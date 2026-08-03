import assert from "node:assert/strict";
import { test } from "node:test";
import { clearProviderCache, ProviderError, generateWithProvider } from "../server/title-generator/provider.js";

const facts = {
  productName: "行李箱套",
  category: "箱包配件",
  description: "防刮蹭行李箱套",
  material: "PET",
  use: "防刮蹭",
  brand: "ACHO",
  authorization: "compatible-third-party",
  sellingPoints: "防刮蹭、易收纳、轻便、牢固"
};

function candidate(index) {
  return {
    title: `適用行李箱套 ${index}`,
    chineseKeywords: ["行李箱套"],
    englishKeywords: ["luggage cover"],
    evidence: ["confirmed facts"],
    removedTerms: []
  };
}

function output() {
  return JSON.stringify({ candidates: [1, 2, 3, 4, 5].map(candidate) });
}

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function config() {
  return {
    primary: { baseUrl: "https://primary.test/v1", model: "glm-5.2", timeout: 1000, key: "primary-test-key" },
    fallback: { baseUrl: "https://fallback.test", model: "gpt-5.6-luna", timeout: 1000, key: "fallback-test-key" }
  };
}

function fetchQueue(items, calls) {
  return async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    const item = items.shift();
    if (item instanceof Error) throw item;
    return item;
  };
}

test("primary disables thinking and returns five candidates", async () => {
  clearProviderCache();
  const calls = [];
  const result = await generateWithProvider(facts, "mall", {
    config: config(),
    fetchImpl: fetchQueue([response({ choices: [{ finish_reason: "stop", message: { content: output() } }], usage: { prompt_tokens: 10, completion_tokens: 40, total_tokens: 50 } })], calls)
  });
  assert.equal(result.metadata.provider, "primary");
  assert.equal(result.metadata.tokenUsage.total, 50);
  assert.equal(result.result.candidates.length, 5);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.enable_thinking, false);
  assert.equal(calls[0].body.temperature, 0.2);
  assert.equal(calls[0].body.max_tokens, 1800);
  assert.match(calls[0].options.headers.Authorization, /^Bearer /u);
});

test("transient primary failure uses nested Responses output with required controls", async () => {
  clearProviderCache();
  const calls = [];
  const fallbackBody = { status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: output() }] }], usage: { input_tokens: 12, output_tokens: 44, total_tokens: 56 } };
  const result = await generateWithProvider(facts, "standard", {
    config: config(),
    fetchImpl: fetchQueue([response({ error: { type: "server_error" } }, 503), response(fallbackBody)], calls)
  });
  assert.equal(result.metadata.provider, "fallback");
  assert.equal(result.metadata.attempts, 2);
  assert.equal(result.metadata.tokenUsage.total, 56);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].body.store, false);
  assert.deepEqual(calls[1].body.reasoning, { effort: "xhigh" });
  assert.equal(calls[1].body.max_output_tokens, 3000);
});

test("400, 401 and 403 errors do not switch to fallback", async () => {
  for (const status of [400, 401, 403]) {
    clearProviderCache();
    const calls = [];
    await assert.rejects(
      generateWithProvider(facts, "standard", { config: config(), fetchImpl: fetchQueue([response({ error: "rejected" }, status)], calls) }),
      (error) => error instanceof ProviderError && error.code === "provider_http_error"
    );
    assert.equal(calls.length, 1);
  }
});

test("invalid primary output does not switch to fallback or expose prompt/key", async () => {
  clearProviderCache();
  const calls = [];
  await assert.rejects(
    generateWithProvider(facts, "standard", { config: config(), fetchImpl: fetchQueue([response({ choices: [{ finish_reason: "stop", message: { content: "not-json" } }] })], calls) }),
    (error) => error instanceof ProviderError && error.code === "provider_output_invalid"
      && !error.message.includes("行李箱套") && !error.message.includes("primary-test-key")
  );
  assert.equal(calls.length, 1);
});

test("truncated output is provider_output_invalid", async () => {
  clearProviderCache();
  const calls = [];
  await assert.rejects(
    generateWithProvider(facts, "standard", { config: config(), fetchImpl: fetchQueue([response({ choices: [{ finish_reason: "length", message: { content: output() } }] })], calls) }),
    (error) => error instanceof ProviderError && error.code === "provider_output_invalid"
  );
  assert.equal(calls.length, 1);
});

test("missing fallback text is invalid output, not a retry loop", async () => {
  clearProviderCache();
  const calls = [];
  await assert.rejects(
    generateWithProvider(facts, "standard", { config: config(), fetchImpl: fetchQueue([response({}, 500), response({ status: "completed", output: [] })], calls) }),
    (error) => error instanceof ProviderError && error.code === "provider_output_invalid"
  );
  assert.equal(calls.length, 2);
});
