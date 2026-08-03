function number(value) { return Number.isFinite(Number(value)) ? Number(value) : null; }
function mean(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }
function metrics(rows) {
  const uv = rows.map((row) => number(row.productUv)).filter((value) => value !== null);
  const imp = rows.map((row) => number(row.searchImpressions)).filter((value) => value !== null);
  const clicks = rows.map((row) => number(row.searchClicks)).filter((value) => value !== null);
  const orders = rows.map((row) => number(row.orders)).filter((value) => value !== null);
  const revenue = rows.map((row) => number(row.revenue)).filter((value) => value !== null);
  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  return { uvPerDay: mean(uv), ctr: sum(imp) ? sum(clicks) / sum(imp) : null, cvr: sum(uv) ? sum(orders) / sum(uv) : null, aov: sum(orders) ? sum(revenue) / sum(orders) : null, days: rows.length };
}
export function analyzeExperiment(experiment) {
  const rows = experiment.observations || [];
  const base = rows.filter((row) => row.variant === "baseline");
  const variant = rows.filter((row) => row.variant === "candidate");
  const windowDays = Number(experiment.windowDays || 14);
  const invalid = base.length < windowDays || variant.length < windowDays || [...base, ...variant].some((row) => row.inStock === false || number(row.productUv) === null || number(row.searchImpressions) === null || number(row.searchClicks) === null);
  const baseline = metrics(base); const candidate = metrics(variant);
  if (invalid) return { baseline, candidate, verdict: "inconclusive", reason: "主指標缺失、窗口不完整或存在缺貨日；不給出勝負結論", method: "非隨機前後對照，不代表因果" };
  const uvUp = candidate.uvPerDay > baseline.uvPerDay;
  const ctrUp = candidate.ctr > baseline.ctr;
  const guardrailDown = (candidate.cvr !== null && baseline.cvr !== null && candidate.cvr < baseline.cvr) || (candidate.aov !== null && baseline.aov !== null && candidate.aov < baseline.aov);
  return { baseline, candidate, verdict: uvUp && ctrUp && !guardrailDown ? "inconclusive" : "inconclusive", reason: "v1 需要完整日級樣本與顯著性檢驗後才會輸出正向或負向", method: "非隨機前後對照，不代表因果" };
}
