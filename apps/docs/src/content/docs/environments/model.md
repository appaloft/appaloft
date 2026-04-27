---
title: "Environment model"
description: "理解环境如何隔离配置并参与部署快照。"
docType: concept
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "environment"
  - "stage"
  - "production"
  - "环境"
relatedOperations:
  - environments.create
  - environments.rename
  - environments.clone
  - environments.lock
  - environments.unlock
  - environments.archive
sidebar:
  label: "Model"
  order: 2
---

<h2 id="concept-environment">Environment</h2>

Environment 是一组部署时配置的用户边界，例如 development、staging 或 production。

<h2 id="environment-deployment-scope">部署作用域</h2>

资源可以在不同环境下部署。每次部署读取目标环境的配置并保存不可变快照。

<h2 id="environment-lifecycle">环境生命周期</h2>

环境默认是 active。锁定环境会保留环境、变量、资源、部署和历史记录，并阻止新的环境变量写入、环境提升、新资源创建和新部署准入；解锁后环境回到 active。

重命名 active 环境只改变环境名称，不会改变环境 ID、变量、资源、部署、域名、证书或运行时状态。锁定或归档环境不能重命名。

克隆 active 环境会在同一项目中创建一个新的 active 环境，使用新的名称并复制源环境变量。它不会复制资源、部署、域名、证书或运行时状态。

归档环境同样保留环境、变量、资源、部署和历史记录，但它是退役状态，不会通过解锁恢复。

克隆、锁定、解锁和归档都不会停止运行时、删除资源、清理域名或移除证书。需要清理时，应使用对应资源、部署、域名或证书命令。
