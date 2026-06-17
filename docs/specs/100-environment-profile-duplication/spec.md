# Environment Profile Duplication

## Status

- Round: Code / Post-Implementation Sync
- Artifact state: Environment Profile query/command/API/CLI/SDK surfaces, preview policy
  base-profile integration, neutral Console extension points, and request-capable hosted panel
  support are implemented for this draft PR. First-party Community Web staged workflows remain a
  deferred follow-up; Cloud owns the hosted Console staged workflow in the private readiness PR.
- Governing decision: [ADR-085](../../decisions/ADR-085-environment-profile-duplication-boundary.md)

## Business Outcome

Users can create a new staging, preview, developer, or custom environment from an existing
environment's application shape without accidentally copying production-only values. The workflow
copies topology and intent, asks for explicit decisions for dependency resources, secrets, domains,
storage data, and deployment policy, then creates a target environment whose deployment readiness is
observable before any new deployment runs.

This makes Environment more than a namespace while preserving existing ownership boundaries:
Resource remains the deployable unit, Dependency Resource owns database/cache/object storage
realization, Domain Binding owns custom access, and Deployment remains one immutable execution
attempt.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| Environment Profile | Provider-neutral composition snapshot of an environment's resource topology and configuration intent. | Workspace / release orchestration | environment shape, app shape |
| Duplicate Environment Plan | Reviewable query result describing what will be copied, regenerated, deferred, or blocked when creating a target environment. | Environment profile planning | duplication plan |
| Environment Profile Decision | User or policy choice that resolves an environment-specific value such as dependency binding, domain, storage data, or secret reference. | Environment profile apply | override, binding decision |
| Copy Shape | Copy topology and configuration intent without copying environment-specific values. | Environment profile planning | copy structure |
| Regenerate | Create a new target-specific value, such as preview/staging route or generated secret reference. | Environment profile apply | derive |
| Create New Managed Dependency | Provision a new target dependency resource through the selected provider. | Dependency binding decision | create-new-managed |
| Bind Existing Dependency | Attach a target resource to an already existing dependency resource. | Dependency binding decision | bind-existing |
| Reuse Source Dependency | Attach the target resource to the same dependency used by the source environment after explicit acknowledgement. | Dependency binding decision | reuse-source |
| Defer Binding | Leave a required binding unresolved and block deployment admission until resolved. | Dependency binding decision | defer |
| Profile Diff | Read model comparing environment shape, decisions, and unresolved target values. | Query side | diff-profile |
| Profile Sync | Apply selected shape changes from one environment into another through staged decisions. | Workflow | sync-profile |
| Preview Profile Base | Environment Profile source selected by product-grade preview policy for a derived PR preview environment. | Preview lifecycle | base Environment Profile |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| ENV-PROFILE-DUP-001 | Plan copies shape without copying production values | A production environment has resources, variables, dependency bindings, domains, and storage requirements | `environments.plan-duplicate` targets staging | The plan marks topology/profile fields as copyable, secret/dependency/domain/storage data as decision-required or regenerated, and contains no secret values. |
| ENV-PROFILE-DUP-002 | Managed Postgres can be recreated for the target | Source resource uses a managed Postgres dependency for `DATABASE_URL` | The apply decision is `create-new-managed` | The target environment gets a new dependency resource binding and generated secret reference, while the source dependency remains unchanged. |
| ENV-PROFILE-DUP-003 | Managed Postgres can be reused only with acknowledgement | Source resource uses production Postgres | The apply decision is `reuse-source` | The command requires explicit acknowledgement, records shared-source/read-only or read-write mode, and the read model keeps the shared dependency warning visible. |
| ENV-PROFILE-DUP-004 | Existing target dependency can be bound | A staging Postgres dependency already exists | The apply decision is `bind-existing` | The target resource binding uses the selected dependency and records safe readback without copying source secret material. |
| ENV-PROFILE-DUP-005 | Deferred binding blocks deployment | A required dependency or secret decision is deferred | A target deployment is requested | Deployment admission fails with an unresolved environment-profile decision error and points to the pending decision. |
| ENV-PROFILE-DUP-006 | Domains are regenerated or deferred | Production resource has a custom domain | The plan targets staging | Production domains are not copied; the plan proposes generated target routes or asks for explicit domain decisions. |
| ENV-PROFILE-DUP-007 | Storage data is not copied implicitly | Source resource has a persistent volume | The plan targets staging | Volume requirements can be copied, but data clone/restore/import/empty selection is an explicit decision. |
| ENV-PROFILE-DUP-008 | Profile diff explains drift safely | Two environments differ in resources, runtime profile, variables, dependencies, or routes | `environments.diff-profile` runs | The result shows added/changed/removed shape and decision differences while masking secret values. |
| ENV-PROFILE-DUP-009 | Profile sync applies selected shape only | Staging lacks a worker resource added in production | `environments.sync-profile` applies only that selected change | The worker shape is staged/applied without overwriting unrelated target-only dependency or secret decisions. |
| ENV-PROFILE-DUP-010 | Existing clone behavior remains explicit | User calls legacy `environments.clone` | The command runs | It remains variable-only and docs direct full environment duplication to the profile workflow. |
| ENV-PROFILE-DUP-011 | PR preview derives from a base profile without replacing preview lifecycle | Product-grade preview policy selects a base Environment Profile | A verified PR preview source event is admitted | The existing preview lifecycle creates/updates the derived preview environment and dispatches ids-only deployment while policy decisions record the safe base environment id; fork previews with secret scopes remain blocked before dispatch unless policy explicitly permits safe no-secret previews. |

