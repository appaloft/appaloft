# ADR-073: Repository Config Health Policy Reconcile

Status: Accepted

Date: 2026-05-24

## Context

`appaloft.yaml` already accepts HTTP health policy fields through `health` and
`runtime.healthCheck`. First-run config deploy stores those fields on the created Resource profile,
but reuse of an existing Resource only applied source, runtime, and network profile drift through
explicit workflow steps. As a result, an operator could acknowledge config profile drift and still
deploy with a stale Resource health policy.

ADR-012 and ADR-020 already place reusable health policy on the Resource side of the model.
ADR-014 keeps `deployments.create` ids-only. The missing behavior is therefore a repository-config
workflow/profile extension over the existing `resources.configure-health` command, not a new
business operation.

## Decision

Repository config deploy must reconcile declared health policy for an existing Resource before
deployment admission when the entry workflow is explicitly applying Resource profile changes.

The config workflow must:

- normalize `health`, `runtime.healthCheck`, and `runtime.healthCheckPath` into the Resource HTTP
  health policy model;
- compare the normalized policy with the selected Resource readback;
- dispatch `resources.configure-health` only when the Resource policy differs;
- keep default config deploy fail-first for unacknowledged existing-resource profile drift;
- keep the final `deployments.create` command ids-only.

The workflow must not use health config to restart runtime, run health probes, mark health status,
change route state, or mutate historical deployment snapshots.

## Consequences

Config deploy now has a closed Resource profile loop for source, runtime, network, generated
access, monitoring thresholds, and health policy. `resources.configure-health` remains the
source-of-truth health mutation; repository config only sequences it as an entry workflow step.

Public docs and AI-facing deploy guidance must describe `health` as reusable Resource
configuration, not a deployment command field. Tests must cover configuration, idempotency, and
ids-only deployment admission.

## Migration Gaps

Command-style health checks remain outside repository config until command health policy sandboxing
has a governing ADR/spec. Environment and preview overlays remain future repository-config work and
must not be implied by this decision.
