import crypto from "node:crypto";
import express from "express";
import { z } from "zod";
import { createTitleStore } from "./store.js";
import { normalizeDetail, normalizeFacts, RULE_VERSION, ruleSources, validateDetail, validateTitle } from "./rules.js";
import { inspect1688 } from "./source-inspector.js";
import { generateWithProvider } from "./provider.js";
import { analyzeExperiment } from "./experiments.js";

const factsSchema = z.object({ productName: z.string().min(1), category: z.string().min(1), description: z.string().optional(), specifications: z.string().optional(), material: z.string().optional(), use: z.string().optional(), currentTitle: z.string().optional(), brand: z.string().optional(), authorization: z.enum(["unbranded", "own", "authorized", "compatible-third-party"]), sellingPoints: z.string().min(1), sourceUrl: z.string().optional() });
const candidateSchema = z.object({ title: z.string().min(1), chineseKeywords: z.array(z.string()).max(12), englishKeywords: z.array(z.string()).max(12), evidence: z.array(z.string()).max(8), removedTerms: z.array(z.string()).max(8) });
const factKeySchema = z.enum(["productName", "category", "description", "specifications", "material", "use", "brand", "authorization", "sellingPoints"]);
const detailItemSchema = z.object({ text: z.string().min(1).max(240), evidence: z.array(factKeySchema).min(1).max(3) }).strict();
const detailSchema = z.object({
  summary: detailItemSchema,
  // 商品介紹計入 2-6 個有效段落，因此其餘段落允許只有 1-5 個。
  sections: z.array(z.object({ key: z.enum(["features", "specifications", "suitableFor", "usage", "packageContents", "notices"]), items: z.array(detailItemSchema).min(1).max(8) }).strict()).min(1).max(5)
}).strict();
const observationSchema = z.object({ date: z.string().min(10), itemId: z.string().min(1), variant: z.enum(["baseline", "candidate"]), searchImpressions: z.number().nullable().optional(), searchClicks: z.number().nullable().optional(), productUv: z.number().nullable().optional(), orders: z.number().nullable().optional(), revenue: z.number().nullable().optional(), shopDau: z.number().nullable().optional(), adSpend: z.number().nullable().optional(), price: z.number().nullable().optional(), inStock: z.boolean().nullable().optional() });
const rate = new Map();
function clean(value) { return String(value || "").replace(/[\r\n]+/gu, " ").slice(0, 180); }
function safeError(error) { const code = error?.code || error?.message; return ["invalid_source_url", "unsafe_source_url", "source_unavailable", "source_too_large", "source_redirect_limit", "provider_not_configured", "provider_upstream_unavailable", "provider_request_rejected", "provider_output_invalid", "provider_timeout", "provider_connection_error"].includes(code) ? code : "request_failed"; }
function providerStatus(code) { return ["provider_upstream_unavailable", "provider_timeout", "provider_connection_error", "provider_not_configured"].includes(code) ? 503 : 502; }
function takeRateSlot(subject) { const now = Date.now(); const entries = (rate.get(subject) || []).filter((at) => at > now - 900000); if (entries.length >= 10) return false; rate.set(subject, [...entries, now]); return true; }
function zodIssuePaths(error) { return error instanceof z.ZodError ? error.issues.map((issue) => ({ path: issue.path.join("."), code: issue.code })) : []; }

