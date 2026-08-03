---
title: 工程化记忆与当前状态
kind: current-state
status: current
updated: 2026-08-03
---

# 工程化记忆与当前状态

## 基线

| 项目 | 2026-08-03 核对结果 |
|---|---|
| 仓库 | `HawZZ/overseas-ecommerce-hot-products-monitor`，分支 `main` |
| 扫描基线 | `d2d3345bee7e51762cce6a60be464dd09d2dff39` |
| 前端 | React 19.2.7 + Vite，GitHub Pages 静态发布；React 当前由依赖树间接解析 |
| 后端 | Express，本机 `127.0.0.1:8787`，HMAC 会话和服务 Token |
| 外网入口 | Cloudflare quick tunnel；地址由 `public/config.json` 动态下发 |
| 数据持久化 | 本机 JSON/CSV/Markdown 文件，没有数据库 |
| 模型 | 快照刷新不调用模型；标题生成仅在用户明确点击时读取本机 ai-crypto provider，Wiki 仍由 `npm run refresh:ai` 独立触发 |

## 已实现

- 登录后读取快照、连接器、动态选品 Wiki；所有 `/api/*` 数据路由要求 Bearer 会话或服务 Token。
- 页面拆分为爆品趋势、区域品类、4P 工作台、风险/API；东南亚默认国家/地区为台湾。
- 机会池按区域、国家/地区、品类生成寻源入口；SKU 清单在前端按“标题 + 品类 + 价格带”做二级跨平台聚合。
- 本机导入支持 CSV/JSON；快照输出 90 天数组、榜单、机会池、告警、4P、策略和 GTM 结构。
- 风险接口会校验 1688 URL 并返回材料清单；没有权威证据源时不返回通过/不通过结论。
- systemd 管理 API、Tunnel、快照刷新和 Pages Tunnel 地址同步。

## 当前运行证据

以下为 2026-08-03 UTC 的一次性检查，不应当作永久状态：

| 检查 | 结果 |
|---|---|
| API 服务 | `overseas-ecommerce-monitor.service` enabled、active/running |
| Tunnel 服务 | `overseas-ecommerce-monitor-tunnel.service` enabled、active/running |
| 本机健康检查 | `/health` 返回 `ok: true`，报告 cadence 12 小时 |
| Pages 配置 | 已读取当前 quick tunnel 地址，目标 `/health` 返回 200 |
| 快照刷新 timer | enabled、active；实际 `OnUnitActiveSec=6h` |
| Pages 同步 timer | enabled、active；实际 `OnUnitActiveSec=5min` |
| 当前快照 | 2026-08-03T03:00:22.627Z，`live-local-import` |
| 导入 | 1 个被启用的 CSV-folder 连接器、1 个读取文件、1188 行 |

## 当前数据覆盖

- 区域配置覆盖东南亚、北美、西欧、非洲，每个区域 5 个平台；Amazon 另列为全球数据源。
- 当前真实导入 SKU 只覆盖东南亚的泰国、新加坡、马来西亚和菲律宾。
- 默认筛选的台湾当前为 0 个商品；越南、印尼以及其他三个大区也没有当前 SKU 数据。
- 当前快照包含 24 个机会池、199 个榜单分组、40 个 shortlist 项和 14 条告警。机会池和告警包含规则派生字段，不等于全部拥有真实观测证据。

详见 [数据索引](data-index.md)。

## 当前不一致与高影响限制

1. **刷新周期不一致**：systemd 实际每 6 小时运行 `npm run refresh`；环境和快照报告 12 小时；独立 `scripts/scheduler.js` 未传环境变量时默认 24 小时。
2. **派生指标仍混入商品视图**：全成本、毛利、竞品强度、缺失评论情绪、cohort 留存代理和机会分会使用确定性种子估算。它们不是原始观测数据，当前字段级标记不够完整。
3. **搜索量是代理信号**：Google Trends 返回相对指数，采集器将平均指数乘 1000 写为 `search90d`；这不是绝对搜索次数。
4. **时间语义不完整**：平台搜索结果的 `sold` 可能是累计销量；单次采集被写入一个日期，其余 89 天填 0，不能直接视为完整 90 天日销量。
5. **SKU 合并置信度有限**：跨平台聚合仅在前端按完全一致的标题、品类和价格带合并，没有 GTIN/UPC/EAN、品牌型号或人工映射。
6. **连接器多数是 UI 占位**：快照生成器目前只消费启用的 `csv-folder`；Shopee、Lazada、Amazon 和风险连接器配置不会自动调用对应官方 API。
7. **风险分析尚无证据查询**：接口只检测“风险类连接器已启用”和 URL 格式，不会查询专利、商标、海关、文化政策、退货或争议数据源。
8. **CI 覆盖有限**：Pages workflow 只安装、构建和部署，没有运行 lint、API smoke、快照验证、视觉检查或凭据扫描。
9. **审计日志无轮换**：本机日志包含 IP、用户名、Origin 和 User-Agent；虽已忽略，但没有保留期限或轮换策略。
10. **React 是隐式依赖**：代码直接 import `react`/`react-dom`，但 `package.json` 未直接声明；当前依赖树解析为 19.2.7，未来安装可能随上游 peer 依赖变化。

## 近期演进

- 2026-06-24：建立前后端分离看板、登录与 Pages/Tunnel 对接。
- 2026-06-25：增加跨平台 SKU 聚合、寻源参考、运行时 API 地址恢复。
- 2026-07-08：加入 Google Trends、Shopee、Lazada 采集与标准化管道。
- 2026-07-10：拆分四个子页面、增加国家/地区和风险/API 页面，并默认关闭 synthetic 数据。
- 2026-08-03：恢复服务器后更新 quick tunnel，并建立项目级 LLM Wiki。

## 下一任务优先读

- 改前端： [代码索引](code-index.md) 的“前端”。
- 改数据或指标： [数据索引](data-index.md) 的“真实与派生边界”。
- 改认证/部署： [架构](../../documentation/architecture.md)、[权限](../../documentation/permissions.md) 和 [变量](../../documentation/variables.md)。
- 改调度： [定时任务](../../documentation/cron.md)。
