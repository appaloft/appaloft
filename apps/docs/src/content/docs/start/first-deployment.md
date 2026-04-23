---
title: "Start here"
description: "第一次使用 Appaloft 时，从 SSH 服务器到可访问应用的最小路径。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "quick start"
  - "getting started"
  - "首次部署"
  - "快速开始"
relatedOperations:
  - projects.create
  - servers.register
  - resources.create
  - deployments.create
sidebar:
  label: "Start here"
  order: 1
---

<h2 id="start-first-deployment-path">第一次部署路径</h2>

最小路径是：创建项目，选择环境，注册 SSH 服务器，创建资源，发起部署，然后观察访问地址、状态、日志和诊断信息。

<h2 id="start-entrypoints">选择入口</h2>

- Web console 适合交互式配置和观察状态。
- CLI 适合本地开发、服务器内运行和 GitHub Actions。
- HTTP API 适合集成系统和自动化控制面。

<h2 id="start-success-check">成功标准</h2>

一次成功的最小部署应该能回答这些问题：

- 哪个资源被部署到了哪个服务器。
- Appaloft 使用了什么源代码、运行时和网络配置。
- 当前部署处于哪个生命周期状态。
- 用户应该访问哪个地址。
- 出错时应该复制哪份诊断摘要。

<h2 id="start-next-links">下一步</h2>

- [Deployment lifecycle](/docs/deploy/lifecycle/) 解释部署阶段。
- [Register and test a server](/docs/servers/register-connect/) 解释 SSH 服务器接入。
- [Logs and health](/docs/observe/logs-health/) 解释状态、日志和恢复路径。
