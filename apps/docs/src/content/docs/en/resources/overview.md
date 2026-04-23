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

<h2 id="resource-profile-purpose">Purpose</h2>

Resource settings describe how future deployments should read source, build the app, start it, check health, and expose network access.

<h2 id="resource-source-profile">Source</h2>

Source tells Appaloft where application code comes from, such as a local directory, Git repository, or automation-provided source snapshot.

<h2 id="resource-runtime-profile">Runtime</h2>

Runtime describes install, build, start, static output, naming intent, and execution strategy.

<h2 id="resource-health-profile">Health</h2>

Health tells the verify stage how to decide whether the app is usable.

<h2 id="resource-network-profile">Network</h2>

Network describes the app's listening endpoint and proxy target. Custom domain binding is separate access configuration.
