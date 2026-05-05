# Plan: Scheduled Task Resource Shape

## Scope

Spec-first slice for Resource-owned scheduled tasks, run attempts, history, and logs.

## Code Round Sequence

1. Add core value objects and state machine for scheduled task definitions and run attempts.
   `Status: implemented for definition value objects, Resource-owned definition state, and
   run-attempt state transitions.`
2. Add application command/query schemas, messages, handlers, use cases, and ports.
   `Status: inactive schemas, messages, result DTOs, and read-model ports are implemented;
   create, update, delete, and run-now admission handlers/use cases are implemented; task/run
   read-query handlers and services are implemented.`
3. Add persistence repository/read models for task definitions and run attempts.
4. Add runtime target execution/log ports for one-off task runs.
5. Add scheduler process manager that dispatches the same admission path as run-now.
6. Add operation catalog, CLI, HTTP/oRPC, Web, public docs/help, and generated MCP descriptor
   surfaces.

## Non-Goals

- Server-local cron as source of truth.
- Deployment history reuse for task runs.
- Provider-specific scheduler APIs in core/application contracts.
- Scheduled backup policies for dependency resources.
- Generic job/outbox management commands.

## Open Implementation Decisions

- Persist skipped fires as run attempts or aggregate counters.
- Cron parser and timezone validation dependency.
- First runtime artifact source for task execution.
