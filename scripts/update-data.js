import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.resolve(rootDir, process.env.DATA_DIR || "data");
const refreshCadenceHours = Number(process.env.REFRESH_CADENCE_HOURS || 6);

const priceTiers = [
  { id: "0-5", label: "0-5美元", min: 0, max: 5 },
  { id: "5-15", label: "5-15美元", min: 5, max: 15 },
  { id: "15-30", label: "15-30美元", min: 15, max: 30 },
  { id: "30-50", label: "30-50美元", min: 30, max: 50 },
  { id: "50-70", label: "50-70美元", min: 50, max: 70 },
  { id: "70-100", label: "70-100美元", min: 70, max: 100 },
  { id: "100-200", label: "100-200美元", min: 100, max: 200 }
];

const regionSizing = {
  sea: {
    growth: 15.2,
    tamUsdB: 157.6,
    serviceableRate: 0.18,
    obtainableRate: 0.012,
    channelFit: "Shopee和TikTok Shop双轮验证，先内容后店铺承接。",
    complianceFocus: "本地标签、插头规格、化妆品备案和清真敏感品类。",
    logisticsMode: "轻小件直邮验证，动销稳定后转海外仓或平台仓。"
  },
  "north-america": {
    growth: 8.1,
    tamUsdB: 1430,
    serviceableRate: 0.1,
    obtainableRate: 0.006,
    channelFit: "Amazon作为基准盘，Walmart和eBay用于价格防守。",
    complianceFocus: "CPSC、FDA、FCC、加州Prop 65和包装合规。",
    logisticsMode: "FBA或本地3PL承接热销SKU，高客单新品保留直邮。"
  },
  "western-europe": {
    growth: 7.4,
    tamUsdB: 1100,
    serviceableRate: 0.09,
    obtainableRate: 0.005,
    channelFit: "Amazon和eBay做泛品验证，Zalando、Cdiscount、bol.com做本地化切入。",
    complianceFocus: "CE、RoHS、REACH、GPSR、VAT和环保包装责任。",
    logisticsMode: "欧盟仓配合VAT合规，高退货风险品类先小批量测试。"
  },
  africa: {
    growth: 12.8,
    tamUsdB: 38,
    serviceableRate: 0.16,
    obtainableRate: 0.01,
    channelFit: "Jumia和Takealot验证本地刚需，Amazon、SHEIN、Temu做价格锚点。",
    complianceFocus: "南非和尼日利亚本地认证、支付覆盖、售后可达性。",
    logisticsMode: "优先轻小耐用品，避免早期压重货库存。"
  }
};

const buyerSegments = [
  {
    id: "value-essentials",
    name: "价格敏感刚需型",
    shareEstimate: "28%-34%",
    demographics: "18-35岁移动端高频购物用户，集中在东南亚、非洲和北美折扣渠道。",
    jtbd: "用可接受的低价快速解决日常小问题，并获得稳定配送体验。",
    painPoints: ["同质化严重", "质量不稳定", "到货慢导致差评"],
    desiredGains: ["低客单高周转", "评价数增长快", "退货率低"],
    fit: "适合0-15美元轻小件，用搜索和成单率快速筛掉伪需求。"
  },
  {
    id: "content-led-impulse",
    name: "内容种草冲动型",
    shareEstimate: "18%-24%",
    demographics: "TikTok、Instagram、YouTube驱动的年轻消费者，女性和礼品场景占比高。",
    jtbd: "被短视频或达人场景激发后，立刻找到同款或替代款下单。",
    painPoints: ["内容热度衰减快", "主图与实物落差", "素材复用难"],
    desiredGains: ["搜索领先销量", "达人内容可复制", "包装适合分享"],
    fit: "适合美妆个护、宠物和家居收纳，用搜索领先指数判断备货窗口。"
  },
  {
    id: "quality-upgrade-family",
    name: "品质升级家庭型",
    shareEstimate: "16%-22%",
    demographics: "25-45岁家庭用户，愿意为耐用、易安装、安全材料付溢价。",
    jtbd: "用更可靠的家居、宠物、小家电产品提升日常效率。",
    painPoints: ["认证和说明书不本地化", "退换货成本高", "配件缺失"],
    desiredGains: ["客单价稳定", "差评可控", "售后说明清晰"],
    fit: "适合15-70美元价格带，必须把合规和售后写入选品门槛。"
  },
  {
    id: "hobby-performance",
    name: "兴趣性能验证型",
    shareEstimate: "12%-18%",
    demographics: "运动户外、消费电子和宠物兴趣圈层，购买前会比较参数和评论。",
    jtbd: "找到比本地品牌更有性价比、功能足够可信的升级款。",
    painPoints: ["参数虚标", "续航或耐用性差", "达人测评分化"],
    desiredGains: ["口碑评分高", "功能差异明确", "可用配件生态"],
    fit: "适合30-200美元SKU，先做小批量验证和内容测评，再扩广告。"
  }
];

