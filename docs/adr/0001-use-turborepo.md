# ADR 0001: Use Turborepo

## Context

Yundu needs a monorepo with apps, layered packages, shared scripts, and selective task execution.

## Decision

Use Turborepo as the task runner and workspace orchestrator.

## Consequences

- fast filtered builds and test runs
- clear task graph for CI
- supports split apps and many small packages without custom scripting
