import crypto from "node:crypto";
import express from "express";
import { z } from "zod";
import { createCollectorStore } from "./store.js";

const pairingLifetimeMs = 5 * 60 * 1000;
const clientLifetimeMs = 90 * 24 * 60 * 60 * 1000;
const fxMaxAgeMs = 48 * 60 * 60 * 1000;
const fxUrl = process.env.TWD_USD_FX_URL || "https://open.er-api.com/v6/latest/TWD";
const priceTiers = [
  { id: "0-5", min: 0, max: 5 },
  { id: "5-15", min: 5, max: 15 },
  { id: "15-30", min: 15, max: 30 },
  { id: "30-50", min: 30, max: 50 },
  { id: "50-70", min: 50, max: 70 },
  { id: "70-100", min: 70, max: 100 },
  { id: "100-200", min: 100, max: 200 }
];

const productSchema = z.object({
  shopId: z.union([z.string(), z.number()]).transform(String).pipe(z.string().min(1).max(80)),
  itemId: z.union([z.string(), z.number()]).transform(String).pipe(z.string().min(1).max(80)),
  title: z.string().min(1).max(300),
  productUrl: z.string().url().max(500),
  imageUrl: z.string().url().max(500).optional().nullable(),
  priceTwd: z.number().positive().finite(),
  sold: z.number().finite().nonnegative().nullable().optional(),
  historicalSold: z.number().finite().nonnegative().nullable().optional(),
  rating: z.number().finite().min(0).max(5).nullable().optional(),
  reviewCount: z.number().finite().nonnegative().nullable().optional(),
  categoryId: z.string().min(1).max(80),
  shopeeCategoryId: z.union([z.string(), z.number()]).transform(String).pipe(z.string().min(1).max(80)),
  rankMode: z.enum(["sales", "relevance"]),
  sourceRank: z.number().int().positive().max(500),
  page: z.number().int().min(0).max(2)
}).strict();

const batchSchema = z.object({
  schemaVersion: z.literal("shopee-tw-cdp-v1"),
  cycleId: z.string().uuid(),
  collectedAt: z.string().datetime(),
  market: z.literal("TW"),
  products: z.array(productSchema).min(1).max(2000)
}).strict();

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

function inferTierId(priceUsd) {
  return priceTiers.find((tier) => priceUsd >= tier.min && priceUsd < tier.max)?.id || null;
}

function isShopeeTaiwanProduct(url, shopId, itemId) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "shopee.tw") return false;
    return parsed.pathname.includes(`/product/${shopId}/${itemId}`) || parsed.pathname.includes(`-${itemId}`);
  } catch {
    return false;
  }
}

function safeStatus(status) {
  return {
    state: status.state || "not-initialized",
    lastAttemptAt: status.lastAttemptAt || null,
    lastSuccessAt: status.lastSuccessAt || null,
    lastError: status.lastError || null,
    rowCount: Number(status.rowCount) || 0,
    rankableSkuCount: Number(status.rankableSkuCount) || 0,
    rejectedCount: Number(status.rejectedCount) || 0,
    rejectedRate: Number(status.rejectedRate) || 0,
    fx: status.fx ? { observedAt: status.fx.observedAt || null, provider: status.fx.provider || "", rate: status.fx.rate || null } : null,
    categoryMapUpdatedAt: status.categoryMapUpdatedAt || null,
    collectorClientCount: Number(status.collectorClientCount) || 0,
    updatedAt: status.updatedAt || null
  };
}

