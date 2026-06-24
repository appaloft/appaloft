# Operation Audit Pipeline

## Status

- Round: Code Round / Post-Implementation Sync
- Artifact state: implemented

## Business Outcome

Appaloft records retained audit rows for important mutating lifecycle operations through a neutral
operation audit pipeline. Self-hosted/community deployments can read the retained audit surface
directly. Hosted or licensed distributions may add entitlement admission and retention policy at
composition time without changing public core behavior.

## Ubiquitous Language

| Term | Meaning | Context |
| --- | --- | --- |
| Operation audit | A retained audit row derived from an application command result or lifecycle fact. | Operator audit history |
| Operation audit sink | Neutral application port that projects command context and result into retained audit rows. | Application composition |
| Lifecycle audit projector | Neutral event consumer that projects selected domain lifecycle facts into retained audit rows. | Application composition |
| Primary target | The main project/resource/deployment/server/domain/dependency/static artifact affected by the command. | Audit read model |
| Related target | Additional aggregate or resource ids that explain the operation context. | Audit read model |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- |
| AUDIT-LIFECYCLE-PROJECT-001 | Project lifecycle audit | a project create/archive/restore/rename/delete command succeeds or fails | the command returns through `CommandBus` | Appaloft records an operation audit row with actor, organization, operation key, result, primary project target, request id, and safe metadata. |
| AUDIT-LIFECYCLE-RESOURCE-002 | Resource lifecycle audit | a resource create/configure/archive/restore/delete/runtime/dependency-binding command returns | the command returns through `CommandBus` | Appaloft records a resource-scoped operation audit row and related project/environment/server/dependency ids when present. |
| AUDIT-LIFECYCLE-DEPLOYMENT-003 | Deployment lifecycle audit | deployment create/retry/redeploy/rollback/cancel/archive commands return | the command returns through `CommandBus` | Appaloft records deployment audit rows with related project/resource/server context when present. |
| AUDIT-LIFECYCLE-DEPLOYMENT-003A | Deployment lifecycle fact audit | deployment requested/started/succeeded/failed facts are emitted after the deployment state transition | the domain event bus dispatches the lifecycle event | Appaloft records deployment audit rows with result, deployment id, and related project/resource/server context without raw deployment payloads. |
| AUDIT-LIFECYCLE-DEPENDENCY-004 | Dependency resource lifecycle audit | dependency provision/import/rename/delete/backup/restore/policy commands return | the command returns through `CommandBus` | Appaloft records dependency-resource audit rows without provider secrets or raw credentials. |
| AUDIT-LIFECYCLE-DEPENDENCY-004A | Dependency resource lifecycle fact audit | dependency resource realization/backup/restore facts are emitted | the domain event bus dispatches the lifecycle event | Appaloft records dependency-resource audit rows with success/failure and provider-safe related target ids. |
| AUDIT-LIFECYCLE-DOMAIN-005 | Domain binding lifecycle audit | domain binding create/confirm/configure/delete/retry commands return | the command returns through `CommandBus` | Appaloft records domain-binding audit rows with safe related target metadata. |
| AUDIT-LIFECYCLE-DOMAIN-005A | Domain binding lifecycle fact audit | domain binding requested/bound/ready/failed/deleted facts are emitted | the domain event bus dispatches the lifecycle event | Appaloft records domain-binding audit rows with domain binding id and related resource/deployment context when present. |
| AUDIT-LIFECYCLE-SERVER-006 | Server lifecycle audit | server register/configure/rename/deactivate/delete/prepare/bootstrap commands return | the command returns through `CommandBus` | Appaloft records server audit rows without SSH credentials or private key material. |
| AUDIT-LIFECYCLE-SERVER-006A | Server lifecycle fact audit | server connected/ready/renamed/configured/deactivated/deleted facts are emitted | the domain event bus dispatches the lifecycle event | Appaloft records server audit rows without SSH credentials or private key material. |
| AUDIT-LIFECYCLE-STATIC-007 | Static artifact lifecycle audit | static artifact publish commands return | the command returns through `CommandBus` | Appaloft records static artifact audit rows with artifact/resource ids and publish result. |
| AUDIT-LIFECYCLE-QUERY-008 | Query policy | a query operation returns | query dispatch completes | Appaloft does not record operation audit by default. |
| AUDIT-LIFECYCLE-REDACTION-009 | Safe metadata | a command contains secret-like fields or raw env values | audit metadata is projected | Secret-like fields are omitted or redacted; safe secret references may be retained. |
| AUDIT-LIFECYCLE-SMOKE-010 | Command-bus lifecycle smoke | representative resource, deployment, and domain binding commands succeed through registered command handlers | the commands return through `CommandBus` with an audit sink installed | Appaloft records operation audit rows for each command with actor, organization, primary target, and related aggregate ids. |

