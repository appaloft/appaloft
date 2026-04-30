# domain-bindings.show Query Spec

## Normative Contract

`domain-bindings.show` reads one durable domain binding and explains its ownership, route readiness,
proxy readiness, selected route/access diagnostic state, generated access fallback, delete safety,
and read-only certificate readiness context.

It does not mutate the binding, retry verification, repair routes, or start certificate lifecycle
work.

## Input

| Field | Requirement | Meaning |
| --- | --- | --- |
| `domainBindingId` | Required | Binding to read. |

## Output

The response contains:

- `binding`: the same domain binding summary shape used by `domain-bindings.list`;
- `routeReadiness`: ready/not-ready/pending/failed/deleted status plus selected/context route
  descriptors;
- `generatedAccessFallback`: latest or planned generated access route when available;
- `proxyReadiness`: resource access summary proxy route status when available;
- `certificates`: certificate readiness context for the binding;
- `deleteSafety`: same safety object returned by `domain-bindings.delete-check`.

## Errors

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input shape is invalid. |
| `not_found` | `domain-binding-readback` | No | Binding does not exist. |
