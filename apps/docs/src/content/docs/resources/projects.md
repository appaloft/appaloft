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
  - projects.reorder
  - projects.set-description
  - projects.archive
  - projects.restore
  - projects.delete-check
  - projects.delete
  - resources.create
sidebar:
  label: "Projects and resources"
  order: 2
---

## Project [#concept-project]

Project 是用户管理一组资源、环境和部署历史的边界。它不是服务器，也不是源码仓库。

## 项目生命周期 [#project-lifecycle]

项目可以被读取、重命名、排序、设置描述、归档、恢复、执行删除预检，并在 blocker 清空后删除。归档项目会保留项目、资源和部署历史，但会阻止在该项目下创建新的环境、资源或部署。恢复项目会重新允许新的项目级创建和部署入口。

项目列表排序、项目设置里的重命名、描述、归档、恢复和删除只改变项目级元数据或生命周期。它们不会创建 deployment、不会改写历史 deployment snapshot，也不会立即停止、重启或删除正在运行的 runtime。

### 重命名项目 [#project-rename]

使用 Web、CLI 或 API 重命名项目时，Appaloft 会根据新名称重新生成项目 slug。如果新 slug 已被其他项目使用，请选择另一个名称。

### 排序项目 [#project-reorder]

项目排序只改变当前组织下活跃项目在列表中的显示顺序。排序不会移动资源、环境或部署历史，也不会影响运行中的 runtime。

### 设置项目描述 [#project-description]

项目描述只用于面向人的元数据。清空描述不会改变项目 slug、资源、环境、部署、访问路由或 runtime 状态。

### 归档项目 [#project-archive]

归档适用于不再接收新部署的项目。归档不会删除资源、环境、域名、证书、日志或历史部署；这些对象仍可用于查看和排查。需要清理资源时，请使用对应资源的生命周期操作。

### 恢复项目 [#project-restore]

恢复适用于需要重新接收新资源、环境或部署的归档项目。恢复只把项目生命周期改回 active，不会恢复已删除的子对象、重试 deployment、改变域名/证书、清理日志或触碰 runtime 状态。

### 删除项目 [#project-delete]

删除归档项目之前先执行 delete-check。只有没有保留的环境、资源、部署历史、source event、域名、证书、日志、审计或 runtime 支持记录依赖该项目时，删除才会启用。没有环境变量、也没有非 deleted 资源的空环境不会阻止删除；项目删除会先通过环境生命周期自动归档这些空环境，再通过 tombstone 把项目从普通项目列表中移除。它不会级联清理其他资源，也不会抹掉保留历史。

## Resource [#concept-resource]

Resource 是可部署的应用或服务。它拥有 source、runtime、health 和 network profile，并被一次次 deployment 使用。

## 资源配置的作用 [#resource-profile-purpose]

资源配置描述未来部署应该如何读取源码、构建应用、启动进程、检查健康状态和暴露网络入口。它不是某一次部署的临时参数。
