/**
 * Lazada 公开产品数据采集器
 * 通过 Lazada AJAX 搜索 API 采集产品数据
 */
import fs from "node:fs/promises";
import { categories, seaCountries, vendorExportsDir, randomDelay, userAgent, proxyDispatcher, inferTierId } from "./config.js";

const PRODUCTS_PER_CATEGORY = 50;
const PAGE_SIZE = 40;

async function fetchLazadaSearchPage(domain, keyword, page) {
  const url = `https://www.${domain}/catalog/?_keyparam=1&ajax=true&q=${encodeURIComponent(keyword)}&page=${page}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": userAgent,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "identity",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": `https://www.${domain}/catalog/?q=${encodeURIComponent(keyword)}`
      },
      dispatcher: proxyDispatcher,
      redirect: "follow",
      signal: AbortSignal.timeout(20000)
    });

    if (!response.ok) {
      console.warn(`  [lazada] ${domain} "${keyword}" page ${page}: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.warn(`  [lazada] ${domain} "${keyword}" page ${page}: ${error.message}`);
    return null;
  }
}

function extractLazadaProduct(item, country, keyword, category) {
  const priceLocal = parseFloat(item.price || item.cheapest_sku?.price || 0);
  const priceUsd = priceLocal * country.currencyToUsd;
  const rating = parseFloat(item.ratingScore || 0);
  const reviewCount = parseInt(item.review || item.reviewCount || 0, 10);
  const soldText = item.itemSoldCntShow || item.itemSold || "0";
  const sold = parseInt(String(soldText).replace(/[^0-9]/g, ""), 10) || 0;

  return {
    title: item.name || "",
    platform: "lazada",
    platformDomain: country.lazadaDomain,
    countryCode: country.code,
    regionId: "sea",
    platformId: "lazada",
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
    shopName: item.sellerName || item.brandName || "",
    imageUrl: item.image || "",
    itemId: item.nid || item.itemId || "",
    collectedAt: new Date().toISOString()
  };
}

async function collectCategoryFromCountry(domain, country, category) {
  const allProducts = [];

  for (const keyword of category.keywords.slice(0, 2)) {
    const pagesNeeded = Math.ceil(PRODUCTS_PER_CATEGORY / PAGE_SIZE);

    for (let page = 1; page <= pagesNeeded; page++) {
      console.log(`  [lazada] ${domain} / ${keyword} / page ${page}`);
      const data = await fetchLazadaSearchPage(domain, keyword, page);

      const items = data?.mods?.listItems || [];
      if (items.length === 0) {
        console.log(`  [lazada] ${domain} / ${keyword}: 无更多结果`);
        break;
      }

      for (const item of items) {
        const product = extractLazadaProduct(item, country, keyword, category);
        if (product.title && product.price > 0) {
          allProducts.push(product);
        }
      }

      if (allProducts.length >= PRODUCTS_PER_CATEGORY) break;
      await randomDelay(3000, 6000);
    }

    if (allProducts.length >= PRODUCTS_PER_CATEGORY) break;
  }

  return allProducts.slice(0, PRODUCTS_PER_CATEGORY);
}

export async function collectLazada() {
  console.log("\n=== Lazada 采集开始 ===");
  const allProducts = [];
  const errors = [];

  for (const country of seaCountries) {
    if (!country.lazadaDomain) {
      console.log(`\n  [lazada] ${country.name}: Lazada未覆盖，跳过`);
      continue;
    }
    for (const category of categories) {
      console.log(`\n  [lazada] ${country.lazadaDomain} / ${category.name}`);
      try {
        const products = await collectCategoryFromCountry(country.lazadaDomain, country, category);
        allProducts.push(...products);
        console.log(`  [lazada] ${country.lazadaDomain} / ${category.name}: ${products.length} 个产品`);
      } catch (error) {
        console.error(`  [lazada] ${country.lazadaDomain} / ${category.name}: ${error.message}`);
        errors.push({ domain: country.lazadaDomain, category: category.id, error: error.message });
      }
      await randomDelay(4000, 8000);
    }
  }

  const dateStr = new Date().toISOString().slice(0, 10);
  const outputFile = `${vendorExportsDir}/lazada-sea-${dateStr}.json`;
  await fs.mkdir(vendorExportsDir, { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify({ rows: allProducts, errors, collectedAt: new Date().toISOString() }, null, 2));
  console.log(`\n  Lazada 写入: ${outputFile} (${allProducts.length} 个产品, ${errors.length} 个错误)`);

  return allProducts;
}

if (process.argv[1]?.endsWith("lazada-collector.js")) {
  collectLazada().then(() => console.log("=== Lazada 采集完成 ===")).catch(console.error);
}
