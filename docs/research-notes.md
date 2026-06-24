# 平台研究笔记

更新时间：2026-06-24

## 假设

- 区域 Top5 用于监控覆盖优先级，不声明为严格、同口径、全区域 GMV 排名。
- 北美目前以美国电商份额作为代理口径，后续可拆分美国、加拿大、墨西哥。
- 西欧和非洲公开资料常给排名或 GMV 片段，不总给可比份额，因此使用 `platformWeight` 做初始权重。
- 亚马逊既是区域平台，也是全局基准数据源。

## 区域平台

东南亚：

- Shopee
- TikTok Shop
- Lazada
- Tokopedia
- Tiki

北美：

- Amazon
- Walmart Marketplace
- Apple Online Store
- eBay
- Target

西欧：

- Amazon
- eBay
- Zalando
- Cdiscount
- bol.com

非洲：

- Amazon
- Takealot
- Jumia
- SHEIN
- Temu

## 来源

来源 URL 已写入 `data/platform-sources.json`，看板底部会展示可点击来源。公开资料容易更新，生产使用时建议每月复核一次平台覆盖和权重。