async function getFxRate(previousStatus, fetchImpl) {
  const cached = previousStatus.fx;
  if (cached?.rate && cached.observedAt && Date.now() - Date.parse(cached.observedAt) < fxMaxAgeMs) return cached;

  const response = await fetchImpl(fxUrl, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("fx_unavailable");
  const data = await response.json();
  const rate = Number(data?.rates?.USD);
  const observedAt = data?.time_last_update_utc ? new Date(data.time_last_update_utc).toISOString() : new Date().toISOString();
  if (data?.result !== "success" || !Number.isFinite(rate) || rate <= 0 || Number.isNaN(Date.parse(observedAt))) throw new Error("fx_unavailable");
  return { rate, observedAt, provider: "open.er-api.com" };
}

function normalizeBatch(products, fx, collectedAt) {
  const newestByItem = new Map();
  const rankings = { sales: {}, relevance: {} };
  let rejectedCount = 0;

  for (const product of products) {
    if (!isShopeeTaiwanProduct(product.productUrl, product.shopId, product.itemId)) {
      rejectedCount += 1;
      continue;
    }
    const priceUsd = Number((product.priceTwd * fx.rate).toFixed(4));
    const priceTierId = inferTierId(priceUsd);
    if (!priceTierId) {
      rejectedCount += 1;
      continue;
    }

    const key = `${product.shopId}:${product.itemId}`;
    const current = newestByItem.get(key);
    if (!current || product.rankMode === "sales") newestByItem.set(key, { ...product, priceUsd, priceTierId });
    const entries = rankings[product.rankMode][product.categoryId] || [];
    entries.push({ itemKey: key, sourceRank: product.sourceRank, shopeeCategoryId: product.shopeeCategoryId });
    rankings[product.rankMode][product.categoryId] = entries;
  }

  const rows = [...newestByItem.values()].map((product) => ({
    title: product.title,
    regionId: "sea",
    platformId: "shopee",
    countryCode: "TW",
    categoryId: product.categoryId,
    priceTierId: product.priceTierId,
    date: collectedAt.slice(0, 10),
    salesUnits: product.sold,
    historicalSold: product.historicalSold,
    searchVolume: null,
    conversionRate: null,
    averageOrderValue: product.priceUsd,
    reviewVolume: product.reviewCount,
    reviewSentiment: product.rating == null ? null : Number(((product.rating - 3) / 2).toFixed(2)),
    sourceName: "shopee-tw-cdp",
    rankMode: product.rankMode,
    sourceRank: product.sourceRank,
    metricStatus: {
      salesUnits: product.sold == null ? "missing" : "observed-platform-field",
      historicalSold: product.historicalSold == null ? "missing" : "observed-platform-field",
      searchVolume: "missing",
      conversionRate: "missing",
      averageOrderValue: "fx-derived",
      sentiment: product.rating == null ? "missing" : "rating-derived"
    },
    _raw: {
      itemId: product.itemId,
      shopId: product.shopId,
      productUrl: product.productUrl,
      imageUrl: product.imageUrl || "",
      currency: "TWD",
      priceLocal: product.priceTwd,
      priceUsd: product.priceUsd,
      shopeeCategoryId: product.shopeeCategoryId
    }
  }));

  const compactRankings = Object.fromEntries(Object.entries(rankings).map(([mode, categories]) => [mode, Object.fromEntries(Object.entries(categories).map(([categoryId, entries]) => [
    categoryId,
    [...entries].sort((left, right) => left.sourceRank - right.sourceRank).filter((entry, index, all) => all.findIndex((candidate) => candidate.itemKey === entry.itemKey) === index).slice(0, 10)
  ]))]));

  return { rows, rankings: compactRankings, rejectedCount };
}

export function createCollectorRouter({ dataDir, requireSession, audit, onAcceptedBatch, fetchImpl = fetch }) {
  const router = express.Router();
  const store = createCollectorStore(dataDir);

  async function readStatus() {
    return store.read("status.json", { state: "not-initialized" });
  }

  async function requireCollector(req, res, next) {
    const header = req.get("authorization") || "";
    const token = header.startsWith("Collector ") ? header.slice(10) : "";
    if (!token) return res.status(401).json({ error: "collector_unauthorized" });
    const clients = await store.read("clients.json", []);
    const client = clients.find((entry) => entry.tokenHash === sha256(token) && !entry.revokedAt && entry.expiresAt > Date.now());
    if (!client) return res.status(401).json({ error: "collector_unauthorized" });
    req.collector = client;
    return next();
  }

  router.post("/collector/pairing-codes", requireSession, async (req, res, next) => {
    try {
      const code = `twc_${crypto.randomBytes(18).toString("base64url")}`;
      const pairings = (await store.read("pairings.json", [])).filter((entry) => entry.expiresAt > Date.now() && !entry.usedAt);
      pairings.push({ codeHash: sha256(code), owner: req.auth.sub, expiresAt: Date.now() + pairingLifetimeMs, createdAt: new Date().toISOString() });
      await store.write("pairings.json", pairings.slice(-50));
      void audit("collector_pairing_created", req, { user: req.auth.sub });
      res.status(201).json({ code, expiresAt: new Date(Date.now() + pairingLifetimeMs).toISOString() });
    } catch (error) { next(error); }
  });

  router.post("/collector/pair", async (req, res, next) => {
    try {
      const code = String(req.body?.code || "");
      const name = String(req.body?.name || "Shopee TW CDP").replace(/[\r\n]+/gu, " ").slice(0, 80);
      const pairings = await store.read("pairings.json", []);
      const pairing = pairings.find((entry) => entry.codeHash === sha256(code) && !entry.usedAt && entry.expiresAt > Date.now());
      if (!pairing) return res.status(401).json({ error: "pairing_invalid" });
      pairing.usedAt = new Date().toISOString();
      const token = `ctw_${crypto.randomBytes(32).toString("base64url")}`;
      const client = { id: crypto.randomUUID(), name, tokenHash: sha256(token), owner: pairing.owner, scope: "shopee-tw:ingest", createdAt: new Date().toISOString(), expiresAt: Date.now() + clientLifetimeMs, revokedAt: null };
      const clients = await store.read("clients.json", []);
      await Promise.all([store.write("pairings.json", pairings), store.write("clients.json", [...clients, client].slice(-20))]);
      const status = await readStatus();
      await store.write("status.json", { ...status, collectorClientCount: clients.filter((entry) => !entry.revokedAt && entry.expiresAt > Date.now()).length + 1, updatedAt: new Date().toISOString() });
      res.status(201).json({ clientId: client.id, token, expiresAt: new Date(client.expiresAt).toISOString(), scope: client.scope });
    } catch (error) { next(error); }
  });

  router.get("/collector/shopee-tw/status", requireSession, async (req, res, next) => {
    try {
      const clients = await store.read("clients.json", []);
      const safeClients = clients
        .filter((entry) => entry.owner === req.auth.sub)
        .map(({ id, name, scope, createdAt, expiresAt, revokedAt }) => ({ id, name, scope, createdAt, expiresAt: new Date(expiresAt).toISOString(), revokedAt }));
      res.json({ source: "shopee-tw-cdp", status: safeStatus(await readStatus()), clients: safeClients });
    } catch (error) { next(error); }
  });

  router.get("/collector/shopee-tw/category-map", (req, res, next) => {
    const middleware = (req.get("authorization") || "").startsWith("Collector ") ? requireCollector : requireSession;
    return middleware(req, res, next);
  }, async (_req, res, next) => {
    try { res.json({ categories: await store.read("category-map.json", []), savedLocally: true }); } catch (error) { next(error); }
  });

  router.post("/collector/shopee-tw/category-map", requireSession, async (req, res, _next) => {
    try {
      const schema = z.array(z.object({ categoryId: z.string().min(1).max(80), shopeeCategoryId: z.union([z.string(), z.number()]).transform(String), url: z.string().url().max(500), label: z.string().min(1).max(120) }).strict()).max(20);
      const categories = schema.parse(req.body?.categories || []);
      if (new Set(categories.map((entry) => entry.categoryId)).size !== categories.length) return res.status(400).json({ error: "duplicate_category_mapping" });
      if (categories.some((entry) => !/^https:\/\/shopee\.tw\//u.test(entry.url))) return res.status(400).json({ error: "invalid_category_url" });
      await store.write("category-map.json", categories);
      const status = await readStatus();
      await store.write("status.json", { ...status, categoryMapUpdatedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      void audit("collector_category_map_saved", req, { user: req.auth.sub, mappingCount: categories.length });
      res.json({ categories });
    } catch (error) { res.status(error instanceof z.ZodError ? 400 : 500).json({ error: error instanceof z.ZodError ? "invalid_category_mapping" : "request_failed" }); }
  });

  router.post("/collector/shopee-tw/batches", requireCollector, async (req, res, _next) => {
    try {
      const batch = batchSchema.parse(req.body);
      const status = await readStatus();
      const batches = await store.read("batches.json", []);
      if (batches.some((entry) => entry.cycleId === batch.cycleId)) return res.json({ ok: true, duplicate: true });
      const categoryMap = await store.read("category-map.json", []);
      const confirmed = new Set(categoryMap.map((entry) => `${entry.categoryId}:${entry.shopeeCategoryId}`));
      const allowedProducts = batch.products.filter((product) => confirmed.has(`${product.categoryId}:${product.shopeeCategoryId}`));
      const fx = await getFxRate(status, fetchImpl);
      const normalized = normalizeBatch(allowedProducts, fx, batch.collectedAt);
      if (!normalized.rows.length) {
        const nextStatus = { ...status, state: "blocked", lastAttemptAt: new Date().toISOString(), lastError: "no_valid_products", rejectedCount: batch.products.length, rejectedRate: 1, fx, updatedAt: new Date().toISOString() };
        await store.write("status.json", nextStatus);
        return res.status(422).json({ error: "no_valid_products" });
      }
      const now = new Date().toISOString();
      const nextStatus = {
        state: "ready",
        lastAttemptAt: now,
        lastSuccessAt: now,
        lastError: null,
        rowCount: normalized.rows.length,
        rankableSkuCount: normalized.rows.filter((row) => row.salesUnits != null || row.historicalSold != null).length,
        rejectedCount: normalized.rejectedCount + (batch.products.length - allowedProducts.length),
        rejectedRate: Number(((normalized.rejectedCount + (batch.products.length - allowedProducts.length)) / batch.products.length).toFixed(4)),
        fx,
        rankings: normalized.rankings,
        categoryMapUpdatedAt: status.categoryMapUpdatedAt || null,
        collectorClientCount: status.collectorClientCount || 0,
        updatedAt: now
      };
      await Promise.all([
        store.writeNormalized(normalized.rows),
        store.write("status.json", nextStatus),
        store.write("batches.json", [...batches, { cycleId: batch.cycleId, collectedAt: batch.collectedAt, receivedAt: now, rowCount: normalized.rows.length, clientId: req.collector.id }].slice(-100))
      ]);
      void audit("collector_batch_accepted", req, { clientId: req.collector.id, rowCount: normalized.rows.length, rejectedCount: nextStatus.rejectedCount });
      void onAcceptedBatch?.(req);
      res.status(202).json({ ok: true, rowCount: normalized.rows.length, rejectedCount: nextStatus.rejectedCount, fx: { observedAt: fx.observedAt, provider: fx.provider } });
    } catch (error) {
      const code = error instanceof z.ZodError ? "invalid_batch" : error?.message === "fx_unavailable" ? "fx_unavailable" : "batch_failed";
      const status = await readStatus().catch(() => ({ state: "not-initialized" }));
      await store.write("status.json", { ...status, state: code === "fx_unavailable" ? "stale" : "blocked", lastAttemptAt: new Date().toISOString(), lastError: code, updatedAt: new Date().toISOString() }).catch(() => {});
      res.status(code === "invalid_batch" ? 400 : 503).json({ error: code });
    }
  });

  router.delete("/collector/clients/:id", requireSession, async (req, res, next) => {
    try {
      const clients = await store.read("clients.json", []);
      const client = clients.find((entry) => entry.id === req.params.id && entry.owner === req.auth.sub);
      if (!client) return res.status(404).json({ error: "collector_not_found" });
      client.revokedAt = new Date().toISOString();
      const status = await readStatus();
      await Promise.all([
        store.write("clients.json", clients),
        store.write("status.json", { ...status, collectorClientCount: clients.filter((entry) => !entry.revokedAt && entry.expiresAt > Date.now()).length, updatedAt: new Date().toISOString() })
      ]);
      void audit("collector_client_revoked", req, { clientId: client.id, user: req.auth.sub });
      return res.status(204).end();
    } catch (error) { return next(error); }
  });

  return router;
}
