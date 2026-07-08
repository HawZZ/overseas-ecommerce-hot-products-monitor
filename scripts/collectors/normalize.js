/**
 * 数据标准化脚本
 * 将采集器原始数据转换为 loadVendorExports() 兼容格式
 * 输出到 data/vendor-exports/normalized/ 供 refresh 管道读取
 */
import fs from "node:fs/promises";
import path from "node:path";
import { vendorExportsDir, inferTierId, categories } from "./config.js";

const normalizedDir = path.resolve(vendorExportsDir, "normalized");

/**
 * 从 Google Trends 数据构建搜索量映射
 * { "sea:mobile-accessories": { searchVolume: X, searchChange: Y } }
 */
function buildSearchIndex(trendsData) {
  const index = {};
  if (!trendsData?.rows) return index;

  for (const row of trendsData.rows) {
    const key = `${row.countryCode?.toLowerCase() || "sea"}:${row.categoryId}`;
    if (!index[key]) {
      index[key] = { searchVolume: 0, searchChange: 0, count: 0 };
    }
    index[key].searchVolume += row.search90d || 0;
    index[key].searchChange += row.searchChange || 0;
    index[key].count += 1;
  }

  for (const key of Object.keys(index)) {
    const entry = index[key];
    entry.searchVolume = Math.round(entry.searchVolume / (entry.count || 1));
    entry.searchChange = Math.round((entry.searchChange / (entry.count || 1)) * 10) / 10;
  }

  return index;
}

/**
 * 将评分(0-5)映射到口碑分(-1到+1)
 */
function ratingToSentiment(rating) {
  if (!rating || rating <= 0) return 0;
  return Math.round(((rating - 3) / 2) * 100) / 100;
}

/**
 * 估算成单率 (基于品类和价格带的合理范围)
 */
function estimateConversionRate(categoryId, priceUsd) {
  const baseByCategory = {
    "mobile-accessories": 0.06,
    "beauty-tools": 0.05,
    "home-organization": 0.07,
    "pet-supplies": 0.06,
    "fitness-outdoor": 0.04,
    "consumer-electronics": 0.03,
    "small-appliances": 0.05
  };
  const base = baseByCategory[categoryId] || 0.05;
  const priceFactor = priceUsd < 15 ? 1.2 : priceUsd < 50 ? 1.0 : 0.8;
  return Math.round(base * priceFactor * 10000) / 10000;
}

function normalizeProductRow(raw, searchIndex, sourceName) {
  const price = Number(raw.price) || 0;
  const priceTierId = raw.priceTierId || inferTierId(price);
  const countryCode = (raw.countryCode || "SG").toLowerCase();
  const categoryKey = `${countryCode}:${raw.categoryId}`;
  const search = searchIndex[categoryKey] || {};

  return {
    title: raw.title || "未命名导入SKU",
    regionId: raw.regionId || "sea",
    platformId: raw.platformId || "shopee",
    categoryId: raw.categoryId || "",
    priceTierId: priceTierId || "",
    date: raw.collectedAt?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    salesUnits: Number(raw.salesUnits) || 0,
    searchVolume: search.searchVolume || Math.round((Number(raw.salesUnits) || 100) * 18),
    conversionRate: estimateConversionRate(raw.categoryId, price),
    averageOrderValue: price,
    sentiment: ratingToSentiment(Number(raw.rating)),
    reviewVolume: Number(raw.reviewVolume) || 0,
    sourceName,
    _raw: {
      itemId: raw.itemId,
      platformDomain: raw.platformDomain,
      countryCode: raw.countryCode,
      currency: raw.currency,
      priceLocal: raw.priceLocal,
      searchKeyword: raw.searchKeyword,
      shopName: raw.shopName
    }
  };
}

async function readJsonIfExists(filePath) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function findLatestFile(dir, prefix) {
  try {
    const files = await fs.readdir(dir);
    const matching = files
      .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
      .sort()
      .reverse();
    return matching[0] ? path.resolve(dir, matching[0]) : null;
  } catch {
    return null;
  }
}

export async function normalizeAll() {
  console.log("\n=== 数据标准化开始 ===");
  await fs.mkdir(normalizedDir, { recursive: true });

  // 1. 读取 Google Trends 数据
  const trendsFile = await findLatestFile(vendorExportsDir, "google-trends-sea");
  const trendsData = trendsFile ? await readJsonIfExists(trendsFile) : null;
  const searchIndex = buildSearchIndex(trendsData);
  console.log(`  Google Trends 索引: ${Object.keys(searchIndex).length} 个品类/地区组合`);

  let totalNormalized = 0;

  // 2. 标准化 Shopee 数据
  const shopeeFile = await findLatestFile(vendorExportsDir, "shopee-sea");
  if (shopeeFile) {
    const shopeeData = await readJsonIfExists(shopeeFile);
    if (shopeeData?.rows?.length) {
      const normalized = shopeeData.rows
        .filter((row) => row.title && row.price > 0 && row.priceTierId)
        .map((row) => normalizeProductRow(row, searchIndex, `shopee-${row.countryCode || "sea"}`));

      const outputFile = path.resolve(normalizedDir, "shopee-sea-normalized.json");
      await fs.writeFile(outputFile, JSON.stringify({ rows: normalized }, null, 2));
      console.log(`  Shopee 标准化: ${normalized.length} 行 -> ${outputFile}`);
      totalNormalized += normalized.length;
    }
  } else {
    console.log("  Shopee: 未找到原始数据文件");
  }

  // 3. 标准化 Lazada 数据
  const lazadaFile = await findLatestFile(vendorExportsDir, "lazada-sea");
  if (lazadaFile) {
    const lazadaData = await readJsonIfExists(lazadaFile);
    if (lazadaData?.rows?.length) {
      const normalized = lazadaData.rows
        .filter((row) => row.title && row.price > 0 && row.priceTierId)
        .map((row) => normalizeProductRow(row, searchIndex, `lazada-${row.countryCode || "sea"}`));

      const outputFile = path.resolve(normalizedDir, "lazada-sea-normalized.json");
      await fs.writeFile(outputFile, JSON.stringify({ rows: normalized }, null, 2));
      console.log(`  Lazada 标准化: ${normalized.length} 行 -> ${outputFile}`);
      totalNormalized += normalized.length;
    }
  } else {
    console.log("  Lazada: 未找到原始数据文件");
  }

  console.log(`\n  标准化总计: ${totalNormalized} 行`);
  console.log("=== 数据标准化完成 ===\n");

  return totalNormalized;
}

if (process.argv[1]?.endsWith("normalize.js")) {
  normalizeAll().catch(console.error);
}
