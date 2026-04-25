# SSH Credential Lifecycle Error Spec

## Normative Contract

SSH credential lifecycle errors must use structured, stable `DomainError` values. Expected query,
validation, usage-read, and safety failures must not be represented by thrown exceptions or
localized message branching.

This spec currently governs the active `credentials.show` query, the active
`credentials.delete-ssh` command, and the active `credentials.rotate-ssh` command.

## Global References

This error spec inherits:

- [Error Model](./model.md)
- [neverthrow Conventions](./neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)
- [SSH Credential Lifecycle Workflow](../workflows/ssh-credential-lifecycle.md)
- [credentials.show Query Spec](../queries/credentials.show.md)
- [credentials.delete-ssh Command Spec](../commands/credentials.delete-ssh.md)
- [credentials.rotate-ssh Command Spec](../commands/credentials.rotate-ssh.md)
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

## `credentials.rotate-ssh` Errors

`credentials.rotate-ssh` replaces stored credential material for the same credential id. It may
affect active and inactive visible servers that reference that credential, so usage visibility and
explicit acknowledgement are part of the error contract.

| Error code | Category | Phase | Retriable | Meaning |
| --- | --- | --- | --- | --- |
| `validation_error` | `validation` | `command-validation` | No | Credential id, new credential material, confirmation, optional metadata, or optional command input is invalid. |
| `not_found` | `not-found` | `credential-read` | No | Credential does not exist or is not visible. |
| `infra_error` | `infra` | `credential-read` | Conditional | Masked credential metadata cannot be read safely. |
| `infra_error` | `infra` | `credential-usage-read` | Conditional | Usage reader failed before rotation safety could be evaluated. |
| `credential_rotation_requires_usage_acknowledgement` | `conflict` | `credential-safety-check` | No | Active or inactive visible server usage exists and the caller did not acknowledge the in-use rotation impact. |
| `credential_secret_unavailable` | `infra` | `credential-mutation` | Conditional | New credential material could not be safely stored through the credential store. |
| `infra_error` | `infra` | `credential-mutation` | Conditional | Persistence adapter failed or could not safely persist the rotated credential. |

`credential_rotation_requires_usage_acknowledgement` details should include `credentialId`,
`totalServers`, `activeServers`, and `inactiveServers`. Details may include safe server ids. They
must not include private keys, public key bodies, local key paths, passphrases, raw SSH command
output, terminal transcripts, deployment logs, or provider credentials.

When usage read fails, the command must fail the whole request rather than continuing to credential
mutation. This prevents users from accepting an in-use rotation without seeing the affected server
usage.

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

For `credentials.rotate-ssh`:

- `credential_rotation_requires_usage_acknowledgement` maps to a conflict response and should tell
  users to review affected server usage and explicitly acknowledge in-use rotation before retrying;
- `infra_error` with phase `credential-usage-read` maps to a retryable unavailable state when
  `retriable = true` and must not display usage as zero;
- `credential_secret_unavailable` maps to an unavailable mutation state with secret-safe details;
- `validation_error` for confirmation mismatch or invalid credential material maps to bad input and
  must not attempt mutation;
- successful output contains only safe rotated metadata and affected usage counts.

## Current Implementation Notes And Migration Gaps

`credentials.show` maps query validation, missing credential, credential-read infrastructure, and
usage-read infrastructure failures to this spec.

`credentials.delete-ssh` maps command validation, confirmation mismatch, missing credential,
usage-read infrastructure, in-use safety, and mutation persistence failures to this spec.

`credentials.rotate-ssh` maps command validation, confirmation mismatch, missing credential,
usage-read infrastructure, in-use acknowledgement safety, and mutation persistence failures to this
spec.

Existing credential create/list and server attachment paths have their own local error handling but
do not yet fully share this lifecycle error spec.

## Open Questions

- None for `credentials.show` error phases.
