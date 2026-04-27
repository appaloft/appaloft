# Project Lifecycle Implementation Plan

## Source Of Truth

This document plans the Code Round for `projects.show`, `projects.rename`, and `projects.archive`.
It does not replace the command, query, workflow, event, error, or testing specs.

## Governed Specs

- [Project Lifecycle Workflow](../workflows/project-lifecycle.md)
- [projects.show Query Spec](../queries/projects.show.md)
- [projects.rename Command Spec](../commands/projects.rename.md)
- [projects.archive Command Spec](../commands/projects.archive.md)
- [project-renamed Event Spec](../events/project-renamed.md)
- [project-archived Event Spec](../events/project-archived.md)
- [Project Lifecycle Error Spec](../errors/projects.lifecycle.md)
- [Project Lifecycle Test Matrix](../testing/project-lifecycle-test-matrix.md)

## Code Round Scope

Expected core/application scope:

- add project lifecycle status and archive metadata to `Project` state using value objects;
- add aggregate methods for `rename` and `archive`;
- add `ShowProjectQuery`, `RenameProjectCommand`, and `ArchiveProjectCommand` vertical slices;
- keep handlers delegating to use cases/query services;
- add operation catalog entries and public exports;
- block archived project contexts in `environments.create`, `resources.create`, and
  `deployments.create`.

Expected persistence scope:

- add project lifecycle columns and migration;
- rehydrate active defaults for older rows;
- persist renamed and archived state through `ProjectRepository`;
- return lifecycle metadata from `ProjectReadModel`.

Expected transport scope:

- expose CLI `project show`, `project rename`, and `project archive`;
- expose oRPC/OpenAPI routes using operation schemas;
- update contracts and generated client shapes.

Expected docs/help scope:

- add public docs anchors for project read/rename/archive behavior;
- connect API route descriptions and CLI help surfaces to project docs where supported.

## Minimal Deliverable

- `projects.show`, `projects.rename`, and `projects.archive` are active in `CORE_OPERATIONS.md` and
  `operation-catalog.ts`;
- CLI and HTTP/oRPC dispatch through CommandBus/QueryBus;
- project archive is persisted and visible through show/list;
- archived projects block new environment/resource/deployment admission;
- focused tests cover the project lifecycle matrix rows selected for this round.

## Verification

Run targeted checks before publishing:

- `bun test packages/application/test/project-lifecycle.test.ts`
- `bun test packages/adapters/cli/test/project-command.test.ts`
- `bun test packages/orpc/test/project-lifecycle.http.test.ts`
- `bun test packages/persistence/pg/test/pglite.integration.test.ts`
- `bun run lint`
- `bun run typecheck`

## Current Implementation Notes And Migration Gaps

The first Code Round implements Web project settings controls for show, rename, and archive, plus
disabled project-scoped creation affordances for archived projects. WebView coverage now proves the
project detail/settings page reads `projects.show`, dispatches `projects.rename` and
`projects.archive`, and communicates that project lifecycle changes do not create deployments,
mutate historical deployment snapshots, or immediately affect runtime state.

Project hard delete, restore, and description editing remain future operations. Resource,
environment, deployment, and access rollups on project detail are read-only composed summaries.

## Open Questions

- None for this slice.
