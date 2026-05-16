---
title: "Secrets"
description: "安全处理 secret、日志屏蔽和诊断信息。"
docType: concept
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "secret"
  - "masking"
  - "runtime variable"
  - "密钥"
relatedOperations:
  - environments.set-variable
  - resources.set-variable
  - resources.secrets.create
  - resources.secrets.rotate
  - resources.secrets.delete
  - resources.secrets.list
  - resources.secrets.show
  - resources.import-variables
  - resources.effective-config
sidebar:
  label: "Secrets"
  order: 4
---

<h2 id="environment-secret-values">Secret 值</h2>

Secret 值用于运行时，不应该以明文出现在读模型、日志、诊断摘要、复制给支持人员的内容或 effective-config 响应中。

用户应该看到的是 secret 的存在和状态，例如 masked value、最后更新时间、来源环境和是否参与部署快照，而不是明文值。

资源级 secret 可以用 `appaloft resource secrets create` 创建，用 `update` 轮换，用 `delete`
移除，用 `list`/`show` 查看 masked 状态。这些操作只影响后续部署快照，不会热更新正在运行的实例。

粘贴 `.env` 到资源时，Appaloft 会把 secret-like key 作为运行时 secret 处理，例如
`DATABASE_URL`、`*_TOKEN`、`*_PASSWORD`、`*_PRIVATE_KEY`。导入结果、API、CLI、Web、日志和诊断都只应显示 masked value。

<h2 id="environment-secret-build-time">构建时限制</h2>

构建时变量不能标记为 secret，因为它们可能进入构建产物。

如果变量需要进入浏览器 bundle、静态文件或构建产物，它就不是 secret。不要把数据库密码、API token、private key 放进构建时变量。

构建时变量必须使用 `PUBLIC_` 或 `VITE_` 前缀；带 secret-like 名称的构建时变量会被拒绝，而不是被静默降级成普通配置。

<h2 id="environment-secret-rotation">轮换 secret</h2>

轮换 secret 后需要重新部署资源，才能让运行中实例读取新的部署快照。

推荐流程：

1. 在目标环境设置新 secret，或者用 `appaloft resource secrets rotate` 更新资源级 secret。
2. 对受影响资源创建新部署。
3. 通过健康摘要和日志确认应用读取新值。
4. 确认旧 secret 不再被使用。
5. 再从外部系统撤销旧 secret。

<h2 id="environment-secret-diagnostics">诊断与支持</h2>

复制诊断摘要时，只复制 key 名、masked 状态、错误 code 和相关部署 id。不要复制 `.env` 文件、完整环境变量表或 secret 值。

相关页面：[Diagnostics](/docs/observe/diagnostics/)。
