# Event Spec Template

> Copy this file to `docs/events/<event-type>.md`.
>
> An event spec describes a fact, not a log line. It must also say what happens if consumption
> fails.

## Metadata

- Event name/type:
- Event category: domain / application / integration / technical / progress-stream
- Publisher:
- Aggregate or process:
- Current status: implemented / partial / proposed / legacy compatibility
- Source classification: current code / recommended target / needs verification

## Meaning

State what fact this event represents. Also state what it does not guarantee.

Example: `deployment_target.registered` means deployment target metadata was persisted and a
registration fact exists. It does not guarantee edge proxy bootstrap has succeeded.

## Trigger Source And Timing

- Triggering command/process:
- Triggering aggregate method:
- Published before or after persistence:
- Transactional boundary:

## Payload

```ts
interface EventPayload {
  // define fields here
}
```

| Field | Required | Meaning | Stability |
| --- | --- | --- | --- |
| | | | stable/experimental |

## Publisher

- Code owner:
- Why this publisher owns the event:
- Outbox requirement: none / recommended / required

## Consumers

| Consumer | Type | Action | Idempotency requirement | Failure behavior |
| --- | --- | --- | --- | --- |
| | event handler/process manager/projection/integration | | | |

## State Progression

| Before state | Event | Consumer action | After state |
| --- | --- | --- | --- |
| | | | |

## Follow-Up Commands Or Events

- Commands triggered:
- Events emitted after successful handling:
- Events emitted after failed handling:

## Idempotency And Ordering

- Natural dedupe key:
- Duplicate consumption behavior:
- Required ordering:
- Allowed out-of-order behavior:

## Retry And Failure Strategy

- Retriable errors:
- Permanent errors:
- Retry owner:
- Retry schedule:
- Dead-letter or failure state:
- User-visible status:
- Compensation behavior:

Do not collapse "event occurred" and "event was handled successfully". Specify both.

## Observability

- Required log fields:
- Required tracing attributes:
- Correlation id:
- Causation id:
- Related command:
- Related aggregate id:

## Error Contract

| Code | Retriable | Phase/step | State impact | Monitoring impact |
| --- | --- | --- | --- | --- |
| | | | | |

## Tests

| Test layer | Required scenarios |
| --- | --- |
| Aggregate event emission | |
| Event handler success | |
| Event handler idempotency | |
| Event handler retry/failure | |
| Projection/read model | |
| E2E workflow | |

## Open Questions

- 
