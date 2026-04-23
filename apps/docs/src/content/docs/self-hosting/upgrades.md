---
title: "Upgrades"
description: "升级 Appaloft binary、Docker 镜像和 docs 静态资源。"
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "upgrade"
  - "release"
  - "backup"
  - "升级"
relatedOperations: []
sidebar:
  label: "Upgrades"
  order: 4
---

<h2 id="self-hosting-upgrade-order">升级顺序</h2>

先备份状态，再升级 binary 或镜像，最后确认 Web console、`/docs/*`、数据库状态和 provider/plugin 状态。

<h2 id="self-hosting-upgrade-rollback">升级回退</h2>

回退前确认数据库迁移是否可逆，以及旧版本是否能读取当前状态。
