# ADR 0003: Use tsyringe Only At The Composition Root

## Context

Yundu needs explicit dependency assembly but must avoid framework-style global container usage.

## Decision

Use `tsyringe` only in `apps/shell` composition/bootstrap code.

## Consequences

- explicit tokens and registrations
- constructor injection stays the norm
- no service locator spread through business logic
