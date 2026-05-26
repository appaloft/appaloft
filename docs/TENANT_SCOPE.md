# Tenant scope and repository guardrail

This document is the persistence-layer tenant-scope checklist for Appaloft product data. The rule is conservative: any resource a signed-in product user can create, list, read, mutate, or delete is tenant scoped unless it is explicitly marked as system-global infrastructure state or Better Auth identity state.

Repository and read-model implementations must not rely on request query parameters for tenant isolation. They must derive the active organization from `RepositoryContext.tenant.organizationId` or `RepositoryContext.principal.activeOrganization.organizationId` and apply the filter inside the persistence adapter.

## Scope rules

| Rule | Requirement |
| --- | --- |
| Organization-owned rows | Store `organization_id` directly or resolve it from a parent row before returning data. |
| Project-owned rows | Filter through `projects.organization_id`; explicit cross-org `projectId` or `environmentId` must return empty/not found. |
| Server-owned rows | Filter through `servers.organization_id`; explicit cross-org `serverId` must return empty/not found. |
| Resource-owned rows | Filter through `resources.project_id -> projects.organization_id`. |
| Secret/material rows | Never expose a standalone product list; access only through the owning aggregate/resource chain. |
| System-global rows | Only background workers, bootstrap, retention, or auth infrastructure may read globally; product user paths must not use global scans. |

## HTTP tenant-isolation coverage

`packages/orpc/test/tenant-isolation.http.test.ts` exercises product HTTP routes with two organizations, two users in the same organization, and one user switching organizations. It verifies no query parameters are required for tenant scoping and explicit cross-org filters return empty results.

