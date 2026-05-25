# ADR-072: Repository Config Runtime Monitoring Thresholds

Status: Accepted

Date: 2026-05-24

## Decision

Repository config may declare non-enforcing runtime monitoring thresholds for the application
Resource under `monitoring.thresholds`.

The accepted MVP shape is:

```yaml
monitoring:
  thresholds:
    enabled: true
    rules:
      - signal: cpu
        metric: containerCpuPercent
        warning: 70
        critical: 90
```

Config deploy maps this declaration to an exact Resource-scope
`runtime-monitoring.thresholds.configure` command after the Resource id is resolved. If the exact
Resource-scope threshold policy already matches the YAML declaration, config deploy no-ops. If
threshold readback is inherited from another scope, config deploy creates an exact Resource-scope
override instead of mutating the inherited parent policy.

This is a repository-config workflow/profile extension over existing
`runtime-monitoring.thresholds.configure` and `runtime-monitoring.thresholds.show`; it is not a new
business operation.

## Context

Runtime monitoring thresholds already exist as non-enforcing warning/critical observation policy.
They can be configured from CLI, HTTP/oRPC, Web, SDK metadata, and generated MCP/tool descriptors.
Applications often want reviewable default CPU, memory, disk, inode, Docker/cache, or network
warning thresholds near the deployment config.

Thresholds are not resource sizing, quota, autoscaling, cleanup, billing, restart, rollback, or
deployment admission policy. They produce readback/operator visibility only.

## Rules

- `monitoring.thresholds` is Resource-scope monitoring policy intent.
- Config deploy must reconcile it through command/query buses only:
  `runtime-monitoring.thresholds.show` then `runtime-monitoring.thresholds.configure` when needed.
- Config deploy must no-op when the exact Resource-scope threshold policy already matches YAML.
- Config deploy must not mutate inherited server, project, environment, or deployment threshold
  policies when YAML targets the selected Resource.
- Config deploy must keep `deployments.create` ids-only.
- Threshold values are numeric observation boundaries, not quotas, reservations, billing limits,
  runtime sizing hints, cleanup triggers, alert routes, or autoscaling rules.
- Repository config must not include policy ids, scope ids, provider accounts, container ids,
  sample ids, host paths, credentials, private keys, tokens, raw metric payloads, log lines, raw
  secret values, or provider-native monitoring settings under `monitoring.thresholds`.

## Consequences

The deployment config parser, generated JSON schema, CLI/Action config deploy workflow, test
matrix, public docs, and AI-facing deploy docs must be updated together.

Because this reuses existing runtime monitoring operations, `CORE_OPERATIONS.md` records the
repository config extension, but `packages/application/src/operation-catalog.ts` does not receive a
new operation key.