const categoryPool = [
  {
    id: "mobile-accessories",
    name: "手机配件",
    segmentId: "value-essentials",
    marketWeight: 0.13,
    logic: "低客单、高复购、平台搜索词更新快，适合用点击率和成单率快速验证。",
    jtbd: "保护设备、提升充电和使用便利性。",
    painPoints: ["兼容性描述不清", "低价竞争密集", "退货原因多来自尺寸不匹配"],
    gains: ["轻小件物流友好", "内容素材容易复用", "配件组合可提升客单价"],
    compliance: "关注电池、磁吸、充电协议和当地电子安全规范。",
    localization: "机型命名、本地语言说明、插头和接口规格。",
    promotion: "搜索广告加短视频场景展示，节日前推礼品套装。",
    items: ["磁吸理线扣", "防摔手机壳", "快充数据线", "镜头保护贴", "折叠手机支架"],
    sentimentDrivers: ["做工扎实", "兼容性明确", "到货快"],
    sentimentDetractors: ["尺寸不符", "掉色", "接口松动"],
    competitors: ["平台低价白牌", "Amazon Basics", "UGREEN", "Anker", "本地3C配件店"]
  },
  {
    id: "beauty-tools",
    name: "美妆个护",
    segmentId: "content-led-impulse",
    marketWeight: 0.14,
    logic: "内容驱动强，短视频搜索和平台成交常不同步，适合监控搜索增速和客单价稳定性。",
    jtbd: "在旅行、通勤或居家场景快速完成护理和妆造。",
    painPoints: ["肤质和发质差异", "成分与合规说明不足", "内容热但复购弱"],
    gains: ["素材转化强", "套装和礼品场景多", "评论关键词能快速暴露问题"],
    compliance: "关注化妆品接触材料、FDA或欧盟化妆品规则、功效表述。",
    localization: "色号、肤质、发质、语言说明和当地审美。",
    promotion: "KOL开箱、前后对比短视频、节日礼盒和邮件召回。",
    items: ["旅行化妆刷", "卷发定型梳", "补水面膜套装", "睫毛夹套装", "便携喷雾仪"],
    sentimentDrivers: ["便携", "上妆自然", "包装精致"],
    sentimentDetractors: ["气味重", "易坏", "功效不明显"],
    competitors: ["SHEIN Beauty", "Temu低价店", "Amazon美妆白牌", "本地药妆店", "TikTok达人店"]
  },
  {
    id: "home-organization",
    name: "家居收纳",
    segmentId: "quality-upgrade-family",
    marketWeight: 0.18,
    logic: "视觉展示影响大，价格带跨度宽，适合用评价密度和加购成单率筛选稳定爆品。",
    jtbd: "在有限空间内提升收纳效率和厨房、卧室整洁度。",
    painPoints: ["尺寸不适配", "承重不足", "安装说明不清"],
    gains: ["前后对比内容强", "组合购提升客单价", "退货原因可通过说明书降低"],
    compliance: "关注食品接触材料、儿童安全和包装责任。",
    localization: "英寸和厘米双单位、本地橱柜尺寸、安装视频。",
    promotion: "Pinterest、Instagram Reels、Google Search和邮件套装推荐。",
    items: ["抽屉分隔盒", "厨房沥水架", "真空压缩袋", "可叠加鞋盒", "旋转调料架"],
    sentimentDrivers: ["节省空间", "安装简单", "材质稳"],
    sentimentDetractors: ["尺寸偏小", "承重差", "塑料味"],
    competitors: ["IKEA替代品", "Amazon自营家居", "Temu家居低价店", "本地家居超市", "Wayfair卖家"]
  },
  {
    id: "pet-supplies",
    name: "宠物用品",
    segmentId: "content-led-impulse",
    marketWeight: 0.12,
    logic: "情绪价值和复购并存，适合关注搜索增长、退货率和平台达人内容。",
    jtbd: "让宠物照护更省心，同时满足互动和安全需求。",
    painPoints: ["宠物体型差异", "清洗麻烦", "安全材料疑虑"],
    gains: ["复购和晒图潜力高", "短视频内容强", "功能差异可被演示"],
    compliance: "关注宠物接触材料、咬合安全和小零件风险。",
    localization: "犬猫体型尺码、本地常见品种、清洗说明。",
    promotion: "宠物达人测评、UGC晒单、订阅补充装和节日礼品。",
    items: ["宠物除毛刷", "自动饮水器", "慢食宠物碗", "发光牵引绳", "猫砂垫"],
    sentimentDrivers: ["宠物愿意用", "容易清洗", "安全感强"],
    sentimentDetractors: ["噪音大", "漏水", "尺码不准"],
    competitors: ["Chewy热销款", "Amazon宠物白牌", "本地宠物店", "TikTok宠物达人店", "Temu宠物低价店"]
  },
  {
    id: "fitness-outdoor",
    name: "运动户外",
    segmentId: "hobby-performance",
    marketWeight: 0.14,
    logic: "季节性明显，广告成本和物流体积影响利润，适合用90天趋势识别周期拐点。",
    jtbd: "用便携装备支撑居家训练、骑行、露营和短途户外。",
    painPoints: ["季节性库存积压", "耐用性差评", "体积重量影响毛利"],
    gains: ["节日和季节活动明确", "内容测评可放大信任", "套装组合空间大"],
    compliance: "关注承重、安全警示、电池和户外照明规范。",
    localization: "本地运动季节、单位、尺码和使用场景。",
    promotion: "Google Search、YouTube测评、户外社群和节日前折扣。",
    items: ["阻力训练带", "速干运动毛巾", "骑行手机包", "折叠露营灯", "按摩筋膜球"],
    sentimentDrivers: ["耐用", "轻便", "训练效果明显"],
    sentimentDetractors: ["异味", "易断", "亮度不足"],
    competitors: ["Decathlon替代品", "Amazon户外白牌", "本地运动零售", "Temu户外低价店", "YouTube测评品牌"]
  },
  {
    id: "consumer-electronics",
    name: "消费电子",
    segmentId: "hobby-performance",
    marketWeight: 0.17,
    logic: "客单价高但合规和售后压力大，适合用搜索热度、竞品数量和评价增速联合判断。",
    jtbd: "以更低价格获得可验证的功能升级。",
    painPoints: ["认证门槛高", "售后成本高", "参数虚标伤害信任"],
    gains: ["高客单带来利润空间", "差异化功能可形成品牌记忆", "测评内容影响购买"],
    compliance: "关注FCC、CE、RoHS、电池运输和隐私声明。",
    localization: "插头、电压、语言、保修和参数单位。",
    promotion: "测评视频、对比页、搜索广告和邮件保修承诺。",
    items: ["蓝牙追踪器", "迷你投影仪", "无线充电座", "降噪耳机", "便携显示屏"],
    sentimentDrivers: ["连接稳定", "续航可靠", "质感好"],
    sentimentDetractors: ["续航虚标", "兼容差", "售后慢"],
    competitors: ["Anker", "UGREEN", "Amazon电子白牌", "本地3C零售", "AliExpress品牌卖家"]
  },
  {
    id: "small-appliances",
    name: "小家电",
    segmentId: "quality-upgrade-family",
    marketWeight: 0.12,
    logic: "供应链和认证门槛较高，适合关注客单价趋势、差评关键词和区域适配。",
    jtbd: "用小体积设备提升厨房、旅行和居家效率。",
    painPoints: ["电压插头差异", "认证复杂", "售后和退货成本高"],
    gains: ["功能差异强", "礼品场景明确", "高客单有毛利空间"],
    compliance: "关注CE、UL、食品接触、电池和当地电器认证。",
    localization: "电压插头、语言说明、食谱和安全警示。",
    promotion: "功能演示短视频、搜索广告、节日礼品和售后承诺。",
    items: ["迷你封口机", "便携榨汁杯", "除螨吸尘器", "旅行电热杯", "桌面空气循环扇"],
    sentimentDrivers: ["省时间", "安全", "小巧"],
    sentimentDetractors: ["功率不足", "漏水", "电压不符"],
    competitors: ["Amazon家电白牌", "本地小家电品牌", "Temu低价家电", "TikTok厨房达人店", "跨境品牌旗舰店"]
  }
];

