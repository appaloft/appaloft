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
  - environments.clone
  - environments.lock
  - environments.unlock
  - environments.archive
sidebar:
  label: "Model"
  order: 2
---

<h2 id="concept-environment">Environment</h2>

An environment is the user boundary for deploy-time configuration, such as development, staging, or production.

<h2 id="environment-deployment-scope">Deployment scope</h2>

A resource can be deployed in different environments. Each deployment reads the target environment configuration and stores an immutable snapshot.

<h2 id="environment-lifecycle">Environment lifecycle</h2>

Environments start as active. Locking an environment keeps the environment, variables, resources, deployments, and history readable, but blocks new environment variable writes, promotion, resource creation, and deployment admission. Unlocking returns it to active.

Cloning an active environment creates a new active environment in the same project with a new name and a copy of the source environment variables. It does not copy resources, deployments, domains, certificates, or runtime state.

Archiving an environment keeps the same history readable, but it is a retired state and is not restored by unlock.

Clone, lock, unlock, and archive do not stop runtime, delete resources, clean up domains, or remove certificates. Use the explicit resource, deployment, domain, or certificate commands for those cleanup tasks.
