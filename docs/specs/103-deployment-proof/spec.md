# Deployment Proof

## Status

- Round: Post-Implementation Sync
- Artifact state: implemented and verified; awaiting public PR review
- Roadmap target: post-`1.0.0-rc` deployment correctness hardening
- Compatibility impact: backward-compatible minor public capability

## Business Outcome

Operators and automation can determine whether the source revision, artifact, configuration, and
runtime effects accepted for one deployment attempt are represented by the workload currently
serving that Resource. A successful command or a healthy endpoint is evidence, but neither is a
deployment proof by itself.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Deployment Proof | A read-only, derived comparison between one immutable Deployment plan and current sanitized runtime, health, access, timeline, and recovery evidence. | Release orchestration | proof |
| Proof verdict | `verified`, `partially-verified`, `unverified`, `stale`, or `failed`. | Deployment observation | verification result |
| Planned effect | A safe statement of what the accepted plan expected to change: artifact rebuild, workload replacement/restart, route-only application, health-policy change, or no runtime change. | Release orchestration | change effect |
| Runtime evidence | Sanitized adapter readback for artifact and workload identity, generation, start time, and configuration fingerprint. | Runtime target boundary | runtime readback |
| Evidence reference | A bounded reference to an existing fact such as a timeline entry, runtime readback, health/access observation, or recovery-readiness result. | Deployment observation | evidence |
| Mismatch | A stable reason-coded difference between planned and observed facts with severity and an existing recommended operation. | Deployment proof | drift |

## Verdict Rules

- `verified`: every required planned effect has current evidence; artifact/workload/configuration
  identity matches; required health and access checks pass; route evidence points to that workload.
- `partially-verified`: at least one required fact is verified, but adapter or observation evidence
  is unavailable. Missing evidence never upgrades to `verified`.
- `unverified`: the attempt has insufficient current evidence to compare, or has not reached a
  terminal successful state.
- `stale`: the proof was once comparable but current runtime or route evidence points to a newer or
  externally changed workload/configuration generation.
- `failed`: the attempt failed, a required health/access check failed, or current evidence proves a
  critical planned-versus-observed mismatch for the attempted rollout.

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DEP-PROOF-001 | Verified replacement | A successful plan requires a new artifact and workload generation | Current adapter, health, access, timeline, and recovery evidence match | One `deployments.proof/v1` result is `verified` and references the matching evidence. |
| DEP-PROOF-002 | Health cannot substitute for identity | Runtime execution returned success and `/health` is 200, but workload identity/configuration generation did not change | Proof is read | Verdict is `failed` or `partially-verified`, never `verified`, with stable mismatch reasons. |
| DEP-PROOF-003 | Missing artifact identity | Adapter cannot resolve an artifact digest/id | Other observations pass | Verdict is at most `partially-verified`; unavailable evidence is explicit. |
| DEP-PROOF-004 | Missing runtime readback | Target adapter cannot inspect the current workload | Proof is read | Verdict is `unverified` or `partially-verified` and does not invent identity/generation. |
| DEP-PROOF-005 | Stale after external change | A successful deployment's current workload is later replaced outside Appaloft | Proof is read again | Verdict is `stale` with current runtime evidence and a redeploy/force-redeploy recommendation. |
| DEP-PROOF-006 | Safe fingerprints | Planned or observed configuration contains secrets | Proof is serialized through every entrypoint | Only deterministic fingerprints and redacted summaries appear; raw values never appear. |
| DEP-PROOF-007 | Recovery candidate | A previous compatible successful runtime is retained or unavailable | Proof is read | Recovery evidence reports retained/unavailable truth and references recovery readiness. |
| DEP-PROOF-008 | Static target | A static artifact target is realized as the accepted runtime/publisher target | Proof is read | Artifact and serving generation are verified where supported; unsupported readback is explicit. |
| DEP-PROOF-009 | Health failure | Required internal health evidence fails | Proof is read | Verdict is `failed` even if artifact/workload identity matches. |
| DEP-PROOF-010 | Route mismatch | Public access is healthy but the current route does not target the observed workload | Proof is read | Verdict is `failed` or `stale` with `access_route_workload_mismatch`. |
| DEP-PROOF-011 | Scope and not found | Deployment is absent, outside tenant/project scope, or resource context mismatches | API/CLI/SDK/MCP reads proof | Existing not-found/forbidden/context error policy applies without leaking cross-scope facts. |
| DEP-PROOF-012 | Published-language parity | A consumer reads API, CLI JSON, SDK, MCP, or Web | The same deployment is requested | Every surface consumes the same `deployments.proof/v1` schema and operation. |

## Domain Ownership

- Bounded context: Release orchestration / deployment observation.
- Aggregate/resource owner: no new aggregate. `Deployment` owns immutable planned attempt facts;
  Deployment Proof is an application-owned read result.
- Upstream contexts: Workload Delivery owns Resource health/access read models; runtime target
  adapters own provider translation; recovery readiness owns rollback candidate decisions.
- Relationship: published language from Release orchestration with adapter anticorruption at the
  runtime evidence port.

## Public Surfaces

- Query/application: `DeploymentProofQuery` and one shared `DeploymentProof` DTO.
- API: `GET /api/deployments/{deploymentId}/proof`.
- CLI: `appaloft deployments proof <deploymentId>` including `--json` output.
- SDK: generated `appaloft.deployments.proof` operation.
- MCP/tool: generated descriptor and handler dispatch from the operation catalog.
- Web: Deployment Detail Proof section; not a single badge.
- Docs/help: deployment proof concept/task anchor and operation reference.
- Events/config: not applicable; proof is derived and read-only.

## Required Evidence And Redaction

Planned facts include source revision, artifact intent/reference, safe Resource profile and
configuration fingerprints, runtime target, expected verification steps, and planned effects.
Observed facts include resolved artifact identity when supported, workload identity/generation,
start/update time, safe configuration fingerprint/generation, internal health, public access,
route-to-workload comparison, and previous runtime/rollback candidate retention.

Evidence references existing timeline cursors/entries, runtime readback, artifact identity,
health/access observations, and recovery readiness. It must never include raw secrets, raw
environment values, provider credentials/tokens, unsafe container inspect payloads, or unlimited
logs.

## Non-Goals

- A deployment mutation, hidden update, automatic retry, or billing event.
- Signed proofs, long-term proof retention, attestation transparency logs, or Enterprise policy.
- A complete general-purpose Change Effect planner.
- Claiming stateful data rollback or proving provider internals that an adapter cannot observe.

## Closed Decisions

- Use a separate `deployments.proof` query because `deployments.show` remains immutable attempt
  detail while proof requires current adapter/read-model observations.
- Compute proof on read from bounded evidence; do not persist a second mutable truth record.
- Runtime-native identities remain sanitized adapter evidence, not Deployment aggregate invariants
  or command inputs.
- No new domain event is introduced: proof is a query result, not a fact emitted by deployment.

## Open Questions

- Signed/retained proofs and Enterprise policy require a later private/public boundary decision.
- Provider-native static/serverless publishers may add evidence adapters after their stable runtime
  identity contract is accepted.
