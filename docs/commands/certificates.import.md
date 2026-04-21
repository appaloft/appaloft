# certificates.import Command Spec

## Normative Contract

`certificates.import` is the source-of-truth command for attaching an operator-supplied
certificate chain and private key to a durable domain binding that uses manual certificate policy.

Unlike `certificates.issue-or-renew`, command success means the import has completed: certificate
material has been validated, stored through a secret-safe boundary, durable certificate state has
been recorded with `source = imported`, and `certificate-imported` has been published or recorded.

```ts
type ImportCertificateResult = Result<
  { certificateId: string; attemptId: string },
  DomainError
>;
```

The command contract is:

- admission or validation failure returns `err(DomainError)`;
- successful import returns `ok({ certificateId, attemptId })`;
- success persists only secret references plus safe certificate metadata;
- success publishes `certificate-imported`;
- success must not publish `certificate-issued`;
- downstream `domain-ready` evaluation may still continue through the event/process-manager path.

## Global References

This command inherits:

- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [ADR-008: Renewal Trigger Model](../decisions/ADR-008-renewal-trigger-model.md)
- [ADR-009: Certificates Import Command](../decisions/ADR-009-certificates-import-command.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Purpose

Import manually managed certificate material for a durable domain binding whose certificate policy
is manual.

It is not:

- a provider-driven issuance or renewal command;
- a deployment command;
- a domain binding creation command;
- a raw secret upload endpoint without domain-policy checks;
- a shortcut mode of `certificates.issue-or-renew`.

## Boundary With certificates.issue-or-renew

`certificates.import` and `certificates.issue-or-renew` are intentionally separate commands.

`certificates.issue-or-renew` owns:

- provider selection;
- challenge type selection;
- provider/account/challenge orchestration;
- renewal scheduler dispatch;
- `certificate-requested`, `certificate-issued`, and `certificate-issuance-failed`.

`certificates.import` owns:

- operator-supplied certificate chain, private key, and optional passphrase;
- parser/validator-driven domain/key/time/algorithm checks;
- secret-store persistence of imported material;
- `certificate-imported`;
- manual-certificate readiness progression.

Raw private key material must never be added to `certificates.issue-or-renew`.

## Manual Certificate Eligibility

The command may run only when all of these are true:

- the referenced `DomainBinding` exists;
- the binding still owns the requested hostname in managed domain lifecycle state;
- the binding certificate policy is `manual`;
- the binding TLS mode is not `disabled`;
- the binding is in a durably owned state such as `bound`, `ready`, or `not_ready`.

Bindings that are still `requested` or `pending_verification` are not eligible because managed
ownership has not yet been proven.

## Secret-Safe Input Contract

The command input model must keep secret-bearing material explicit and reusable across CLI, HTTP,
Web, automation, and future MCP entrypoints.

Each secret-bearing field is one command field, even when transports collect it in different ways:

| Field | Requirement | Meaning |
| --- | --- | --- |
| `domainBindingId` | Required | Durable domain binding that will own the imported certificate. |
| `certificateChain` | Required | Secret-bearing input for PEM chain material. Transport may resolve from upload, stdin, file-backed secret input, or another secret-safe carrier before command execution. |
| `privateKey` | Required | Secret-bearing input for PEM private key material. |
| `passphrase` | Optional | Secret-bearing input for an encrypted private key passphrase. |
| `idempotencyKey` | Optional but recommended | Caller-supplied dedupe key for repeated import attempts. |
| `causationId` | Required when event-driven | Event id or command id that requested the import. |

The command schema must not expose raw file paths, temp-file names, or storage-provider internals
as part of the durable business contract. Entry surfaces may collect from files or uploads, but the
application boundary still receives the same secret-bearing command fields.

## Validation Rules

The command must validate, without leaking secret material in errors, events, logs, or read models:

- the leaf certificate covers the bound hostname according to certificate SAN/CN rules;
- the supplied private key matches the imported leaf certificate;
- `notBefore` is not in the future at import time;
- `expiresAt` is in the future at import time;
- the key/certificate algorithm is supported by the platform policy;
- the chain parses successfully and is not malformed or leafless;
- optional passphrase decrypts the supplied private key when the key is encrypted.

Validation must operate on parsed certificate structures behind an application port or domain
service. Aggregate state and read models keep only safe metadata.

## Admission Flow

The command must:

1. Validate command input shape.
2. Resolve the domain binding.
3. Verify manual-certificate eligibility for the binding.
4. Reject duplicate idempotency reuse when the same idempotency key is paired with conflicting
   imported material or a different target binding.
5. Parse and validate the certificate chain, private key, and optional passphrase.
6. Allocate or resolve certificate state for the binding and create or reuse an import attempt id.
7. Store the certificate chain, private key, and optional passphrase through the secret store.
8. Persist durable certificate state with `source = imported`, safe metadata, secret references,
   latest import attempt metadata, and idempotency linkage.
9. Publish or record `certificate-imported`.
10. Return `ok({ certificateId, attemptId })`.

If secret storage or durable persistence cannot be completed safely, the command must return `err`
and must not publish `certificate-imported`.

## Durable State Minimum

The minimum Code Round write-side contract for imported certificates is:

- certificate source value `imported`;
- certificate-to-domain-binding association;
- safe metadata only:
  `subjectAlternativeNames`, `issuer`, `notBefore`, `expiresAt`, optional fingerprint, and
  key/certificate algorithm;
- secret references for certificate chain, private key, and optional passphrase;
- latest import attempt id;
- idempotency key linkage needed to make repeated imports deterministic.

Raw PEM bodies, decrypted private keys, and passphrase values must not be stored in aggregate state,
events, read models, or structured errors.

## Domain Readiness Interaction

`certificate-imported` may trigger `domain-ready` evaluation when:

- the binding is still durably owned;
- route readiness is already satisfied or later becomes satisfied;
- no TLS-disabled policy disables certificate use.

Importing a valid certificate does not bypass domain ownership or route-readiness gates.

## Domain-Specific Error Codes

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input shape or required secret-bearing fields are missing or malformed before certificate parsing. |
| `not_found` | `certificate-context-resolution` | No | Domain binding does not exist. |
| `certificate_import_not_allowed` | `certificate-admission` | No | Binding policy or binding state does not allow manual import. |
| `conflict` | `certificate-admission` | No | Same idempotency key was reused with conflicting material or a different binding target. |
| `certificate_import_domain_mismatch` | `certificate-import-validation` | No | Imported leaf certificate does not cover the bound hostname. |
| `certificate_import_key_mismatch` | `certificate-import-validation` | No | Private key does not match the leaf certificate. |
| `certificate_import_expired` | `certificate-import-validation` | No | Imported certificate is already expired. |
| `certificate_import_not_yet_valid` | `certificate-import-validation` | No | Imported certificate `notBefore` is in the future. |
| `certificate_import_unsupported_algorithm` | `certificate-import-validation` | No | Imported key/certificate algorithm is not allowed by policy. |
| `certificate_import_malformed_chain` | `certificate-import-validation` | No | Certificate chain cannot be parsed or ordered into a valid leaf/intermediate sequence. |
| `certificate_import_storage_failed` | `certificate-import-storage` | Yes | Secret storage or durable state recording failed before import success could be recorded. |
| `infra_error` | `event-publication` | Conditional | `certificate-imported` could not be safely recorded after durable state was written. |

`certificate-issued` must never be used to represent these import outcomes.

## Entry Surfaces And Secret Handling

Web, CLI, and HTTP/oRPC must dispatch the same command semantics while using surface-appropriate
secret collection:

- Web:
  resource-scoped domain or certificate surfaces may expose manual-certificate import only for
  bindings whose policy is `manual`; the UI may accept paste or upload, must never prefill private
  key/passphrase fields, and must redact secrets from client logs and toasts.
- CLI:
  the canonical entrypoint is `appaloft certificate import <domainBindingId>` with secret-safe
  collection such as file-backed secret input, stdin, or prompt-hidden passphrase input; CLI output
  must never echo raw certificate, private key, or passphrase content.
- HTTP / oRPC:
  the canonical business operation is `POST /api/certificates/import`; transport handling may use
  JSON, multipart, or another secure carrier, but adapter logs and validation responses must expose
  only structured codes, phases, and safe metadata.

All surfaces must reuse the same command schema and must not invent a provider-driven import mode.

## Handler Boundary

The handler must delegate to an application use case and return typed `Result`.

It must not:

- call provider issuance adapters or ACME clients;
- publish `certificate-requested` or `certificate-issued`;
- mutate deployment route snapshots directly;
- update read models directly;
- leak secret-bearing input into logs or errors.

## Current Implementation Notes And Migration Gaps

`certificates.import` is now implemented in the write side, operation catalog, CLI entrypoint,
HTTP/oRPC entrypoint, resource-scoped Web entrypoint, and durable PG/PGlite-backed certificate
secret-store path, and it publishes `certificate-imported` on successful manual import.

Remaining migration gaps:

- none for the normative `certificates.import` contract baseline.

## Open Questions

- None for the current `certificates.import` baseline. Command separation is governed by ADR-009,
  and renewal remains governed by ADR-008.
