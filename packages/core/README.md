# @yundu/core

Pure domain model for Yundu.

Responsibilities:

- entity and aggregate root base classes, aggregates, value objects, domain errors, domain events
- runtime plan, deployment plan, environment snapshot, capability enums
- bounded contexts under `src/workspace`, `configuration`, `runtime-topology`, `workload-delivery`, `dependency-resources`, `release-orchestration`, `identity-governance`, and `extensibility`

Depends on:

- no framework or infrastructure package

Must not:

- import Elysia, tsyringe, Kysely, postgres drivers, CLI parsers, or UI code
- perform IO

Canonical references:

- `docs/DOMAIN_MODEL.md` for aggregate, entity, and value-object boundaries
- root-level files in `src/*.ts` are compatibility re-exports only