| Matrix ID | Route/resource surface | Covered cases |
| --- | --- | --- |
| `TENANT-HTTP-PROJECT-001` | `GET /api/projects`, `GET /api/projects/{projectId}` | same org visible, different org hidden, same user switching org sees different rows, cross-org detail returns 404 |
| `TENANT-HTTP-ENVIRONMENT-001` | `GET /api/environments`, `GET /api/environments/{environmentId}` | default list scoped, same org visible, same user switching org sees different rows, cross-org `projectId` returns empty, cross-org detail returns 404 |
| `TENANT-HTTP-RESOURCE-001` | `GET /api/resources`, `GET /api/resources/{resourceId}` | default list scoped, same org visible, cross-org `projectId` and `environmentId` return empty, cross-org detail returns 404 |
| `TENANT-HTTP-RESOURCE-DEPENDENCY-BINDING-001` | `GET /api/resources/{resourceId}/dependency-bindings`, `GET /api/resources/{resourceId}/dependency-bindings/{bindingId}` | resource-owned binding list/detail scoped through project ownership; cross-org parent returns empty and cross-org detail returns 404 |
| `TENANT-HTTP-DEPENDENCY-RESOURCE-001` | `GET /api/dependency-resources`, `GET /api/dependency-resources/{dependencyResourceId}` | default list scoped, same org visible, cross-org `projectId` and `environmentId` return empty, cross-org detail returns 404 |
| `TENANT-HTTP-DEPENDENCY-BACKUP-001` | `GET /api/dependency-resources/{dependencyResourceId}/backups`, `GET /api/dependency-resources/backups/{backupId}` | dependency-resource-owned backup list/detail scoped through project ownership; cross-org parent returns empty and cross-org detail returns 404 |
| `TENANT-HTTP-DEPENDENCY-BACKUP-POLICY-001` | `GET /api/dependency-resources/backup-policies`, `GET /api/dependency-resources/backup-policies/{policyId}` | backup policy list/detail scoped through dependency resource ownership; cross-org filter returns empty and cross-org detail returns `policy: null` |
| `TENANT-HTTP-SERVER-001` | `GET /api/servers`, `GET /api/servers/{serverId}` | organization-owned deployment targets scoped by active org; cross-org detail returns 404 |
| `TENANT-HTTP-SSH-CREDENTIAL-001` | `GET /api/credentials/ssh`, `GET /api/credentials/ssh/{credentialId}` | saved SSH credentials scoped by active org; cross-org detail returns 404 |
| `TENANT-HTTP-DOMAIN-BINDING-001` | `GET /api/domain-bindings`, `GET /api/domain-bindings/{domainBindingId}` | domain binding list/detail scoped through project ownership; cross-org `projectId` returns empty and cross-org detail returns 404 |
| `TENANT-HTTP-CERTIFICATE-001` | `GET /api/certificates`, `GET /api/certificates/{certificateId}` | certificate list/detail scoped through domain binding project ownership; cross-org `domainBindingId` returns empty and cross-org detail returns 404 |
| `TENANT-HTTP-STORAGE-VOLUME-001` | `GET /api/storage-volumes`, `GET /api/storage-volumes/{storageVolumeId}` | storage volume list/detail scoped through project ownership; cross-org `projectId` returns empty and cross-org detail returns 404 |
| `TENANT-HTTP-DEPLOYMENT-001` | `GET /api/deployments`, `GET /api/deployments/{deploymentId}` | deployment list/detail scoped through project ownership; cross-org `projectId` returns empty and cross-org detail returns 404 |
| `TENANT-HTTP-DEPLOY-TOKEN-001` | `GET /api/deploy-tokens`, `GET /api/deploy-tokens/{tokenId}` | deploy token list/detail scoped by active organization even when an explicit cross-org `organizationId` is supplied |
| `TENANT-HTTP-RETENTION-DEFAULT-001` | `GET /api/retention-defaults`, `GET /api/retention-defaults/{category}` | organization defaults scoped by active organization; system defaults are the explicit global exception; cross-org organization filter returns empty/`policy: null` |
| `TENANT-HTTP-SOURCE-EVENT-001` | `GET /api/source-events`, `GET /api/source-events/{sourceEventId}` | project/resource scoped product reads require scope and intersect it with active org; cross-org `projectId` returns empty and cross-org detail returns 404 |
| `TENANT-HTTP-SOURCE-LINK-001` | `GET /api/source-links`, `GET /api/source-links/{sourceFingerprint}` | source link list/detail scoped through project ownership; cross-org `projectId` returns empty and cross-org detail returns 404 |
| `TENANT-HTTP-PREVIEW-ENVIRONMENT-001` | `GET /api/preview-environments`, `GET /api/preview-environments/{previewEnvironmentId}` | preview environment list/detail scoped through project ownership; same user switching org sees different rows; cross-org `projectId` returns empty and cross-org detail returns 404 |
| `TENANT-HTTP-SCHEDULED-TASK-001` | `GET /api/scheduled-tasks`, `GET /api/scheduled-tasks/{taskId}` | scheduled task list/detail scoped through resource/project ownership; cross-org `projectId` returns empty and cross-org detail returns 404 |
| `TENANT-HTTP-SCHEDULED-TASK-RUN-001` | `GET /api/scheduled-task-runs`, `GET /api/scheduled-task-runs/{runId}` | scheduled task run list/detail scoped through resource/project ownership; cross-org resource filter returns empty and cross-org detail returns 404 |
| `TENANT-HTTP-SCHEDULED-TASK-LOG-001` | `GET /api/scheduled-task-runs/{runId}/logs` | run log read resolves the run through resource/project ownership first; cross-org run returns no log entries |

The same test also verifies a second user inside the same organization sees the same rows, and one user switching active organization sees different rows.

Additional PGlite repository tests cover lower-level persistence invariants:

| Test | Coverage |
| --- | --- |
| `server-ownership.pglite.test.ts` | server repository/read model organization ownership |
| `ssh-credential-ownership.pglite.test.ts` | SSH credential repository/read model/usage organization ownership |
| `dependency-resource.pglite.test.ts` | dependency resource tenant fallback |
| `project-ownership.pglite.test.ts` | project organization ownership and legacy self-hosted fallback |
| `deploy-token.pglite.test.ts` | deploy token repository/read model organization ownership |
| `preview-policy.pglite.test.ts` | preview policy project/resource ownership |
| `dependency-resource-backup-policy.pglite.test.ts` | backup policy ownership through dependency resource project |
| `retention-defaults.pglite.test.ts` | organization defaults isolated while system defaults remain visible |

