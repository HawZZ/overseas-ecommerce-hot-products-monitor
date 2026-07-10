import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const snapshotPath = path.resolve(rootDir, "data", "latest-snapshot.json");
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertTrend(product, label) {
  assert(Array.isArray(product.trend), `${label} missing trend`);
  assert(product.trend.length === 90, `${label} trend length is ${product.trend.length}, expected 90`);
  for (const point of product.trend) {
    assert("salesUnits" in point, `${label} trend missing salesUnits`);
    assert("searchVolume" in point, `${label} trend missing searchVolume`);
    assert("conversionRate" in point, `${label} trend missing conversionRate`);
    assert("averageOrderValue" in point, `${label} trend missing averageOrderValue`);
  }
}

assert(snapshot.refreshCadenceHours === 12, "default refresh cadence must be 12 hours");
assert(snapshot.workflowVersion === "pm-4p-workflow-v2", "workflowVersion must be pm-4p-workflow-v2");
assert(["live-local-import", "awaiting-real-data"].includes(snapshot.dataMode), "dataMode must be explicit and non-synthetic");
assert(snapshot.dataQuality?.boundary, "dataQuality.boundary is required");

assert(snapshot.regions?.length === 4, "expected 4 regions");
for (const region of snapshot.regions) {
  assert(region.platforms?.length === 5, `${region.name} must have 5 platform entries`);
  assert(Array.isArray(region.countries) && region.countries.length > 0, `${region.name} must include country/region filters`);
}
assert(snapshot.regions.find((region) => region.id === "sea")?.countries?.some((country) => country.id === "tw" && country.default), "SEA must default to Taiwan");

assert(snapshot.globalDataSources?.some((source) => source.id === "amazon-global"), "amazon-global data source is required");
assert(snapshot.priceTiers?.length === 7, "expected 7 price tiers");
assert(snapshot.priceTiers.map((tier) => tier.id).join(",") === "0-5,5-15,15-30,30-50,50-70,70-100,100-200", "price tiers changed unexpectedly");

assert(snapshot.tierRanks?.length === 7, "tierRanks must cover every price tier");
for (const group of snapshot.tierRanks) {
  assert(group.products?.length <= 10, `${group.label} cannot exceed top 10 products`);
  for (const product of group.products) {
    assertTrend(product, `${group.label}/${product.title}`);
    assert(product.sourceType !== "synthetic", `${group.label}/${product.title} must not be synthetic`);
  }
}

const rankGroups = snapshot.rankGroups || [];
assert(rankGroups.length > 0, "rankGroups are required");
const regionPlatformTierGroups = rankGroups.filter((group) => group.type === "region-platform-price-tier");
assert(regionPlatformTierGroups.length >= 4 * 5 * 7, "region/platform/price tier groups must cover configured combinations");
assert(rankGroups.some((group) => group.type === "region-country"), "rankGroups must include region-country groups");
for (const group of regionPlatformTierGroups) {
  assert(group.products?.length <= 10, `${group.label} cannot exceed top 10 products`);
  for (const product of group.products) {
    assertTrend(product, `${group.label}/${product.title}`);
    assert(product.dataLineage?.mode, `${group.label}/${product.title} missing dataLineage`);
    assert(product.sourceType !== "synthetic", `${group.label}/${product.title} must not be synthetic`);
  }
}

assert(snapshot.metricsFramework?.northStar?.name === "可执行爆品机会数", "metrics dashboard north star missing");
assert(snapshot.alerts?.length >= 1, "alert list should not be empty");
assert(snapshot.workflowSteps?.length === 5, "PM workflow must have 5 steps");
assert(snapshot.strategyCanvas?.sections?.length === 9, "strategy canvas must have 9 sections");
assert(snapshot.gtmPlaybook?.roadmap90Days?.length === 3, "GTM playbook must have 90 day roadmap");

assert(snapshot.opportunityPools?.every((pool) => pool.countryId && pool.countryName), "opportunityPools must include country/region dimension");
assert(snapshot.opportunityPools?.every((pool) => Array.isArray(pool.sourcingReferences)), "opportunityPools must include sourcingReferences array");
assert(snapshot.opportunityPools?.every((pool) => pool.sourcingReferences.length === 0 || pool.sourcingReferences.some((reference) => reference.sourcingRegionName === "中国大陆")), "every opportunity pool with sourcing must include China mainland sourcing");
for (const pool of snapshot.opportunityPools) {
  for (const reference of pool.sourcingReferences) {
    assert(reference.platformId && reference.platformName, `${pool.id} sourcing reference missing platform`);
    assert(reference.url && reference.url.startsWith("http"), `${pool.id} sourcing reference missing url`);
    assert(reference.targetRegionName && reference.sourcingRegionName, `${pool.id} sourcing reference missing region`);
  }
}

console.log("Snapshot verification passed");
