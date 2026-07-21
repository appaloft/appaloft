---
title: "Upgrades"
description: "Upgrade the Appaloft binary, Docker image, and docs static assets."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "upgrade"
  - "release"
  - "backup"
relatedOperations:
  - system.instance-upgrade.check
  - system.instance-upgrade.apply
sidebar:
  label: "Upgrades"
  order: 4
---

## Upgrade order [#self-hosting-upgrade-order]

Back up state first, then upgrade the binary or image, then verify the Web console, `/docs/*`, database state, and provider/plugin status.

## Check for updates [#self-hosting-upgrade-check]

Run this from SSH or a local CLI:

```bash
appaloft upgrade check
```

The Web console Instance page also shows the current version, latest version, target version, and a copyable SSH update command.

## Apply an update [#self-hosting-upgrade-apply]

The standard self-hosted installation can still be updated by rerunning the installer. It reuses `/opt/appaloft/.env` and the existing data volumes:

```bash
curl -fsSL https://appaloft.com/install.sh | sudo sh
```

To target a specific version:

```bash
appaloft upgrade apply --version 0.2.1 --confirm
```

The Web console “Update now” button is enabled only when a host-side process explicitly sets `APPALOFT_INSTANCE_UPGRADE_APPLY_ENABLED=1`. Default container deployments do not let the Web process mutate the host Docker installation directly.

## Upgrade rollback [#self-hosting-upgrade-rollback]

Before rolling back, confirm whether database migrations are reversible and whether the old version can read current state.