export function createTitleGeneratorRouter({ dataDir, requireSession, audit }) {
  const router = express.Router(); const store = createTitleStore(dataDir);
  router.use(requireSession);
  router.get("/title-generator/status", async (_req, res, next) => { try {
    const rules = await store.read("rules.json", { checkedAt: null, status: "unverified" });
    res.json({ provider: "本機 ai-crypto 設定", rules: { version: RULE_VERSION, status: rules.status, checkedAt: rules.checkedAt, sources: ruleSources.map(([id, url]) => ({ id, url })) }, trends: { geo: "TW", window: "90d", status: "reserved", note: "相對指數，不等於 Shopee 搜尋量" }, storage: { localOnly: true, shopeeOpenPlatform: "未接通" } });
  } catch (error) { next(error); } });
  router.post("/title-generator/source/inspect", async (req, res) => { try { res.json(await inspect1688(String(req.body?.sourceUrl || ""))); } catch (error) { res.status(400).json({ error: safeError(error) }); } });
  router.post("/title-generator/generate", async (req, res) => { try {
    const facts = normalizeFacts(factsSchema.parse(req.body?.facts)); const profile = req.body?.profile === "mall" ? "mall" : "standard";
    if (!takeRateSlot(req.auth.sub)) return res.status(429).json({ error: "rate_limited" });
    let raw; let metadata;
    try {
      const generated = await generateWithProvider(facts, profile);
      raw = z.object({ candidates: z.array(candidateSchema).length(5) }).parse(generated.result).candidates;
      metadata = generated.metadata;
    } catch (error) {
      const code = error instanceof z.ZodError ? "provider_output_invalid" : safeError(error);
      void audit("title_generation_failed", req, { errorType: code, ...(error.metadata || {}) });
      res.status(providerStatus(code)).json({ error: code });
      return;
    }
    const rules = await store.read("rules.json", { checkedAt: null, status: "unverified" });
    const candidates = raw.slice(0, 5).map((candidate) => {
      const check = validateTitle(candidate.title, facts, profile);
      return { ...candidate, ...check, status: rules.status === "verified" && check.status === "pass" ? "pass" : "needs-review", trend: null, trendNote: "Google Trends 相對指數尚未取得；不等於 Shopee 搜尋量" };
    });
    const runs = await store.read("runs.json", []); const run = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), profile, facts, candidates, details: {}, metadata: { ...metadata, promptHash: metadata.promptHash || crypto.createHash("sha256").update(JSON.stringify(facts)).digest("hex") } };
    await store.write("runs.json", [run, ...runs].slice(0, 100)); void audit("title_generated", req, { promptHash: metadata.promptHash, provider: metadata.provider, model: metadata.model, attempts: metadata.attempts, latencyMs: metadata.latencyMs, tokenUsage: metadata.tokenUsage }); res.json(run);
  } catch (error) { const code = error instanceof z.ZodError ? "source_details_required" : safeError(error); res.status(error instanceof z.ZodError ? 400 : providerStatus(code)).json({ error: code }); } });
  router.post("/title-generator/runs/:id/details", async (req, res, next) => { try {
    const candidateIndex = Number(req.body?.candidateIndex);
    if (!Number.isInteger(candidateIndex) || candidateIndex < 0 || candidateIndex > 4) return res.status(400).json({ error: "invalid_candidate" });
    const runs = await store.read("runs.json", []); const run = runs.find((entry) => entry.id === req.params.id);
    if (!run || !run.candidates?.[candidateIndex]) return res.status(404).json({ error: "title_run_not_found" });
    if (!takeRateSlot(req.auth.sub)) return res.status(429).json({ error: "rate_limited" });
    let raw; let metadata;
    try {
      const generated = await generateWithProvider(run.facts, run.profile, { task: "detail", selectedTitle: run.candidates[candidateIndex].title });
      raw = detailSchema.parse(generated.result?.detail); metadata = generated.metadata;
    } catch (error) {
      const code = error instanceof z.ZodError ? "provider_output_invalid" : safeError(error);
      void audit("title_detail_generation_failed", req, { task: "detail", errorType: code, validation: zodIssuePaths(error), ...(error.metadata || {}) });
      return res.status(providerStatus(code)).json({ error: code });
    }
    const detail = normalizeDetail(raw); const check = validateDetail(detail, run.facts, run.profile);
    const rules = await store.read("rules.json", { checkedAt: null, status: "unverified" });
    const result = { runId: run.id, candidateIndex, title: run.candidates[candidateIndex].title, detail: { ...detail, ...check, status: rules.status === "verified" && check.status === "pass" ? "pass" : "needs-review" }, metadata: { ...metadata, task: "detail" }, createdAt: new Date().toISOString() };
    run.details = { ...(run.details || {}), [candidateIndex]: result };
    await store.write("runs.json", runs);
    void audit("title_detail_generated", req, { task: "detail", promptHash: metadata.promptHash, provider: metadata.provider, model: metadata.model, attempts: metadata.attempts, latencyMs: metadata.latencyMs, tokenUsage: metadata.tokenUsage });
    res.json(result);
  } catch (error) { next(error); } });
  router.get("/title-generator/runs", async (_req, res, next) => { try { const runs = await store.read("runs.json", []); res.json({ runs: runs.map((run) => ({ ...run, details: run.details || {} })) }); } catch (error) { next(error); } });
  router.delete("/title-generator/runs/:id", async (req, res, next) => { try { const runs = await store.read("runs.json", []); await store.write("runs.json", runs.filter((run) => run.id !== req.params.id)); res.status(204).end(); } catch (error) { next(error); } });
  router.get("/title-experiments", async (_req, res, next) => { try { const experiments = await store.read("experiments.json", []); res.json({ experiments: experiments.map((item) => ({ ...item, analysis: analyzeExperiment(item) })) }); } catch (error) { next(error); } });
  router.post("/title-experiments", async (req, res) => { try { const body = req.body || {}; const experiment = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), name: clean(body.name) || "未命名標題實驗", itemId: clean(body.itemId), baselineTitle: clean(body.baselineTitle), candidateTitle: clean(body.candidateTitle), windowDays: [7, 14, 28].includes(Number(body.windowDays)) ? Number(body.windowDays) : 14, observations: [] }; const all = await store.read("experiments.json", []); await store.write("experiments.json", [experiment, ...all]); res.status(201).json(experiment); } catch { res.status(400).json({ error: "invalid_experiment" }); } });
  router.patch("/title-experiments/:id", async (req, res, next) => { try { const all = await store.read("experiments.json", []); const target = all.find((item) => item.id === req.params.id); if (!target) return res.status(404).json({ error: "not_found" }); Object.assign(target, { name: clean(req.body?.name) || target.name, windowDays: [7, 14, 28].includes(Number(req.body?.windowDays)) ? Number(req.body.windowDays) : target.windowDays }); await store.write("experiments.json", all); res.json(target); } catch (error) { next(error); } });
  router.post("/title-experiments/:id/observations", async (req, res) => { try { const rows = z.array(observationSchema).max(2000).parse(req.body?.observations); const all = await store.read("experiments.json", []); const target = all.find((item) => item.id === req.params.id); if (!target) return res.status(404).json({ error: "not_found" }); target.observations = rows; target.updatedAt = new Date().toISOString(); await store.write("experiments.json", all); res.json({ ...target, analysis: analyzeExperiment(target) }); } catch { res.status(400).json({ error: "invalid_observations" }); } });
  return router;
}
