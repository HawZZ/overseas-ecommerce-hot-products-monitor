---
title: 数据索引与真实性边界
kind: data-index
status: current
updated: 2026-08-03
---

# 数据索引与真实性边界

## 标题生成器本机数据

`data/title-generator/` 被 Git 忽略：生成历史、标题实验和缓存仅供本机 API 使用。实验指标来自用户导入的日级 Shopee 数据，缺失值为 `null`；Google Trends 只能标记为台湾 90 天相对指数，不能当作 Shopee 搜索量。

## 数据分层

| 层 | 路径 | Git | 敏感性 | 责任 |
|---|---|---|---|---|
| 公开配置 | `data/platform-sources.json` | tracked | 公开 | 区域、国家、Top5 平台、研究来源和覆盖口径 |
| 连接器模板 | `data/connectors.example.json` | tracked | 公开 | 可用 connector type 和非密钥示例 |
| Pages 运行配置 | `public/config.json` | tracked | 公开 | 默认后端 HTTPS URL；URL 不是密钥 |
| 连接器运行配置 | `data/connectors.json` | ignored | 可能含密钥/本机路径 | 启用状态、凭据和导入目录 |
| 原始/授权导出 | `data/vendor-exports/*` | ignored | 商业数据 | 平台、数据商或采集器输出 |
| 标准化导出 | `data/vendor-exports/normalized/*` | ignored | 商业数据 | 生成器可读取的统一行 |
| 快照 | `data/latest-snapshot.json` | ignored | 业务数据 | 登录后看板完整数据 |
| 动态选品 Wiki | `data/product-selection-wiki.md` | ignored | 业务分析 | 登录后 `/api/wiki` 返回 |
| 审计日志 | `data/audit.log` | ignored | PII/安全日志 | 登录和刷新事件 |
| 公开 Wiki 模板 | `docs/product-selection-wiki.md` | tracked | 公开 | 动态 Wiki 缺失时的无数据模板 |

禁止把 ignored 运行数据改名后提交到其他目录。`dist/`、Pages artifact、截图和回复也不得包含这些内容。

## 数据流

```text
外部来源/卖家导出
  -> collectors 或人工放入 vendor-exports
  -> normalizeAll（可选）
  -> 启用的 csv-folder connector
  -> loadVendorExports
  -> normalizeVendorRow
  -> buildImportedProducts
  -> 90 天趋势 + 聚合 + 派生分析
  -> latest-snapshot.json / product-selection-wiki.md
  -> requireSession
  -> GitHub Pages 浏览器
```

关键限制：采集器写出文件，不代表快照会自动读取。`scripts/update-data.js` 当前只消费一个启用且类型为 `csv-folder` 的连接器路径。

## 标准导入行

生成器接受 CSV 或 JSON，关键字段为：

| 字段 | 语义 | 缺失行为 |
|---|---|---|
| `date` | 建议为 `YYYY-MM-DD` 的观测日期 | 无日期行无法进入对应趋势日 |
| `regionId` | `sea`、`north-america`、`western-europe`、`africa` | 行被过滤 |
| `countryId` / `countryCode` | 国家/地区 | 无法解析时归到区域整体 |
| `platformId` | 区域内平台 ID | 行被过滤 |
| `categoryId` | 品类 ID | 当前会回退到第一个品类，需谨慎 |
| `priceTierId` | 七个美元价格带之一 | 可由价格推断；无法推断时过滤 |
| `title` | 商品/SKU 名 | 回退“未命名导入SKU” |
| `salesUnits` | 来源定义的销量 | 转为数值；必须另行确认日销量还是累计销量 |
| `searchVolume` | 来源定义的搜索值 | 缺失为 0；不能自动解释为真实零 |
| `conversionRate` | 0-1 或百分数 | 大于 1 时除以 100 |
| `averageOrderValue` | 美元价格/客单价 | 缺失时可能用价格带中点参与派生定价 |
| `sentiment` | -1 到 +1 评论情绪 | 缺失时使用规则估算 |
| `reviewVolume` | 评论数量 | 缺失为 0 |
| `metricStatus` | 字段级 observed/missing/proxy 标签 | 只在 normalized collector 输出中较完整 |

## 真实、代理和派生边界

