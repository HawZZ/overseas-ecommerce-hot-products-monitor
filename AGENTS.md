# 海外电商平台爆品监控 LLM 工作约定

本文件是项目级操作契约，也是 LLM Wiki 的 schema。进入仓库后先读本文件，再读 [`docs/wiki/index.md`](docs/wiki/index.md) 和 [`docs/wiki/current-state.md`](docs/wiki/current-state.md)。

## 1. 项目目标

维护一个前后端分离的跨境电商选品与爆品趋势工作台：

1. GitHub Pages 只发布静态前端和公开 API 地址。
2. 本机后端负责登录认证、连接器配置、真实快照、风险核验入口和按需刷新。
3. 数据按区域、国家/地区、平台、品类和价格带组织，默认关注东南亚 / 台湾。
4. 选品链路覆盖指标告警、机会池、SKU 筛选、趋势口碑、风险清单和 4P/Wiki。
5. 常规刷新不调用模型；只有显式执行 `npm run refresh:ai` 才允许使用模型生成选品 Wiki。

真实数据是硬约束。没有可靠来源时显示“待接入”，不得用模拟值、静态种子或未经标注的估算替代观测数据。

## 2. 每个任务的启动顺序

1. 运行 `git status --short --branch`，保留用户已有改动。
2. 阅读 [`docs/wiki/index.md`](docs/wiki/index.md) 和 [`docs/wiki/current-state.md`](docs/wiki/current-state.md)。
3. 按任务读取对应主题页，不先通读历史材料。
4. 仓库存在 `.codegraph/` 时，先用 CodeGraph 查符号、调用链和影响面，再用 `rg` 补充 JSON、Markdown、CSS、Shell 和运行配置。
5. 涉及当前数据、服务、HEAD、Tunnel 或 Pages 时重新查询；Wiki 中带日期的数字只是快照。

常用命令：

```bash
codegraph status .
codegraph explore "描述要理解的调用链或行为"
codegraph node <symbol-or-file> --path .
codegraph impact <symbol> --path .
codegraph affected <changed-files...> --path .
codegraph sync .
```

`.codegraph/` 是本机索引，不进入 Git。若目录不存在，不自动初始化，先向 owner 说明。

## 3. 事实源优先级

发生冲突时按以下顺序判断：

1. 当前代码、配置 schema、本机数据 schema、运行服务和刚执行的测试。
2. [`docs/wiki/`](docs/wiki/) 中标记为 `current` 的综合页面。
3. [`documentation/`](documentation/) 中的架构、权限、变量、流程和测试地图。
4. 当前 `README.md`、`docs/data-model.md` 和 `docs/deployment.md`。
5. `docs/magi/`、研究笔记、旧提交、截图和聊天记录只作为历史目标或证据。

文件存在不等于能力已接入；连接器显示 `configured` 不等于已调用外部 API；测试通过不等于线上 timer 或 Tunnel 正在运行。结论要区分：

- `implemented`：代码已实现。
- `configured`：配置存在，但未证明执行成功。
- `running`：已用当前运行证据确认。
- `observed`：已有带来源和时间的数据结果。
- `derived`：由规则、聚合或估算生成，不能表述为原始事实。

## 4. 工程约束

- 保持 GitHub Pages 前端、本机 API 后端的部署边界。
- 后端默认只绑定 `127.0.0.1`；外网入口必须是 HTTPS Tunnel 或受控反向代理。
- 认证账号密码和监控面板共用后端环境变量；不在前端增加第二套凭据。
- 新数据源必须记录来源、采集/导入时间、指标语义、授权方式和字段级 lineage。
- 价格、销量、搜索、成单率、客单价、评论、退货和风险结论缺失时保留缺失状态。
- 规则评分、代理指标、市场假设和模型输出必须显式标记为 `derived` 或 `design`。
- 跨平台 SKU 合并必须优先使用稳定商品标识或人工映射；标题相等只能作为低置信候选。
- 不扩大无关重构；修复真实调用链，并同步受影响 Wiki 页面。

## 5. LLM Wiki 维护

Wiki 使用三层模型：

- 原始源：代码、Git 历史、配置、运行状态、本机数据、现有文档和外部来源。
- Wiki：`docs/wiki/*.md`，综合当前事实并提供导航。
- Schema：本 `AGENTS.md`，规定事实状态、工作流和安全边界。

每个 Wiki 主题页使用 YAML frontmatter，至少包含 `title`、`kind`、`status`、`updated`：

- `current`：已用当前代码或运行证据核对。
- `design`：目标或建议，尚未实现。
- `historical`：历史基线，不代表当前行为。

接收新代码、数据或运行证据时：

1. 确认来源、时间和可信层级。
2. 提炼事实，不复制凭据、整份日志或大段原始数据。
3. 更新受影响主题页、交叉链接和 `docs/wiki/index.md` 摘要。
4. 在 `docs/wiki/log.md` 追加记录，不改写已有日志条目。

架构、数据 schema、认证、调度或发布方式变化后检查失效链接、页面矛盾、无日期动态数字和疑似凭据。

## 6. 数据与凭据

- `data/platform-sources.json` 和 `data/connectors.example.json` 是可公开配置。
- `data/latest-snapshot.json`、`data/connectors.json`、`data/vendor-exports/`、`data/audit.log` 和动态选品 Wiki 是本机运行数据，不提交 Git。
- 不在命令输出、Wiki、回复或测试 artifact 中打印完整 `connectors.json`、`.env`、Authorization、Cookie、Token、密码或 API key。
- 检查连接器时只读取 `id`、`type`、`enabled` 和字段名；检查审计日志时只聚合事件和时间，不输出 IP、用户名或 User-Agent。
- 发现凭据时不要复述。先从当前工作树移除或脱敏并报告路径；历史重写、force push、吊销和轮换需要 owner 明确授权。
- 模型密钥只由后端进程读取。任何 `VITE_*` 值都视为公开信息。

数据索引入口是 [`docs/wiki/data-index.md`](docs/wiki/data-index.md)。当前代码仍包含若干种子估算和代理指标，修改数据语义前必须先读该页。

## 7. 测试与发布

按改动范围选择验证：

```bash
npm run lint
npm run verify:snapshot
npm run smoke:api
npm run build
```

前端交互或布局变化再运行 `npm run check:visual`；它需要从环境读取测试账号密码。不要把凭据写进命令、截图名或报告。

GitHub 主仓库是 `https://github.com/HawZZ/overseas-ecommerce-hot-products-monitor`，默认分支 `main`。只有用户明确要求时才 commit、push 或发布。同步前运行：

```bash
git status --short --branch
git diff --check
codegraph sync .
```

Pages 地址和 Tunnel 都属于动态运行配置。变更 Tunnel 后使用 `scripts/sync-pages-tunnel-url.sh`，并验证 Pages 的 `config.json` 和目标 `/health`；quick tunnel 不属于长期 API 契约。

## 8. 完成标准

任务完成时说明：

- 改了什么，实际行为是否变化。
- 执行了哪些测试、数据检查和运行检查。
- 哪些结论只是代码存在或设计状态，哪些已在当前环境验证。
- 是否更新 Wiki、`log.md` 和 CodeGraph。
- 是否涉及 GitHub commit、push 或 Pages 发布；未获明确要求时保持未推送。
