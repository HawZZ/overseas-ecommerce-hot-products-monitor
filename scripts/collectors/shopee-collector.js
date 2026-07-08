/**
 * Shopee 公开产品数据采集器
 * 通过 Shopee 内部搜索 API 采集热销产品数据
 */
import fs from "node:fs/promises";
import { categories, seaCountries, vendorExportsDir, randomDelay, userAgent, proxyDispatcher, inferTierId } from "./config.js";

const PRODUCTS_PER_CATEGORY = 50;
const PAGE_SIZE = 30;

async function fetchShopeeSearchPage(domain, keyword, page) {
  const url = `https://${domain}/api/v4/search/search_items?by=relevancy&keyword=${encodeURIComponent(keyword)}&limit=${PAGE_SIZE}&newest=${page * PAGE_SIZE}&order=desc&page_type=search&scenario=PAGE_GLOBAL_SEARCH&version=2`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": `https://${domain}/`,
        "X-Requested-With": "XMLHttpRequest",
        "X-API-SOURCE": "pc"
      },
      dispatcher: proxyDispatcher,
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      console.warn(`  [shopee] ${domain} "${keyword}" page ${page}: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.warn(`  [shopee] ${domain} "${keyword}" page ${page}: ${error.message}`);
    return null;
  }
}

function extractProduct(item, country, keyword, category) {
  const info = item.item_basic || item;
  const priceLocal = (info.price || info.price_min || 0) / 100000;
  const priceUsd = priceLocal * country.currencyToUsd;
  const rating = info.item_rating?.rating_star ?? 0;
  const reviewCount = info.cmt_count ?? info.rating?.rating_count?.[0] ?? 0;
  const sold = info.sold ?? info.historical_sold ?? 0;

  return {
    title: info.name || "",
    platform: "shopee",
    platformDomain: country.shopeeDomain,
    countryCode: country.code,
    regionId: "sea",
    platformId: "shopee",
    categoryId: category.id,
    categoryName: category.name,
    priceLocal: Math.round(priceLocal * 100) / 100,
    currency: country.currency,
    price: Math.round(priceUsd * 100) / 100,
    priceTierId: inferTierId(priceUsd),
    salesUnits: sold,
    searchKeyword: keyword,
    rating: Math.round(rating * 100) / 100,
    reviewVolume: reviewCount,
    shopName: info.shop_location || "",
    imageUrl: info.image ? `https://cf.shopee.com.br/file/${info.image}` : "",
    itemId: info.item_id || info.id || "",
    collectedAt: new Date().toISOString()
  };
}

async function collectCategoryFromCountry(domain, country, category) {
  const allProducts = [];

  for (const keyword of category.keywords.slice(0, 2)) {
    const pagesNeeded = Math.ceil(PRODUCTS_PER_CATEGORY / PAGE_SIZE);

    for (let page = 0; page < pagesNeeded; page++) {
      console.log(`  [shopee] ${domain} / ${keyword} / page ${page}`);
      const data = await fetchShopeeSearchPage(domain, keyword, page);

      if (!data?.items?.length) {
        console.log(`  [shopee] ${domain} / ${keyword}: 无更多结果`);
        break;
      }

      for (const item of data.items) {
        const product = extractProduct(item, country, keyword, category);
        if (product.title && product.price > 0) {
          allProducts.push(product);
        }
      }

      if (allProducts.length >= PRODUCTS_PER_CATEGORY) break;
      await randomDelay(2500, 5000);
    }

    if (allProducts.length >= PRODUCTS_PER_CATEGORY) break;
  }

  return allProducts.slice(0, PRODUCTS_PER_CATEGORY);
}

export async function collectShopee() {
  console.log("\n=== Shopee 采集开始 ===");
  const allProducts = [];
  const errors = [];

  for (const country of seaCountries) {
    for (const category of categories) {
      console.log(`\n  [shopee] ${country.shopeeDomain} / ${category.name}`);
      try {
        const products = await collectCategoryFromCountry(country.shopeeDomain, country, category);
        allProducts.push(...products);
        console.log(`  [shopee] ${country.shopeeDomain} / ${category.name}: ${products.length} 个产品`);
      } catch (error) {
        console.error(`  [shopee] ${country.shopeeDomain} / ${category.name}: ${error.message}`);
        errors.push({ domain: country.shopeeDomain, category: category.id, error: error.message });
      }
      await randomDelay(3000, 6000);
    }
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const outputFile = `${vendorExportsDir}/shopee-sea-${dateStr}.json`;
  await fs.mkdir(vendorExportsDir, { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify({ rows: allProducts, errors, collectedAt: new Date().toISOString() }, null, 2));
  console.log(`\n  Shopee 写入: ${outputFile} (${allProducts.length} 个产品, ${errors.length} 个错误)`);

  return allProducts;
}

if (process.argv[1]?.endsWith("shopee-collector.js")) {
  collectShopee().then(() => console.log("=== Shopee 采集完成 ===")).catch(console.error);
}
