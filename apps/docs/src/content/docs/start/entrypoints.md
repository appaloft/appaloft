---
title: "选择入口"
description: "在 Web console、CLI、HTTP API 和 MCP 工具之间选择合适入口。"
docType: concept
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "entrypoint"
  - "cli"
  - "api"
  - "web console"
  - "入口"
relatedOperations: []
sidebar:
  label: "Choose an entrypoint"
  order: 2
---

<h2 id="entrypoint-web-console">Web console</h2>

适合第一次配置、查看状态、理解输入含义和跟随 `?` 帮助链接完成任务。

<h2 id="entrypoint-cli">CLI</h2>

适合本地开发、SSH 服务器 bootstrap、CI 脚本和需要交互式确认的操作。

GitHub Action 的默认 BYOS 形态也是 CLI 表面：Pure SSH Action 使用
`control-plane-mode: none`，在 Action 中安装/运行 CLI，通过 SSH 部署，并把状态保存在目标服务器的
`ssh-pglite` 中。

<h2 id="entrypoint-http-api">HTTP API</h2>

适合自动化系统。API 描述应链接到同一 public docs anchor，不能重新定义一套输入语义。

Self-hosted Server Action 使用 HTTP API 表面：`control-plane-url` 显式选择 Appaloft instance，
`appaloft-token` 提供 deploy-token 认证。Action 不运行 CLI、不 SSH，也不会扫描目标机发现控制面。

<h2 id="entrypoint-mcp-tools">MCP tools</h2>

当 agent host 配置 Appaloft MCP 时，使用 `appaloft mcp stdio` 暴露同一 operation catalog。
MCP tools 应复用相同 topic id、输入解释和恢复说明；查看
[Appaloft MCP server](/docs/agent/mcp-server/#appaloft-mcp-server)。
