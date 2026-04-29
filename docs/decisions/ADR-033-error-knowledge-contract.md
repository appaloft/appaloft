# ADR-033: Error Knowledge Contract

## Status

Accepted

## Context

Appaloft already treats expected failures as structured errors with stable `code`, `category`,
`phase`, details, and retriable behavior. In practice, some entrypoints still collapse those errors
to a human message. That loses the difference between invalid user input, operator-actionable
infrastructure state, provider failure, automatic retry state, and system-owned faults.

Public documentation is now a first-class product surface, and future MCP/agent surfaces need
machine-readable recovery guidance. A public docs URL is useful for humans, but agents and
automation also need stable links to structured guidance, safe details, and allowed remedies.

## Decision

Appaloft defines an Error Knowledge Contract for expected public errors.

The base error remains the source of truth for failure identity:

- `code`
- `category`
- `phase`
- `retryable`
- safe `details`

Known public errors may additionally resolve to error knowledge keyed by `code` plus `phase`. Error
knowledge carries:

- `responsibility`: `user`, `operator`, `system`, `provider`, or `appaloft`;
- `actionability`: `fix-input`, `wait-retry`, `run-diagnostic`, `auto-recoverable`,
  `report-bug`, or `no-user-action`;
- links with explicit rels such as `human-doc`, `llm-guide`, `runbook`, `spec`,
  `source-symbol`, and `support`;
- safe remedies such as retry, diagnostic, command, workflow action, or no user action.

`packages/core` owns the pure contract types. `@appaloft/docs-registry` owns public documentation
and agent-readable guide lookup for known public errors. Entrypoints may enrich errors from the
registry at presentation or transport boundaries, but domain aggregates and value objects must not
depend on public docs URLs.

Human-facing messages are not a machine contract. CLI, Web, HTTP/oRPC, GitHub Actions logs, and
future MCP/tool surfaces must use stable error fields and error knowledge when deciding how to
render links, retries, diagnostics, and recovery affordances.

## Consequences

- Public errors can point to both human docs and LLM/tool-readable guidance without leaking docs
  dependencies into core domain objects.
- Tests can assert error knowledge coverage for known public `(code, phase)` pairs.
- Some existing entrypoints still only print `message`; those are migration gaps and should be
  moved to a shared presenter.
- Error guide content must avoid secrets and must mark commands/remedies as safe by default only
  when they do not mutate or destroy state without an explicit diagnostic gate.

## Governed Specs

- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Public Docs Structure](../documentation/public-docs-structure.md)
- [Public Documentation Test Matrix](../testing/public-documentation-test-matrix.md)
- [Error Knowledge Contract Test Matrix](../testing/error-knowledge-contract-test-matrix.md)

## Migration Gaps

- Shell pre-composition failures, including SSH remote-state preparation and sync-back failures,
  still write only `error.message` in some paths.
- HTTP/oRPC and Web clients do not yet expose a normalized `knowledge` object for every structured
  error response.
- Only the SSH remote-state lock guide is registered in the first slice; additional public errors
  should be added as they become user-visible support or automation pain points.
