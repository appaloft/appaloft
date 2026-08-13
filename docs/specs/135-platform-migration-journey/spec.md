# Platform Migration Journey

## Status

- Round: Spec.
- Artifact state: owner-accepted recommendation on 2026-08-13.
- Code changes allowed: after the public Ticket is `ready-for-agent`.
- Compatibility: additive pre-1.0 public command, contract and Web surface.
- Governing decision: ADR-113.

## Business Outcome

A developer migrates a representative application from Railway or an equivalent platform into
Appaloft through one reviewable task flow while all resulting lifecycle state remains owned by the
existing public operations.

## Ubiquitous Language

| Term | Meaning |
| --- | --- |
| Migration bundle | Versioned, secret-safe source/config snapshot plus optional external artifact references. |
| Migration plan | Deterministic ordered list of existing operation messages, blockers and warnings bound to a digest. |
| Migration receipt | Safe result for one dispatched existing operation, including created/reused identity and cleanup ownership. |
| Migration verification | Bounded readback proving configured shape, deployment, access, recovery and residual state. |
| Source adapter | Anticorruption boundary translating a vendor export into the migration bundle language. |

Migration is a task/presentation term, not an aggregate or alternate Project/Environment/Resource lifecycle.

## Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| MIG-BUNDLE-001 | Strict bundle parsing | a v1 bundle is supplied | it is parsed | unknown versions/fields and secret-looking plaintext fail safely; canonical output is deterministic. |
| MIG-SOURCE-002 | Railway translation | a Railway config/export or read-only local collector result exists | source adapter runs | services, source/runtime, variables, domains, dependencies and volumes map to neutral bundle fields with explicit unsupported blockers. |
| MIG-PLAN-003 | No-effect plan | a valid bundle and target context exist | `migrate plan` runs | existing operation messages, dependencies, warnings, blockers, cleanup ownership and digest are returned without mutation. |
| MIG-APPLY-004 | Exact accepted apply | a blocker-free plan digest is confirmed | `migrate apply` runs | messages dispatch through CommandBus in dependency order; receipts identify created/reused state and retry idempotently. |
| MIG-READ-005 | Shared status/readback | an apply is partial or complete | status is requested | receipts plus existing list/show/effective-config/deployment/domain/data queries produce bounded redacted state. |
| MIG-FAIL-006 | Partial failure | one operation fails | apply stops | later dependent effects do not run; safe error, completed receipts and exact resume/cleanup actions are returned. |
| MIG-VERIFY-007 | Outcome verification | deployment/data/domain work has run | verify runs | existing health, proof, logs, domain readiness, backup/restore and effective-config evidence is evaluated without inferring success from command acceptance. |
| MIG-CLEAN-008 | Exact cleanup | an accepted plan owns temporary or newly created resources | cleanup is confirmed | only receipt-owned resources are removed in reverse dependency order; reused/user-owned state is preserved. |
| MIG-SURFACE-009 | Surface parity | local or remote profile is used | CLI, JSON, HTTP/oRPC/SDK or Web runs the task | all use the same plan/apply/status/verify/cleanup contract and operation truth. |
| MIG-WEB-010 | Fresh web migration | exported web config and repository exist | full journey runs | source, variables, domain/TLS, deploy, logs/health/proof, rollback and cleanup are evidenced. |
| MIG-COMPOSE-011 | Multi-service migration | a Compose/service graph exists | full journey runs | service graph, private networking, per-service variables, deploy/observe/recover and cleanup are evidenced. |
| MIG-STATEFUL-012 | Stateful migration | database, volume and custom domain requirements exist | full journey runs | dependency/volume creation or import, backup, independent restore, TLS, deploy, rollback and exit evidence are verified. |
| MIG-AUTH-013 | Authorization and secrets | tenant roles and secret inputs vary | plan/apply/read run | viewer writes and unsupported entitlement fail before effects; no secret/provider credential appears in bundle, receipt, logs or errors. |
| MIG-COMPAT-014 | Existing operation compatibility | expert users exist | migration ships | no existing command/input/output changes and removing the coordinator leaves all business state usable. |

## Public Surfaces

- CLI: `appaloft migrate plan|apply|status|verify|cleanup`, including `--from railway`, `--input`,
  `--plan`, `--confirm`, `--json` and local read-only collector options.
- HTTP/oRPC/SDK: one task contract over the same coordinator; plan is a Query, apply/cleanup are
  Commands, status/verify are Queries.
- Web: import/plan review, blockers, progress receipts, verification and cleanup affordances.
- Config/repository: migration bundle is input only; canonical Appaloft config remains the durable
  repository contract.
- Public docs: `/docs/migrate/platform/#platform-migration`.

## Non-Goals

- Mirroring Railway billing, teams, usage history or internal identifiers.
- A private Cloud migration lifecycle, automatic DNS mutation, live destructive restore, or raw
  database copying outside existing provider/backup operations.
- Kubernetes runtime support; that is Spec 136.

## Compatibility And Rollback

This is additive before 1.0. Removing the task surfaces does not delete or migrate any resulting
Project, Environment, Resource, Deployment, DomainBinding, DependencyResource or StorageVolume.
