# Plan: Reusable SSH Credential Rotation

## Governing Sources

- Domain model: `docs/DOMAIN_MODEL.md`
- Operation map: `docs/BUSINESS_OPERATION_MAP.md`
- Public operation catalog source: `docs/CORE_OPERATIONS.md`
- Decisions/ADRs: `docs/decisions/ADR-026-aggregate-mutation-command-boundary.md`
- Global contracts: `docs/errors/model.md`, `docs/errors/neverthrow-conventions.md`, `docs/architecture/async-lifecycle-and-acceptance.md`
- Local specs: `docs/workflows/ssh-credential-lifecycle.md`, `docs/queries/credentials.show.md`, `docs/commands/credentials.rotate-ssh.md`, `docs/errors/credentials.lifecycle.md`
- Test matrix: `docs/testing/ssh-credential-lifecycle-test-matrix.md`
- Implementation plan: `docs/implementation/ssh-credential-lifecycle-plan.md`

## Architecture Approach

- Domain/application placement: add command `credentials.rotate-ssh` under the existing SSH credential lifecycle slice. The command coordinates validation, masked credential read, usage read, safety acknowledgement, aggregate mutation, and persistence.
- Repository/specification/visitor impact: add a named credential rotation mutation spec or reuse a collection-like update/upsert mutation spec without adding repository business verbs such as `rotateWhenInUse`.
- Event/CQRS/read-model impact: command mutates credential state; `credentials.show` remains the read surface for masked credential detail and usage. The first slice does not publish credential rotation events.
- Entrypoint impact: CLI, API/oRPC, Web, and future MCP must all reuse the command input schema. No transport may define parallel rotation input semantics.
- Persistence/migration impact: preserve credential id and server foreign-key/reference state. Persist rotated private-key material and safe metadata such as `rotatedAt`; avoid exposing old or new key material through read models.

## Decision State

- Decision state: no new ADR needed
- Governing decisions: ADR-026
- Rationale: the behavior fits the existing Runtime Topology credential lifecycle, uses an intention-revealing `rotate` command allowed by ADR-026, preserves credential identity and server references, does not introduce async acceptance, does not change aggregate ownership, and does not publish a new event or public integration contract in the first slice. Security and redaction semantics are local to the credential lifecycle command/workflow/error specs.

## Roadmap And Compatibility

- Roadmap target: Phase 4 / `0.6.0` Resource Ownership And CRUD Foundation.
- Version target: Phase 4 / `0.6.0`; Code Round verification is complete and release inclusion follows the normal release gate.
- Compatibility impact: `pre-1.0-policy`; this is a new public command/API/Web capability and a backward-compatible query output extension for rotated metadata.
- Release-note requirement: note that saved SSH credentials can be rotated in place and that users should run server connectivity tests after rotation.
- Migration requirement: none for existing users unless persistence adds `rotatedAt` or equivalent nullable metadata, which should be forward-filled as absent for existing credentials.

## Testing Strategy

- Matrix ids: `SSH-CRED-ROTATE-001` through `SSH-CRED-ROTATE-008`, plus `SSH-CRED-ENTRY-011` through `SSH-CRED-ENTRY-015`.
- Test-first rows: command/use-case safety, PG/PGlite mutation, operation catalog boundary, CLI dispatch, HTTP/oRPC dispatch, Web confirmation, docs/help coverage.
- Acceptance/e2e: one CLI and one HTTP/oRPC dispatch test should prove shared command schema and structured errors. Web should prove exact confirmation and in-use acknowledgement gates before dispatch.
- Contract/integration/unit: application use-case tests cover success, in-use acknowledgement, usage-read failure, missing credential, confirmation mismatch, redaction, and mutation failure. Persistence tests prove id preservation and server references unchanged.

## Risks And Scope Decisions

- Risk: in-place rotation can break every server using the credential if the new key is wrong. Mitigation: usage visibility, exact confirmation, in-use acknowledgement, and post-rotation connectivity-test guidance.
- Risk: public-key metadata can become stale. Mitigation: command input treats provided public key as replacement metadata and allows clearing or preserving only by explicit schema rules in the command spec.
- Risk: users may confuse rotation with connectivity verification. Mitigation: command spec and public docs state that success means credential material was stored, not that SSH connectivity works.
- Closure: public docs content and help registry operation coverage are updated with the active operation.
- Scope decision: audit/event history for credential mutations remains outside this operation unless pulled forward by a separate ADR/spec.
