---
title: "Configure resources"
description: "配置资源的源代码、运行时、健康检查和网络入口。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "resource profile"
  - "runtime"
  - "health check"
  - "network"
  - "资源配置"
  - "运行时"
relatedOperations:
  - resources.create
  - resources.configure-source
  - resources.configure-runtime
  - resources.configure-health
  - resources.configure-network
sidebar:
  label: "Configure resources"
  order: 4
---

<h2 id="resource-profile-purpose">资源配置的作用</h2>

资源配置描述未来部署应该如何读取源代码、构建应用、启动进程、检查健康状态和暴露网络入口。它不是某一次部署的临时参数。

<h2 id="resource-source-profile">Source</h2>

Source 告诉 Appaloft 从哪里读取应用，例如本地目录、Git 仓库或自动化运行环境提供的源码快照。

<h2 id="resource-runtime-profile">Runtime</h2>

Runtime 描述安装、构建、启动、静态输出目录、容器命名意图和运行策略。部署时 Appaloft 会把这些输入转成运行计划。

<h2 id="resource-health-profile">Health</h2>

Health 决定 verify 阶段如何判断应用是否可用。健康策略应该和用户实际访问路径保持一致。

<h2 id="resource-network-profile">Network</h2>

Network 描述应用监听端口、协议和代理目标。绑定自定义域名是单独的访问配置，不应该混进基础部署输入。
