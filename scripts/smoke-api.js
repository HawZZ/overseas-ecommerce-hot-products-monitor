import "dotenv/config";
import { spawn } from "node:child_process";

const port = Number(process.env.SMOKE_API_PORT || 18787);
const baseUrl = `http://127.0.0.1:${port}`;
const env = {
  ...process.env,
  API_HOST: "127.0.0.1",
  API_PORT: String(port),
  API_TOKEN: process.env.API_TOKEN || "smoke-api-token-12345678901234567890",
  DASHBOARD_USERNAME: process.env.DASHBOARD_USERNAME || "smoke-user@example.com",
  DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD || "smoke-password-12345678901234567890",
  SESSION_SECRET: process.env.SESSION_SECRET || "smoke-session-secret-12345678901234567890",
  CORS_ORIGINS: process.env.CORS_ORIGINS || "http://127.0.0.1:5173",
  TITLE_GENERATOR_DISABLE_PROVIDER: "1"
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return response;
    } catch {
      await wait(250);
    }
  }
  throw new Error("API health check did not become ready");
}

const server = spawn(process.execPath, ["server/index.js"], {
  env,
  stdio: ["ignore", "pipe", "pipe"]
});

let stderr = "";
let failure = null;
server.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

try {
  const healthResponse = await waitForHealth();
  const health = await healthResponse.json();
  assert(health.ok === true, "health.ok must be true");
  assert(health.host === "127.0.0.1", "API must bind to 127.0.0.1");
  assert(health.cadenceHours === 12, "API health must report 12 hour cadence");

  const unauthorizedSnapshot = await fetch(`${baseUrl}/api/snapshot`);
  assert(unauthorizedSnapshot.status === 401, "snapshot must reject anonymous requests");

  const unauthorizedCollector = await fetch(`${baseUrl}/api/collector/shopee-tw/status`);
  assert(unauthorizedCollector.status === 401, "collector status must reject anonymous requests");

  const badLogin = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: env.DASHBOARD_USERNAME, password: "wrong-password" })
  });
  assert(badLogin.status === 401, "wrong login must be rejected");

  const login = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: env.DASHBOARD_USERNAME, password: env.DASHBOARD_PASSWORD })
  });
  assert(login.status === 200, "valid login must pass");
  const session = await login.json();
  assert(session.token, "login response must include token");

  const collectorStatus = await fetch(`${baseUrl}/api/collector/shopee-tw/status`, {
    headers: { Authorization: `Bearer ${session.token}` }
  });
  assert(collectorStatus.status === 200, "authenticated collector status must pass");

  const pairing = await fetch(`${baseUrl}/api/collector/pairing-codes`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` }
  });
  assert(pairing.status === 201, "collector pairing code creation must pass");
  const pairingBody = await pairing.json();
  assert(pairingBody.code && !JSON.stringify(pairingBody).includes("token"), "pairing response must not include collector token");

  const snapshot = await fetch(`${baseUrl}/api/snapshot`, {
    headers: { Authorization: `Bearer ${session.token}` }
  });
  assert(snapshot.status === 200, "authenticated snapshot must pass");

  const titleStatus = await fetch(`${baseUrl}/api/title-generator/status`, {
    headers: { Authorization: `Bearer ${session.token}` }
  });
  assert(titleStatus.status === 200, "authenticated title status must pass");

  const invalidDetailRun = await fetch(`${baseUrl}/api/title-generator/runs/not-a-run/details`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ candidateIndex: 0 })
  });
  assert(invalidDetailRun.status === 404, "detail generation must reject an unknown title run");

  const generate = await fetch(`${baseUrl}/api/title-generator/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({
      profile: "standard",
      facts: { productName: "收納盒", category: "居家生活", authorization: "unbranded", sellingPoints: "可堆疊收納" }
    })
  });
  assert(generate.status === 503, "provider-disabled smoke mode must not return static title candidates");
  const generationError = await generate.json();
  assert(generationError.error === "provider_not_configured", "provider-disabled smoke mode must report provider_not_configured");

  const createExperiment = await fetch(`${baseUrl}/api/title-experiments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
    body: JSON.stringify({ name: "smoke", windowDays: 7 })
  });
  assert(createExperiment.status === 201, "title experiment creation must pass");

  console.log("API smoke verification passed");
} catch (error) {
  failure = error;
} finally {
  server.kill("SIGTERM");
  await wait(250);
}

if (failure) {
  throw failure;
}

if (server.exitCode && server.exitCode !== 0) {
  throw new Error(stderr || `server exited with ${server.exitCode}`);
}
