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

## 升级顺序 [#self-hosting-upgrade-order]

先备份状态，再升级 binary 或镜像，最后确认 Web console、`/docs/*`、数据库状态和 provider/plugin 状态。

## 检查更新 [#self-hosting-upgrade-check]

在 SSH 或本机 CLI 中运行：

```bash
appaloft upgrade check
```

Web console 的 Instance 页面也会显示当前版本、最新版本、目标版本和可复制的 SSH 更新命令。

## 执行更新 [#self-hosting-upgrade-apply]

标准自托管安装仍然可以重复运行安装器；它会复用 `/opt/appaloft/.env` 和现有数据卷：

```bash
curl -fsSL https://appaloft.com/install.sh | sudo sh
```

重复运行时也会把 Appaloft 管理的常驻 Traefik proxy 对齐到当前 release 审查过的默认镜像。
如果显式设置了 `APPALOFT_TRAEFIK_IMAGE`，或复用了外部 proxy，则该镜像仍由 operator
自行审查和升级。

指定版本：

```bash
appaloft upgrade apply --version 0.2.1 --confirm
```

Web console 的“立即更新”只会在宿主侧进程显式设置 `APPALOFT_INSTANCE_UPGRADE_APPLY_ENABLED=1` 时启用。默认容器部署不会让 Web 进程直接修改宿主 Docker 安装。

## 升级回退 [#self-hosting-upgrade-rollback]

回退前确认数据库迁移是否可逆，以及旧版本是否能读取当前状态。
