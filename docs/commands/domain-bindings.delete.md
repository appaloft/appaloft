# domain-bindings.delete Command Spec

## Normative Contract

`domain-bindings.delete` removes active managed domain route intent while preserving generated
access, deployment snapshot history, server-applied route audit, and certificate history.

It does not revoke certificates, delete certificates, delete deployments, rewrite route snapshots,
or remove generated access state.

## Input

| Field | Requirement | Meaning |
| --- | --- | --- |
| `domainBindingId` | Required | Binding to delete. |
| `confirmation.domainBindingId` | Required | Must exactly match `domainBindingId`. |
| `idempotencyKey` | Optional | Caller dedupe key. |

## Safety

Deletion is blocked while active certificate state is attached. Certificate revoke/delete lifecycle
must be implemented as separate certificate operations.

Successful deletion marks the binding inactive/deleted so the same owner route can be created again
without erasing the old record.

## Errors

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `domain-binding-delete` | No | Confirmation mismatch or invalid input. |
| `conflict` | `domain-binding-delete` | No | Delete-check blockers are present. |
| `not_found` | `domain-binding-delete` | No | Binding does not exist. |
