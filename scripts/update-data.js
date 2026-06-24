import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.resolve(rootDir, process.env.DATA_DIR || "data");

const priceTiers = [
  { id: "0-5", label: "0-5美元", min: 0, max: 5 },
  { id: "5-15", label: "5-15美元", min: 5, max: 15 },
  { id: "15-30", label: "15-30美元", min: 15, max: 30 },
  { id: "30-50", label: "30-50美元", min: 30, max: 50 },
  { id: "50-70", label: "50-70美元", min: 50, max: 70 },
  { id: "70-100", label: "70-100美元", min: 70, max: 100 },
  { id: "100-200", label: "100-200美元", min: 100, max: 200 }
];

const categoryPool = [
  {
    id: "mobile-accessories",
    name: "手机配件",
    logic: "低客单、高复购、平台搜索词更新快，适合用点击率和转化率快速验证。",
    items: ["磁吸理线扣", "防摔手机壳", "快充数据线", "镜头保护贴", "折叠手机支架"]
  },
  {
    id: "beauty-tools",
    name: "美妆个护",
    logic: "内容驱动强，短视频搜索和平台成交常不同步，适合监控搜索增速和客单价稳定性。",
    items: ["旅行化妆刷", "卷发定型梳", "补水面膜套装", "睫毛夹套装", "便携喷雾仪"]
  },
  {
    id: "home-organization",
    name: "家居收纳",
    logic: "视觉展示影响大，价格带跨度宽，适合用评价密度和加购成单率筛选稳定爆品。",
    items: ["抽屉分隔盒", "厨房沥水架", "真空压缩袋", "可叠加鞋盒", "旋转调料架"]
  },
  {
    id: "pet-supplies",
    name: "宠物用品",
    logic: "情绪价值和复购并存，适合关注搜索增长、退货率和平台达人内容。",
    items: ["宠物除毛刷", "自动饮水器", "慢食宠物碗", "发光牵引绳", "猫砂垫"]
  },
  {
    id: "fitness-outdoor",
    name: "运动户外",
    logic: "季节性明显，广告成本和物流体积影响利润，适合用90天趋势识别周期拐点。",
    items: ["阻力训练带", "速干运动毛巾", "骑行手机包", "折叠露营灯", "按摩筋膜球"]
  },
  {
    id: "consumer-electronics",
    name: "消费电子",
    logic: "客单价高但合规和售后压力大，适合用搜索热度、竞品数量和评价增速联合判断。",
    items: ["蓝牙追踪器", "迷你投影仪", "无线充电座", "降噪耳机", "便携显示屏"]
  },
  {
    id: "small-appliances",
    name: "小家电",
    logic: "供应链和认证门槛较高，适合关注客单价趋势、差评关键词和区域适配。",
    items: ["迷你封口机", "便携榨汁杯", "除螨吸尘器", "旅行电热杯", "桌面空气循环扇"]
  }
];

const productQualifiers = [
  "轻量款",
  "升级款",
  "跨境款",
  "家庭装",
  "便携款",
  "高复购款",
  "礼品款",
  "低退货款",
  "达人同款",
  "利润款"
];

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isoDateDaysAgo(daysAgo) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

async function readJson(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return JSON.parse(text);
}

function chooseCategory(tierIndex, rank) {
  return categoryPool[(tierIndex + rank) % categoryPool.length];
}

function priceForTier(tier, rng) {
  const span = tier.max - tier.min;
  const low = tier.min + span * 0.18;
  const high = tier.max - span * 0.12;
  return round(low + (high - low) * rng(), 2);
}

function generateTrend({ seedKey, tier, rank, platformWeight, categoryIndex }) {
  const rng = createRng(hashString(seedKey));
  const price = priceForTier(tier, rng);
  const tierPower = Math.max(0.68, 1.35 - tier.min / 190);
  const baseSales = (2300 * tierPower + platformWeight * 18) / Math.sqrt(rank + 1);
  const baseSearch = baseSales * (8.5 + rng() * 8.5);
  const conversionBase = clamp(0.028 + tierPower * 0.03 + rng() * 0.025 - rank * 0.0012, 0.018, 0.14);
  const trendLift = -0.18 + rng() * 0.62;
  const seasonality = 0.05 + rng() * 0.12;

  return Array.from({ length: 90 }, (_, index) => {
    const age = 89 - index;
    const progress = index / 89;
    const weekly = Math.sin((index + categoryIndex) / 7) * seasonality;
    const noise = (rng() - 0.5) * 0.12;
    const lift = 1 + trendLift * progress + weekly + noise;
    const salesUnits = Math.max(3, Math.round(baseSales * lift));
    const searchVolume = Math.max(120, Math.round(baseSearch * (lift + 0.08 + rng() * 0.1)));
    const conversionRate = round(clamp(conversionBase + trendLift * 0.018 * progress + weekly * 0.025 + noise * 0.02, 0.01, 0.19), 4);
    const aov = round(price * (0.96 + rng() * 0.12 + progress * trendLift * 0.035), 2);

    return {
      date: isoDateDaysAgo(age),
      salesUnits,
      searchVolume,
      conversionRate,
      averageOrderValue: aov
    };
  });
}

