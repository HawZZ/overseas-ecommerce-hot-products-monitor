import crypto from "node:crypto";
import fs from "node:fs/promises";
import YAML from "yaml";

const cache = new Map();
const PRIMARY_MAX_TOKENS = 1800;
const FALLBACK_MAX_OUTPUT_TOKENS = 3000;

export class ProviderError extends Error {
  constructor(code, metadata = {}) {
    super(code);
    this.name = "ProviderError";
    this.code = code;
    this.metadata = metadata;
  }
}

function isTimeout(error) {
  return error?.name === "TimeoutError" || error?.name === "AbortError";
}

function statusClass(status) {
  return Number.isInteger(status) ? `${Math.floor(status / 100)}xx` : null;
}

function providerFailure(code, metadata = {}) {
  return new ProviderError(code, {
    provider: metadata.provider || null,
    model: metadata.model || null,
    attempt: metadata.attempt || null,
    statusClass: statusClass(metadata.status),
    retryable: metadata.status === 429 || metadata.status >= 500 || code === "provider_timeout" || code === "provider_connection_error",
    latencyMs: metadata.latencyMs || null,
    tokenUsage: metadata.tokenUsage || null
  });
}

export async function loadProviderConfig() {
  try {
    const catalog = YAML.parse(await fs.readFile("/home/ec2-user/ai-crypto/configs/provider_catalog.yaml", "utf8")) || {};
    const secrets = YAML.parse(await fs.readFile("/etc/ai-crypto/secrets.production.yaml", "utf8")) || {};
    const primary = catalog?.llm?.primary || catalog?.providers?.primary || {};
    const fallback = catalog?.llm?.fallback || catalog?.providers?.fallback || {};
    const initialTimeout = Number(catalog.timeouts_seconds?.initial || 60) * 1000;
    return {
      primary: {
        baseUrl: primary.base_url || primary.baseUrl,
        model: primary.model || primary.default_model,
        timeout: initialTimeout,
        key: secrets?.llm?.api_key
      },
      fallback: {
        baseUrl: fallback.base_url || fallback.baseUrl,
        model: fallback.model || fallback.default_model,
        timeout: initialTimeout,
        key: secrets?.llm?.fallback_api_key
      }
    };
  } catch {
    return null;
  }
}

function prompt(facts, profile) {
  return `你是 Shopee 台灣商品標題編輯。只依據已確認事實，輸出 JSON: {"candidates":[{"title":"","chineseKeywords":[""],"englishKeywords":[""],"evidence":[""],"removedTerms":[""]}]}; 必須剛好5筆。標題使用台灣繁體中文，英文關鍵字不能進標題。規則檔位:${profile}。事實:${JSON.stringify(facts)}`;
}

function tokenUsage(data) {
  const usage = data?.usage;
  if (!usage || typeof usage !== "object") return null;
  return {
    input: usage.prompt_tokens ?? usage.input_tokens ?? null,
    output: usage.completion_tokens ?? usage.output_tokens ?? null,
    total: usage.total_tokens ?? null
  };
}

async function readJson(response, metadata) {
  if (!response.ok) {
    throw providerFailure("provider_http_error", { ...metadata, status: response.status });
  }
  try {
    return await response.json();
  } catch {
    throw providerFailure("provider_output_invalid", metadata);
  }
}

function parseJsonContent(content, metadata) {
  if (typeof content !== "string" || !content.trim()) throw providerFailure("provider_output_invalid", metadata);
  try {
    return JSON.parse(content);
  } catch {
    throw providerFailure("provider_output_invalid", metadata);
  }
}

