# SSH Credential Lifecycle Error Spec

## Normative Contract

SSH credential lifecycle errors must use structured, stable `DomainError` values. Expected query,
validation, usage-read, and future safety failures must not be represented by thrown exceptions or
localized message branching.

This spec currently governs the active `credentials.show` query and the active
`credentials.delete-ssh` command.

## Global References

This error spec inherits:

- [Error Model](./model.md)
- [neverthrow Conventions](./neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [SSH Credential Lifecycle Workflow](../workflows/ssh-credential-lifecycle.md)
- [credentials.show Query Spec](../queries/credentials.show.md)
- [credentials.delete-ssh Command Spec](../commands/credentials.delete-ssh.md)
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
| `command-validation` | Command input failed schema, field validation, or typed confirmation before mutation. |
| `query-validation` | Query input failed schema or field validation before read admission. |
| `credential-read` | Credential summary/detail could not be found or safely read. |
| `credential-usage-read` | Deployment-target/server usage summary could not be safely derived. |
| `credential-safety-check` | Delete safety rejected active/inactive visible server usage or could not prove the credential is unused. |
| `credential-mutation` | Credential mutation persistence failed or was rejected by a final adapter guard. |
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

## `credentials.delete-ssh` Errors

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `validation_error` | `validation` | `command-validation` | No | Credential id, confirmation, or optional command input is invalid. |
| `not_found` | `not-found` | `credential-read` | No | Credential does not exist or is not visible. |
| `infra_error` | `infra` | `credential-read` | Conditional | Masked credential metadata cannot be read safely. |
| `infra_error` | `infra` | `credential-usage-read` | Conditional | Usage reader failed before delete safety could be proven. |
| `credential_in_use` | `conflict` | `credential-safety-check` | No | Active or inactive visible servers still reference the credential. |
| `infra_error` | `infra` | `credential-mutation` | Conditional | Persistence adapter failed or could not safely delete the credential. |

`credential_in_use` details should include `credentialId`, `totalServers`, `activeServers`, and
`inactiveServers`. Details may include safe server ids. They must not include private keys, public
key bodies, local key paths, passphrases, raw SSH command output, terminal transcripts, deployment
logs, or provider credentials.

When usage read fails, the command must fail the whole request rather than continuing to the delete
adapter. This prevents users from mistaking unavailable usage for unused credential state.

## Future Safety Errors

Future rotate/update commands must define command-specific errors before implementation. Expected
candidates include, but are not yet active:

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
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

For `credentials.delete-ssh`:

- `credential_in_use` maps to a conflict response and should tell users to inspect usage before
  deleting;
- `infra_error` with phase `credential-usage-read` maps to a retryable unavailable state when
  `retriable = true`;
- `validation_error` for confirmation mismatch maps to bad input and must not attempt deletion;
- successful output contains only the credential id.

## Current Implementation Notes And Migration Gaps

`credentials.show` maps query validation, missing credential, credential-read infrastructure, and
usage-read infrastructure failures to this spec.

`credentials.delete-ssh` maps command validation, confirmation mismatch, missing credential,
usage-read infrastructure, in-use safety, and mutation persistence failures to this spec.

Existing credential create/list and server attachment paths have their own local error handling but
do not yet fully share this lifecycle error spec.

## Open Questions

- None for `credentials.show` error phases.
