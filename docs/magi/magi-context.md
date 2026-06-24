# MAGI Context

## 用户目标

构建“海外电商平台爆品监控”工作台：GitHub Pages 前端、本机后端、账号密码登录、区域平台覆盖、价格带爆品 Top10、90 天趋势、选品 wiki、12 小时默认刷新，并用 PM skills 形成 4P 执行工作流。

## 当前约束

- 前端必须可部署到 GitHub Pages。
- 后端和敏感信息只在本机，前端通过 API URL 访问。
- GitHub 仓库不得提交密钥、真实快照、平台 token、账号密码或本机导出文件。
- 没有真实平台凭证时，不能把合成数据伪装成生产数据。

## 已知事实

- 项目使用 Vite + React 前端和本机 Express 后端。
- 当前仓库有平台覆盖种子、90 天趋势生成、登录认证和 GitHub Pages workflow。
- 公开平台 Top5 不是所有区域都有同口径市占率，需区分市占率和覆盖权重。

## 当前假设

- 用户接受在没有平台密钥的情况下，先落地本机授权导入和 synthetic fallback。
- 生产数据应来自 Amazon SP-API/Ads/Brand Analytics、卖家后台导出、数据商或合规采集器。
