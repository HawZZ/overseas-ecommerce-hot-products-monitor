import OpenCC from "opencc-js";

const toTraditional = OpenCC.Converter({ from: "cn", to: "tw" });

export const ruleSources = [
  ["685", "https://seller.shopee.tw/edu/article/685"],
  ["517", "https://seller.shopee.tw/edu/article/517"],
  ["676", "https://seller.shopee.tw/edu/article/676"],
  ["417", "https://seller.shopee.tw/edu/article/417"],
  ["171", "https://seller.shopee.tw/edu/article/171"]
];
export const RULE_VERSION = "tw-title-2026-08-03";
export const profiles = { standard: "一般賣場", mall: "蝦皮商城" };
const medical = /治療|療效|抗癌|減肥|瘦身|消炎|殺菌|治癒|藥效/u;
const claim = /官方|正品|第一|最強|保證|100%|永久/u;
const emoji = /[\p{Extended_Pictographic}]/u;
const suspiciousSymbols = /[★☆◆◇【】〈〉]{2,}|[!！]{2,}/u;

export function normalizeFacts(input) {
  const fact = (value) => toTraditional(String(value || "").trim()).replace(/\s+/gu, " ");
  return {
    productName: fact(input.productName), category: fact(input.category), description: fact(input.description),
    specifications: fact(input.specifications), material: fact(input.material), use: fact(input.use),
    currentTitle: fact(input.currentTitle), brand: String(input.brand || "").trim(),
    authorization: input.authorization || "unbranded", sellingPoints: fact(input.sellingPoints), sourceUrl: String(input.sourceUrl || "").trim()
  };
}

export function validateTitle(title, facts, profile = "standard") {
  const issues = [];
  const text = String(title || "").trim();
  if (!text) issues.push("缺少商品標題");
  if (text !== toTraditional(text)) issues.push("含簡體中文");
  if (emoji.test(text) || suspiciousSymbols.test(text)) issues.push("含表情或異常符號");
  if (medical.test(text) || claim.test(text)) issues.push("含醫療療效或高風險誇大宣稱");
  if (/https?:|line\s*[:：]|微信|whatsapp/iu.test(text)) issues.push("含導外資訊");
  if (facts.authorization === "compatible-third-party" && !/(適用|通用|專用|可用)/u.test(text)) issues.push("第三方相容商品需完整標示適用、通用、專用或可用");
  if (facts.brand && facts.authorization === "unbranded" && text.toLowerCase().includes(facts.brand.toLowerCase())) issues.push("未確認品牌不可放入標題");
  if (profile === "mall" && /[()（）]/u.test(text) && !(/[()]/u.test(text) ? /\([^)]*\)/u.test(text) : /（[^）]*）/u.test(text))) issues.push("括號不完整");
  const status = issues.length ? "needs-review" : "pass";
  return { status, issues, preview: Array.from(text).slice(0, 25).join(""), sources: profile === "mall" ? ruleSources : ruleSources.filter(([id]) => id !== "171") };
}

export function deterministicCandidates(facts, profile) {
  const terms = [facts.brand && facts.authorization !== "unbranded" ? facts.brand : "", facts.productName, facts.specifications, facts.material, facts.use]
    .filter(Boolean).join(" ").replace(/\s+/gu, " ");
  const variants = [terms, [facts.productName, facts.material, facts.use].filter(Boolean).join(" "), [facts.productName, facts.specifications, facts.use].filter(Boolean).join(" "), [facts.productName, facts.use, facts.material].filter(Boolean).join(" "), [facts.productName, facts.specifications, facts.material].filter(Boolean).join(" ")];
  return variants.map((title, index) => ({
    title, chineseKeywords: [facts.productName, facts.material, facts.use].filter(Boolean).slice(0, 5),
    englishKeywords: [], evidence: ["已確認商品資料", profiles[profile] || profiles.standard], removedTerms: [], rank: index + 1
  }));
}
