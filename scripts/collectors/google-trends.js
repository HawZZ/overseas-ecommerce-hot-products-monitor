/**
 * Google Trends 采集器
 * 获取东南亚地区品类搜索趋势（过去90天，周粒度）
 */
import fs from "node:fs/promises";
import googleTrends from "google-trends-api";
import { categories, seaCountries, vendorExportsDir, delay } from "./config.js";

async function fetchInterestOverTime(keyword, countryCode) {
  try {
    const result = await googleTrends.interestOverTime({
      keyword,
      startTime: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      endTime: new Date(),
      geo: countryCode,
      granularity: "MONTHLY"
    });
    const parsed = JSON.parse(result);
    const timeline = parsed.default?.timelineData || [];
    return timeline.map((point) => ({
      date: new Date(Number(point.time) * 1000).toISOString().slice(0, 10),
      value: point.value?.[0] ?? 0
    }));
  } catch (error) {
    console.warn(`  [google-trends] ${keyword} @ ${countryCode}: ${error.message}`);
    return [];
  }
}

async function fetchRelatedQueries(keyword, countryCode) {
  try {
    const result = await googleTrends.relatedQueries({
      keyword,
      startTime: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      endTime: new Date(),
      geo: countryCode
    });
    const parsed = JSON.parse(result);
    const rising = parsed.default?.rankedList?.[0]?.rankedKeyword || [];
    const top = parsed.default?.rankedList?.[1]?.rankedKeyword || [];
    return {
      rising: rising.slice(0, 10).map((item) => ({ query: item.query, value: item.value })),
      top: top.slice(0, 10).map((item) => ({ query: item.query, value: item.value }))
    };
  } catch (error) {
    console.warn(`  [google-trends] related queries ${keyword} @ ${countryCode}: ${error.message}`);
    return { rising: [], top: [] };
  }
}

function computeSearchMetrics(timeline) {
  if (!timeline || timeline.length < 2) {
    return { search90d: 0, searchChange: 0, trendSeries: [] };
  }
  const values = timeline.map((p) => p.value);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const firstHalf = values.slice(0, Math.floor(values.length / 2));
  const secondHalf = values.slice(Math.floor(values.length / 2));
  const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / (firstHalf.length || 1);
  const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / (secondHalf.length || 1);
  const change = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;
  return {
    search90d: Math.round(avg * 1000),
    searchChange: Math.round(change * 10) / 10,
    trendSeries: timeline
  };
}

export async function collectGoogleTrends() {
  console.log("\n=== Google Trends 采集开始 ===");
  const allResults = [];
  const countryCodes = seaCountries.map((c) => c.code);

  for (const category of categories) {
    for (const countryCode of countryCodes) {
      console.log(`  [google-trends] ${category.trendKeyword} @ ${countryCode}`);

      const timeline = await fetchInterestOverTime(category.trendKeyword, countryCode);
      const related = await fetchRelatedQueries(category.trendKeyword, countryCode);
      const metrics = computeSearchMetrics(timeline);

      allResults.push({
        categoryId: category.id,
        categoryName: category.name,
        countryCode,
        trendKeyword: category.trendKeyword,
        ...metrics,
        relatedQueries: related,
        collectedAt: new Date().toISOString()
      });

      await delay(1500 + Math.random() * 2000);
    }
  }

  const outputFile = `${vendorExportsDir}/google-trends-sea-${new Date().toISOString().slice(0, 10)}.json`;
  await fs.mkdir(vendorExportsDir, { recursive: true });
  await fs.writeFile(outputFile, JSON.stringify({ rows: allResults, collectedAt: new Date().toISOString() }, null, 2));
  console.log(`  Google Trends 写入: ${outputFile} (${allResults.length} 条)`);

  return allResults;
}

if (process.argv[1]?.endsWith("google-trends.js")) {
  collectGoogleTrends().then(() => console.log("=== Google Trends 采集完成 ===")).catch(console.error);
}
