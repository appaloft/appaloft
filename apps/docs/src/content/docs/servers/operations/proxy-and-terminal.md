---
title: "Proxy readiness and terminal sessions"
description: "理解代理准备状态和受控终端排障。"
docType: troubleshooting
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "proxy"
  - "terminal"
  - "shell"
  - "default access"
  - "代理"
relatedOperations:
  - servers.configure-edge-proxy
  - servers.bootstrap-proxy
  - terminal-sessions.open
sidebar:
  label: "Proxy and terminal"
  order: 4
---

<h2 id="server-proxy-readiness">代理准备状态</h2>

代理准备状态决定默认访问地址和路由是否能正常工作。代理修复是显式操作，不应该被隐藏在普通部署按钮后面。

服务器的 edge proxy 类型是未来路由使用的意图：`none` 表示后续生成访问或自定义域名路由不会选择这个服务器作为代理承载目标；`traefik` 和 `caddy` 表示后续代理准备或部署确保流程可以为这个服务器实现 provider-owned 代理配置。修改这个类型不会立即启动代理、删除已有路由快照，或清理历史部署/域名/审计记录。

```bash title="修改未来代理意图"
appaloft server proxy configure srv_primary --kind traefik
```

如果从 `none` 改为 `traefik` 或 `caddy`，下一步运行显式修复或等待后续部署确保流程处理代理准备：

```bash title="显式修复代理准备状态"
appaloft server proxy repair srv_primary
```

<h2 id="server-terminal-session">打开终端会话</h2>

终端会话用于对服务器或资源执行受控排查，不是普通部署路径的一部分。打开前应明确目标、身份和目的。

CLI 默认会打印 session descriptor，方便脚本继续处理。需要把本地终端直接接入已接受的
session 时，在 `appaloft server terminal <serverId>` 或
`appaloft resource terminal <resourceId>` 后加 `--attach`。

使用 terminal session lifecycle operations 可以列出 active sessions、查看单个 session 的安全元数据、关闭一个 active session，或让旧的 active sessions 过期。这些操作只返回 session id、scope、target ids、provider key、transport path、timestamps 和 status，不暴露终端输入、终端输出、原始命令、private key、access token 或环境 secret 值。

Web Instance 页面展示同一组 active-session lifecycle 视图。它可以关闭单个 active session，
也可以让超过一小时的 session 过期；这个视图不会 attach 到 terminal transport，也不会读取终端输出。

打开和关闭终端会写入安全审计元数据，包括 session id、scope、target ids、actor、entrypoint、provider key、时间和关闭原因。审计记录不保存终端输入、终端输出、原始命令、private key、access token 或环境 secret 值。

<h2 id="server-terminal-safe-copy">安全复制输出</h2>

终端输出可能包含环境、路径或运行时细节。复制日志或诊断信息前，优先使用诊断摘要，并避免分享 secret、私钥或完整环境变量值。
