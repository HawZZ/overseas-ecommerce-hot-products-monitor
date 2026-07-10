import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent } from "undici";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const rootDir = path.resolve(__dirname, "../..");
export const dataDir = path.resolve(rootDir, "data");
export const vendorExportsDir = path.resolve(dataDir, "vendor-exports");

const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
export const proxyDispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined;
if (proxyUrl) console.log(`[config] Using proxy: ${proxyUrl}`);

export const seaCountries = [
  { code: "TW", name: "Taiwan", shopeeDomain: "shopee.tw", lazadaDomain: "", currency: "TWD", currencyToUsd: 0.031 },
  { code: "SG", name: "Singapore", shopeeDomain: "shopee.sg", lazadaDomain: "lazada.sg", currency: "SGD", currencyToUsd: 0.74 },
  { code: "MY", name: "Malaysia", shopeeDomain: "shopee.com.my", lazadaDomain: "lazada.com.my", currency: "MYR", currencyToUsd: 0.21 },
  { code: "TH", name: "Thailand", shopeeDomain: "shopee.co.th", lazadaDomain: "lazada.co.th", currency: "THB", currencyToUsd: 0.028 },
  { code: "PH", name: "Philippines", shopeeDomain: "shopee.ph", lazadaDomain: "lazada.com.ph", currency: "PHP", currencyToUsd: 0.017 },
  { code: "ID", name: "Indonesia", shopeeDomain: "shopee.co.id", lazadaDomain: "lazada.co.id", currency: "IDR", currencyToUsd: 0.000062 },
  { code: "VN", name: "Vietnam", shopeeDomain: "shopee.vn", lazadaDomain: "lazada.vn", currency: "VND", currencyToUsd: 0.00004 }
];

export const categories = [
  { id: "mobile-accessories", name: "手机配件", keywords: ["phone case", "phone charger", "cable organizer", "phone stand", "screen protector"], trendKeyword: "mobile accessories" },
  { id: "beauty-tools", name: "美妆个护", keywords: ["makeup brush set", "facial mask", "hair styling tools", "eyelash curler", "facial sprayer"], trendKeyword: "beauty tools" },
  { id: "home-organization", name: "家居收纳", keywords: ["drawer organizer", "shoe storage box", "vacuum storage bag", "kitchen rack", "closet organizer"], trendKeyword: "home organization" },
  { id: "pet-supplies", name: "宠物用品", keywords: ["pet water fountain", "pet grooming brush", "cat litter mat", "slow feeder bowl", "dog leash"], trendKeyword: "pet supplies" },
  { id: "fitness-outdoor", name: "运动户外", keywords: ["resistance band", "sports towel", "camping light", "yoga mat", "phone holder bike"], trendKeyword: "fitness equipment" },
  { id: "consumer-electronics", name: "消费电子", keywords: ["bluetooth earbuds", "portable projector", "wireless charger", "bluetooth tracker", "portable monitor"], trendKeyword: "consumer electronics" },
  { id: "small-appliances", name: "小家电", keywords: ["mini blender", "portable fan", "vacuum cleaner", "sealing machine", "electric cup"], trendKeyword: "small appliances" }
];

export const priceTiers = [
  { id: "0-5", label: "0-5美元", min: 0, max: 5 },
  { id: "5-15", label: "5-15美元", min: 5, max: 15 },
  { id: "15-30", label: "15-30美元", min: 15, max: 30 },
  { id: "30-50", label: "30-50美元", min: 30, max: 50 },
  { id: "50-70", label: "50-70美元", min: 50, max: 70 },
  { id: "70-100", label: "70-100美元", min: 70, max: 100 },
  { id: "100-200", label: "100-200美元", min: 100, max: 200 }
];

export function inferTierId(priceUsd) {
  const tier = priceTiers.find((t) => priceUsd >= t.min && priceUsd < t.max);
  return tier?.id || null;
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomDelay(min = 2000, max = 5000) {
  return delay(min + Math.random() * (max - min));
}

export const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
