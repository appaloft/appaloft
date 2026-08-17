# ADR-121: Source Event Required Check Gate

## Status

Accepted

## Context

ADR-037 dispatches a matching verified push synchronously after durable source-event persistence.
Operators need an optional gate that binds deployment to named completed CI checks on the exact
revision without moving provider policy into `deployments.create`, webhook transports or Cloud-only
code.

GitHub exposes signed `check_run.completed` webhook facts and documents `success`, `neutral` and
`skipped` as successful required-check conclusions. Dynamically mirroring branch protection would
require additional provider API availability/permission and would make provider configuration the
hidden owner of Resource deployment policy.

## Decision

Resource auto-deploy policy owns an optional provider-neutral set of explicit required check names.
The first adapter is GitHub `check_run.completed`; no branch-protection read occurs.

Source-event application state owns the gate:

- a matching push snapshots required names per Resource policy result;
- verified completed-check facts update only the same safe repository identity and revision;
- `success`, `neutral` and `skipped` satisfy a name;
- failure-like conclusions block but a newer completed rerun may replace them;
- provider completion time plus check-run id prevents out-of-order regression;
- a newer matching push supersedes older undispatched work for the same Resource/ref;
- an atomic persistence claim permits exactly one transition to deployment dispatch;
- policy matches without required names retain immediate dispatch.

The GitHub adapter verifies HMAC and normalizes only repository identity, revision, check name,
conclusion, check-run id, completion time, delivery id and optional installation identity. Raw
payloads, annotations, output, URLs, signatures and tokens do not cross the application port.

No timer, timeout, polling or automatic background retry is added. Waiting remains operator-visible;
failed dispatch remains recoverable only through the existing explicit safe replay boundary.

## Ownership

| Concern | Owner |
| --- | --- |
| Required check names | Resource auto-deploy policy |
| Signature and payload normalization | GitHub integration adapter |
| Pass/block/rerun/supersession semantics | Source-event application workflow |
| Delivery dedupe and exact-once dispatch claim | Source-event persistence port/adapter |
| Deployment creation | Existing `deployments.create` dispatcher |
| Diagnostics | Existing source-event read model and Web/CLI/API surfaces |

## Consequences

- Public core/application contracts stay provider-neutral while GitHub is the first adapter.
- Source-event status and policy-result vocabularies gain waiting, check-blocked and superseded
  states plus bounded safe check evidence.
- Resource JSON policy and source-event persistence receive backward-compatible migrations.
- Repository config, CLI, HTTP/oRPC, Web and generated metadata must ship together.
- GitHub App installations need Checks read permission and the `check_run` webhook subscription.
- Commit status API, branch-protection mirroring, other providers and timeout workers require later
  specs.

## Governed Sources

- [GitHub Check-Gated Auto Deploy](../specs/141-github-check-gated-auto-deploy/spec.md)
- [Source Binding And Auto Deploy](../specs/042-source-binding-auto-deploy/spec.md)
- [Source Binding Auto Deploy Test Matrix](../testing/source-binding-auto-deploy-test-matrix.md)
- [GitHub Check-Gated Auto Deploy Test Matrix](../testing/github-check-gated-auto-deploy-test-matrix.md)
- [ADR-037](./ADR-037-source-event-auto-deploy-ownership.md)
- [ADR-069](./ADR-069-repository-config-auto-deploy-policy.md)
