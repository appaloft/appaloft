---
title: "Environment model"
description: "Understand how environments isolate configuration and participate in deployment snapshots."
docType: concept
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "environment"
  - "stage"
  - "production"
relatedOperations:
  - environments.create
sidebar:
  label: "Model"
  order: 2
---

<h2 id="concept-environment">Environment</h2>

An environment is the user boundary for deploy-time configuration, such as development, staging, or production.

<h2 id="environment-deployment-scope">Deployment scope</h2>

A resource can be deployed in different environments. Each deployment reads the target environment configuration and stores an immutable snapshot.
