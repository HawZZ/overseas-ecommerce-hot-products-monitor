---
title: 代码索引
kind: code-index
status: current
updated: 2026-08-03
---

# 代码索引

本页按运行链路索引关键文件和符号。行号来自 2026-08-03 的 HEAD `d2d3345`，后续应优先按符号名查询 CodeGraph。

## 商品名生成器

- `server/title-generator/router.js`：会话保护 API、Zod 校验、历史与实验路由。
- `server/title-generator/rules.js`：繁简转换、规则档位和标题硬检查。
- `server/title-generator/source-inspector.js`：1688 URL/重定向/DNS 安全检查和公开资料提取。
- `server/title-generator/provider.js`：本机 provider 读取、主 Chat Completions 与临时故障 Responses fallback。

## 运行入口

| 命令/入口 | 实现 | 结果 |
|---|---|---|
| `npm run dev` | `vite.config.js`、`src/main.jsx` | 本机前端 `127.0.0.1:5173` |
| `npm run server` | `server/index.js` | 本机认证 API `127.0.0.1:8787` |
| `npm run collect` | `scripts/collectors/index.js` | 原始采集文件和 normalized export |
| `npm run refresh` | `scripts/update-data.js` | 本机快照和动态选品 Wiki |
| `npm run refresh:ai` | `scripts/update-data.js --with-ai-wiki` | 同上，并按条件调用模型重写 Wiki |
| `npm run scheduler` | `scripts/scheduler.js` | 进程内周期采集/刷新循环 |
| push `main` | `.github/workflows/pages.yml` | 构建并部署 GitHub Pages |
| systemd timer | 仓库外 unit + `scripts/sync-pages-tunnel-url.sh` | 定时刷新和同步 quick tunnel URL |

## 前端

主文件：[`src/main.jsx`](../../src/main.jsx)

| 符号 | 位置 | 责任 | 修改后重点检查 |
|---|---:|---|---|
| `loadRuntimeConfig` | 90 | 读取构建变量或 `public/config.json` | Pages 新 Tunnel、缓存和 fallback |
| `requestApi` | 109 | 组装 API 请求和 Bearer 头 | Token 不进入 URL/日志 |
| `buildSkuGroups` | 182 | 按标题、品类、价格带做前端跨平台聚合 | 同名误合并、异名漏合并、权重 |
| `collectSnapshotProducts` | 252 | 从多个榜单去重收集商品 | ID 去重、重复统计 |
| `useSnapshot` | 283 | 配置、登录、会话恢复、刷新和 API 状态 | sessionStorage、manual API fallback、401 |
| `App` | 533 | 全局筛选、默认台湾、页面切换和选中 SKU | 默认筛选、空数据页、跨页选中项 |
| `ConnectionPanel` | 705 | 当前 API、刷新和退出 | 地址编辑和会话状态 |
| `FilterPanel` | 762 | 区域/国家/品类/价格带/阶段筛选 | 国家随区域联动 |
| `TrendsPage` | 840 | 爆品趋势页编排 | 90 天图表和 shortlist |
| `RegionalCategoryPage` | 856 | 区域品类、寻源、SKU 和风险 | 台湾空态、寻源链接、风险目标 |
| `FourPPage` | 880 | 4P 与策略页面 | 缺失 `product4p` 的防御处理 |
| `ApiRiskPage` | 895 | 连接器和风险配置页面 | 密钥打码、保存状态 |
| `ConnectorConfigPanel` | 992 | 本机连接器表单 | 打码占位符不得覆盖真实密钥 |
| `RiskAnalysisPanel` | 1086 | 1688 URL + 市场风险请求 | URL 校验、无证据时措辞 |
| `LoginShell` | 1204 | 登录壳和默认 API 重置 | 配置加载前禁用、密码清空 |
| `SkuScreening` | 1562 | 聚合主行与平台/市场二级明细 | 聚合统计和选中明细 |

样式集中在 [`src/styles.css`](../../src/styles.css)。它不进入 CodeGraph；改布局时用 `rg` 定位 class，并运行视觉检查。

## 后端和权限边界

主文件：[`server/index.js`](../../server/index.js)

