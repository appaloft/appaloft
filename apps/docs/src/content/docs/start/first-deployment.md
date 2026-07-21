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

## 第一次部署路径 [#start-first-deployment-path]

最小路径是：创建项目，选择环境，注册 SSH 服务器，创建资源，发起部署，然后观察访问地址、状态、日志和诊断信息。

## 选择入口 [#start-entrypoints]

- Web console 适合交互式配置和观察状态。
- CLI 适合本地开发、服务器内运行和 GitHub Actions。
- HTTP API 适合集成系统和自动化控制面。
- AI agent 应优先安装 [Appaloft skill](/docs/agent/appaloft-skill/#appaloft-skill)，再按
  [Agent deploy skill](/docs/agent/deploy-skill/#agent-deploy-skill) 子协议安全识别来源并调用现有
  CLI/API/Web 入口。

## AI agent 部署 [#agent-deploy-skill]

Agent 部署不是新的业务操作。它把“部署这个项目”翻译成已有的项目、服务器、环境、资源和部署操作，并在完成时优先返回访问 URL、部署状态、日志、诊断摘要和恢复命令。

对于已经构建好的静态目录，agent 可以使用 `appaloft deploy ./dist --as static-site`。这类似上传一个静态输出目录，但 Appaloft 默认仍部署到用户选择的 BYOS 目标，不会隐式上传到托管云。

依赖自动 runtime detection 前，先查看当前
[零配置部署支持矩阵](/docs/deploy/sources/#zero-configuration-support)。本地单应用根目录具有最完整的
已验证覆盖；Public remote Git 的自动 framework detection 是 Unsupported，显式 container-native
或 command remote-Git profile 以及 bounded local monorepo discovery 是 Preview。通用 workload
archive 是 Unsupported；monorepo 根目录存在多个候选应用时会阻塞，直到显式选择
`baseDirectory`。

## 成功标准 [#start-success-check]

一次成功的最小部署应该能回答这些问题：

- 哪个资源被部署到了哪个服务器。
- Appaloft 使用了什么源代码、运行时和网络配置。
- 当前部署处于哪个生命周期状态。
- 用户应该访问哪个地址。
- 出错时应该复制哪份诊断摘要。

## 下一步 [#start-next-links]

- [Deployment lifecycle](/docs/deploy/lifecycle/) 解释部署阶段。
- [Register and test a server](/docs/servers/register-connect/) 解释 SSH 服务器接入。
- [Logs and health](/docs/observe/logs-health/) 解释状态、日志和恢复路径。
