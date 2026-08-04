#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import CDP from "chrome-remote-interface";

const execFileAsync = promisify(execFile);
const configDir = path.join(os.homedir(), ".config", "shopee-tw-cdp-collector");
const configPath = path.join(configDir, "config.json");
const lockPath = path.join(configDir, "run.lock");
const profileDir = path.join(configDir, "chrome-profile");
const defaultPagesConfigUrl = "https://hawzz.github.io/overseas-ecommerce-hot-products-monitor/config.json";
const allowedPath = "/api/v4/search/search_items";
const minNavigationDelayMs = 30_000;
const maxNavigations = 28;

function usage() {
  console.log("Usage: node collector.mjs <init|pair|run|install-launchd|uninstall-launchd> [options]");
}

async function writePrivate(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, file);
  await fs.chmod(file, 0o600);
}

async function readConfig() {
  try { return JSON.parse(await fs.readFile(configPath, "utf8")); } catch { throw new Error(`配置不存在，请先执行 init：${configPath}`); }
}

function argument(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function requireApiBase(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1" && url.hostname !== "localhost") throw new Error("API 地址必须为 https 或本机地址");
  return url.toString().replace(/\/$/u, "");
}

async function healthyApiBase(apiBase) {
  const response = await fetch(`${apiBase}/health`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.auth !== "dashboard-login") throw new Error("tunnel_unavailable");
  return apiBase;
}

async function resolveApiBase(config) {
  const configUrl = config.pagesConfigUrl || defaultPagesConfigUrl;
  try {
    const response = await fetch(`${configUrl}${configUrl.includes("?") ? "&" : "?"}t=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
    const body = await response.json();
    return await healthyApiBase(requireApiBase(body.defaultApiBase));
  } catch (error) {
    if (config.apiBase) return healthyApiBase(requireApiBase(config.apiBase));
    throw error;
  }
}

async function init() {
  const apiBase = requireApiBase(argument("--api", ""));
  const config = { apiBase, pagesConfigUrl: argument("--config-url", defaultPagesConfigUrl), cdpHost: "127.0.0.1", cdpPort: Number(argument("--port", "9222")), profileDir, clientName: argument("--name", "Shopee TW CDP") };
  await writePrivate(configPath, config);
  console.log(`已写入本机配置：${configPath}`);
  console.log("即将打开专用可见 Chrome。请在其中手动选择繁体中文、登录或完成平台验证，再执行 pair 和 run。");
  await fs.mkdir(profileDir, { recursive: true, mode: 0o700 });
  await execFileAsync("open", ["-na", "Google Chrome", "--args", `--remote-debugging-address=${config.cdpHost}`, `--remote-debugging-port=${config.cdpPort}`, `--user-data-dir=${profileDir}`, "https://shopee.tw/"]);
}

async function pair() {
  const config = await readConfig();
  const apiBase = await resolveApiBase(config);
  const code = argument("--code");
  if (!code) throw new Error("缺少 --code。请从监控面板的 Shopee 台湾采集器卡片生成一次性配对码。");
  const response = await fetch(`${apiBase}/api/collector/pair`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, name: config.clientName }) });
  const body = await response.json();
  if (!response.ok || !body.token) throw new Error(`配对失败：${body.error || response.status}`);
  await writePrivate(configPath, { ...config, apiBase, clientId: body.clientId, token: body.token, tokenExpiresAt: body.expiresAt });
  console.log(`已配对，Token 到期：${body.expiresAt}`);
}

function productUrl(item) {
  const shopId = item.shopid ?? item.shop_id;
  const itemId = item.itemid ?? item.item_id;
  return shopId && itemId ? `https://shopee.tw/product/${shopId}/${itemId}` : "";
}

function parseSearchResponse(text, context) {
  const parsed = JSON.parse(text);
  if (parsed?.error === 90309999 || parsed?.error_msg) throw new Error("platform_blocked");
  if (!Array.isArray(parsed?.items)) throw new Error("response_structure_changed");
  return parsed.items.map((entry, index) => {
    const item = entry.item_basic || entry;
    const shopId = item.shopid ?? item.shop_id;
    const itemId = item.itemid ?? item.item_id;
    const price = Number(item.price ?? item.price_min) / (Number(item.price ?? item.price_min) > 100000 ? 100000 : 1);
    if (!shopId || !itemId || !item.name || !Number.isFinite(price) || price <= 0) return null;
    return {
      shopId: String(shopId), itemId: String(itemId), title: String(item.name).slice(0, 300), productUrl: productUrl(item),
      imageUrl: item.image ? `https://down-tw.img.susercontent.com/file/${item.image}` : null,
      priceTwd: price, sold: Number.isFinite(Number(item.sold)) ? Number(item.sold) : null,
      historicalSold: Number.isFinite(Number(item.historical_sold)) ? Number(item.historical_sold) : null,
      rating: Number.isFinite(Number(item.item_rating?.rating_star)) ? Number(item.item_rating.rating_star) : null,
      reviewCount: Number.isFinite(Number(item.item_rating?.rating_count?.[0])) ? Number(item.item_rating.rating_count[0]) : null,
      categoryId: context.categoryId, shopeeCategoryId: String(context.shopeeCategoryId), rankMode: context.rankMode, sourceRank: context.page * 60 + index + 1, page: context.page
    };
  }).filter(Boolean);
}

function categoryNavigation(url, rankMode, page) {
  const target = new URL(url);
  target.searchParams.set("page", String(page));
  if (rankMode === "sales") target.searchParams.set("sortBy", "sales"); else target.searchParams.delete("sortBy");
  return target.toString();
}

async function captureNavigation(client, targetUrl, context) {
  const { Network, Page, Runtime } = client;
  const captured = [];
  let blocked = false;
  const onResponse = async ({ requestId, response }) => {
    if (!response.url.startsWith("https://shopee.tw") || !new URL(response.url).pathname.endsWith(allowedPath)) return;
    try {
      const body = await Network.getResponseBody({ requestId });
      captured.push(...parseSearchResponse(body.body, context));
    } catch (error) { blocked = error.message === "platform_blocked" || error.message === "response_structure_changed" ? error.message : blocked; }
  };
  Network.responseReceived(onResponse);
  await Page.navigate({ url: targetUrl });
  await new Promise((resolve) => setTimeout(resolve, 8_000));
  const title = await Runtime.evaluate({ expression: "document.title + ' ' + document.body.innerText.slice(0, 600)", returnByValue: true });
  if (/captcha|驗證|verification|90309999/iu.test(title.result.value || "")) blocked = "platform_blocked";
  Network.responseReceived.removeListener?.(onResponse);
  if (blocked) throw new Error(blocked);
  if (!captured.length) throw new Error("response_structure_changed");
  return captured;
}

async function notify(message) {
  await execFileAsync("osascript", ["-e", `display notification ${JSON.stringify(message)} with title "Shopee 台湾采集器"`]).catch(() => {});
}

async function run() {
  const config = await readConfig();
  const apiBase = await resolveApiBase(config);
  if (!config.token) throw new Error("尚未配对，请先执行 pair。");
  try { await fs.writeFile(lockPath, String(process.pid), { flag: "wx", mode: 0o600 }); } catch { throw new Error("已有采集任务运行中"); }
  try {
    const mapResponse = await fetch(`${apiBase}/api/collector/shopee-tw/category-map`, { headers: { Authorization: `Collector ${config.token}` } });
    if (!mapResponse.ok) throw new Error("collector_token_invalid");
    const categories = (await mapResponse.json()).categories || [];
    if (!categories.length) throw new Error("category_map_missing");
    const client = await CDP({ host: config.cdpHost, port: config.cdpPort });
    await client.Network.enable(); await client.Page.enable();
    const products = []; let navigations = 0;
    for (const category of categories) {
      for (const rankMode of ["sales", "relevance"]) {
        for (const page of [0, 1]) {
          if (navigations >= maxNavigations) break;
          products.push(...await captureNavigation(client, categoryNavigation(category.url, rankMode, page), { ...category, rankMode, page }));
          navigations += 1;
          if (navigations < maxNavigations) await new Promise((resolve) => setTimeout(resolve, minNavigationDelayMs));
        }
      }
    }
    await client.close();
    const byKey = new Map(); for (const product of products) { const key = `${product.shopId}:${product.itemId}:${product.rankMode}:${product.categoryId}`; if (!byKey.has(key)) byKey.set(key, product); }
    const response = await fetch(`${apiBase}/api/collector/shopee-tw/batches`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Collector ${config.token}` }, body: JSON.stringify({ schemaVersion: "shopee-tw-cdp-v1", cycleId: crypto.randomUUID(), collectedAt: new Date().toISOString(), market: "TW", products: [...byKey.values()] }) });
    if (!response.ok) throw new Error(`upload_failed_${response.status}`);
    console.log(`采集完成：${byKey.size} 行，${navigations} 次导航。`);
  } catch (error) { await notify(`本轮停止：${error.message}。上一批有效数据未覆盖。`); throw error; } finally { await fs.unlink(lockPath).catch(() => {}); }
}

async function installLaunchd(remove = false) {
  const plist = path.join(os.homedir(), "Library", "LaunchAgents", "com.overseas-ecommerce.shopee-tw-cdp.plist");
  if (remove) { await execFileAsync("launchctl", ["unload", plist]).catch(() => {}); await fs.unlink(plist).catch(() => {}); return console.log("已卸载 launchd 任务。"); }
  const script = path.resolve(process.argv[1]);
  const content = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>com.overseas-ecommerce.shopee-tw-cdp</string><key>ProgramArguments</key><array><string>${process.execPath}</string><string>${script}</string><string>run</string></array><key>StartInterval</key><integer>43200</integer><key>RunAtLoad</key><false/></dict></plist>`;
  await fs.mkdir(path.dirname(plist), { recursive: true }); await fs.writeFile(plist, content, { mode: 0o600 }); await execFileAsync("launchctl", ["load", plist]); console.log(`已安装：${plist}`);
}

const command = process.argv[2];
try { if (command === "init") await init(); else if (command === "pair") await pair(); else if (command === "run") await run(); else if (command === "install-launchd") await installLaunchd(); else if (command === "uninstall-launchd") await installLaunchd(true); else usage(); } catch (error) { console.error(error.message); process.exitCode = 1; }
