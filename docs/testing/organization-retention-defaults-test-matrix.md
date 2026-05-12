# Organization Retention Defaults Test Matrix

This matrix governs organization-level retention default policy. It does not govern audit rows,
legal holds, immutable archives, domain event streams, provider job logs, deployment logs, resource
runtime log archive rows, process attempts, runtime artifacts, source workspaces, build cache, or
scheduled retention execution.

| Test ID | Scenario | Layer | Automation |
| --- | --- | --- | --- |
| ORG-RETENTION-DEFAULTS-001 | Configure category defaults for retention days and scheduling flags without executing prune work. | Application + persistence/pg | Covered by `packages/application/test/retention-defaults.test.ts` and `packages/persistence/pg/test/retention-defaults.pglite.test.ts`. |
| ORG-RETENTION-DEFAULTS-002 | List/show retention defaults with safe category, scope, retention days, scheduling flags, enabled state, and update metadata. | Application + persistence/pg | Covered by `packages/application/test/retention-defaults.test.ts` and `packages/persistence/pg/test/retention-defaults.pglite.test.ts`. |
| ORG-RETENTION-DEFAULTS-003 | Manual prune commands continue requiring explicit cutoff/destructive input and do not infer behavior from defaults. | Application | Covered by `packages/application/test/retention-defaults.test.ts`. |
| ORG-RETENTION-DEFAULTS-004 | Legal holds, immutable archives, replay guards, active attempts, recovery evidence, and category-specific skip rules remain authoritative over defaults. | Application + persistence/pg | Covered by `packages/application/test/retention-defaults.test.ts`, with existing category guard evidence in `packages/application/test/domain-event-retention.test.ts`, `packages/persistence/pg/test/domain-event-stream-retention.pglite.test.ts`, and `packages/persistence/pg/test/audit-event-read-model.pglite.test.ts`. |
| ORG-RETENTION-DEFAULTS-005 | CLI and HTTP/oRPC entrypoints dispatch configure/list/show through shared schemas and command/query buses. | CLI + HTTP/oRPC | Covered by `packages/adapters/cli/test/retention-default-command.test.ts` and `packages/orpc/test/retention-defaults.http.test.ts`. |

## Current Gaps

- ADR-060 defines retention defaults as a non-executing policy boundary.
- Code Round added schemas, commands/queries, persistence, catalog entries, and docs-registry
  migration-gap coverage.
- CLI, HTTP/oRPC, public docs/help, OpenAPI route coverage, and SDK metadata are active for
  `retention-defaults.configure/list/show`.
- Scheduled retention automation remains separate and must consume defaults only through governed
  worker specs.
- Web remains a future operator maintenance surface until a governed UI slice enters scope.
