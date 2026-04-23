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
  - resources.create
sidebar:
  label: "Projects and resources"
  order: 2
---

<h2 id="concept-project">Project</h2>

Project 是用户管理一组资源、环境和部署历史的边界。它不是服务器，也不是源码仓库。

<h2 id="concept-resource">Resource</h2>

Resource 是可部署的应用或服务。它拥有 source、runtime、health 和 network profile，并被一次次 deployment 使用。

<h2 id="resource-profile-purpose">资源配置的作用</h2>

资源配置描述未来部署应该如何读取源码、构建应用、启动进程、检查健康状态和暴露网络入口。它不是某一次部署的临时参数。
