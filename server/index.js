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
const dashboardUsername = process.env.DASHBOARD_USERNAME || "admin";
const dashboardPassword = process.env.DASHBOARD_PASSWORD || apiToken;
const sessionSecret = process.env.SESSION_SECRET || runtimeSecret;
const sessionTtlHours = Number(process.env.SESSION_TTL_HOURS || 12);
const allowedOrigins = (process.env.CORS_ORIGINS || "http://127.0.0.1:5173,http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);
app.use(morgan("tiny"));
app.use(express.json({ limit: "1mb" }));
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

async function readSnapshot() {
  const snapshotPath = path.resolve(dataDir, "latest-snapshot.json");
  const text = await fs.readFile(snapshotPath, "utf8");
  return JSON.parse(text);
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    host,
    cadenceHours: 12,
    auth: "dashboard-login"
  });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!safeEqual(username, dashboardUsername) || !safeEqual(password, dashboardPassword)) {
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const session = createSessionToken(username);
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
    const wiki = await fs.readFile(path.resolve(rootDir, "docs", "product-selection-wiki.md"), "utf8");
    res.type("text/markdown").send(wiki);
  } catch (error) {
    next(error);
  }
});

app.post("/api/refresh", requireSession, async (_req, res, next) => {
  try {
    const { spawn } = await import("node:child_process");
    const child = spawn(process.execPath, ["scripts/update-data.js"], {
      cwd: rootDir,
      stdio: "ignore",
      detached: true,
      env: process.env
    });
    child.unref();
    res.status(202).json({ accepted: true });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    error: "Internal server error",
    message: error.message
  });
});

app.listen(port, host, () => {
  console.log(`Local API listening on http://${host}:${port}`);
  console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
  console.log(`Dashboard login user: ${dashboardUsername}`);
});
