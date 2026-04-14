# ADR-003: Server Connect Public Versus Internal

Status: Accepted

Date: 2026-04-14

## Decision

`servers.connect` is a first-class lifecycle command that can be dispatched by both public entry points and internal process managers.

Public entry points may expose `servers.connect` for explicit operator actions such as connect, reconnect, retry connectivity, or revalidate connectivity.

Internal process managers may dispatch the same command after `servers.register` when enough provider and credential context exists to verify connectivity.

`servers.test-connectivity` remains a diagnostic/preflight command. It returns a connectivity result to the caller and must not mutate server lifecycle state or publish `server-connected`.

`servers.register` success means server metadata has been accepted. It does not mean connectivity succeeded, proxy bootstrap succeeded, or the server is ready.

## Governed Specs

- [servers.register / servers.connect Command Spec](../commands/servers.register-or-connect.md)
- [Server Bootstrap And Proxy Workflow Spec](../workflows/server-bootstrap-and-proxy.md)
- [Server Bootstrap Error Spec](../errors/server-bootstrap.md)
- [Server Bootstrap Test Matrix](../testing/server-bootstrap-test-matrix.md)
- [Core Operations](../CORE_OPERATIONS.md)

## Implementation Requirements

`servers.connect` must be added to the business operation surface when implemented. It must have a command message, schema, handler, use case, operation-catalog entry, and transport mappings like other business operations.

Both public and internal dispatch paths must use the same command semantics and command bus path. No transport, event handler, or process manager may run provider connectivity mutation logic outside the command/use-case boundary.

After `servers.register`, automatic connection may be scheduled by a process manager when:

- the server metadata is persisted;
- the provider supports connectivity verification;
- required credentials or local execution policy are available;
- no equivalent in-flight connectivity attempt already exists.

If required credentials are missing, the server remains registered and not ready. The process manager must not publish `server-connected` until the connect command verifies connectivity and records the connected lifecycle state.

Duplicate connect attempts must be deduped by `serverId + attemptId` when an attempt id is supplied. Without an attempt id, the use case must prevent duplicate in-flight attempts for the same server and connectivity policy.

`server-connected` may be published only after connected state is durably recorded.

## Consequences

This decision gives users and automation an explicit lifecycle operation while keeping auto-bootstrap possible after registration.

It prevents the diagnostic connectivity command from becoming a hidden state mutation path and keeps CQRS command semantics consistent across CLI, HTTP API, Web, automation, and internal process managers.

## Superseded Open Questions

- Should `servers.connect` be a public command, an internal process-manager command, or both?
- Should `servers.connect` run automatically after registration, only when explicitly requested, or both?