const productQualifiers = ["轻量款", "升级款", "跨境款", "家庭装", "便携款", "高复购款", "礼品款", "低退货款", "达人同款", "利润款"];

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

function priceForTier(tier, rng, regionId) {
  const span = tier.max - tier.min;
  const low = tier.min + span * 0.18;
  const high = tier.max - span * 0.12;
  const base = low + (high - low) * rng();
  if (regionId === "western-europe") return round(Math.round(base), 2);
  if (regionId === "north-america") return round(Math.max(tier.min + 0.99, Math.floor(base) + 0.99), 2);
  return round(base, 2);
}

function platformNumericWeight(platform) {
  return platform.marketSharePercent || platform.platformWeight || 5;
}

function generateTrend({ seedKey, tier, rank, platformWeight, categoryIndex, regionGrowth }) {
  const rng = createRng(hashString(seedKey));
  const tierPower = Math.max(0.68, 1.35 - tier.min / 190);
  const baseSales = (2200 * tierPower + platformWeight * 20) / Math.sqrt(rank + 1);
  const baseSearch = baseSales * (8.2 + rng() * 8.8);
  const conversionBase = clamp(0.026 + tierPower * 0.03 + rng() * 0.026 - rank * 0.0011, 0.016, 0.15);
  const trendLift = -0.14 + rng() * 0.72 + regionGrowth / 500;
  const seasonality = 0.045 + rng() * 0.14;

  return Array.from({ length: 90 }, (_, index) => {
    const age = 89 - index;
    const progress = index / 89;
    const weekly = Math.sin((index + categoryIndex) / 7) * seasonality;
    const noise = (rng() - 0.5) * 0.12;
    const lift = 1 + trendLift * progress + weekly + noise;
    const salesUnits = Math.max(3, Math.round(baseSales * lift));
    const searchVolume = Math.max(120, Math.round(baseSearch * (lift + 0.08 + rng() * 0.1)));
    const conversionRate = round(clamp(conversionBase + trendLift * 0.018 * progress + weekly * 0.025 + noise * 0.02, 0.01, 0.19), 4);
    const averageOrderValue = round(priceForTier(tier, rng, "sea") * (0.96 + rng() * 0.12 + progress * trendLift * 0.035), 2);

    return {
      date: isoDateDaysAgo(age),
      salesUnits,
      searchVolume,
      conversionRate,
      averageOrderValue
    };
  });
}

function summarizeTrend(points) {
  const first14 = points.slice(0, 14);
  const last14 = points.slice(-14);
  const first30 = points.slice(0, 30);
  const middle30 = points.slice(30, 60);
  const last30 = points.slice(-30);
  const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
  const avg = (rows, key) => sum(rows, key) / rows.length;
  const pctChange = (start, end) => round(((end - start) / Math.max(1, start)) * 100, 1);
  const sales90d = sum(points, "salesUnits");
  const search90d = sum(points, "searchVolume");
  const conversionNow = avg(last14, "conversionRate");
  const aovNow = avg(last14, "averageOrderValue");
  const salesChange = pctChange(sum(first14, "salesUnits"), sum(last14, "salesUnits"));
  const searchChange = pctChange(sum(first14, "searchVolume"), sum(last14, "searchVolume"));
  const conversionChange = round((avg(last14, "conversionRate") - avg(first14, "conversionRate")) * 100, 2);
  const aovChange = pctChange(avg(first14, "averageOrderValue"), avg(last14, "averageOrderValue"));

  return {
    sales90d,
    search90d,
    conversionRate: round(conversionNow, 4),
    averageOrderValue: round(aovNow, 2),
    salesChange,
    searchChange,
    conversionChange,
    aovChange,
    cohorts: [
      { label: "第1-30天", salesUnits: sum(first30, "salesUnits"), searchVolume: sum(first30, "searchVolume"), conversionRate: round(avg(first30, "conversionRate"), 4) },
      { label: "第31-60天", salesUnits: sum(middle30, "salesUnits"), searchVolume: sum(middle30, "searchVolume"), conversionRate: round(avg(middle30, "conversionRate"), 4) },
      { label: "第61-90天", salesUnits: sum(last30, "salesUnits"), searchVolume: sum(last30, "searchVolume"), conversionRate: round(avg(last30, "conversionRate"), 4) }
    ]
  };
}

function estimatePricing({ price, tier, regionId, category, rng }) {
  const platformFeeRate = round(0.08 + rng() * 0.08, 3);
  const vatDutyRate = round(regionId === "western-europe" ? 0.18 + rng() * 0.06 : regionId === "north-america" ? 0.06 + rng() * 0.05 : 0.04 + rng() * 0.05, 3);
  const logisticsCost = round(0.42 + tier.max * (regionId === "africa" ? 0.075 : 0.052) + rng() * 1.4, 2);
  const supplyCost = round(price * (0.26 + rng() * 0.18 + (category.id === "consumer-electronics" ? 0.08 : 0)), 2);
  const platformFee = round(price * platformFeeRate, 2);
  const vatDuty = round(price * vatDutyRate, 2);
  const landedCost = round(supplyCost + logisticsCost + platformFee + vatDuty, 2);
  const grossMarginRate = round(clamp((price - landedCost) / Math.max(price, 1), 0.04, 0.72), 3);
  const benchmarkMedianPrice = round(price * (0.88 + rng() * 0.28), 2);
  const priceGapPercent = round(((price - benchmarkMedianPrice) / Math.max(benchmarkMedianPrice, 1)) * 100, 1);
  const strategy = grossMarginRate < 0.22
    ? "先降物流和平台费，不用低价硬打"
    : priceGapPercent > 12
      ? "突出功能差异和保修承诺，避免只比低价"
      : "采用心理定价和轻折扣测试转化弹性";

  return {
    targetPrice: price,
    benchmarkMedianPrice,
    landedCost,
    supplyCost,
    logisticsCost,
    platformFeeRate,
    vatDutyRate,
    grossMarginRate,
    priceGapPercent,
    psychologicalPrice: regionId === "north-america" ? `${Math.max(0, Math.floor(price))}.99美元` : regionId === "western-europe" ? `${Math.round(price)}欧元锚点` : `${round(price, 2)}美元锚点`,
    strategy,
    experiment: "保留3个价格点，测试主图不变时的成单率和毛利率。"
  };
}

