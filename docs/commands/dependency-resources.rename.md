# dependency-resources.rename Command Spec

## Intent

Rename one active dependency resource without changing bindings, backup metadata, provider state,
runtime state, or deployment snapshots.

## Input

- `dependencyResourceId`
- `name`

## Success

Returns `ok({ id })`, updates name/slug, and records a `dependency-resource-renamed` event.

## Failure

- `validation_error`, phase `dependency-resource-validation`
- `not_found`
- `conflict`, phase `dependency-resource-validation`

## Non-Goals

No generic update bag and no mutation of connection, binding, provider, runtime, backup, or snapshot
state.
