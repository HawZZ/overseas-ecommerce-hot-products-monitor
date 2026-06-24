# MAGI Issue Register

| ID | Level | Issue | Raised By | Status | Resolution |
|---|---|---|---|---|---|
| M-001 | P1 | 默认刷新频率是 6 小时，不符合用户目标 12 小时。 | Id/Ego/Superego | Resolved | 默认值、文档、快照、测试均改为 12 小时。 |
| M-002 | P1 | 核心数据是 synthetic-seed，容易被误解为真实生产监控。 | Id/Superego | Resolved | 增加 `dataQuality`、`dataLineage`、UI 数据可信度条和文档边界说明。 |
| M-003 | P1 | “分组 top10”只覆盖全局价格带，不覆盖区域/平台/价格带组合。 | Id/Ego | Resolved | 新增 `rankGroups`，覆盖价格带、区域、区域+平台、区域+平台+价格带、品类榜单。 |
| M-004 | P1 | Amazon 数据源仅声明，缺少真实接入路径。 | Ego/Superego | Accepted | 当前无凭证，不能生产接入；已加入连接器状态和本机导入层，明确 Amazon SP-API 不在公开仓库启用。 |
| M-005 | P1 | Top5 平台证据不是所有区域同口径 GMV 市占率。 | Superego | Resolved | 文档和 UI 改为“监控覆盖优先级”，只有可比来源时显示份额，否则显示覆盖权重。 |
| M-006 | P2 | quick tunnel 地址公开且不稳定。 | Superego | Resolved | `public/config.json` 默认回到本机地址，部署文档说明 quick tunnel 仅适合临时演示。 |
| M-007 | P2 | 登录安全缺少审计日志和刷新并发控制。 | Superego | Resolved | 后端增加登录/刷新审计日志、弱配置警告、刷新并发锁。 |
| M-008 | P2 | 缺少自动验收测试。 | Id/Ego | Resolved | 新增 snapshot schema 验证和 API smoke 测试，`npm run check` 覆盖 lint、refresh、verify、smoke、build。 |