## Product HTTP matrix classification

| Table | Product HTTP matrix status | Reason |
| --- | --- | --- |
| `projects` | covered | `/api/projects` list/show |
| `servers` | covered | `/api/servers` list/show |
| `ssh_credentials` | covered | `/api/credentials/ssh` list/show |
| `deploy_tokens` | covered | `/api/deploy-tokens` list/show |
| `retention_defaults` | covered | `/api/retention-defaults` list/show with system-default exception |
| `environments` | covered | `/api/environments` list/show |
| `resources` | covered | `/api/resources` list/show |
| `storage_volumes` | covered | `/api/storage-volumes` list/show |
| `dependency_resources` | covered | `/api/dependency-resources` list/show |
| `dependency_resource_backups` | covered | `/api/dependency-resources/{dependencyResourceId}/backups` and `/api/dependency-resources/backups/{backupId}` |
| `dependency_resource_backup_policies` | covered | `/api/dependency-resources/backup-policies` list/show |
| `deployments` | covered | `/api/deployments` list/show |
| `domain_bindings` | covered | `/api/domain-bindings` list/show |
| `certificates` | covered | `/api/certificates` list/show |
| `source_links` | covered | `/api/source-links` list/show |
| `destinations` | not standalone | no standalone product list/show; returned through server/resource/deployment-owned flows |
| `environment_variables` | embedded | surfaced through scoped environment/resource config, not as a standalone table list |
| `resource_variables` | embedded | surfaced through scoped resource config, not as a standalone table list |
| `resource_storage_attachments` | embedded | surfaced through scoped resource/storage volume reads |
| `resource_dependency_bindings` | covered | `/api/resources/{resourceId}/dependency-bindings` list/show |
| `dependency_binding_secrets` | embedded secret | secret material only through scoped binding/resource chain |
| `dependency_resource_secrets` | embedded secret | secret material only through scoped dependency resource chain |
| `certificate_secrets` | embedded secret | secret material only through scoped certificate/domain binding chain |
| `source_events` | covered | `/api/source-events` list/show requires project/resource scope and intersects with active organization; unmatched ingestion rows remain system/internal |
| `preview_environments` | covered | `/api/preview-environments` list/show |
| `preview_policies` | repository covered | show/configure API is scoped by project/resource ownership; PGlite matrix covers read/write guard |
| `default_access_domain_policies` | service guarded | server-scoped service resolves server through tenant-scoped server repository |
| `runtime_monitoring_samples` | repository covered | read model filters through project/server ownership; add HTTP matrix when sample fixture is stable |
| `runtime_monitoring_threshold_policies` | service guarded | scope-specific service resolves owning entity before repository access |
| `resource_health_observations` | repository covered | read model filters through resource/project ownership |
| `scheduled_task_definitions` | covered | `/api/scheduled-tasks` list/show |
| `scheduled_task_run_attempts` | covered | `/api/scheduled-task-runs` list/show |
| `scheduled_task_run_logs` | covered | `/api/scheduled-task-runs/{runId}/logs` |
| `scheduled_runtime_prune_policies` | repository covered | read model filters through server ownership; wildcard defaults are system scope |
| `process_attempt_journal` | internal/system | operator/workflow journal, not tenant resource list |
| `resource_access_failure_evidence` | internal/system | diagnostic projection behind scoped resource/server callers |
| `provider_job_logs` | internal/system | retention/debug log store |
| `audit_logs` | internal/system | aggregate audit log; product reads require scoped aggregate ids |
| `audit_event_legal_holds` | system compliance | operator/compliance scope |
| `audit_event_archives` | system compliance | compliance archive state |
| `audit_event_archive_items` | system compliance | archive contents |
| `domain_event_stream_records` | internal/system | event-stream retention/projection state |
| `domain_event_stream_prune_watermarks` | internal/system | retention watermark state |
| `mutation_coordinations` | internal/system | lock table |
| `user`, `session`, `account`, `verification`, `organization`, `member`, `invitation` | auth boundary | Better Auth/product-session authorization boundary, not product resource table matrix |

