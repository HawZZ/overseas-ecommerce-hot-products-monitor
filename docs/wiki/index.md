---
title: 海外电商平台爆品监控 LLM Wiki
kind: index
status: current
updated: 2026-08-03
---

# LLM Wiki

本目录是当前代码、运行状态和数据边界的综合记忆。它不替代代码或实时检查；遇到动态事实时，按根目录 [`AGENTS.md`](../../AGENTS.md) 的事实优先级重新验证。

## 入口

| 页面 | 用途 | 何时读取 |
|---|---|---|
| [当前状态](current-state.md) | 当前能力、运行证据、已知偏差和近期演进 | 每个任务开始 |
| [代码索引](code-index.md) | 模块、关键符号、输入输出和修改检查点 | 定位实现 |
| [CodeGraph 索引](codegraph-index.md) | 本机图索引状态、关键调用链和查询配方 | 修改代码前 |
| [数据索引](data-index.md) | 文件分类、schema、lineage、真实/派生边界和安全查询 | 处理数据前 |
| [维护日志](log.md) | Wiki ingest、验证和重大事实变更的追加记录 | 完成任务时 |

## 可审查文档

| 页面 | 主题 |
|---|---|
| [架构](../../documentation/architecture.md) | 系统结构、信任边界、假设和风险 |
| [关键流程](../../documentation/flows.md) | 登录、数据读取、连接器保存、刷新和风险分析 |
| [权限](../../documentation/permissions.md) | 角色、资源和操作矩阵 |
| [变量与密钥](../../documentation/variables.md) | 环境变量、公开配置和轮换边界 |
| [测试地图](../../documentation/tests.md) | 现有覆盖、建议覆盖和未验证规则 |
| [定时任务](../../documentation/cron.md) | systemd timer、脚本调度和操作检查 |
| [自动化与模型](../../documentation/automation.md) | 刷新、Tunnel 同步和按需 LLM 路径 |
| [公开页面](../../documentation/seo.md) | GitHub Pages 的公开/索引边界 |

## 事实标签

- `current`：当前代码或运行证据已核对。
- `design`：目标、待接入链路或建议。
- `historical`：历史材料，不代表当前实现。
- `observed`：原始或导入数据中实际存在的字段。
- `derived`：聚合、代理、规则、评分或模型生成结果。

涉及实时快照、服务、Git HEAD、Pages 或 Tunnel 的数字必须注明核对日期，并在回答前重新查询。
