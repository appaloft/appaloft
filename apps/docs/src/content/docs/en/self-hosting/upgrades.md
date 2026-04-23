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
relatedOperations: []
sidebar:
  label: "Upgrades"
  order: 4
---

<h2 id="self-hosting-upgrade-order">Upgrade order</h2>

Back up state first, then upgrade the binary or image, then verify the Web console, `/docs/*`, database state, and provider/plugin status.

<h2 id="self-hosting-upgrade-rollback">Upgrade rollback</h2>

Before rolling back, confirm whether database migrations are reversible and whether the old version can read current state.
