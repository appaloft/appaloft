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

<h2 id="concept-environment">Environment</h2>

An environment is the user boundary for deploy-time configuration, such as development, staging, or production.

<h2 id="environment-deployment-scope">Deployment scope</h2>

A resource can be deployed in different environments. Each deployment reads the target environment configuration and stores an immutable snapshot.

<h2 id="environment-lifecycle">Environment lifecycle</h2>

Environments start as active. Locking an environment keeps the environment, variables, resources, deployments, and history readable, but blocks new environment variable writes, promotion, resource creation, and deployment admission. Unlocking returns it to active.

Renaming an active environment changes only the environment name. It does not change the environment id, variables, resources, deployments, domains, certificates, or runtime state. Locked and archived environments cannot be renamed.

Cloning an active environment creates a new active environment in the same project with a new name and a copy of the source environment variables. It does not copy resources, deployments, domains, certificates, or runtime state.

<h2 id="environment-copy">Copy environment</h2>

Copy environment is for staging, test, preview, or one-off demo environments. It is broader than cloning an environment: by default it copies service and resource shape, redeploys in the target environment, and keeps the data plane isolated.

The Console **Copy environment** action uses safe defaults:

- Services: copy and redeploy.
- Network: create an isolated network.
- Dependencies: create new managed dependencies.
- Secrets: regenerate target references; never copy or reveal source secret values.
- Database data: start with an empty database, then seed, migrate, or restore later.
- Domains: generate a route; do not copy production custom domains.
- Storage: create empty volumes.

Open advanced policies only when the copy needs data migration or a shared source:

- **Reuse source dependencies** keeps the target environment on the same database or dependency resource as the source. It can mix data between environments, requires explicit acknowledgement, and leaves a shared-source warning visible.
- **Restore database from backup** uses a backup id to initialize the target database.
- **Bind a custom domain** uses an explicit target hostname instead of a generated route.
- **Restore storage from backup** restores volume data from a backup id.
- **Import storage artifact** imports volume data from an artifact reference.

The equivalent safe CLI default is:

```bash
appaloft env copy local staging \
  --dependencies create-new \
  --secrets regenerate \
  --data empty \
  --domains generated \
  --storage empty \
  --network isolated
```

Common variants:

```bash
appaloft env copy local staging --dry-run --json
appaloft env copy local staging --yes
appaloft env copy production staging --database restore:backup_123
appaloft env copy production staging --domain rebind:staging.example.com
appaloft env copy production staging --storage import:artifact_ref
appaloft env copy production staging --reuse-source db --acknowledge-shared-source
```

Archiving an environment keeps the same history readable, but it is a retired state and is not restored by unlock.

Clone, lock, unlock, and archive do not stop runtime, delete resources, clean up domains, or remove certificates. Use the explicit resource, deployment, domain, or certificate commands for those cleanup tasks.
