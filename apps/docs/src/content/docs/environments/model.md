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
sidebar:
  label: "Model"
  order: 2
---

<h2 id="concept-environment">Environment</h2>

Environment 是一组部署时配置的用户边界，例如 development、staging 或 production。

<h2 id="environment-deployment-scope">部署作用域</h2>

资源可以在不同环境下部署。每次部署读取目标环境的配置并保存不可变快照。
