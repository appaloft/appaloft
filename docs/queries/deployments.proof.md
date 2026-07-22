# `deployments.proof`

## Intent

Return a machine-readable, read-only comparison of one Deployment attempt's planned source,
artifact, configuration, runtime target, verification steps, and effects against current sanitized
runtime, health, access, timeline, and recovery evidence.

## Input

- `deploymentId`: required.
- `resourceId`: optional context assertion used by nested/resource-scoped consumers.

## Result

`deployments.proof/v1` contains:

- `verdict`: `verified | partially-verified | unverified | stale | failed`;
- `planned`: source/artifact intent, safe profile/configuration fingerprints, runtime target,
  verification steps, and expected effects;
- `observed`: artifact, workload identity/generation/time, safe configuration fingerprint, internal
  health, public access/route observations, and recovery retention. Each managed route observation
  records behavior, expected/observed identity or redirect result, match state, and a safe reason;
- `mismatches`: stable reason code, severity, expected/observed safe summaries, evidence references,
  and existing recommended operation keys;
- `evidence`: bounded references to timeline, runtime readback, artifact identity, health, access,
  and recovery readiness;
- `unavailableEvidence`: explicit kinds and stable reason codes;
- `generatedAt` and a safe `stateVersion` for cache/recheck decisions.

The result never contains raw secret/environment values, provider credentials, tokens, unbounded
logs, or raw provider/container payloads.

## Semantics

- Query execution does not mutate Deployment, Resource, route, runtime, or recovery state.
- Missing evidence cannot produce `verified`.
- A successful health check is evidence about the observed endpoint, not proof that it is the
  planned workload.
- A managed public route is matched from the proxy-stamped deployment identity observed on the
  response. The current container's deployment label cannot satisfy route ownership by itself.
- A current redirect route is matched only by a no-follow response with the exact governed status
  and normalized destination, including path/query preservation. Destination workload identity
  cannot satisfy source redirect behavior.
- Current identity/configuration drift after a previously successful attempt returns `stale`.
- Required failed checks or critical attempted-rollout mismatch return `failed`.

## Entrypoints

- HTTP: `GET /api/deployments/{deploymentId}/proof`.
- CLI: `appaloft deployments proof <deploymentId>`.
- SDK/MCP/Web: generated/shared operation and schema.
