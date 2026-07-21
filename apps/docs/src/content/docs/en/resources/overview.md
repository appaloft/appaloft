---
title: "Configure resources"
description: "Configure resource source, runtime, health, and network settings."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "resource profile"
  - "runtime"
  - "health check"
  - "network"
relatedOperations:
  - resources.create
  - resources.configure-source
  - resources.configure-runtime
  - resources.configure-health
  - resources.configure-network
sidebar:
  label: "Configure resources"
  order: 4
---

## Purpose [#resource-profile-purpose]

Resource settings describe how future deployments should read source, build the app, start it, check health, and expose network access.

## Source [#resource-source-profile]

Source tells Appaloft where application code comes from, such as a local directory, Git repository, or automation-provided source snapshot.

## Runtime [#resource-runtime-profile]

Runtime describes install, build, start, static output, naming intent, and execution strategy.

## Health [#resource-health-profile]

Health tells the verify stage how to decide whether the app is usable.

## Network [#resource-network-profile]

Network describes the app's listening endpoint and proxy target. Custom domain binding is separate access configuration.
