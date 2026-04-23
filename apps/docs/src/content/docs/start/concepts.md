---
title: "Concepts"
description: "Appaloft 用户会看到的核心概念，不暴露内部实现模型。"
docType: concept
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "concept"
  - "project"
  - "resource"
  - "server"
  - "deployment"
  - "概念"
  - "项目"
  - "资源"
  - "服务器"
relatedOperations:
  - projects.create
  - resources.create
  - deployments.create
sidebar:
  label: "Concepts"
  order: 2
---

<h2 id="concept-project">Project</h2>

Project 是一组资源、环境和部署历史的工作边界。用户通常先选择项目，再在项目里创建资源或查看部署。

<h2 id="concept-resource">Resource</h2>

Resource 是一个可部署单元，例如 Web 应用、后端服务、静态站点、worker 或 Compose stack。部署历史、运行时日志、健康状态和访问路径都应该回到资源视角解释。

<h2 id="concept-server">Server</h2>

Server 是 Appaloft 可以连接和操作的部署目标。它通常包含 SSH 连接信息、代理状态和运行应用所需的执行环境。

<h2 id="concept-environment">Environment</h2>

Environment 保存部署前的配置上下文。变量会在部署时形成快照，避免后续配置变化改写历史部署。

<h2 id="concept-deployment">Deployment</h2>

Deployment 是一次尝试，不是长期配置容器。Appaloft 会围绕它执行 detect、plan、execute、verify，并在需要时保留 rollback 所需线索。