function estimateSentiment({ category, summary, rng }) {
  const qualitySignal = clamp(summary.conversionRate * 4.4 + summary.aovChange / 80 + (rng() - 0.38) * 0.35, -0.25, 0.45);
  const score = round(clamp(0.34 + qualitySignal + summary.salesChange / 500, -0.2, 0.92), 2);
  const satisfactionLevel = score >= 0.62 ? "强正向" : score >= 0.38 ? "可验证" : score >= 0.18 ? "分化" : "风险";
  const reviewVolume = Math.round(summary.sales90d * (0.018 + rng() * 0.028));

  return {
    score,
    satisfactionLevel,
    reviewVolume,
    npsProxy: Math.round(score * 100 - 10),
    positiveThemes: category.sentimentDrivers.slice(0, 2),
    detractorThemes: category.sentimentDetractors.slice(0, 2),
    recommendation: score < 0.25 ? "先抽检差评关键词和退货原因，再决定是否打样。" : "用评论高频词反推主图、标题和详情页卖点。"
  };
}

function estimateCohort(summary, sentiment, pricing) {
  const [early, , late] = summary.cohorts;
  const salesLift = round(((late.salesUnits - early.salesUnits) / Math.max(early.salesUnits, 1)) * 100, 1);
  const searchLift = round(((late.searchVolume - early.searchVolume) / Math.max(early.searchVolume, 1)) * 100, 1);
  const conversionDelta = round((late.conversionRate - early.conversionRate) * 100, 2);
  const retentionProxy = round(clamp(0.42 + summary.conversionRate * 2.2 + sentiment.score * 0.16 + pricing.grossMarginRate * 0.12, 0.18, 0.88), 2);
  const anomaly = searchLift > salesLift + 24
    ? "搜索领先销量，承接不足"
    : salesLift > 30 && conversionDelta >= 0
      ? "销量和转化同步抬升"
      : pricing.grossMarginRate < 0.2
        ? "毛利保护不足"
        : "趋势平稳";
  const state = anomaly === "销量和转化同步抬升"
    ? "scale"
    : anomaly === "搜索领先销量，承接不足"
      ? "validate"
      : anomaly === "毛利保护不足"
        ? "protect-margin"
        : "watch";

  return {
    state,
    salesLift,
    searchLift,
    conversionDelta,
    retentionProxy,
    anomaly,
    validationAction: state === "scale"
      ? "进入小批量补货和广告预算放大。"
      : state === "validate"
        ? "优先测试标题、主图、价格和配送承诺。"
        : state === "protect-margin"
          ? "重算头程、平台佣金、关税和退货成本。"
          : "继续观察一个刷新周期，等待搜索或成单率信号。"
  };
}

function competitorIntensity({ platform, category, rng }) {
  const platformWeight = platformNumericWeight(platform);
  const categoryRisk = category.id === "consumer-electronics" || category.id === "mobile-accessories" ? 0.18 : 0.08;
  return round(clamp(0.28 + platformWeight / 120 + categoryRisk + rng() * 0.24, 0.22, 0.92), 2);
}

function buildCompetitors({ category, platform, intensity }) {
  return category.competitors.slice(0, 5).map((name, index) => ({
    name,
    position: index === 0 ? "价格锚点" : index === 1 ? "平台信任锚点" : index === 2 ? "功能锚点" : "替代方案",
    strength: index <= 1 ? "流量和评价积累强" : "差异化卖点明确",
    weakness: index <= 1 ? "同质化和价格内卷明显" : "价格更高或渠道覆盖有限",
    threatLevel: intensity > 0.72 && index <= 2 ? "high" : intensity > 0.5 ? "medium" : "low"
  })).concat(
    platform.name && !category.competitors.includes(platform.name)
      ? [{ name: `${platform.name}头部卖家`, position: "本平台直接竞品", strength: "平台权重高", weakness: "可被差异化主图和本地化说明切入", threatLevel: intensity > 0.6 ? "high" : "medium" }]
      : []
  ).slice(0, 5);
}

function build4p({ category, regionId, platform, pricing, cohort, sentiment }) {
  const region = regionSizing[regionId];
  return {
    product: [
      category.localization,
      category.compliance,
      sentiment.score < 0.3 ? "先用差评关键词做样品改版。" : "把正向评论词沉淀为主图和详情页卖点。"
    ],
    price: [
      `目标价${pricing.psychologicalPrice}，毛利率底线${Math.round(Math.max(22, pricing.grossMarginRate * 100 - 4))}%。`,
      pricing.strategy,
      "价格测试必须同时记录成单率、广告成本和退货率。"
    ],
    place: [
      `${platform.name}作为首发渠道。${region.channelFit}`,
      region.logisticsMode,
      cohort.state === "scale" ? "动销稳定后准备海外仓或平台仓。" : "新品阶段保留直邮或小批量仓配。"
    ],
    promotion: [
      category.promotion,
      cohort.state === "validate" ? "先补搜索词包和短视频素材，再加库存。" : "用高转化词做搜索广告，用评论词做内容脚本。",
      "邮件营销用于日常折扣、购物车挽回和复购提醒。"
    ]
  };
}

function opportunityScore({ summary, pricing, sentiment, intensity, regionGrowth }) {
  const demandScore = clamp((Math.log10(summary.search90d + 1) / 6) * 100, 0, 100);
  const salesScore = clamp((Math.log10(summary.sales90d + 1) / 5) * 100, 0, 100);
  const momentumScore = clamp(50 + summary.salesChange * 0.32 + summary.searchChange * 0.2 + summary.conversionChange * 5 + regionGrowth * 0.45, 0, 100);
  const marginScore = clamp((pricing.grossMarginRate - 0.12) * 190, 0, 100);
  const sentimentScore = clamp((sentiment.score + 0.2) * 85, 0, 100);
  const competitionScore = clamp(100 - intensity * 82, 0, 100);
  return round(demandScore * 0.18 + salesScore * 0.18 + momentumScore * 0.24 + marginScore * 0.16 + sentimentScore * 0.14 + competitionScore * 0.1, 1);
}

