import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.resolve(rootDir, process.env.DATA_DIR || "data");
const host = process.env.API_HOST || "127.0.0.1";
const port = Number(process.env.API_PORT || 8787);
const runtimeSecret = crypto.randomBytes(32).toString("base64url");
const apiToken = process.env.API_TOKEN || runtimeSecret;
const dashboardUsername = process.env.DASHBOARD_USERNAME || process.env.MONITOR_USERNAME || "admin";
const dashboardPassword = process.env.DASHBOARD_PASSWORD || process.env.MONITOR_PASSWORD || apiToken;
const sessionSecret = process.env.SESSION_SECRET || process.env.MONITOR_SECRET_KEY || runtimeSecret;
const sessionTtlHours = Number(process.env.SESSION_TTL_HOURS || 12);
const refreshCadenceHours = Number(process.env.REFRESH_CADENCE_HOURS || 12);
const loginWindowMs = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const loginMaxFailures = Number(process.env.LOGIN_RATE_LIMIT_MAX_FAILURES || 8);
const allowedOrigins = (process.env.CORS_ORIGINS || "http://127.0.0.1:5173,http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
let refreshInProgress = false;

const app = express();
const loginFailures = new Map();
const connectorsPath = path.resolve(dataDir, "connectors.json");
const connectorsExamplePath = path.resolve(dataDir, "connectors.example.json");

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);
app.use(morgan("tiny"));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "32kb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  next();
});
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin not allowed: ${origin}`));
    },
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "OPTIONS"]
  })
);

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function signPayload(encodedPayload) {
  return crypto.createHmac("sha256", sessionSecret).update(encodedPayload).digest("base64url");
}

function createSessionToken(username) {
  const expiresAt = Date.now() + sessionTtlHours * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ sub: username, exp: expiresAt })).toString("base64url");
  const signature = signPayload(payload);
  return {
    token: `${payload}.${signature}`,
    expiresAt
  };
}

function verifySessionToken(token) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if (!safeEqual(signature, signPayload(payload))) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed.sub || !parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function requireSession(req, res, next) {
  const header = req.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (safeEqual(token, apiToken)) {
    req.auth = { sub: "api-token" };
    next();
    return;
  }

  const session = verifySessionToken(token);
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.auth = session;
  next();
}

function loginClientKey(req) {
  const forwarded = req.get("cf-connecting-ip") || req.get("x-forwarded-for") || req.ip || "unknown";
  return forwarded.split(",")[0].trim();
}

function loginFailureState(req) {
  const key = loginClientKey(req);
  const now = Date.now();
  const state = loginFailures.get(key);
  if (!state || state.resetAt <= now) {
    const fresh = { count: 0, resetAt: now + loginWindowMs };
    loginFailures.set(key, fresh);
    return { key, state: fresh };
  }
  return { key, state };
}

function requireLoginRateLimit(req, res, next) {
  const { state } = loginFailureState(req);
  if (state.count >= loginMaxFailures) {
    res.status(429).json({ error: "Too many login attempts" });
    return;
  }
  next();
}

function recordLoginFailure(req) {
  const { state } = loginFailureState(req);
  state.count += 1;
}

function clearLoginFailures(req) {
  loginFailures.delete(loginClientKey(req));
}

function isWeakConfiguredValue(value) {
  const normalized = String(value || "").trim();
  return !normalized
    || normalized.length < 24
    || /^(admin|password|secret|token)$/i.test(normalized)
    || /change-me|replace-me|your-|example/i.test(normalized);
}

function validateRuntimeConfig() {
  const weakFields = [
    ["API_TOKEN", process.env.API_TOKEN],
    ["DASHBOARD_PASSWORD", process.env.DASHBOARD_PASSWORD || process.env.MONITOR_PASSWORD || process.env.API_TOKEN],
    ["SESSION_SECRET", process.env.SESSION_SECRET || process.env.MONITOR_SECRET_KEY]
  ].filter(([, value]) => isWeakConfiguredValue(value));

  if (weakFields.length === 0) return;

  const names = weakFields.map(([name]) => name).join(", ");
  const message = `Weak or missing security config: ${names}. Set strong values in .env before exposing the tunnel.`;
  if (process.env.NODE_ENV === "production" || process.env.REQUIRE_STRONG_CONFIG === "1") {
    throw new Error(message);
  }
  console.warn(message);
}

async function writeAudit(event, req, details = {}) {
  try {
    await fs.mkdir(dataDir, { recursive: true });
    const record = {
      at: new Date().toISOString(),
      event,
      ip: loginClientKey(req),
      origin: req.get("origin") || null,
      userAgent: req.get("user-agent") || null,
      ...details
    };
    await fs.appendFile(path.resolve(dataDir, "audit.log"), `${JSON.stringify(record)}\n`);
  } catch (error) {
    console.warn(`Audit log write failed: ${error.message}`);
  }
}

async function readSnapshot() {
  const snapshotPath = path.resolve(dataDir, "latest-snapshot.json");
  const text = await fs.readFile(snapshotPath, "utf8");
  return JSON.parse(text);
}

async function readJsonIfExists(filePath, fallback = null) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function readConnectors() {
  return readJsonIfExists(connectorsPath, await readJsonIfExists(connectorsExamplePath, {}));
}

function isSecretField(key) {
  return /(api.?key|secret|token|password|credential|client.?secret|refresh.?token)/iu.test(key);
}

function maskSecrets(value) {
  if (Array.isArray(value)) return value.map(maskSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    isSecretField(key) ? (item ? "********" : "") : maskSecrets(item)
  ]));
}

function mergeSecretPlaceholders(nextValue, previousValue) {
  if (Array.isArray(nextValue)) return nextValue.map((item, index) => mergeSecretPlaceholders(item, previousValue?.[index]));
  if (!nextValue || typeof nextValue !== "object") return nextValue;

  return Object.fromEntries(Object.entries(nextValue).map(([key, item]) => {
    if (isSecretField(key) && item === "********") {
      return [key, previousValue?.[key] || ""];
    }
    return [key, mergeSecretPlaceholders(item, previousValue?.[key])];
  }));
}

async function writeConnectors(nextConnectors) {
  const previous = await readConnectors();
  const merged = Object.fromEntries(Object.entries(nextConnectors || {}).map(([id, connector]) => [
    id,
    mergeSecretPlaceholders(connector, previous?.[id])
  ]));
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(connectorsPath, `${JSON.stringify(merged, null, 2)}\n`);
  return merged;
}

async function runRefresh(req) {
  if (refreshInProgress) return { accepted: false, reason: "Refresh already in progress" };
  refreshInProgress = true;
  const { spawn } = await import("node:child_process");
  const child = spawn(process.execPath, ["scripts/update-data.js"], {
    cwd: rootDir,
    stdio: "ignore",
    env: process.env
  });
  child.on("exit", (code) => {
    refreshInProgress = false;
    void writeAudit("refresh_completed", req, { code, user: req.auth?.sub || null });
  });
  child.on("error", (error) => {
    refreshInProgress = false;
    void writeAudit("refresh_failed", req, { message: error.message, user: req.auth?.sub || null });
  });
  void writeAudit("refresh_started", req, { user: req.auth?.sub || null });
  return { accepted: true };
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    host,
    cadenceHours: refreshCadenceHours,
    auth: "dashboard-login"
  });
});

app.post("/api/login", requireLoginRateLimit, (req, res) => {
  const { username, password } = req.body || {};
  if (!safeEqual(username, dashboardUsername) || !safeEqual(password, dashboardPassword)) {
    recordLoginFailure(req);
    void writeAudit("login_failed", req, { username: username || null });
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  clearLoginFailures(req);
  const session = createSessionToken(username);
  void writeAudit("login_succeeded", req, { username });
  res.json({
    token: session.token,
    expiresAt: session.expiresAt,
    user: {
      username
    }
  });
});

app.get("/api/session", requireSession, (req, res) => {
  res.json({
    ok: true,
    user: {
      username: req.auth.sub
    }
  });
});

app.get("/api/snapshot", requireSession, async (_req, res, next) => {
  try {
    res.json(await readSnapshot());
  } catch (error) {
    next(error);
  }
});

app.get("/api/wiki", requireSession, async (_req, res, next) => {
  try {
    const wikiPath = path.resolve(dataDir, "product-selection-wiki.md");
    const fallbackWikiPath = path.resolve(rootDir, "docs", "product-selection-wiki.md");
    const wiki = await fs.readFile(wikiPath, "utf8").catch((error) => {
      if (error.code === "ENOENT") return fs.readFile(fallbackWikiPath, "utf8");
      throw error;
    });
    res.type("text/markdown").send(wiki);
  } catch (error) {
    next(error);
  }
});

app.get("/api/connectors", requireSession, async (_req, res, next) => {
  try {
    const connectors = await readConnectors();
    res.json({
      connectors: maskSecrets(connectors),
      savedLocally: true,
      secretsMasked: true
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/connectors", requireSession, async (req, res, next) => {
  try {
    const connectors = await writeConnectors(req.body?.connectors || {});
    const refresh = await runRefresh(req);
    void writeAudit("connectors_saved", req, {
      user: req.auth?.sub || null,
      connectorIds: Object.keys(connectors)
    });
    res.status(202).json({
      ok: true,
      refresh,
      connectors: maskSecrets(connectors)
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/risk/analyze", requireSession, async (req, res, next) => {
  try {
    const connectors = await readConnectors();
    const enabledRiskConnectors = Object.entries(connectors || {})
      .filter(([id, connector]) => connector?.enabled && /risk|patent|trademark|customs|culture|policy/iu.test(`${id} ${connector.type || ""}`))
      .map(([id]) => id);
    const { title, categoryName, sourcingUrl, regionName, countryName } = req.body || {};
    const hasSourcingUrl = /^https?:\/\/(.*\.)?1688\.com\//iu.test(String(sourcingUrl || ""));

    res.json({
      status: enabledRiskConnectors.length && hasSourcingUrl ? "evidence-required" : "needs-configuration",
      title: title || "未选择SKU",
      categoryName: categoryName || "",
      targetMarket: [regionName, countryName].filter(Boolean).join(" / "),
      sourcingUrl: sourcingUrl || "",
      evidenceConnectors: enabledRiskConnectors,
      sections: [
        {
          id: "patent-ip",
          title: "专利/商标/外观侵权核验",
          status: enabledRiskConnectors.length && hasSourcingUrl ? "waiting-for-evidence" : "needs-data-source",
          materials: [
            "1688商品链接、商品主图、详情页截图和供应商主体信息",
            "供应商提供的品牌授权书、专利/外观设计/商标权属或不侵权声明",
            "目标国家/地区的专利、外观设计、商标检索结果和检索日期",
            "样品实拍、包装/说明书/Logo/型号清单，用于比对是否仿冒或近似",
            "进口申报品名、HS编码、材质、用途和合规证书"
          ],
          dataNeeds: ["当地专利/外观设计库", "当地商标库", "平台禁限售政策", "海关扣押/侵权案例库"]
        },
        {
          id: "culture",
          title: "宗教、文化、习俗冲突核验",
          status: enabledRiskConnectors.length && hasSourcingUrl ? "waiting-for-evidence" : "needs-data-source",
          materials: [
            "商品图案、颜色、文案、人物形象、节日场景和包装素材",
            "目标国家/地区宗教、民族、政治符号、禁忌图案和节庆习俗规则",
            "平台当地内容政策、广告政策和买家投诉/下架案例",
            "本地语言标题、说明书、警示语和客服话术"
          ],
          dataNeeds: ["目标市场文化政策资料", "平台内容/广告政策", "本地化审核记录", "历史下架/退回案例"]
        },
        {
          id: "returns-fraud",
          title: "退货、空包、售后与货损风险",
          status: "needs-marketplace-data",
          materials: [
            "该SKU历史退货率、退款原因、拒付/争议率和空包案例",
            "平台当地退货政策、消费者保护规则和物流签收/称重证据",
            "出库称重、装箱视频、序列号/防拆标签和签收凭证留存方案"
          ],
          dataNeeds: ["卖家后台退货原因", "物流签收和重量数据", "平台争议/申诉记录"]
        }
      ],
      caveat: "未接入目标市场权威专利、商标、文化政策、平台政策和海关/售后案例数据前，本接口只给出核验材料和数据链路，不给出通过/不通过结论。"
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/refresh", requireSession, async (_req, res, next) => {
  try {
    const refresh = await runRefresh(_req);
    if (!refresh.accepted) {
      res.status(409).json({ error: refresh.reason });
      return;
    }
    res.status(202).json(refresh);
  } catch (error) {
    refreshInProgress = false;
    next(error);
  }
});

// ── Serve frontend static files from dist/ ──────────────────────────
const distDir = path.resolve(rootDir, "dist");

app.use(express.static(distDir, { index: false, fallthrough: true }));

// SPA catch-all: return index.html for any non-API GET request
app.get("*", (req, res, next) => {
  // Skip API routes, health, and non-GET methods already handled
  if (req.path.startsWith("/api/") || req.path === "/health") return next();
  res.sendFile(path.join(distDir, "index.html"), (err) => {
    if (err) next();
  });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    error: "Internal server error",
    message: error.message
  });
});

try {
  validateRuntimeConfig();
  app.listen(port, host, () => {
    console.log(`Local API listening on http://${host}:${port}`);
    console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
    console.log("Dashboard login configured: yes");
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
