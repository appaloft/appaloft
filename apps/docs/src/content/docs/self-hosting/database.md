---
title: "Database"
description: "理解本地优先和自托管数据库状态。"
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "database"
  - "pglite"
  - "postgres"
  - "数据库"
relatedOperations: []
sidebar:
  label: "Database"
  order: 3
---

<h2 id="self-hosting-database-state">数据库状态</h2>

Appaloft 可以使用本地优先状态或自托管数据库。用户需要理解状态归属、备份和迁移窗口。

<h2 id="self-hosting-database-backup">备份</h2>

备份应覆盖控制面状态、部署历史和必要的配置快照，不应导出明文 secret。
