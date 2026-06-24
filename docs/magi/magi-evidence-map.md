# MAGI Evidence Map

| Claim | Label | Source | Confidence | Challenge |
|---|---|---|---|---|
| 默认刷新周期为 12 小时。 | Fact | `server/index.js`、`scripts/update-data.js`、`scripts/scheduler.js`、`.env.example`、`data/latest-snapshot.json`、`npm run check` | High | 用户允许按需调整频率，但目标仍写 12 小时，因此默认保留 12。 |
| 每区有 5 个监控平台。 | Fact | `data/platform-sources.json`、`scripts/verify-snapshot.js` | High | 不是所有区域都有同口径市占率。 |
| 平台 Top5 是监控覆盖优先级，不全部是严格市占率排名。 | Fact | `data/platform-sources.json` notes、`docs/research-notes.md`、前端 `PlatformCoverage` | High | 生产使用需月度复核来源。 |
| 每个区域/平台/价格带都有 Top10 商品组。 | Fact | `rankGroups`、`scripts/verify-snapshot.js` | High | 目前多数商品仍来自 synthetic fallback。 |
| 每个榜单商品有 90 天销量、搜索、成单率、客单价趋势。 | Fact | `scripts/verify-snapshot.js` | High | 趋势真实度取决于数据源模式。 |
| GitHub Pages 不包含密钥或真实快照。 | Fact | `.gitignore`、`public/config.json`、build output | Medium | 推送前仍需人工/自动 secret scan。 |
| Amazon 真实生产数据已接入。 | Missing Evidence | 仅有 `amazon-global` 声明和 disabled connector 示例 | High | 当前接受为后续生产接入项，不能声称已完成真实 Amazon 采集。 |
