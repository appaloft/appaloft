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
  - environments.plan-duplicate
  - environments.duplicate-profile
  - environments.lock
  - environments.unlock
  - environments.archive
sidebar:
  label: "Model"
  order: 2
---

## Environment [#concept-environment]

Environment 是一组部署时配置的用户边界，例如 development、staging 或 production。

## 部署作用域 [#environment-deployment-scope]

资源可以在不同环境下部署。每次部署读取目标环境的配置并保存不可变快照。

## 环境生命周期 [#environment-lifecycle]

环境默认是 active。锁定环境会保留环境、变量、资源、部署和历史记录，并阻止新的环境变量写入、环境提升、新资源创建和新部署准入；解锁后环境回到 active。

重命名 active 环境只改变环境名称，不会改变环境 ID、变量、资源、部署、域名、证书或运行时状态。锁定或归档环境不能重命名。

克隆 active 环境会在同一项目中创建一个新的 active 环境，使用新的名称并复制源环境变量。它不会复制资源、部署、域名、证书或运行时状态。

## 复制环境 [#environment-copy]

复制环境用于创建 staging、测试、preview 或一次性演示环境。它比“克隆环境”更完整：默认复制服务和资源配置形状，在新环境中重新部署，并把数据面保持隔离。

Console 中的 **复制环境** 默认使用安全策略：

- 服务：复制并重新部署。
- 网络：新建隔离网络。
- 依赖：新建托管依赖。
- Secret：重新生成目标环境引用，不复制或展示来源 secret 明文。
- 数据库数据：创建空数据库，之后再 seed、迁移或恢复。
- 域名：生成新路由，不复制生产自定义域名。
- 存储：创建空卷。

只有需要迁移数据或复用来源时才展开高级策略：

- **复用来源依赖**：目标环境继续使用来源环境同一个数据库或依赖资源。它可能让环境之间共用数据，必须显式确认，并会保留共享来源提醒。
- **从备份恢复数据库**：填写备份 id，用备份内容初始化目标数据库。
- **绑定自定义域名**：填写目标 hostname，而不是使用自动生成路由。
- **从备份恢复存储**：用备份 id 恢复卷数据。
- **导入存储 artifact**：用 artifact 引用导入卷数据。

CLI 中等价的安全默认命令是：

```bash
appaloft env copy local staging \
  --dependencies create-new \
  --secrets regenerate \
  --data empty \
  --domains generated \
  --storage empty \
  --network isolated
```

常用变体：

```bash
appaloft env copy local staging --dry-run --json
appaloft env copy local staging --yes
appaloft env copy production staging --database restore:backup_123
appaloft env copy production staging --domain rebind:staging.example.com
appaloft env copy production staging --storage import:artifact_ref
appaloft env copy production staging --reuse-source db --acknowledge-shared-source
```

归档环境同样保留环境、变量、资源、部署和历史记录，但它是退役状态，不会通过解锁恢复。

克隆、锁定、解锁和归档都不会停止运行时、删除资源、清理域名或移除证书。需要清理时，应使用对应资源、部署、域名或证书命令。
