# ADR-071: Repository Config Generated Access Profile

Status: Accepted

Date: 2026-05-24

## Decision

Repository config may declare a user-facing generated access preference for one application
Resource under `access.generated`.

The accepted MVP shape is:

```yaml
access:
  generated:
    enabled: true
    pathPrefix: /
```

`enabled: true` maps to `ResourceAccessProfile.generatedAccessMode = "inherit"`, meaning the
Resource remains eligible for generated default access when the selected default access policy,
network profile, deployment target, and edge proxy allow it. `enabled: false` maps to
`generatedAccessMode = "disabled"` for that Resource. `pathPrefix` maps to the generated access
route path prefix and defaults to `/`.

This is a repository-config workflow/profile extension over existing
`resources.configure-access`; it is not a new business operation.

## Context

`resources.configure-access` already owns the durable Resource access profile for generated default
access preference and generated route path prefix. Repository config already supports
`access.domains[]` for server-applied custom domain intent, but it cannot yet declare whether a
Resource should opt out of generated default access or use a generated route path prefix.

Generated default access is user-facing application reachability configuration. It is different
from custom domain bindings, certificate lifecycle, server-applied config domains, and default
access provider policy.

## Rules

- `access.generated` is provider-neutral Resource profile intent.
- Config deploy must reconcile it through `resources.configure-access` before
  `deployments.create`.
- Config deploy must no-op when the existing Resource access profile already matches the YAML
  declaration.
- Config deploy must keep `deployments.create` ids-only.
- Config deploy must not create domain bindings, issue certificates, mutate default access policy,
  apply proxy routes directly, or rewrite historical deployment snapshots.
- Repository config must not include provider account, DNS provider identity, certificate provider
  identity, route ids, certificate ids, server ids, destination ids, credentials, private keys,
  tokens, raw certificate material, or raw secret values under `access.generated`.
- `access.domains[]` remains server-applied domain intent for SSH/PGlite mode and is governed by
  ADR-024. `access.generated` is Resource access profile intent and may coexist with
  `access.domains[]`.

## Consequences

The deployment config parser, generated JSON schema, CLI/Action config deploy workflow, test
matrix, public docs, and AI-facing deploy docs must be updated together.

Because this reuses the existing `resources.configure-access` operation, `CORE_OPERATIONS.md` and
`packages/application/src/operation-catalog.ts` do not receive a new operation key. They must only
record that repository config generated access is a workflow/profile extension over the existing
operation.
