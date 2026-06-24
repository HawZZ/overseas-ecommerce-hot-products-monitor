# 数据模型

## 平台覆盖

`data/platform-sources.json` 包含：

- `regions`：东南亚、北美、西欧、非洲。
- `platforms`：每个区域 Top5 平台。
- `marketSharePercent`：公开资料提供可比份额时使用。
- `platformWeight`：只有排名、GMV 或市场领导描述时使用，不等同真实市占率。
- `collectionModes`：建议接入方式，例如平台 API、卖家后台导出、第三方数据商、搜索排名监控。

## 爆品趋势

`data/latest-snapshot.json` 包含：

- `workflowVersion`：当前工作流版本。
- `refreshCadenceHours`：后端刷新频率，默认 12 小时。
- `dataMode`：`synthetic-seed` 表示监控种子演示，`mixed-local-import` 表示已读取本机授权导出并用规则补全缺失维度。
- `dataQuality`：连接器状态、导入文件数、导入行数、导入文件列表和数据边界说明。
- `workflowSteps`：PM 组合工作流步骤和每步产物。
- `metricsFramework`：North Star、输入指标、健康指标、业务指标、定义、来源、目标和告警阈值。
- `alerts`：需要运营、供应链、产品或数据处理的告警队列。
- `marketSegments`：买家细分、JTBD、痛点、收益和适配说明。
- `opportunityPools`：区域/品类机会池，包含 TAM、SAM、SOM、增长率、竞争强度和推荐动作。
- `priceTiers`：0-5、5-15、15-30、30-50、50-70、70-100、100-200 美元。
- `tierRanks`：每个价格带 Top10 商品。
- `rankGroups`：持久化分组 Top10，包含价格带、区域、区域+平台、区域+平台+价格带、品类等维度。每个榜单商品保留 90 天趋势、summary、pricing、sentiment、cohort 和 dataLineage。
- `skuShortlist`：跨价格带的重点 SKU 筛选清单。
- `trend`：每个商品过去 90 天每日数据。
- `summary`：销量、搜索、成单率、客单价的当前值和趋势变化。
- `pricing`：目标价、竞品中位价、全成本、平台佣金、税费、毛利率、价格策略和价格实验。
- `competitors`：直接竞品、定位、优势、弱点和威胁等级。
- `cohort`：30 天 cohort 对比、趋势异常、留存代理指标和下一步验证动作。
- `sentiment`：评论/口碑代理信号，使用 -1 到 +1 的情绪分。
- `product4p`：当前 SKU 的 Product、Price、Place、Promotion 执行动作。
- `sourceType`：`synthetic` 或 `local-import`。
- `dataLineage`：SKU 数据来源、导入行数、来源文件和使用 caveat。
- `wikiSignals`：沉淀到选品 wiki 的品类级信号。
- `strategyCanvas`：Product Strategy Canvas 九宫格。
- `gtmPlaybook`：渠道、信息、KPI、90 天路线图和风险缓解。

## 生产接入建议

优先级：

1. 已授权卖家后台导出或官方 API。
2. 第三方市场情报数据商。
3. 合规的类目页和搜索页监控。
4. 搜索趋势、广告词、达人内容作为补充信号。

不要把平台账号、Cookie、Token 或付费数据源密钥放进前端。

## 本机导入字段

`data/vendor-exports/` 支持 CSV 或 JSON 数组。字段名可使用英文或中文别名：

| 标准字段 | 说明 |
|---|---|
| `date` | 日期，建议 `YYYY-MM-DD` |
| `regionId` | 区域 ID，例如 `sea`、`north-america`、`western-europe`、`africa` |
| `platformId` | 平台 ID，例如 `amazon-us`、`shopee` |
| `categoryId` | 品类 ID，例如 `home-organization` |
| `priceTierId` | 价格带 ID，例如 `15-30` |
| `title` | SKU 或商品名 |
| `salesUnits` | 当日销量 |
| `searchVolume` | 当日搜索量 |
| `conversionRate` | 成单率，支持 `0.08` 或 `8` |
| `averageOrderValue` | 客单价，美元 |
| `sentiment` | 评论情绪分，-1 到 +1 |
| `reviewVolume` | 评论数量 |
