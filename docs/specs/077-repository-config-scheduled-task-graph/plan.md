# Repository Config Scheduled Task Graph Plan

## Scope

Add repository config support for Resource-owned scheduled task definitions without changing
deployment admission. Keep provider-native schedulers, task ids, task run triggering, and target
identity outside this MVP.

## Domain And Operation Mapping

| Concern | Decision |
| --- | --- |
| Bounded context | Workload delivery Resource scheduled tasks |
| Existing commands | `scheduled-tasks.create`, `scheduled-tasks.configure`, `scheduled-tasks.delete`, `deployments.cleanup-preview` |
| Existing queries | `scheduled-tasks.list` |
| New operation key | None; repository config scheduled tasks are a workflow/profile extension |
| Deployment admission | No change; `deployments.create` remains ids-only |
| Durable provenance | Extend source-link metadata with `source-link.scheduled-task-provenance/v1` |

## Implementation Plan

1. Extend `@appaloft/deployment-config` parser and generated JSON schema with top-level
   `scheduledTasks.<key>`.
2. Map parsed declarations into CLI `DeploymentPromptSeed.scheduledTaskGraph`.
3. Add CLI config deploy orchestration that lists scheduled tasks, creates missing tasks,
   configures provenance-owned drifted tasks, adopts exact matches, handles conflicts, and writes
   scheduled-task provenance.
4. Extend source-link record types and persistence metadata parsing for scheduled-task provenance.
5. Extend preview cleanup to delete only provenance-owned ephemeral scheduled tasks.
6. Update workflow docs, command docs, test matrices, public docs, and AI-facing deploy docs.
7. Add parser, CLI workflow, idempotency/conflict, and cleanup tests.

## Test Strategy

| Matrix ID | Automated coverage |
| --- | --- |
| CONFIG-FILE-SCHED-TASK-001 | `packages/deployment-config/test/appaloft-config.test.ts` |
| CONFIG-FILE-SCHED-TASK-002 | `packages/deployment-config/test/appaloft-config.test.ts` |
| CONFIG-FILE-SCHED-TASK-003 | `packages/deployment-config/test/appaloft-config.test.ts` |
| CONFIG-FILE-SCHED-TASK-004 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-SCHED-TASK-005 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-SCHED-TASK-006 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-SCHED-TASK-007 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-SCHED-TASK-008 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-SCHED-TASK-009 | `packages/adapters/cli/test/deployment-config.test.ts` |
| SOURCE-LINK-STATE-024 | `packages/adapters/cli/test/deployment-remote-state.test.ts` |
| DEPLOYMENTS-CLEANUP-PREVIEW-015 | `packages/application/test/cleanup-preview.test.ts` |
| DEPLOYMENTS-CLEANUP-PREVIEW-016 | `packages/application/test/cleanup-preview.test.ts` |
| SCHED-TASK-CONFIG-001 | `packages/adapters/cli/test/deployment-config.test.ts` |
| SCHED-TASK-CONFIG-002 | `packages/application/test/cleanup-preview.test.ts` |

## Appaloft YAML Sync Decision

Scheduled tasks are Resource-owned application automation and affect runtime execution context, so
they belong in `appaloft.yaml` as a high-level `scheduledTasks` graph. The YAML does not expose
internal scheduled-task ids, provider-native scheduler handles, deployment command fields, or
secret material.

## Open Questions

- Provider-native scheduled jobs remain a future provider-extension slice behind ADR-039.
- Future named runtime command references may be added after the scheduled task command model
  accepts them; MVP uses safe single-line command intent.
