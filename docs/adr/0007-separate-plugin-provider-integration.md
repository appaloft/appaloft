# ADR 0007: Separate Plugin, Provider, Integration, And Strategy

## Context

Deployment platforms accumulate many extension types. If they are mixed together, the architecture becomes impossible to evolve safely.

## Decision

Keep provider, integration, plugin, and strategy as separate concepts and package groups.

## Consequences

- clearer dependency boundaries
- explicit capability modeling
- lower risk of hard-coded vendor special cases
