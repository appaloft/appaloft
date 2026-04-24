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

<h2 id="server-terminal-safe-copy">安全复制输出</h2>

终端输出可能包含环境、路径或运行时细节。复制日志或诊断信息前，优先使用诊断摘要，并避免分享 secret、私钥或完整环境变量值。
