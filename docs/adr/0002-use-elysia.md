# ADR 0002: Use Elysia For The Backend HTTP Adapter

## Context

The backend needs a lightweight Bun-native HTTP framework without dragging the domain into framework conventions.

## Decision

Use Elysia for the HTTP adapter only.

## Consequences

- Bun-friendly runtime
- simple adapter boundary
- no framework leakage into `core` or `application`
