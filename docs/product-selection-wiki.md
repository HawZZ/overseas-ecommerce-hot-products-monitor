# 选品 Wiki 公开模板

本文件只作为公开仓库模板，不包含本机真实 SKU、机会池或平台导出数据。

本机刷新脚本会把动态 wiki 写入 `data/product-selection-wiki.md`，该文件已加入 `.gitignore`，并由登录后的本机后端 `/api/wiki` 提供给看板。

## 工作流

1. metrics-dashboard：定义可执行爆品机会数、输入指标、健康指标和告警。
2. market-segments + market-sizing：按区域、国家/地区、品类拆机会池。
3. competitor-analysis + pricing-strategy：筛 SKU、价格带、竞品强度和毛利安全垫。
4. cohort-analysis + sentiment-analysis：验证 90 天销量、搜索、成单率、客单价、评论和退货信号。
5. product-strategy + gtm-strategy：把成功逻辑沉淀为 4P 动作和 GTM 复用规则。

## 真实数据边界

- 默认不生成模拟 SKU 或静态榜单。
- 真实数据来自授权平台 API、卖家后台导出、广告/搜索/评论数据或第三方数据商。
- 缺少 API 或授权文件时，看板显示待接入状态。
- API key、平台凭证和动态 wiki 只保存在本机后端，不进入 GitHub Pages。
