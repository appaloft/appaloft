# Automatic Route Context Lookup Plan

## Goal

Implement a provider-neutral baseline that resolves hostname/path access failures to safe
resource/deployment/domain/route context through existing read models.

## Steps

1. Add test-matrix rows for automatic route context lookup before implementation.
2. Add application tests for generated access, durable domain binding, server-applied route,
   precedence/confidence, safe not-found, and redaction.
3. Add an adapter integration test proving evidence capture enriches a diagnostic that lacks ids.
4. Implement an application read service that uses `ResourceReadModel`, `DomainBindingReadModel`,
   and `DeploymentReadModel` without adding persistence API.
5. Wire the HTTP diagnostic renderer to call the lookup before evidence recording when route
   context is missing.
6. Synchronize workflow/error/domain/roadmap docs and mark tasks complete.
7. Run targeted tests, typecheck, and lint.

## ADR Decision

No ADR is needed for this slice. The implementation does not add a public operation, change route
ownership, change request-id evidence retention, or change public error contracts.

## Repository API Decision

No new repository API is needed for this baseline. A later indexed lookup must use composable specs
and a persistence visitor rather than `findByHostname` or optional filter bags.
