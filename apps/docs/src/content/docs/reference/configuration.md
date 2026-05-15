---
title: "Configuration reference"
description: "入口、环境变量和静态资源覆盖参考。"
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "configuration"
  - "environment variable"
  - "static assets"
  - "scheduled retention"
  - "scheduler"
  - "配置"
relatedOperations: []
sidebar:
  label: "Configuration"
  order: 5
---

<h2 id="reference-runtime-configuration">运行时配置</h2>

运行时配置控制 Appaloft serve、数据库、静态资源目录和自托管行为。

<h2 id="reference-docs-static-dir">Docs 静态资源目录</h2>

`APPALOFT_DOCS_STATIC_DIR` 覆盖 public docs 静态资源，不覆盖 Web console。

<h2 id="reference-scheduled-workers">Scheduled workers</h2>

除非另有说明，scheduled worker 默认关闭。只在应拥有周期性工作的实例上启用它们。

| 变量 | 默认值 | 含义 |
| --- | --- | --- |
| `APPALOFT_SCHEDULED_TASK_RUNNER_ENABLED` | `false` | 运行到期的 Resource scheduled tasks。 |
| `APPALOFT_SCHEDULED_TASK_RUNNER_INTERVAL_SECONDS` | `60` | scheduled task 轮询间隔。 |
| `APPALOFT_SCHEDULED_TASK_RUNNER_BATCH_SIZE` | `25` | 每次 tick 最多扫描的 scheduled task attempts。 |
| `APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_ENABLED` | `false` | 运行 scheduled runtime capacity prune policies。 |
| `APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_INTERVAL_SECONDS` | `3600` | runtime capacity prune 轮询间隔。 |
| `APPALOFT_SCHEDULED_RUNTIME_PRUNE_RUNNER_BATCH_SIZE` | `25` | 每次 tick 最多扫描的 runtime prune policies。 |
| `APPALOFT_SCHEDULED_DEPENDENCY_BACKUP_RUNNER_ENABLED` | `false` | 运行 scheduled dependency backup policies。 |
| `APPALOFT_SCHEDULED_DEPENDENCY_BACKUP_RUNNER_INTERVAL_SECONDS` | `3600` | dependency backup policy 轮询间隔。 |
| `APPALOFT_SCHEDULED_DEPENDENCY_BACKUP_RUNNER_BATCH_SIZE` | `25` | 每次 tick 最多扫描的 dependency backup policies。 |
| `APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_ENABLED` | `false` | 通过已有 history prune commands 运行 retention defaults。 |
| `APPALOFT_SCHEDULED_HISTORY_RETENTION_RUNNER_INTERVAL_SECONDS` | `3600` | scheduled history retention 轮询间隔。 |
