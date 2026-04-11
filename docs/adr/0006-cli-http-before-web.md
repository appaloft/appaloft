# ADR 0006: Treat CLI And HTTP As Core Interfaces

## Context

AI agents, IDE tooling, and automation need non-UI interfaces to drive deployments.

## Decision

Center the architecture around shared application use cases used by CLI and HTTP, with web consuming the HTTP contracts.

## Consequences

- web is replaceable
- CLI and future MCP tools can reach parity
- deployment workflows stay backend-owned
