# Workflow Spec Template

> Copy this file to `docs/workflows/<workflow-name>.md`.
>
> A workflow spec describes input collection, multi-step UX, or process orchestration. It must end
> in explicit commands/events rather than inventing parallel business semantics.

## Metadata

- Workflow name:
- Entrypoint: Web / CLI / API / automation / process manager
- Current status: implemented / partial / proposed / legacy compatibility
- Related command specs:
- Related event specs:
- Source classification: current code / recommended target / needs verification

## Purpose

Describe why this workflow exists and what user/system problem it solves.

## Not Domain Truth

List decisions that are only input collection or UX convenience and must not be treated as domain
rules.

## Steps

| Step | Owner | Input | Command/query called | Output | Failure |
| --- | --- | --- | --- | --- | --- |
| | UI/CLI/API/process manager | | | | |

## Final Command Payload

```ts
// The final payload submitted to the business command.
type FinalCommandInput = unknown;
```

## Async State Progression

| State | Trigger | Owner | User-visible status | Retry/compensation |
| --- | --- | --- | --- | --- |
| | | | | |

## Error Handling

| Error | Sync/async | Source | Mapping | User visibility |
| --- | --- | --- | --- | --- |
| | | | | |

## Entry Differences

| Entrypoint | Difference | Must still preserve |
| --- | --- | --- |
| Web | | command semantics |
| CLI | | command semantics |
| API | | command semantics |
| Automation / MCP | | command semantics |

## Tests

- Unit tests for input collection helpers:
- Command integration tests:
- Event/process-manager tests:
- Web/CLI flow tests:
- E2E tests:

## Open Questions

- 
