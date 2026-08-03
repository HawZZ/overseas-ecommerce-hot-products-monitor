---
title: LLM Wiki 维护日志
kind: changelog
status: current
updated: 2026-08-03
---

# LLM Wiki 维护日志

本页只追加，不改写历史条目。记录 Wiki ingest、事实核对和结构变化；代码提交历史仍以 Git 为准。

## 2026-08-03

- 建立根级 `AGENTS.md`、`docs/wiki/` 和 `documentation/` 文档体系。
- 接入 Shopee 台湾商品名生成器：保持 Pages 前端和本机 API 边界，标题不自动发布、生成不纳入定时刷新。
- 以 HEAD `d2d3345`、CodeGraph、当前本机快照、systemd 服务/timer、Pages 配置和健康检查作为首次基线。
- CodeGraph 同步后覆盖 16 个文件、353 个符号和 856 条关系；数据库保留在本机并加入忽略规则。
- 记录真实/派生数据边界、台湾数据空缺、SKU 合并限制、连接器占位、风险证据链未接入和刷新周期不一致。