async function chat(config, body, fetchImpl, metadata) {
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(`${String(config.baseUrl || "").replace(/\/$/u, "")}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(config.timeout),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.key}` },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: body }],
        response_format: { type: "json_object" },
        enable_thinking: false,
        temperature: 0.2,
        max_tokens: PRIMARY_MAX_TOKENS
      })
    });
    const data = await readJson(response, { ...metadata, status: response.status });
    const choice = data?.choices?.[0];
    if (choice?.finish_reason && choice.finish_reason !== "stop") {
      throw providerFailure("provider_output_invalid", { ...metadata, status: response.status, tokenUsage: tokenUsage(data) });
    }
    return {
      result: parseJsonContent(choice?.message?.content, { ...metadata, status: response.status, tokenUsage: tokenUsage(data) }),
      tokenUsage: tokenUsage(data),
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw providerFailure(isTimeout(error) ? "provider_timeout" : "provider_connection_error", { ...metadata, latencyMs: Date.now() - startedAt });
  }
}

function extractResponseText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) return data.output_text;
  return (data?.output || [])
    .flatMap((item) => item?.content || [])
    .filter((item) => item?.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("");
}

async function responses(config, body, fetchImpl, metadata) {
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(`${String(config.baseUrl || "").replace(/\/$/u, "")}/responses`, {
      method: "POST",
      signal: AbortSignal.timeout(config.timeout),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.key}` },
      body: JSON.stringify({
        model: config.model,
        input: body,
        store: false,
        reasoning: { effort: "xhigh" },
        max_output_tokens: FALLBACK_MAX_OUTPUT_TOKENS
      })
    });
    const data = await readJson(response, { ...metadata, status: response.status });
    if (data?.status && data.status !== "completed") {
      throw providerFailure("provider_output_invalid", { ...metadata, status: response.status, tokenUsage: tokenUsage(data) });
    }
    return {
      result: parseJsonContent(extractResponseText(data), { ...metadata, status: response.status, tokenUsage: tokenUsage(data) }),
      tokenUsage: tokenUsage(data),
      latencyMs: Date.now() - startedAt
    };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw providerFailure(isTimeout(error) ? "provider_timeout" : "provider_connection_error", { ...metadata, latencyMs: Date.now() - startedAt });
  }
}

export function clearProviderCache() {
  cache.clear();
}

export async function generateWithProvider(facts, profile, options = {}) {
  if (process.env.TITLE_GENERATOR_DISABLE_PROVIDER === "1" && !options.config) throw new ProviderError("provider_not_configured");
  const fetchImpl = options.fetchImpl || fetch;
  const input = prompt(facts, profile);
  const promptHash = crypto.createHash("sha256").update(input).digest("hex");
  const hit = cache.get(promptHash);
  if (hit && hit.expiresAt > Date.now()) return { ...hit.value, cached: true };
  const config = options.config || await loadProviderConfig();
  if (!config?.primary?.key || !config.primary.baseUrl || !config.primary.model) throw new ProviderError("provider_not_configured");

  let output;
  let provider = "primary";
  let attempts = 1;
  try {
    output = await chat(config.primary, input, fetchImpl, { provider, model: config.primary.model, attempt: 1 });
  } catch (error) {
    if (!(error instanceof ProviderError) || !["provider_timeout", "provider_connection_error", "provider_http_error"].includes(error.code) || !error.metadata.retryable) throw error;
    if (!config.fallback?.key || !config.fallback.baseUrl || !config.fallback.model) throw new ProviderError("provider_upstream_unavailable", { provider, model: config.primary.model, attempt: 1 });
    provider = "fallback";
    attempts = 2;
    try {
      output = await responses(config.fallback, input, fetchImpl, { provider, model: config.fallback.model, attempt: 2 });
    } catch (fallbackError) {
      if (fallbackError instanceof ProviderError && fallbackError.code === "provider_output_invalid") throw fallbackError;
      throw new ProviderError("provider_upstream_unavailable", { provider, model: config.fallback.model, attempt: 2, latencyMs: fallbackError?.metadata?.latencyMs || null });
    }
  }

  const value = {
    result: output.result,
    metadata: {
      promptHash,
      provider,
      model: provider === "primary" ? config.primary.model : config.fallback.model,
      attempts,
      latencyMs: output.latencyMs,
      tokenUsage: output.tokenUsage
    }
  };
  cache.set(promptHash, { value, expiresAt: Date.now() + 300000 });
  return value;
}
