/**
 * 数据采集主入口
 * 按顺序运行: Google Trends -> Shopee -> Lazada -> 标准化
 *
 * 用法:
 *   node scripts/collectors/index.js           # 运行全部采集器
 *   node scripts/collectors/index.js trends     # 只运行 Google Trends
 *   node scripts/collectors/index.js shopee     # 只运行 Shopee
 *   node scripts/collectors/index.js lazada     # 只运行 Lazada
 *   node scripts/collectors/index.js normalize  # 只运行标准化
 */
import { collectGoogleTrends } from "./google-trends.js";
import { collectShopee } from "./shopee-collector.js";
import { collectLazada } from "./lazada-collector.js";
import { normalizeAll } from "./normalize.js";

const collectors = {
  trends: collectGoogleTrends,
  shopee: collectShopee,
  lazada: collectLazada,
  normalize: normalizeAll
};

async function runAll() {
  const args = process.argv.slice(2);
  const selected = args.length > 0
    ? args.filter((arg) => collectors[arg])
    : ["trends", "shopee", "lazada", "normalize"];

  if (selected.length === 0) {
    console.log("可用采集器: trends, shopee, lazada, normalize");
    console.log("用法: node scripts/collectors/index.js [trends] [shopee] [lazada] [normalize]");
    process.exit(1);
  }

  console.log(`=== 采集管道开始 (${new Date().toISOString()}) ===`);
  console.log(`运行: ${selected.join(" -> ")}\n`);

  const results = {};
  for (const name of selected) {
    const start = Date.now();
    try {
      results[name] = await collectors[name]();
      console.log(`  [${name}] 耗时: ${((Date.now() - start) / 1000).toFixed(1)}s`);
    } catch (error) {
      console.error(`  [${name}] 失败: ${error.message}`);
      results[name] = { error: error.message };
    }
  }

  console.log(`\n=== 采集管道完成 (${new Date().toISOString()}) ===`);
  return results;
}

runAll().catch(console.error);