## Domain Ownership

- Bounded context: Workspace / Release Orchestration.
- Aggregate/resource owner: Environment Profile Duplication is an application workflow over
  `Environment`, `Resource`, `DependencyResource`, `DomainBinding`, `StorageVolume`, preview policy,
  and deployment readiness owners. It does not become a new aggregate owner for those objects.
- Upstream contexts: repository config profile overlays, service graph, application graph,
  dependency resource lifecycle, storage volume lifecycle, route/domain lifecycle.
- Downstream contexts: runtime provider adapters, hosted provider policy, customer-managed provider
  adapters, usage or quota policy.

## Public Surfaces

- API/HTTP/oRPC:
  - query `environments.plan-duplicate`;
  - command `environments.duplicate-profile`;
  - query `environments.diff-profile`;
  - command `environments.sync-profile`.
- CLI:
  - `appaloft env duplicate plan`;
  - `appaloft env duplicate apply`;
  - `appaloft env diff-profile`;
  - `appaloft env sync-profile`.
- Web/UI:
  - Public Web exposes neutral owner-scoped Console extension points and request-capable hosted
    panel support so distributions can provide staged workflows without copying public source.
  - First-party Community Web Project Environment management for Duplicate, Diff, and Sync remains
    a deferred follow-up; the Cloud distribution implements the hosted staged workflow privately.
- Preview:
  - Product-grade preview policy may select an Environment Profile base through
    `environmentProfileBaseEnvironmentId`; preview lifecycle remains the owner of temporary
    preview environment identity, feedback, and cleanup, and `deployments.create` remains ids-only.
- Config:
  - Repository config may provide safe profile defaults, but it must not select project/resource
    identity, provider credentials, raw secrets, or production domains.
- Events:
  - Future Code Round must define domain/process events for plan acceptance, target creation,
    deferred decision, and sync completion before adding async workers.
- Public docs/help:
  - Add task docs before first user-facing implementation slice.
- Future tool/MCP:
  - Tool descriptors must come from the same operation catalog entries after operations are added.

## Non-Goals

- No broad `environments.update` operation.
- No copying production database values, secret values, custom domains, volume data, provider
  credentials, or deployment history by default.
- No fields added to `deployments.create`.
- No hosted account policy, provider-account selection, plan limits, or
  distribution-specific admission policy in public Appaloft.
- No automatic data migration or backup restore without an explicit dependency/storage decision.
- No replacement of product-grade preview environments; preview consumes the base profile as
  policy/read-model context while retaining the existing derived temporary environment lifecycle.

## Open Questions

- Whether `environments.clone` should remain indefinitely as variable-only or be deprecated after
  profile duplication reaches full entrypoint parity.
- Whether storage data copy choices belong to the same apply command or a follow-up storage-volume
  restore/import workflow.