| 数据 | 当前实现 | 分类 | 可以怎样表述 |
|---|---|---|---|
| 平台商品标题、价格、rating、review count | 搜索结果或导入字段 | `observed`，但需保留来源时间 | “来源在某时刻返回的值” |
| `salesUnits` | Shopee/Lazada 的 sold 字段或导入字段 | `observed` 但语义未统一 | 先确认累计/周期/日销量，不能直接称 90 天销量 |
| Google Trends timeline | 官方相对热度指数 | `observed-proxy` | “相对搜索热度”，不是绝对搜索次数 |
| collector `search90d` | 相对指数均值 × 1000 | `derived-proxy` | 只能做内部比较，并标明公式 |
| USD 价格、价格带 | 本地币 × 静态汇率、区间映射 | `derived` | 标明汇率来源/日期；当前汇率是静态配置 |
| rating sentiment | `(rating - 3) / 2` | `derived-proxy` | “评分代理情绪”，不是文本情绪分析 |
| 90 天 summary | 对 90 点数组求和/均值/首末 14 天变化 | `derived` | 仅在日粒度完整时具有对应业务语义 |
| supply/logistics/fee/tax/margin | `estimatePricing` + 确定性随机种子 | `estimated` | 不能称真实成本或真实毛利 |
| 缺失 sentiment、NPS proxy | `estimateSentiment` + 规则/种子 | `estimated` | 不能称真实口碑或 NPS |
| 竞品强度、竞品详情 | 平台权重、品类常量和种子 | `estimated` | 只能作为设计占位 |
| cohort/retention proxy | summary + sentiment + pricing 规则 | `derived-proxy` | 不是用户留存 cohort |
| 机会分、阶段、告警、4P、GTM | 多个 observed/estimated 字段的规则组合 | `derived` | 必须能追溯输入，不能当原始事实 |
| 风险分析 | 固定材料清单 + connector/URL 状态 | `checklist` | 尚无风险等级或通过结论 |
| 模型 Wiki | 快照压缩输入 + OpenAI 输出 | `model-derived` | 仅在显式命令调用，并保留输入边界 |

`ALLOW_SYNTHETIC_DEMO=1` 仍可启用 synthetic 生成器，但默认关闭；生产和验证任务不得设置该变量。

## 当前本机数据快照

以下只描述 2026-08-03T03:00:22.627Z 的安全元数据：

| 项目 | 数值 |
|---|---:|
| `dataMode` | `live-local-import` |
| vendor rows / files | 1188 / 1 |
| regions / price tiers | 4 / 7 |
| opportunity pools | 24 |
| rank groups | 199 |
| shortlist | 40 |
| alerts | 14 |

当前商品覆盖：泰国 348、新加坡 346、马来西亚 349、菲律宾 139；台湾、越南、印尼、北美、西欧和非洲为 0。这里的“商品数”来自快照分组结果，不代表平台全量商品数或市场规模。

现有本机导出元数据：

- Google Trends：42 行，采集时间 2026-07-08。
- Lazada 原始：1190 行，采集时间 2026-07-08。
- Lazada normalized：1188 行。
- 当前没有被快照读取的 Shopee normalized 文件。

## SKU identity

生成器先按 `region + country + platform + priceTier + category + exact title` 建商品，因此每个平台/市场仍是独立记录。前端 `buildSkuGroups` 再按 `exact lowercase title + category + priceTier` 聚合并汇总二级明细。

这不是可靠的同款识别：

- 同款在不同语言、标题或价格带会漏合并。
- 不同品牌的通用标题可能误合并。
- 缺少 GTIN/UPC/EAN、品牌、型号、规格、图片指纹和人工映射证据。

未来 identity 应以稳定 ID 和映射表为主，标题匹配只输出低置信候选。

## 安全查询

可以读取统计和 schema，不要打印完整运行文件：

```bash
jq '{generatedAt,dataMode,refreshCadenceHours,rowCounts:.dataQuality.rowCounts}' data/latest-snapshot.json
jq 'to_entries | map({id:.key,type:.value.type,enabled:(.value.enabled//false),fieldNames:(.value|keys)})' data/connectors.json
jq -s '{entries:length,latestAt:(map(.at)|max),events:(group_by(.event)|map({event:.[0].event,count:length}))}' data/audit.log
git check-ignore -v data/connectors.json data/latest-snapshot.json data/vendor-exports/example.json
```

不要运行会输出 `.env`、完整 connector values、完整审计行、商品明细或 Authorization header 的诊断命令。

## 数据变更完成标准

1. schema 和 `metricStatus` 同步更新。
2. 观测、代理、估算、规则和模型字段可区分。
3. 缺失值不被无提示地当作真实 0。
4. `scripts/verify-snapshot.js` 增加对应结构/负向断言。
5. 更新本页、`docs/data-model.md` 和 Wiki log。
6. 运行 `npm run refresh`、`npm run verify:snapshot` 和受影响前端检查，但不覆盖用户的真实导出。