function createProduct({ region, platform, tier, tierIndex, rankSeed }) {
  const category = chooseCategory(tierIndex, rankSeed + platform.rank);
  const item = category.items[(rankSeed + tierIndex + platform.rank) % category.items.length];
  const qualifier = productQualifiers[(rankSeed + tierIndex + platform.rank) % productQualifiers.length];
  const seedKey = `${region.id}:${platform.id}:${tier.id}:${rankSeed}`;
  const rng = createRng(hashString(seedKey));
  const price = priceForTier(tier, rng, region.id);
  const trend = generateTrend({
    seedKey,
    tier,
    rank: rankSeed,
    platformWeight: platformNumericWeight(platform),
    categoryIndex: categoryPool.findIndex((entry) => entry.id === category.id),
    regionGrowth: regionSizing[region.id].growth
  }).map((point) => ({ ...point, averageOrderValue: round(point.averageOrderValue * (price / Math.max(tier.min + 1, (tier.min + tier.max) / 2)), 2) }));
  const summary = summarizeTrend(trend);
  const pricing = estimatePricing({ price: summary.averageOrderValue, tier, regionId: region.id, category, rng });
  const sentiment = estimateSentiment({ category, summary, rng });
  const cohort = estimateCohort(summary, sentiment, pricing);
  const intensity = competitorIntensity({ platform, category, rng });
  const score = opportunityScore({ summary, pricing, sentiment, intensity, regionGrowth: regionSizing[region.id].growth });
  const competitors = buildCompetitors({ category, platform, intensity });
  const product4p = build4p({ category, regionId: region.id, platform, pricing, cohort, sentiment });
  const confidence = round(clamp(0.48 + score / 220 + sentiment.score * 0.16 - intensity * 0.08, 0.35, 0.93), 2);
  const stage = score >= 78 && cohort.state === "scale" ? "scale" : score >= 70 ? "test" : cohort.state === "protect-margin" ? "fix-margin" : "watch";

  return {
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
    buyerSegmentId: category.segmentId,
    selectionLogic: category.logic,
    score,
    opportunityScore: score,
    confidence,
    stage,
    rankSeed,
    competitorIntensity: intensity,
    recommendation: cohort.validationAction,
    summary,
    pricing,
    sentiment,
    cohort,
    competitors,
    product4p,
    trend
  };
}

function buildOpportunityPools(products) {
  return Object.values(
    products.reduce((groups, product) => {
      const key = `${product.regionId}:${product.categoryId}`;
      if (!groups[key]) {
        const category = categoryPool.find((entry) => entry.id === product.categoryId);
        const region = regionSizing[product.regionId];
        const tamUsdM = round(region.tamUsdB * 1000 * category.marketWeight, 1);
        groups[key] = {
          id: key,
          regionId: product.regionId,
          regionName: product.regionName,
          categoryId: product.categoryId,
          categoryName: product.categoryName,
          segmentName: buyerSegments.find((segment) => segment.id === category.segmentId)?.name || "未分组",
          jtbd: category.jtbd,
          painPoints: category.painPoints,
          productFit: category.gains.join("、"),
          tamUsdM,
          samUsdM: round(tamUsdM * region.serviceableRate, 1),
          somUsdM: round(tamUsdM * region.serviceableRate * region.obtainableRate, 2),
          growthRate: region.growth,
          complianceFocus: region.complianceFocus,
          channelFit: region.channelFit,
          products: []
        };
      }
      groups[key].products.push(product);
      return groups;
    }, {})
  )
    .map((pool) => {
      const top = [...pool.products].sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 8);
      const avg = (rows, getter) => rows.reduce((sum, row) => sum + getter(row), 0) / rows.length;
      const priorityScore = round(avg(top, (product) => product.opportunityScore) * 0.72 + pool.growthRate * 1.2 + (1 - avg(top, (product) => product.competitorIntensity)) * 12, 1);
      const competitiveIntensity = round(avg(top, (product) => product.competitorIntensity), 2);
      return {
        ...pool,
        products: undefined,
        priorityScore,
        priority: priorityScore >= 78 ? "高优先级" : priorityScore >= 68 ? "验证池" : "观察池",
        averageMarginRate: round(avg(top, (product) => product.pricing.grossMarginRate), 3),
        averageSentiment: round(avg(top, (product) => product.sentiment.score), 2),
        competitiveIntensity,
        winningPriceTiers: [...new Set(top.slice(0, 5).map((product) => product.priceTierLabel))],
        leadingPlatforms: [...new Set(top.slice(0, 5).map((product) => product.platformName))],
        assumptions: ["市场规模为监控模型估算，需要用平台GMV、广告词和店铺转化数据校准。", "SOM按1-3年可获得份额估算，不代表承诺营收。"],
        risks: competitiveIntensity > 0.7 ? ["价格竞争强", "需要更强本地化卖点"] : ["需验证物流成本", "需验证评论关键词"],
        recommendedAction: priorityScore >= 78 ? "进入SKU筛选和打样排期。" : "补充搜索词、评价和广告成本数据后再决策。"
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 18);
}

function buildRegionalSummary(platformSources, products) {
  return platformSources.regions.map((region) => {
    const regionProducts = products.filter((product) => product.regionId === region.id);
    const topProducts = [...regionProducts].sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 10);
    return {
      id: region.id,
      name: region.name,
      platformCount: region.platforms.length,
      marketSizing: regionSizing[region.id],
      totalSales90d: regionProducts.reduce((total, product) => total + product.summary.sales90d, 0),
      totalSearch90d: regionProducts.reduce((total, product) => total + product.summary.search90d, 0),
      averageConversionRate: round(regionProducts.reduce((total, product) => total + product.summary.conversionRate, 0) / regionProducts.length, 4),
      topProducts: topProducts.map((product, index) => ({
        rank: index + 1,
        productId: product.id,
        title: product.title,
        platformName: product.platformName,
        priceTierLabel: product.priceTierLabel,
        opportunityScore: product.opportunityScore,
        stage: product.stage
      }))
    };
  });
}

function buildWikiSignals(products) {
  return categoryPool.map((category) => {
    const categoryProducts = products.filter((product) => product.categoryId === category.id);
    const top = [...categoryProducts].sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 12);
    const averageScore = round(top.reduce((sum, product) => sum + product.opportunityScore, 0) / top.length, 1);
    const searchLed = top.filter((product) => product.summary.searchChange > product.summary.salesChange + 12).length;
    const marginSafe = top.filter((product) => product.pricing.grossMarginRate >= 0.28).length;
    const sentimentSafe = top.filter((product) => product.sentiment.score >= 0.42).length;
    const observedPattern = searchLed >= 6
      ? "搜索增长领先销量，先补内容和关键词承接，再放大库存。"
      : marginSafe >= 8 && sentimentSafe >= 8
        ? "毛利和口碑同时稳定，适合进入小批量补货。"
        : marginSafe <= 4
          ? "毛利保护不足，需要优先重算全成本和退货风险。"
          : "销量、搜索和口碑同步增长，适合做区域扩张测试。";

    return {
      categoryId: category.id,
      categoryName: category.name,
      segmentName: buyerSegments.find((segment) => segment.id === category.segmentId)?.name,
      logic: category.logic,
      averageScore,
      winningPriceTiers: [...new Set(top.slice(0, 5).map((product) => product.priceTierLabel))],
      leadingPlatforms: [...new Set(top.slice(0, 5).map((product) => product.platformName))],
      observedPattern,
      fourPRules: {
        product: [category.localization, category.compliance],
        price: ["必须包含国内物流、头程、仓储尾程、平台佣金、关税/VAT和汇损。"],
        place: ["平台首发验证后，再决定海外仓、FBA、本地3PL或直邮。"],
        promotion: [category.promotion]
      }
    };
  });
}

