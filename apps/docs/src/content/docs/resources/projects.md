---
title: "Projects and resources"
description: "理解项目、资源和环境如何组织部署对象。"
docType: concept
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "project"
  - "resource"
  - "app"
  - "项目"
  - "资源"
relatedOperations:
  - projects.create
  - projects.show
  - projects.rename
  - projects.archive
  - resources.create
sidebar:
  label: "Projects and resources"
  order: 2
---

<h2 id="concept-project">Project</h2>

Project 是用户管理一组资源、环境和部署历史的边界。它不是服务器，也不是源码仓库。

<h2 id="project-lifecycle">项目生命周期</h2>

项目可以被读取、重命名或归档。归档项目会保留项目、资源和部署历史，但会阻止在该项目下创建新的环境、资源或部署。

项目设置里的重命名和归档只改变项目级生命周期。它们不会创建 deployment、不会改写历史 deployment snapshot，也不会立即停止、重启或删除正在运行的 runtime。

<h3 id="project-rename">重命名项目</h3>

使用 Web、CLI 或 API 重命名项目时，Appaloft 会根据新名称重新生成项目 slug。如果新 slug 已被其他项目使用，请选择另一个名称。

<h3 id="project-archive">归档项目</h3>

归档适用于不再接收新部署的项目。归档不会删除资源、环境、域名、证书、日志或历史部署；这些对象仍可用于查看和排查。需要清理资源时，请使用对应资源的生命周期操作。

<h2 id="concept-resource">Resource</h2>

Resource 是可部署的应用或服务。它拥有 source、runtime、health 和 network profile，并被一次次 deployment 使用。

<h2 id="resource-profile-purpose">资源配置的作用</h2>

资源配置描述未来部署应该如何读取源码、构建应用、启动进程、检查健康状态和暴露网络入口。它不是某一次部署的临时参数。
