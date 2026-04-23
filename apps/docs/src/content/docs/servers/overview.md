---
title: "Servers and credentials"
description: "注册部署目标服务器，配置 SSH 凭据，并理解代理准备状态。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "server"
  - "ssh"
  - "credential"
  - "deployment target"
  - "服务器"
  - "凭据"
relatedOperations:
  - servers.register
  - servers.configure-credential
  - credentials.create-ssh
  - servers.test-connectivity
  - terminal-sessions.open
sidebar:
  label: "Servers and credentials"
  order: 5
---

<h2 id="server-deployment-target">服务器是什么</h2>

服务器是 Appaloft 可以连接、检查和部署应用的目标。用户看到的是 SSH 地址、凭据、连接状态和代理准备状态。

<h2 id="server-ssh-credential-path">SSH 凭据</h2>

SSH 凭据可以是一次性输入，也可以保存为可复用凭据。文档和 UI 不应该显示明文 secret，诊断信息也必须屏蔽敏感值。

<h2 id="server-connectivity-test">连接测试</h2>

连接测试用于确认 Appaloft 能到达服务器，并能读取必要的运行环境信息。测试失败不等于部署失败，但会阻止依赖该服务器的新部署。

<h2 id="server-proxy-readiness">代理准备状态</h2>

代理准备状态决定默认访问地址和路由是否能正常工作。代理修复是显式操作，不应该被隐藏在普通部署按钮后面。

<h2 id="server-terminal-session">打开终端会话</h2>

终端会话用于对服务器或资源执行受控排查，不是普通部署路径的一部分。打开前应明确目标、身份和目的；UI、CLI 和 API 描述都应该提示用户只输入当前任务需要的命令。

终端输出可能包含环境、路径或运行时细节。复制日志或诊断信息前，应优先使用诊断摘要，并避免分享 secret、私钥或完整环境变量值。
