import crypto from "node:crypto";
import fs from "node:fs/promises";
import YAML from "yaml";

const cache = new Map();
function safeError(error) { return error?.name === "TimeoutError" ? "timeout" : "upstream_unavailable"; }
function transient(status) { return status === 429 || status >= 500; }
export async function loadProviderConfig() {
  try {
    const catalog = YAML.parse(await fs.readFile("/home/ec2-user/ai-crypto/configs/provider_catalog.yaml", "utf8")) || {};
    const secrets = YAML.parse(await fs.readFile("/etc/ai-crypto/secrets.production.yaml", "utf8")) || {};
    const primary = catalog?.llm?.primary || catalog?.providers?.primary || {};
    const fallback = catalog?.llm?.fallback || catalog?.providers?.fallback || {};
    const initialTimeout = Number(catalog.timeouts_seconds?.initial || 60) * 1000;
    return { primary: { baseUrl: primary.base_url || primary.baseUrl, model: primary.model || primary.default_model, timeout: initialTimeout, key: secrets?.llm?.api_key }, fallback: { baseUrl: fallback.base_url || fallback.baseUrl, model: fallback.model || fallback.default_model, timeout: initialTimeout, key: secrets?.llm?.fallback_api_key } };
  } catch { return null; }
}
function prompt(facts, profile) { return `你是 Shopee 台灣商品標題編輯。只依據已確認事實，輸出 JSON: {"candidates":[{"title":"","chineseKeywords":[""],"englishKeywords":[""],"evidence":[""],"removedTerms":[""]}]}; 必須剛好5筆。標題使用台灣繁體中文，英文關鍵字不能進標題。規則檔位:${profile}。事實:${JSON.stringify(facts)}`; }
async function chat(config, body) {
  const response = await fetch(`${String(config.baseUrl || "").replace(/\/$/u, "")}/chat/completions`, { method: "POST", signal: AbortSignal.timeout(config.timeout), headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.key}` }, body: JSON.stringify({ model: config.model, messages: [{ role: "user", content: body }], response_format: { type: "json_object" } }) });
  if (!response.ok) { const error = new Error("upstream"); error.status = response.status; throw error; }
  return JSON.parse((await response.json()).choices?.[0]?.message?.content || "");
}
async function responses(config, body) {
  const response = await fetch(`${String(config.baseUrl || "").replace(/\/$/u, "")}/responses`, { method: "POST", signal: AbortSignal.timeout(config.timeout), headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.key}` }, body: JSON.stringify({ model: config.model, input: body, store: false, reasoning: { effort: "xhigh" } }) });
  if (!response.ok) { const error = new Error("upstream"); error.status = response.status; throw error; }
  const data = await response.json(); return JSON.parse(data.output_text || "");
}
export async function generateWithProvider(facts, profile) {
  if (process.env.TITLE_GENERATOR_DISABLE_PROVIDER === "1") throw new Error("provider_not_configured");
  const input = prompt(facts, profile); const key = crypto.createHash("sha256").update(input).digest("hex"); const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return { ...hit.value, cached: true };
  const config = await loadProviderConfig();
  if (!config?.primary?.key || !config.primary.baseUrl || !config.primary.model) throw new Error("provider_not_configured");
  let result; let provider = "primary"; let attempts = 1;
  try { result = await chat(config.primary, input); } catch (error) {
    if (!transient(error.status) && safeError(error) !== "timeout") throw new Error("provider_request_rejected");
    if (!config.fallback?.key || !config.fallback.baseUrl || !config.fallback.model) throw new Error("provider_upstream_unavailable");
    try {
      result = await responses(config.fallback, input);
    } catch {
      throw new Error("provider_upstream_unavailable");
    }
    provider = "fallback"; attempts = 2;
  }
  const value = { result, metadata: { promptHash: key, provider, model: provider === "primary" ? config.primary.model : config.fallback.model, attempts } };
  cache.set(key, { value, expiresAt: Date.now() + 300000 }); return value;
}