function buildMetricsFramework({ products, opportunityPools, skuShortlist, generatedAt }) {
  const scaleReady = products.filter((product) => product.stage === "scale").length;
  const tested = products.filter((product) => product.stage === "test" || product.stage === "scale").length;
  const highPriorityPools = opportunityPools.filter((pool) => pool.priority === "高优先级").length;
  const avgMargin = products.reduce((sum, product) => sum + product.pricing.grossMarginRate, 0) / products.length;
  const avgSentiment = products.reduce((sum, product) => sum + product.sentiment.score, 0) / products.length;
  const searchLed = products.filter((product) => product.summary.searchChange > product.summary.salesChange + 12).length;
  const lowConfidence = products.filter((product) => product.confidence < 0.5).length;
  const hoursSinceRefresh = round((Date.now() - Date.parse(generatedAt)) / 36e5, 2);

  const metric = (layer, name, value, definition, dataSource, visualization, target, alertThreshold, reviewCadence) => ({
    layer,
    name,
    value,
    definition,
    dataSource,
    visualization,
    target,
    alertThreshold,
    reviewCadence
  });

  return {
    northStar: metric(
      "North Star",
      "可执行爆品机会数",
      scaleReady,
      "过去90天内机会分>=78、趋势状态为scale、毛利和口碑未触发高风险的SKU数量。",
      "本机快照 + 授权平台/广告/评论数据",
      "核心数字 + 趋势",
      "每周新增5个",
      "连续2个刷新周期低于2个则复盘选品池",
      "每周"
    ),
    inputMetrics: [
      metric("Input", "高优先级机会池", highPriorityPools, "区域和品类组合中priorityScore>=78的机会池数量。", "market-segments + market-sizing", "条形图", ">=6", "<3"),
      metric("Input", "SKU验证通过率", round(tested / products.length, 3), "test或scale阶段SKU数 / 监控SKU数。", "competitor-analysis + pricing-strategy", "漏斗", ">=18%", "<10%"),
      metric("Input", "搜索领先指数", round(searchLed / products.length, 3), "搜索增速超过销量增速12pp的SKU占比。", "搜索词、平台搜索量、广告词", "折线", "18%-35%", "<8%或>50%"),
      metric("Input", "平均毛利安全垫", round(avgMargin, 3), "目标售价扣除供货、物流、平台佣金、税费后的毛利率均值。", "pricing-strategy", "数字 + 分布", ">=28%", "<22%"),
      metric("Input", "平均口碑分", round(avgSentiment, 2), "评论和退货代理信号映射为-1到+1的情绪均值。", "sentiment-analysis", "热力图", ">=0.42", "<0.25")
    ],
    healthMetrics: [
      metric("Health", "数据新鲜度", `${hoursSinceRefresh}小时`, "当前时间和快照生成时间的差值。", "scheduler", "状态", `<=${refreshCadenceHours + 1}小时`, `>${refreshCadenceHours + 2}小时`),
      metric("Health", "低置信SKU占比", round(lowConfidence / products.length, 3), "confidence<0.5的SKU数 / 监控SKU数。", "数据质量规则", "数字", "<=20%", ">30%"),
      metric("Health", "认证覆盖", "后端登录", "所有数据API必须通过本机后端账号密码或服务Token。", "Express API", "状态", "100%", "任何401异常飙升")
    ],
    businessMetrics: [
      metric("Business", "候选SKU平均客单价", round(skuShortlist.reduce((sum, product) => sum + product.summary.averageOrderValue, 0) / skuShortlist.length, 2), "SKU shortlist当前客单价均值。", "平台订单和价格监控", "数字", "按价格带分层", "单价格带偏离>20%"),
      metric("Business", "库存放大候选", skuShortlist.filter((product) => product.stage === "scale").length, "可进入补货或广告放大的SKU数量。", "cohort-analysis", "列表", ">=8", "<3"),
      metric("Business", "高竞争SKU占比", round(products.filter((product) => product.competitorIntensity > 0.72).length / products.length, 3), "competitorIntensity>0.72的SKU占比。", "competitor-analysis", "分布", "<35%", ">50%")
    ]
  };
}

function buildAlerts({ products, metricsFramework }) {
  const productAlerts = products.flatMap((product) => {
    const alerts = [];
    if (product.summary.searchChange > product.summary.salesChange + 28) {
      alerts.push({
        id: `${product.id}:search-gap`,
        severity: "medium",
        title: "搜索领先但销量未承接",
        subject: product.title,
        owner: "选品/运营",
        responseTimeHours: 12,
        action: "检查主图、标题、价格和配送承诺，先提升成单率。"
      });
    }
    if (product.pricing.grossMarginRate < 0.22) {
      alerts.push({
        id: `${product.id}:margin`,
        severity: "high",
        title: "毛利低于安全线",
        subject: product.title,
        owner: "供应链/财务",
        responseTimeHours: 6,
        action: "重算供货、头程、平台佣金、关税/VAT、退货和汇损。"
      });
    }
    if (product.sentiment.score < 0.22) {
      alerts.push({
        id: `${product.id}:sentiment`,
        severity: "high",
        title: "口碑风险偏高",
        subject: product.title,
        owner: "产品/质检",
        responseTimeHours: 12,
        action: "抽查差评关键词和样品批次，暂停放量。"
      });
    }
    return alerts;
  });

  const metricAlerts = [
    metricsFramework.inputMetrics.find((metric) => metric.name === "平均毛利安全垫")?.value < 0.22
      ? { id: "metric-margin", severity: "high", title: "整体毛利安全垫不足", subject: "SKU池", owner: "负责人", responseTimeHours: 12, action: "降低低毛利SKU权重，补充物流和税费数据。" }
      : null,
    metricsFramework.healthMetrics.find((metric) => metric.name === "低置信SKU占比")?.value > 0.3
      ? { id: "metric-confidence", severity: "medium", title: "低置信SKU占比过高", subject: "数据质量", owner: "数据", responseTimeHours: 24, action: "优先接入真实订单、广告和评论导出。" }
      : null
  ].filter(Boolean);

  return [...metricAlerts, ...productAlerts]
    .sort((a, b) => (a.severity === "high" ? -1 : 1) - (b.severity === "high" ? -1 : 1))
    .slice(0, 14);
}

