# Environments

## Model

`Environment` is a first-class domain object, not a UI form.

Current implementation note:
- the aggregate uses an `EnvironmentConfigSet` value object to enforce variable rules and snapshot materialization
- `EnvironmentProfile` remains a compatibility export name for older imports, but new code should use `Environment`

Supported kinds:

- `local`
- `development`
- `test`
- `staging`
- `production`
- `preview`
- `custom`

## Scope Hierarchy

Precedence:

```text
defaults < system < organization < project < environment < deployment snapshot
```

The current code models scope and snapshot precedence directly in the domain.

## Variable Types

- plain config
- secret
- provider-specific config
- deployment-strategy config

Exposure:

- build-time
- runtime

## Build-Time vs Runtime

Current minimum policy:

- build-time variables must use `PUBLIC_` or `VITE_`
- build-time variables cannot be marked secret
- runtime secrets are masked in read models and logs

This prevents accidental frontend secret leakage in Milestone 1.

## Inheritance And Override

- environment variables are stored with explicit scope metadata
- snapshots merge inherited values first, then apply later scopes
- each deployment writes an immutable snapshot into the deployment record

## Snapshot And Rollback

- every deployment stores `environmentSnapshot`
- rollback uses the snapshot attached to the original deployment
- later environment edits do not mutate historical releases

## Environment Operations

Current CLI:

- `appaloft env list`
- `appaloft env create`
- `appaloft env show <id>`
- `appaloft env set <id> <key> <value>`
- `appaloft env unset <id> <key>`
- `appaloft env diff <source> <target>`
- `appaloft env promote <source> <target-name>`

Current HTTP API:

- `GET /api/environments`
- `POST /api/environments`
- `GET /api/environments/:id`
- `POST /api/environments/:id/variables`
- `DELETE /api/environments/:id/variables/:key`
- `POST /api/environments/:id/promote`
- `GET /api/environments/:id/diff/:otherId`

## Hosted vs Self-Hosted

- the domain model is shared
- hosted may add organization/tenant policy and external secret managers sooner
- self-hosted keeps the same snapshot and masking rules with local config