function summarizeTrend(points) {
  const first = points.slice(0, 14);
  const last = points.slice(-14);
  const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
  const avg = (rows, key) => sum(rows, key) / rows.length;
  const pctChange = (start, end) => round(((end - start) / Math.max(1, start)) * 100, 1);
  const sales90d = sum(points, "salesUnits");
  const search90d = sum(points, "searchVolume");
  const conversionNow = avg(last, "conversionRate");
  const aovNow = avg(last, "averageOrderValue");
  const salesChange = pctChange(sum(first, "salesUnits"), sum(last, "salesUnits"));
  const searchChange = pctChange(sum(first, "searchVolume"), sum(last, "searchVolume"));
  const conversionChange = round((avg(last, "conversionRate") - avg(first, "conversionRate")) * 100, 2);
  const aovChange = pctChange(avg(first, "averageOrderValue"), avg(last, "averageOrderValue"));

  return {
    sales90d,
    search90d,
    conversionRate: round(conversionNow, 4),
    averageOrderValue: round(aovNow, 2),
    salesChange,
    searchChange,
    conversionChange,
    aovChange
  };
}

function productScore(summary, tier) {
  const salesScore = Math.log10(summary.sales90d + 1) * 18;
  const searchScore = Math.log10(summary.search90d + 1) * 13;
  const conversionScore = summary.conversionRate * 240;
  const marginProxy = Math.log2(tier.max + 2) * 5;
  const momentum = summary.salesChange * 0.35 + summary.searchChange * 0.22 + summary.conversionChange * 3;
  return round(salesScore + searchScore + conversionScore + marginProxy + momentum, 1);
}

function platformNumericWeight(platform) {
  return platform.marketSharePercent || platform.platformWeight || 5;
}