## Table audit

Status values:

- `guarded`: repository/read model applies tenant filtering directly.
- `guarded via parent`: no direct tenant column; access is filtered through owning project/server/resource/dependency row.
- `embedded`: stored and returned only through an already-scoped aggregate repository.
- `internal/system`: not product-user listable; background/system paths may use global scans.
- `auth boundary`: Better Auth or product session authorization data.

| Table | Scope | Guard status | Notes |
| --- | --- | --- | --- |
| `projects` | organization | guarded | Direct `organization_id`; project repository/read model filters by context org. |
| `servers` | organization | guarded | Direct `organization_id`; server repository/read model filters by context org. |
| `ssh_credentials` | organization | guarded | Direct `organization_id`; list/detail/update/delete/usage filter by context org. |
| `deploy_tokens` | organization | guarded | Direct `organization_id`; list filters by org, repository reads/updates also filter when context org exists. |
| `retention_defaults` | organization/system | guarded | Product context may read system defaults and its own org defaults, not another org. |
| `destinations` | server | guarded via parent | Repository filters by `server_id -> servers.organization_id`. No standalone product list. |
| `environments` | project | guarded via parent | Repository/read model filters through project ownership. |
| `resources` | project/environment | guarded via parent | Repository/read model filters through project ownership. |
| `environment_variables` | environment | embedded | Managed through scoped environment aggregate/snapshots; no standalone product list. |
| `resource_variables` | resource | embedded | Managed through scoped resource aggregate; no standalone product list. |
| `storage_volumes` | project/environment | guarded via parent | Repository/read model filters through project ownership. |
| `resource_storage_attachments` | resource/storage volume | embedded | Managed through scoped resource/storage-volume reads. |
| `dependency_resources` | project/environment | guarded via parent | Repository/read model filters through project ownership. |
| `dependency_resource_backups` | project/environment | guarded via parent | Repository/read model filters through project ownership. |
| `dependency_resource_backup_policies` | dependency resource | guarded via parent | Repository filters through `dependency_resources.project_id -> projects.organization_id`. |
| `resource_dependency_bindings` | project/environment/resource | guarded via parent | Repository/read model filters through project ownership. |
| `dependency_binding_secrets` | binding/resource | embedded | Secret material; accessed only through owning dependency binding/resource chain. |
| `dependency_resource_secrets` | dependency resource/project | embedded | Secret material; accessed only through owning dependency resource/project chain. |
| `deployments` | project/environment/resource/server | guarded via parent | Repository/read model filters through project ownership; server references are runtime placement. |
| `domain_bindings` | project/environment/resource/server | guarded via parent | Repository/read model filters through project ownership. |
| `certificates` | domain binding/project | guarded via parent | Read model filters through `domain_bindings.project_id -> projects.organization_id`. |
| `certificate_secrets` | certificate/domain binding | embedded | Secret material; no standalone product list. |
| `source_links` | project/resource/server | guarded via parent | List/detail/update/delete repository calls accept context and filter through project ownership. |
| `source_events` | project or unmatched source | guarded via parent/internal | Product project-scoped reads filter by project; unmatched events are system ingestion state. |
| `preview_environments` | project/resource/server | guarded via parent | Repository filters through project ownership. |
| `preview_policies` | project/resource | guarded via parent | Reads filter through project ownership. |
| `preview_policy_decisions` | project/environment/resource | internal/system | Projection rows are consumed by preview workflow; project-owned by schema. |
| `preview_feedback_records` | preview environment | internal/system | Feedback projection tied to preview environments. |
| `preview_cleanup_attempts` | preview environment/resource | internal/system | Cleanup worker journal; not product-user listable globally. |
| `default_access_domain_policies` | system or server | guarded by service | Server-scoped commands/queries resolve server through tenant-scoped server repository before repository access. |
| `server_applied_route_states` | project/resource/server | guarded via parent/internal | Route-state reads are scoped by deployment/resource/server callers; no product global list. |
| `resource_runtime_log_archives` | resource/deployment/server | guarded via parent/internal | Runtime log archive reads are scoped by resource/server filters; no product global list. |
| `resource_runtime_control_attempts` | resource/deployment/server | guarded via parent/internal | Runtime control attempts are scoped by resource/server callers. |
| `runtime_monitoring_samples` | project/resource/server/deployment | guarded via parent | Read model filters through project/server ownership. |
| `runtime_monitoring_threshold_policies` | project/resource/server/deployment | guarded by scope service | Scope-specific service resolves owning entity; repository stores exact scope. |
| `resource_health_observations` | resource | guarded via parent | Read model filters through `resources.project_id -> projects.organization_id`. |
| `scheduled_task_definitions` | resource | guarded via parent | Repository filters through resource/project ownership. |
| `scheduled_task_run_attempts` | scheduled task/resource | guarded via parent/internal | Run attempts are read through scoped scheduled task/resource flows. |
| `scheduled_task_run_logs` | run/task/resource | guarded via parent/internal | Run logs are read through scoped run/task/resource flows. |
| `scheduled_runtime_prune_policies` | server or defaults | guarded via parent | Read model filters through server ownership; wildcard defaults are system scope. |
| `process_attempt_journal` | optional project/resource/deployment/server | internal/system | Operator/workflow journal; product views must pass scoped filters. |
| `resource_access_failure_evidence` | resource/deployment/domain/server | internal/system | Diagnostic projection; resource/server-scoped callers only. |
| `provider_job_logs` | deployment | internal/system | Retention/debug log store; deployment-owned by schema. |
| `audit_logs` | aggregate | internal/system | Aggregate audit log; product reads must request a known scoped aggregate id. |
| `audit_event_legal_holds` | system compliance | internal/system | Operator/compliance scope, not tenant resource list. |
| `audit_event_archives` | aggregate or global window | internal/system | Compliance archive state. |
| `audit_event_archive_items` | archive | internal/system | Compliance archive contents. |
| `domain_event_stream_records` | stream/aggregate | internal/system | Event-stream retention/projection state, not product resource list. |
| `domain_event_stream_prune_watermarks` | stream | internal/system | Retention watermark state. |
| `mutation_coordinations` | operation scope | internal/system | Lock table; no product data read surface. |
| `user` | identity | auth boundary | Better Auth identity state. |
| `session` | identity/session/org context | auth boundary | Holds active organization for authorization context. |
| `account` | identity provider account | auth boundary | Better Auth account state. |
| `verification` | auth verification | auth boundary | Better Auth verification state. |
| `organization` | identity organization | auth boundary | Better Auth organization state. |
| `member` | organization membership | auth boundary | Product session authorization checks membership. |
| `invitation` | organization membership | auth boundary | Invitation management is organization-scoped by Better Auth data. |

## Review checklist for future repositories

1. If the table has `organization_id`, repository/read model methods must add `where organization_id = context organization` for user contexts.
2. If the table has `project_id`, methods must add `where project_id in (select id from projects where organization_id = context organization)`.
3. If the table has only `server_id`, methods must add `where server_id in (select id from servers where organization_id = context organization)`.
4. If the table has only `resource_id`, methods must resolve through `resources.project_id -> projects.organization_id`.
5. If a method accepts an explicit `projectId`, `environmentId`, `resourceId`, `serverId`, `domainBindingId`, or `dependencyResourceId`, the explicit id must be intersected with context ownership; cross-org ids return empty/not found.
6. System/background workers may use global scans only when running without a user tenant context or when the operation is explicitly system scope.