| 符号/路由 | 位置 | 认证 | 责任/副作用 |
|---|---:|---|---|
| `validateRuntimeConfig` | 157 | 启动时 | 生产或强制模式拒绝弱密钥 |
| `writeAudit` | 174 | 内部 | 追加本机 `data/audit.log` |
| `readConnectors` / `writeConnectors` | 207 / 236 | 受保护路由调用 | 读取/覆盖本机连接器，保留打码密钥 |
| `runRefresh` | 247 | 受保护路由调用 | 异步 spawn `scripts/update-data.js` |
| `GET /health` | 268 | 公开 | 最小健康状态，不返回数据 |
| `POST /api/login` | 277 | 账号密码 + IP 失败限流 | 签发 HMAC 会话、写审计 |
| `GET /api/session` | 298 | `requireSession` | 校验会话/服务 Token |
| `GET /api/snapshot` | 307 | `requireSession` | 返回完整本机快照 |
| `GET /api/wiki` | 315 | `requireSession` | 返回动态 Wiki，缺失时回退公开模板 |
| `GET /api/connectors` | 329 | `requireSession` | 只返回打码配置 |
| `POST /api/connectors` | 342 | `requireSession` | 写配置、触发刷新、写审计 |
| `POST /api/risk/analyze` | 360 | `requireSession` | 当前只返回材料/数据需求清单 |
| `POST /api/refresh` | 421 | `requireSession` | 触发单实例刷新；并发返回 409 |

认证核心是 `createSessionToken`、`verifySessionToken` 和 `requireSession`。只有一个权限层级；有效登录会话和 `API_TOKEN` 都可访问所有受保护资源。

## 数据采集与生成

| 文件/符号 | 责任 | 输入 | 输出 |
|---|---|---|---|
| `scripts/collectors/config.js` | 东南亚国家、品类、价格带、汇率和代理 | 环境代理变量 | 采集器共享配置 |
| `collectGoogleTrends` | 90 天相对趋势和关联词 | Google Trends | `google-trends-sea-YYYY-MM-DD.json` |
| `collectShopee` | 搜索结果商品 | Shopee 内部搜索接口 | `shopee-sea-YYYY-MM-DD.json` |
| `collectLazada` | 搜索结果商品 | Lazada AJAX 搜索 | `lazada-sea-YYYY-MM-DD.json` |
| `normalizeAll` | 原始平台数据标准化 | 最新 Trends/Shopee/Lazada 文件 | `vendor-exports/normalized/*.json` |
| `normalizeVendorRow` | CSV/JSON 别名转标准字段 | connector folder 文件 | 标准导入行 |
| `loadVendorExports` | 读取启用的 `csv-folder` | `data/connectors.json` | 已过滤行和文件列表 |
| `buildImportedTrend` | 对齐最近 90 个日期 | 标准导入行 | 90 点趋势，缺日为 0 且 `observed:false` |
| `buildImportedProducts` | 按市场/平台/价格带/品类/标题分组 | vendor rows + 平台配置 | 商品、lineage、规则分析 |
| `buildOpportunityPools` | 汇总区域/国家/品类机会 | 商品 | 机会池与寻源引用 |
| `buildRankGroups` | 生成 Top10 分组 | 商品 | 价格/区域/国家/平台/品类榜单 |
| `generateSnapshot` | 总编排 | 平台配置、连接器、vendor rows | `latest-snapshot.json` 内存对象 |
| `maybeCreateAiWiki` | 规则 Wiki 或按需模型 Wiki | 快照 + 可选模型变量 | Markdown |
| `main` | 写盘 | `generateSnapshot` 结果 | 本机快照与动态 Wiki |

`scripts/update-data.js` 同时包含真实导入聚合和派生评分。修改前必须读 [数据索引](data-index.md)；不能把 `estimatePricing`、`estimateSentiment`、`competitorIntensity` 或 Google Trends 代理值当作观测事实。

## 运维与验证

| 文件 | 用途 | 当前边界 |
|---|---|---|
| `scripts/scheduler.js` | 进程内周期执行 collect + refresh | 默认 24h，与 systemd/快照配置不一致 |
| `scripts/sync-pages-tunnel-url.sh` | 检测 quick tunnel、更新 `public/config.json`、commit/push | 会改变远端状态，只在明确授权的发布任务中运行 |
| `scripts/verify-snapshot.js` | 校验快照结构、价格带、榜单、台湾默认和非 synthetic | 不验证数值是否真实或新鲜 |
| `scripts/smoke-api.js` | 临时端口测试健康、匿名拒绝、错误/正确登录、快照访问 | 未覆盖所有受保护路由和限流 |
| `scripts/visual-check.js` | 桌面/移动登录、四页关键元素、溢出和控制台错误 | 依赖本机凭据和真实商品数据 |
| `.github/workflows/pages.yml` | `npm ci`、build、Pages deploy | 当前没有测试或凭据扫描 gate |

## 影响面速查

- 改登录/Token：前端 `useSnapshot`、后端 `requireSession`、`smoke-api.js`、权限和流程文档。
- 改快照 schema：`update-data.js`、`verify-snapshot.js`、`main.jsx`、`docs/data-model.md`、数据索引和视觉检查。
- 改国家/平台：`data/platform-sources.json`、collector config、生成器解析、筛选器、快照验证。
- 改连接器：前端模板、后端打码/写入、生成器实际 consumer、变量/权限文档。
- 改 Tunnel/Pages：同步脚本、`public/config.json`、Pages workflow、CORS、部署和当前状态页。
