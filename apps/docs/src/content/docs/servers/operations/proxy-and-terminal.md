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
  - servers.bootstrap-proxy
  - terminal-sessions.open
sidebar:
  label: "Proxy and terminal"
  order: 4
---

<h2 id="server-proxy-readiness">代理准备状态</h2>

代理准备状态决定默认访问地址和路由是否能正常工作。代理修复是显式操作，不应该被隐藏在普通部署按钮后面。

<h2 id="server-terminal-session">打开终端会话</h2>

终端会话用于对服务器或资源执行受控排查，不是普通部署路径的一部分。打开前应明确目标、身份和目的。

<h2 id="server-terminal-safe-copy">安全复制输出</h2>

终端输出可能包含环境、路径或运行时细节。复制日志或诊断信息前，优先使用诊断摘要，并避免分享 secret、私钥或完整环境变量值。
