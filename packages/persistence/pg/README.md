# @yundu/persistence-pg

Postgres-compatible persistence adapter backed by Kysely.

Responsibilities:

- schema types, migrations, repository implementations, selection/mutation visitor translation, read models
- readiness checks and migration status
- runtime database selection between external PostgreSQL and embedded PGlite
- one repository implementation file per aggregate root
- read models remain separate from aggregate repositories

Depends on:

- application ports
- core domain types
- Kysely plus Postgres-compatible dialects

Must not:

- leak SQL clients directly to upper layers
- own domain rules that belong in aggregates, handlers, or application services
- define standalone repositories for entities or value objects
