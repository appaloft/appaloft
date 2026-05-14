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
relatedOperations:
  - system.instance-upgrade.check
  - system.instance-upgrade.apply
sidebar:
  label: "Upgrades"
  order: 4
---

<h2 id="self-hosting-upgrade-order">升级顺序</h2>

先备份状态，再升级 binary 或镜像，最后确认 Web console、`/docs/*`、数据库状态和 provider/plugin 状态。

<h2 id="self-hosting-upgrade-check">检查更新</h2>

在 SSH 或本机 CLI 中运行：

```bash
appaloft upgrade check
```

Web console 的 Instance 页面也会显示当前版本、最新版本、目标版本和可复制的 SSH 更新命令。

<h2 id="self-hosting-upgrade-apply">执行更新</h2>

标准自托管安装仍然可以重复运行安装器；它会复用 `/opt/appaloft/.env` 和现有数据卷：

```bash
curl -fsSL https://appaloft.com/install.sh | sudo sh
```

指定版本：

```bash
appaloft upgrade apply --version 0.2.1 --confirm
```

Web console 的“立即更新”只会在宿主侧进程显式设置 `APPALOFT_INSTANCE_UPGRADE_APPLY_ENABLED=1` 时启用。默认容器部署不会让 Web 进程直接修改宿主 Docker 安装。

<h2 id="self-hosting-upgrade-rollback">升级回退</h2>

回退前确认数据库迁移是否可逆，以及旧版本是否能读取当前状态。
