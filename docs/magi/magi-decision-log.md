# MAGI Decision Log

## 状态

`REVISE` 后执行修复，当前工程验证通过，但真实平台 API 接入仍是 accepted risk。

## 决策

1. 默认刷新周期恢复为 12 小时。
2. 保留 synthetic fallback，但必须在 UI、快照和文档中显式标注数据模式。
3. 增加本机授权 CSV/JSON 导入层，作为真实数据接入的第一步。
4. 用 `rankGroups` 持久化分组 Top10，满足区域/平台/价格带榜单验收。
5. 平台覆盖采用“份额或覆盖权重”双口径，不伪造缺失市占率。
6. GitHub Pages 默认配置不提交临时 tunnel URL，外部访问时由部署者同步受控 HTTPS 入口。

## 角色投票

- Id: `REVISE`
- Ego: `REVISE`
- Superego: `REVISE`

## 已解决 P0/P1

- 默认刷新周期不符。
- synthetic 数据边界不清。
- 分组 Top10 粒度不足。
- 平台排名口径容易误导。

## 接受风险

- Amazon SP-API、Ads API、Brand Analytics 和各平台官方 API 尚未在公开仓库中启用，因为当前没有真实凭证和授权。项目已提供后端连接器配置位和本机导入路径。

## 验证

- `npm run check` 通过：lint、refresh、snapshot verify、API smoke、build。