function buildStrategyCanvas(metricsFramework) {
  return {
    vision: "让跨境卖家在投入库存前，用区域机会、价格带、竞品、趋势和口碑信号判断哪些SKU值得验证。",
    sections: [
      { key: "vision", title: "愿景", body: "把爆品判断从经验表格升级为可复用的选品工作流。", evidence: "North Star为可执行爆品机会数。" },
      { key: "segments", title: "市场细分", body: "优先服务价格敏感刚需型、内容种草冲动型、品质升级家庭型和兴趣性能验证型。", evidence: "market-segments输出买家JTBD、痛点和适配价格带。" },
      { key: "costs", title: "相对成本", body: "不追求最低价，围绕全成本和口碑稳定性做可持续毛利。", evidence: "pricing-strategy追踪供货、头程、仓储尾程、平台佣金、税费和汇损。" },
      { key: "value", title: "价值主张", body: "在搜索热度出现时，判断商品是否能被价格、渠道和内容承接。", evidence: "SKU详情页把Product、Price、Place、Promotion落成动作。" },
      { key: "tradeoffs", title: "取舍", body: "不把未授权爬虫、Cookie采集和不可解释的模型结论作为生产路径。", evidence: "默认脚本不调用模型，真实数据来自授权API、后台导出或数据商。" },
      { key: "metrics", title: "关键指标", body: `${metricsFramework.northStar.name}，季度OMTM为SKU验证通过率。`, evidence: "metrics-dashboard定义指标、阈值和复盘节奏。" },
      { key: "growth", title: "增长", body: "先用平台验证动销，再用独立站、邮件和内容沉淀复购与品牌资产。", evidence: "gtm-strategy把渠道、信息和90天路线图拆开。" },
      { key: "capabilities", title: "能力", body: "需要稳定数据接入、类目研究、合规核验、供应链成本模型和内容投放反馈。", evidence: "每6小时刷新种子快照，可按需接入真实导出。" },
      { key: "defensibility", title: "防御性", body: "长期优势来自区域和类目的历史样本、供应链成本校准、评论词库和复盘wiki。", evidence: "选品wiki每次刷新沉淀判断规则。" }
    ],
    hypotheses: [
      "搜索领先销量的SKU可以通过主图、标题、价格和配送承诺提升成单率。",
      "毛利率低于22%的SKU即使销量高，也不应进入放量阶段。",
      "评论情绪分低于0.25时，广告放量会放大退货和售后风险。"
    ],
    experiments: [
      "每周选择5个validate阶段SKU做主图和价格小测试。",
      "对scale阶段SKU做小批量补货，比较7天广告花费回收。",
      "把差评关键词转成改版检查单，复测情绪分和退货代理指标。"
    ]
  };
}

function buildGtmPlaybook() {
  return {
    positioning: "不是找便宜货，而是在区域、价格、渠道和内容之间找到可验证的利润机会。",
    channels: [
      { name: "平台搜索广告", fit: "捕获明确购买意图", kpi: "关键词成单率、ACOS、毛利后利润" },
      { name: "TikTok/Instagram/YouTube达人", fit: "验证内容种草和开箱卖点", kpi: "搜索抬升、点击率、评论主题" },
      { name: "Google Search", fit: "验证北美和西欧高意图需求", kpi: "CPC、转化率、价格敏感度" },
      { name: "邮件营销", fit: "购物车挽回、节日促销和复购", kpi: "打开率、召回转化、复购客单价" },
      { name: "独立站", fit: "沉淀品牌和私域数据", kpi: "订阅率、首购转化、复购率" }
    ],
    messaging: [
      "Product: 本土化规格、合规认证和差异化场景。",
      "Price: 全成本定价、心理价格和节日折扣边界。",
      "Place: 平台首发验证，海外仓或直邮按动销阶段切换。",
      "Promotion: 用搜索广告捕获需求，用达人内容解释场景，用EDM提升复购。"
    ],
    kpis: ["可执行爆品机会数", "SKU验证通过率", "平均毛利安全垫", "搜索领先指数", "评论情绪分"],
    roadmap90Days: [
      { phase: "0-30天", focus: "接入平台导出和广告词，跑通价格带Top10和告警。", output: "首批机会池和SKU打样清单" },
      { phase: "31-60天", focus: "对validate和test阶段SKU做主图、价格、物流承诺实验。", output: "通过SKU、淘汰SKU和改版规则" },
      { phase: "61-90天", focus: "放大scale阶段SKU，建立海外仓和邮件复购动作。", output: "补货计划、内容脚本库和选品wiki" }
    ],
    risks: [
      { risk: "真实平台数据缺失", mitigation: "先接授权导出和数据商，不把未授权采集作为生产依赖。" },
      { risk: "低价内卷", mitigation: "把毛利、口碑和竞品强度纳入评分，不只看销量。" },
      { risk: "合规或售后风险", mitigation: "高客单和电器类SKU进入打样前必须通过认证清单。" }
    ]
  };
}

function buildWorkflowSteps() {
  return [
    { skill: "metrics-dashboard", title: "指标与告警", purpose: "定义North Star、输入指标、健康指标和业务指标。", output: "刷新节奏、阈值、负责人和响应时间。" },
    { skill: "market-segments + market-sizing", title: "区域/品类机会池", purpose: "用JTBD、TAM/SAM/SOM和增长率定位机会。", output: "高优先级机会池和假设清单。" },
    { skill: "competitor-analysis + pricing-strategy", title: "SKU筛选", purpose: "比较竞品强度、全成本、价格锚点和毛利安全垫。", output: "watch/test/scale/fix-margin阶段。" },
    { skill: "cohort-analysis + sentiment-analysis", title: "趋势与口碑验证", purpose: "看90天销量、搜索、成单率、客单价和评论情绪。", output: "趋势异常、口碑风险和下一步动作。" },
    { skill: "product-strategy + gtm-strategy", title: "选品Wiki", purpose: "把成功逻辑沉淀为4P执行规则和90天GTM。", output: "可复用选品wiki和增长动作。" }
  ];
}

