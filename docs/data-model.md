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

- `priceTiers`：0-5、5-15、15-30、30-50、50-70、70-100、100-200 美元。
- `tierRanks`：每个价格带 Top10 商品。
- `trend`：每个商品过去 90 天每日数据。
- `summary`：销量、搜索、成单率、客单价的当前值和趋势变化。
- `wikiSignals`：沉淀到选品 wiki 的品类级信号。

## 生产接入建议

优先级：

1. 已授权卖家后台导出或官方 API。
2. 第三方市场情报数据商。
3. 合规的类目页和搜索页监控。
4. 搜索趋势、广告词、达人内容作为补充信号。

不要把平台账号、Cookie、Token 或付费数据源密钥放进前端。
