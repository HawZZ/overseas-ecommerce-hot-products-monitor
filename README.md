# 海外电商平台爆品监控

一个前后端分离的跨境电商爆品监控项目：

- 前端：Vite + React 静态看板，可发布到 GitHub Pages。
- 后端：本机 Node API，只监听 `127.0.0.1`，用监控面板账号密码登录保护。
- 数据：按区域、平台、价格带生成可替换的数据快照，保留 90 天趋势，并输出 PM 组合工作流结果。快照只保存在本机 `data/`，不发布到 GitHub Pages。
- 工作流：`metrics-dashboard` 定义指标和告警，`market-segments` + `market-sizing` 做机会池，`competitor-analysis` + `pricing-strategy` 做 SKU 筛选，`cohort-analysis` + `sentiment-analysis` 验证趋势和口碑，`product-strategy` + `gtm-strategy` 沉淀选品 wiki。
- 4P：每个重点 SKU 都落到 Product、Price、Place、Promotion 的执行动作。
- 更新：`npm run refresh` 可手动刷新，`npm run scheduler` 默认每 6 小时刷新一次，可用 `REFRESH_CADENCE_HOURS` 调整。
- 模型调用：默认不调用模型。只有运行 `npm run refresh:ai` 且设置 `OPENAI_API_KEY` 与 `OPENAI_MODEL` 时，才会用模型生成 wiki 分析。

## 快速开始

```bash
cd /home/ec2-user/overseas-ecommerce-hot-products-monitor
npm install
cp .env.example .env
npm run refresh
npm run server
```

另开一个终端启动前端：

```bash
npm run dev
```

打开 `http://127.0.0.1:5173`。在页面右上角填入：

- API 地址：`http://127.0.0.1:8787`
- 账号：`.env` 里的 `DASHBOARD_USERNAME`
- 密码：`.env` 里的 `DASHBOARD_PASSWORD`

## GitHub Pages

前端是纯静态产物，后端不部署到 GitHub Pages。发布步骤见 [部署说明](./docs/deployment.md)。

## 数据边界

当前仓库内置平台覆盖种子与公开来源说明。真实生产数据需要接入平台 API、第三方数据商或合规采集器。不要在 GitHub Pages、前端代码或公开仓库提交平台密钥、OpenAI 密钥、后端 Token、账号密码或真实快照。
