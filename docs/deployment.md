# 安全部署说明

## 架构

```mermaid
flowchart LR
  A["GitHub Pages 静态前端"] -->|"读取 config.json"| B["Cloudflare HTTPS tunnel URL"]
  B --> C["127.0.0.1:8787 本机 API"]
  C --> D["本机 data/latest-snapshot.json"]
  C --> E["平台 API / 第三方数据商 / 合规采集器"]
  C --> F["可选模型分析，仅 refresh:ai 调用"]
```

前端部署到 GitHub Pages，后端绑定 `127.0.0.1` 并通过 HTTPS tunnel 转发。这样平台密钥、OpenAI 密钥、账号密码和会话签名密钥都只留在本机后端环境变量中，不会进入公开页面或 GitHub 仓库。

## 本机后端

1. 复制环境变量：

```bash
cp .env.example .env
```

2. 修改 `.env`：

```bash
API_HOST=127.0.0.1
API_PORT=8787
DASHBOARD_USERNAME=你的登录账号
DASHBOARD_PASSWORD=换成强密码
SESSION_SECRET=换成另一段长随机字符串
REFRESH_CADENCE_HOURS=6
CORS_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,https://YOUR_GITHUB_USERNAME.github.io
```

3. 初始化数据并启动：

```bash
npm run refresh
npm run server
```

4. 按环境变量频率更新，默认每 6 小时：

```bash
npm run scheduler
```

也可以使用系统级定时任务：

```bash
0 */6 * * * cd /home/ec2-user/overseas-ecommerce-hot-products-monitor && /usr/bin/npm run refresh >> data/refresh.log 2>&1
```

## GitHub Pages 前端与 tunnel

1. 创建 GitHub 仓库并推送代码。
2. 在仓库 Settings -> Pages 中选择 GitHub Actions。
3. `.github/workflows/pages.yml` 会在 `main` 分支 push 后构建 `dist/` 并发布。
4. 后端 tunnel URL 写在 `public/config.json`。这个 URL 不是密钥，Pages 会把它发布为 `/config.json`。
5. tunnel URL 变化后运行：

```bash
scripts/sync-pages-tunnel-url.sh
```

脚本会从 `overseas-ecommerce-monitor-tunnel.service` 日志中读取当前 `trycloudflare.com` URL，校验 `/health`，更新 `public/config.json`，提交并推送。
6. 打开 Pages URL，使用监控面板账号密码登录。

## 安全要点

- 后端绑定 `127.0.0.1`，不监听 `0.0.0.0`，公网访问只通过 HTTPS tunnel 转发。
- 前端只保存 API 地址到本机浏览器 `localStorage`，登录会话只保存在当前标签页的 `sessionStorage`。
- `CORS_ORIGINS` 只允许你的 GitHub Pages 域名和本地开发域名。
- `public/config.json` 只包含后端 tunnel URL，不包含账号、密码、API key 或平台 token。
- `.env`、平台密钥、OpenAI 密钥、Token、账号密码和真实快照不提交到仓库。
- 如果不使用 Cloudflare quick tunnel，也可以换成 Tailscale Funnel、WireGuard 或 SSH tunnel，不要直接暴露端口。

## 模型调用策略

默认刷新命令不会调用模型：

```bash
npm run refresh
```

只有你需要重写选品 wiki 时才运行：

```bash
npm run refresh:ai
```

这会读取 `.env` 中的 `OPENAI_API_KEY` 和 `OPENAI_MODEL`。脚本会把看板快照压缩成结构化输入，要求模型只基于给定数据输出 wiki，避免在常规刷新时产生不必要成本。

## 工作流产物

登录后的工作台包含：

- 指标和告警：North Star、输入指标、健康指标、业务指标和响应时间。
- 区域/品类机会池：TAM、SAM、SOM、JTBD、增长率、竞品强度和推荐动作。
- SKU筛选：按价格带、区域、品类和阶段筛选，展示毛利、口碑、搜索增速和90天趋势。
- 4P工作台：每个SKU给出 Product、Price、Place、Promotion 动作。
- 选品wiki和90天GTM：把验证通过的爆品逻辑沉淀为复用规则。
