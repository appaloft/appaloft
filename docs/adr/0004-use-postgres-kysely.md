# ADR 0004: Use PostgreSQL And Kysely

## Context

The platform needs a formal production database with migrations, CI parity, and strong SQL control.

## Decision

Use PostgreSQL as the database and Kysely as the only data-access entry point.

## Consequences

- real relational constraints
- type-safe query building
- repositories and read models can stay explicit