function generateSnapshot(platformSources) {
  const products = [];
  for (const region of platformSources.regions) {
    for (const platform of region.platforms) {
      const platformWeight = platformNumericWeight(platform);
      priceTiers.forEach((tier, tierIndex) => {
        for (let rankSeed = 1; rankSeed <= 10; rankSeed += 1) {
          const category = chooseCategory(tierIndex, rankSeed + platform.rank);
          const item = category.items[(rankSeed + tierIndex + platform.rank) % category.items.length];
          const qualifier = productQualifiers[(rankSeed + tierIndex + platform.rank) % productQualifiers.length];
          const seedKey = `${region.id}:${platform.id}:${tier.id}:${rankSeed}`;
          const trend = generateTrend({
            seedKey,
            tier,
            rank: rankSeed,
            platformWeight,
            categoryIndex: categoryPool.findIndex((entry) => entry.id === category.id)
          });
          const summary = summarizeTrend(trend);
          const score = productScore(summary, tier);

          products.push({
            id: `${region.id}-${platform.id}-${tier.id}-${rankSeed}`,
            title: `${item} ${qualifier}`,
            regionId: region.id,
            regionName: region.name,
            platformId: platform.id,
            platformName: platform.name,
            priceTierId: tier.id,
            priceTierLabel: tier.label,
            categoryId: category.id,
            categoryName: category.name,
            selectionLogic: category.logic,
            score,
            rankSeed,
            summary,
            trend
          });
        }
      });
    }
  }

  const tierRanks = priceTiers.map((tier) => {
    const rows = products
      .filter((product) => product.priceTierId === tier.id)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((product, index) => ({ ...product, rank: index + 1 }));

    return {
      ...tier,
      products: rows
    };
  });

  const regionalSummary = platformSources.regions.map((region) => {
    const regionProducts = products.filter((product) => product.regionId === region.id);
    const topProducts = regionProducts.sort((a, b) => b.score - a.score).slice(0, 10);
    return {
      id: region.id,
      name: region.name,
      platformCount: region.platforms.length,
      totalSales90d: regionProducts.reduce((total, product) => total + product.summary.sales90d, 0),
      totalSearch90d: regionProducts.reduce((total, product) => total + product.summary.search90d, 0),
      averageConversionRate: round(
        regionProducts.reduce((total, product) => total + product.summary.conversionRate, 0) / regionProducts.length,
        4
      ),
      topProducts: topProducts.map((product, index) => ({
        rank: index + 1,
        productId: product.id,
        title: product.title,
        platformName: product.platformName,
        priceTierLabel: product.priceTierLabel,
        score: product.score
      }))
    };
  });

  const wikiSignals = categoryPool.map((category) => {
    const categoryProducts = products.filter((product) => product.categoryId === category.id);
    const top = categoryProducts.sort((a, b) => b.score - a.score).slice(0, 12);
    return {
      categoryId: category.id,
      categoryName: category.name,
      logic: category.logic,
      averageScore: round(top.reduce((sum, product) => sum + product.score, 0) / top.length, 1),
      winningPriceTiers: [...new Set(top.slice(0, 5).map((product) => product.priceTierLabel))],
      leadingPlatforms: [...new Set(top.slice(0, 5).map((product) => product.platformName))],
      observedPattern: buildObservedPattern(top)
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    dataMode: "synthetic-seed",
    dataModeNote: "This snapshot is generated from platform ranking seeds. Replace connector adapters with licensed platform or vendor data for production.",
    refreshCadenceHours: 12,
    priceTiers,
    regions: platformSources.regions,
    sources: platformSources.sources,
    globalDataSources: platformSources.globalDataSources,
    regionalSummary,
    tierRanks,
    wikiSignals
  };
}

function buildObservedPattern(products) {
  const positive = products.filter((product) => product.summary.salesChange > 0).length;
  const searchLed = products.filter((product) => product.summary.searchChange > product.summary.salesChange).length;
  const aovStable = products.filter((product) => Math.abs(product.summary.aovChange) < 8).length;

  if (searchLed >= 7) {
    return "搜索增长领先销量，适合提前建词包和内容素材。";
  }
  if (positive >= 8 && aovStable >= 7) {
    return "销量增长且客单价稳定，适合加深供应链和广告预算。";
  }
  if (aovStable <= 4) {
    return "客单价波动较大，需要先拆解促销、套装和物流成本。";
  }
  return "销量和搜索同步增长，适合用小批量库存测试区域扩张。";
}

function createDefaultWiki(snapshot) {
  const generatedDate = snapshot.generatedAt.slice(0, 10);
  const sections = snapshot.wikiSignals
    .map(
      (signal) => `## ${signal.categoryName}

- 观察模式：${signal.observedPattern}
- 常见价格带：${signal.winningPriceTiers.join("、")}
- 领先平台：${signal.leadingPlatforms.join("、")}
- 选品逻辑：${signal.logic}
- 下一步动作：检查近14天搜索增速是否继续领先销量，并核对差评关键词、退货原因、物流体积和平台广告成本。`
    )
    .join("\n\n");

  return `# 选品 Wiki

更新时间：${generatedDate}

本 wiki 由本地脚本根据最新看板快照生成。默认模式使用监控种子数据，不调用模型；接入真实平台或第三方数据后，结论会随快照更新。

## 判断框架

1. 先看搜索增长，再看销量承接。搜索领先但销量未跟上时，优先检查主图、价格、评价数和配送时效。
2. 同一价格带内比较成单率，不跨价格带硬比。低价带看规模，高价带看利润和售后风险。
3. 客单价稳定且销量增长的商品，优先进入打样和小批量补货。
4. 客单价上涨但成单率下降的商品，先判断是否被促销结束或竞品低价冲击影响。
5. 区域扩张前先核对平台规则、认证要求、退货成本和本地节日周期。

${sections}
`;
}

async function maybeCreateAiWiki(snapshot) {
  const withAiWiki = process.argv.includes("--with-ai-wiki");
  if (!withAiWiki) {
    return createDefaultWiki(snapshot);
  }

  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) {
    console.warn("OPENAI_API_KEY or OPENAI_MODEL is missing. Falling back to rule-based wiki.");
    return createDefaultWiki(snapshot);
  }

  const topSignals = snapshot.tierRanks.map((tier) => ({
    tier: tier.label,
    topProducts: tier.products.slice(0, 5).map((product) => ({
      title: product.title,
      platform: product.platformName,
      region: product.regionName,
      score: product.score,
      salesChange: product.summary.salesChange,
      searchChange: product.summary.searchChange,
      conversionRate: product.summary.conversionRate,
      averageOrderValue: product.summary.averageOrderValue
    }))
  }));

  const prompt = [
    "你是跨境电商选品分析师。基于以下JSON，输出中文选品wiki。",
    "要求：只使用给定数据，不编造外部事实；按价格带和品类总结爆品逻辑；给出可执行动作；不要使用夸张营销语。",
    JSON.stringify(topSignals)
  ].join("\n\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL,
      input: prompt
    })
  });

  if (!response.ok) {
    const text = await response.text();
    console.warn(`OpenAI request failed (${response.status}). Falling back to rule-based wiki. ${text.slice(0, 200)}`);
    return createDefaultWiki(snapshot);
  }

  const json = await response.json();
  const content = json.output_text || json.output?.flatMap((item) => item.content || []).map((item) => item.text).filter(Boolean).join("\n");
  return content || createDefaultWiki(snapshot);
}

async function main() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(path.resolve(rootDir, "docs"), { recursive: true });

  const platformSources = await readJson(path.resolve(dataDir, "platform-sources.json"));
  const snapshot = generateSnapshot(platformSources);
  const wiki = await maybeCreateAiWiki(snapshot);

  await fs.writeFile(path.resolve(dataDir, "latest-snapshot.json"), `${JSON.stringify(snapshot)}\n`);
  await fs.writeFile(path.resolve(rootDir, "docs", "product-selection-wiki.md"), wiki);

  console.log(`Generated ${snapshot.tierRanks.length} price-tier rankings at ${snapshot.generatedAt}`);
  console.log(`Wrote ${path.relative(rootDir, path.resolve(dataDir, "latest-snapshot.json"))}`);
  console.log("Wrote docs/product-selection-wiki.md");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
