---
title: CodeGraph 索引
kind: codegraph-index
status: current
updated: 2026-08-03
---

# CodeGraph 索引

## 本机索引状态

2026-08-03 执行 `codegraph sync .` 后：

| 项目 | 数值 |
|---|---:|
| 索引文件 | 16 |
| 符号节点 | 353 |
| 关系边 | 856 |
| 数据库大小 | 约 1.16 MB |
| 主要语言 | JavaScript 14、JSX 1、YAML 1 |

索引数据库位于 `.codegraph/codegraph.db`，只保存在本机并由根 `.gitignore` 排除。状态数字是动态快照；修改代码后重新执行 `codegraph sync .`。

## 覆盖与盲区

CodeGraph 当前覆盖 JavaScript、JSX、Vite 配置和 Pages workflow，适合查询符号、调用者、被调用者和影响面。

它没有索引 Markdown、JSON、CSS、Shell、本机 systemd unit 和运行时数据。以下内容用 `rg`、结构化解析器或运行命令补充：

- `data/platform-sources.json`、连接器 schema 和快照 schema。
- `src/styles.css` 的 class 和响应式规则。
- `scripts/sync-pages-tunnel-url.sh` 的 Git/健康检查副作用。
- `documentation/`、`docs/wiki/` 和旧文档之间的事实冲突。
- systemd 服务/timer、Pages `config.json`、Tunnel 和当前健康状态。

## 关键调用链

```text
浏览器
  App
    -> useSnapshot
      -> loadRuntimeConfig
      -> requestApi
        -> /api/login | /api/snapshot | /api/connectors | /api/risk/analyze | /api/refresh

后端
  POST /api/connectors
    -> writeConnectors
    -> runRefresh
      -> spawn scripts/update-data.js
        -> generateSnapshot
          -> loadVendorExports
          -> buildImportedProducts
          -> buildOpportunityPools / buildRankGroups / metrics / alerts
        -> maybeCreateAiWiki

定时数据
  systemd refresh timer
    -> npm run refresh

可选全采集
  scripts/scheduler.js or npm run collect
    -> collectors/index.js
      -> Google Trends -> Shopee -> Lazada -> normalizeAll
    -> vendor-exports
    -> update-data.js (需 csv-folder connector 指向对应目录)
```

动态 `spawn`、HTTP route 与浏览器 fetch 之间的边可能不会由静态图自动连接；查询时把两端符号同时写进 `explore` 问题。

## 查询配方

任务开始：

```bash
codegraph status .
codegraph explore "当前任务涉及的行为、文件、符号和调用链"
```

读取文件或符号的当前源码与上下游：

```bash
codegraph node useSnapshot --path .
codegraph node server/index.js --path .
codegraph node generateSnapshot --path .
```

修改前看影响面：

```bash
codegraph impact requireSession --path .
codegraph impact buildImportedProducts --path .
codegraph affected src/main.jsx server/index.js --path .
```

典型问题：

```bash
codegraph explore "登录会话如何从 LoginShell 流到受保护 API，所有拒绝路径是什么"
codegraph explore "connector 保存后如何触发刷新，哪些 connector type 真正被消费"
codegraph explore "观测字段如何变成 90 天趋势、评分、榜单和前端图表"
codegraph explore "同一个 SKU 如何跨平台合并，哪些字段决定 identity"
```

## 维护规则

1. 修改索引覆盖的代码后运行 `codegraph sync .`。
2. 大规模移动、解析异常或状态显示陈旧时运行 `codegraph index .` 全量重建。
3. 在 `codegraph explore` 后只读取未覆盖的 JSON/CSS/Shell/文档；避免重复扫描整文件。
4. 索引状态不证明测试通过，也不证明运行服务使用当前 HEAD。
5. 不提交 `.codegraph/` 数据库、锁、socket、日志或 daemon 状态。
