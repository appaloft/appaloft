# ADR-074: Repository Config Preview Profile Overlays

Status: Accepted

Date: 2026-05-24

## Context

`appaloft.yaml` can already declare source, runtime, network, health, access, dependency, storage,
scheduled task, auto-deploy, generated access, monitoring, env, and secret-reference intent. PR
preview deployments often need a small profile difference from production, such as a preview
runtime name, start command, non-secret environment value, generated access mode, or health path.

Before this decision the safe answer was either a separate `appaloft.preview.yml` file or trusted
Action flags. That works, but it makes the repository config graph harder to review as one
application graph. The missing capability is a selected overlay over the same existing config
workflow, not a new deployment operation.

Preview selection is identity-sensitive. A committed config file must not create or select a
preview environment, resource, server, destination, credential, organization, tenant, or provider
account. Trusted entrypoint context such as GitHub pull request metadata or an already resolved
preview source link selects the preview scope first.

## Decision

Repository config may declare `preview.pullRequest.profile` as a safe profile overlay. The overlay
is applied only when the entrypoint has already selected PR preview mode from trusted request
context.

The preview profile overlay may override or add reviewable profile declarations that already map to
existing operations, including runtime, network, health, generated access, monitoring thresholds,
non-secret env values, and allowed secret references. It must remain strict, provider-neutral, and
free of identity or raw secret material.

The config workflow must:

- parse and validate `preview.pullRequest.profile` with the same no-identity and no-secret safety
  rules as root repository config;
- ignore the overlay for ordinary deploys and non-PR-preview entrypoints;
- merge the overlay after root config parsing and before prompt seed/runtime/env normalization;
- let explicit trusted CLI/Action flags override the merged profile;
- continue reconciling through existing Resource, environment, dependency, storage, scheduled task,
  access, monitoring, and health operations;
- keep final `deployments.create` ids-only.

The overlay must not reinterpret root production `access.domains[]` as preview domains. Preview
hostnames remain trusted entrypoint values such as `preview.pullRequest.domainTemplate`, explicit
Action inputs, generated access, or a separate explicitly selected preview config.

## Consequences

A single root `appaloft.yaml` can now carry common production defaults plus PR-preview-specific
runtime/env/profile differences without granting the file authority to select preview identity.

This is a workflow/profile extension over existing operations. No new operation catalog key is
introduced. Public docs and AI-facing deploy guidance must describe preview profile overlays as
selected overlays, not as deployment command fields or identity selectors.

## Migration Gaps

General `environments.<name>` overlays remain deferred until the entrypoint selection and
environment-name matching rules are specified. Resource sizing, replicas, rollout, restart policy,
autoscaling, quotas, alert routing, cleanup policy, provider-native handles, and credentials remain
outside repository config unless a later ADR/spec admits them.
