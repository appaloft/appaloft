# SSH Credential Lifecycle Error Spec

## Normative Contract

SSH credential lifecycle errors must use structured, stable `DomainError` values. Expected query,
validation, usage-read, and future safety failures must not be represented by thrown exceptions or
localized message branching.

This spec currently governs the active `credentials.show` query and the future credential lifecycle
commands that will build on its usage visibility.

## Global References

This error spec inherits:

- [Error Model](./model.md)
- [neverthrow Conventions](./neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [SSH Credential Lifecycle Workflow](../workflows/ssh-credential-lifecycle.md)
- [credentials.show Query Spec](../queries/credentials.show.md)
- [SSH Credential Lifecycle Test Matrix](../testing/ssh-credential-lifecycle-test-matrix.md)

## Error Shape

Every expected failure must include:

- stable `code`;
- `category`;
- `phase`;
- `retriable`;
- safe `details` for ids, counts, phases, and related entity metadata.

Error details must not include private keys, public key bodies, key file paths, SSH agent socket
paths, passphrases, raw SSH command output, terminal transcripts, deployment logs, provider
credentials, environment secret values, or credential-bearing URLs.

## Phases

| Phase | Meaning |
| --- | --- |
| `query-validation` | Query input failed schema or field validation before read admission. |
| `credential-read` | Credential summary/detail could not be found or safely read. |
| `credential-usage-read` | Deployment-target/server usage summary could not be safely derived. |
| `credential-safety-check` | Future rotate/delete safety could not be evaluated. |
| `credential-mutation` | Future credential mutation was rejected by lifecycle or invariant rules. |
| `event-publication` | Future credential mutation event could not be durably recorded or published. |

## `credentials.show` Errors

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `validation_error` | `validation` | `query-validation` | No | Credential id or optional query input is invalid. |
| `not_found` | `not-found` | `credential-read` | No | Credential does not exist or is not visible. |
| `infra_error` | `infra` | `credential-read` | Conditional | Credential read model or repository failed. |
| `infra_error` | `infra` | `credential-usage-read` | Conditional | Usage reader failed while `includeUsage = true`. |

When usage read fails with `includeUsage = true`, the query should fail the whole request rather
than returning an empty usage section. This prevents users from mistaking unavailable usage for
unused credential state.

## Future Safety Errors

Future rotate/update or delete-when-unused commands must define command-specific errors before
implementation. Expected candidates include, but are not yet active:

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `credential_in_use` | `conflict` | `credential-safety-check` | No | A future delete command found active or retained server usage blockers. |
| `credential_rotation_conflict` | `conflict` | `credential-safety-check` | No | A future rotation command conflicts with current attachment or snapshot policy. |
| `credential_secret_unavailable` | `infra` | `credential-mutation` | Conditional | A future mutation could not safely read or persist secret material through the credential store. |

These rows are planning placeholders only. They must be moved into concrete command specs and test
matrix rows before any rotate/delete behavior is implemented.

## Consumer Mapping

Web, CLI, HTTP/oRPC, and future MCP/tool consumers must branch on `code` and `phase`, not raw
`message`.

For `credentials.show`:

- `validation_error` maps to a bad input response;
- `not_found` maps to a not-found response or "credential not available" UI state;
- `infra_error` maps to an unavailable/retryable state when `retriable = true`;
- usage-read failure must be visually distinct from zero usage.

## Current Implementation Notes And Migration Gaps

`credentials.show` maps query validation, missing credential, credential-read infrastructure, and
usage-read infrastructure failures to this spec.

Existing credential create/list and server attachment paths have their own local error handling but
do not yet fully share this lifecycle error spec.

## Open Questions

- None for `credentials.show` error phases.