function generateSnapshot(platformSources) {
  const products = [];
  for (const region of platformSources.regions) {
    for (const platform of region.platforms) {
      priceTiers.forEach((tier, tierIndex) => {
        for (let rankSeed = 1; rankSeed <= 10; rankSeed += 1) {
          products.push(createProduct({ region, platform, tier, tierIndex, rankSeed }));
        }
      });
    }
  }

  const tierRanks = priceTiers.map((tier) => ({
    ...tier,
    products: products
      .filter((product) => product.priceTierId === tier.id)
      .sort((a, b) => b.opportunityScore - a.opportunityScore)
      .slice(0, 10)
      .map((product, index) => ({ ...product, rank: index + 1 }))
  }));
  const opportunityPools = buildOpportunityPools(products);
  const skuShortlist = [...products]
    .sort((a, b) => b.opportunityScore - a.opportunityScore)
    .slice(0, 40)
    .map((product, index) => ({ ...product, shortlistRank: index + 1 }));
  const generatedAt = new Date().toISOString();
  const regionalSummary = buildRegionalSummary(platformSources, products);
  const wikiSignals = buildWikiSignals(products);
  const metricsFramework = buildMetricsFramework({ products, opportunityPools, skuShortlist, generatedAt });
  const alerts = buildAlerts({ products, metricsFramework });

  return {
    generatedAt,
    workflowVersion: "pm-4p-workflow-v1",
    dataMode: "synthetic-seed",
    dataModeNote: "当前快照由监控种子和规则模型生成，用于工作流演示和数据结构验证。生产环境应替换为授权平台API、卖家后台导出、第三方数据商或合规采集器。",
    refreshCadenceHours,
    priceTiers,
    regions: platformSources.regions,
    sources: platformSources.sources,
    globalDataSources: platformSources.globalDataSources,
    workflowSteps: buildWorkflowSteps(),
    buyerSegments,
    regionalSummary,
    marketSegments: buyerSegments,
    opportunityPools,
    tierRanks,
    skuShortlist,
    metricsFramework,
    alerts,
    wikiSignals,
    strategyCanvas: buildStrategyCanvas(metricsFramework),
    gtmPlaybook: buildGtmPlaybook()
  };
}

function createDefaultWiki(snapshot) {
  const generatedDate = snapshot.generatedAt.slice(0, 10);
  const opportunityRows = snapshot.opportunityPools
    .slice(0, 8)
    .map((pool, index) => `${index + 1}. ${pool.regionName} / ${pool.categoryName}: ${pool.priority}，SOM约${pool.somUsdM}百万美元，动作：${pool.recommendedAction}`)
    .join("\n");
  const skuRows = snapshot.skuShortlist
    .slice(0, 12)
    .map((product, index) => `${index + 1}. ${product.title}｜${product.regionName}/${product.platformName}/${product.priceTierLabel}｜阶段：${product.stage}｜机会分：${product.opportunityScore}｜动作：${product.recommendation}`)
    .join("\n");
  const categorySections = snapshot.wikiSignals
    .map(
      (signal) => `## ${signal.categoryName}

- 观察模式：${signal.observedPattern}
- 常见价格带：${signal.winningPriceTiers.join("、")}
- 领先平台：${signal.leadingPlatforms.join("、")}
- Product：${signal.fourPRules.product.map(trimChineseStop).join("；")}。
- Price：${signal.fourPRules.price.map(trimChineseStop).join("；")}。
- Place：${signal.fourPRules.place.map(trimChineseStop).join("；")}。
- Promotion：${signal.fourPRules.promotion.map(trimChineseStop).join("；")}。
- 选品逻辑：${signal.logic}`
    )
    .join("\n\n");

  return `# 选品 Wiki

更新时间：${generatedDate}

本 wiki 由本地脚本根据最新看板快照生成。默认模式使用监控种子数据，不调用模型；接入真实平台、广告、评论和订单数据后，结论会随快照更新。

## 组合工作流

1. metrics-dashboard：看${snapshot.metricsFramework.northStar.name}、输入指标、健康指标和告警。
2. market-segments + market-sizing：从区域和品类机会池判断TAM、SAM、SOM和JTBD。
3. competitor-analysis + pricing-strategy：对SKU做竞品强度、全成本和价格锚点筛选。
4. cohort-analysis + sentiment-analysis：用90天销量、搜索、成单率、客单价和评论情绪验证爆品趋势。
5. product-strategy + gtm-strategy：把成功逻辑沉淀为4P动作和90天GTM。

## 4P执行规则

- Product：先做本土化、合规和差异化，不把国内现货直接搬到海外。
- Price：每个SKU必须包含国内物流、国际头程、海外仓储/尾程、平台佣金、关税/VAT、退货和汇损。
- Place：平台用于首发验证，独立站和邮件用于沉淀复购；海外仓只给动销稳定SKU。
- Promotion：搜索广告捕获购买意图，TikTok/Instagram/YouTube验证内容种草，EDM做召回和复购。

## Top机会池

${opportunityRows}

## SKU筛选清单

${skuRows}

${categorySections}
`;
}

function trimChineseStop(value) {
  return String(value).replace(/[。.]$/u, "");
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

  const topSignals = {
    workflowSteps: snapshot.workflowSteps,
    metrics: snapshot.metricsFramework,
    opportunities: snapshot.opportunityPools.slice(0, 8),
    skuShortlist: snapshot.skuShortlist.slice(0, 12).map((product) => ({
      title: product.title,
      region: product.regionName,
      platform: product.platformName,
      priceTier: product.priceTierLabel,
      score: product.opportunityScore,
      stage: product.stage,
      salesChange: product.summary.salesChange,
      searchChange: product.summary.searchChange,
      conversionRate: product.summary.conversionRate,
      averageOrderValue: product.summary.averageOrderValue,
      margin: product.pricing.grossMarginRate,
      sentiment: product.sentiment.score,
      action: product.recommendation,
      fourP: product.product4p
    })),
    wikiSignals: snapshot.wikiSignals
  };

  const prompt = [
    "你是跨境电商选品分析师。基于以下JSON，输出中文选品wiki。",
    "要求：只使用给定数据，不编造外部事实；按metrics-dashboard、market-segments、market-sizing、competitor-analysis、pricing-strategy、cohort-analysis、sentiment-analysis、product-strategy、gtm-strategy组织；必须落到4P执行动作；不要使用夸张营销语。",
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
  console.log(`Workflow version: ${snapshot.workflowVersion}`);
  console.log(`Refresh cadence: ${snapshot.refreshCadenceHours} hours`);
  console.log(`Wrote ${path.relative(rootDir, path.resolve(dataDir, "latest-snapshot.json"))}`);
  console.log("Wrote docs/product-selection-wiki.md");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