## Domain Ownership

- Bounded context: Operator audit history.
- Write-side owner: application command dispatch boundary. Domain events remain domain facts; audit
  is a read-model/projection concern.
- Read-side owner: retained audit read model (`audit_logs`) and audit event query/export operations.
- Hosted distribution ownership: entitlement admission, retention interpretation, and Console
  visibility are composition concerns outside public core.

## Public Surfaces

- API/CLI: existing `audit-events.list`, `audit-events.export`, and
  `audit-events.export-global` read retained audit rows.
- Web/UI: public Audit Log Console page reads `audit-events.export-global` and supports time
  range, resource type, action, and actor filtering. Hosted distributions may hide navigation
  through their own entitlement overlays.
- Events: selected domain lifecycle facts feed the audit projector. Audit Log is not itself a
  domain event and not a billing event.
- Persistence: first implementation stores normalized operation audit fields in the existing
  audit payload envelope (`operation-audit/v1`) and preserves the existing `audit_logs` table shape.

## Non-Goals

- Event sourcing.
- Billing/metering.
- Hosted subscription or license plan logic in public core.
- Terminal session activity as the default lifecycle audit category.
- Background physical cleanup of hosted retention windows.

## Current Implementation Notes

- `CommandBus` invokes `OperationAuditSink` after command handlers return.
- `OperationAuditDomainEventProjector` consumes selected lifecycle domain events and writes the
  same retained audit read model.
- The first implementation is synchronous in the in-process dispatch pipeline and fail-open: an
  audit write failure is logged but does not change the command or event handler result. A hosted or
  enterprise runtime can replace the sink/recorder with an outbox-backed adapter without changing
  business handlers.
- Failure command results are recorded as `result=failure` when the command reaches the handler and
  returns a modeled domain error.
- Operation guard denial before handler dispatch remains an admission/authz concern; downstream
  hosted distributions can record those through their own security audit channel if required.

## Audited Lifecycle Categories

- Project: create, archive, restore, rename, reorder, description update, delete.
- Resource: create, configure source/runtime/network/access/health, set/unset variables, manage
  secret references, bind/rotate dependency bindings, archive, restore, delete.
- Deployment: create, retry, redeploy, force redeploy, rollback, cancel, archive, plus
  requested/started/succeeded/failed lifecycle facts.
- Dependency resource: provision, import, rename, delete, configure backup policy, backup, restore,
  plus realization/backup/restore lifecycle facts.
- Domain binding: create, confirm, configure route, retry verification, delete, plus
  requested/bound/ready/failed lifecycle facts.
- Server: register, prepare/bootstrap proxy, configure edge proxy, rename, deactivate, delete, plus
  connected/ready/configured/deactivated/deleted lifecycle facts.
- Static artifact: publish and publication-related commands.
- Storage volume: create, attach, detach, backup, restore, delete.
- Credential: create/rotate/delete SSH credentials and deploy tokens through safe metadata only.

## Excluded First-Version Categories

- Terminal sessions and terminal output.
- Connectivity tests and draft connectivity tests.
- Runtime log archival/pruning.
- Internal cleanup/prune jobs that do not represent a user-visible lifecycle transition.
