# Read Model Count Queries

## Status

Implemented.

## Context

Dashboard and summary UI surfaces often need only aggregate totals. Calling list queries for those
totals forces transports to fetch row payloads that are not rendered and makes the UI semantics
misleading. Count is a read-model aggregate query, parallel to `list`, `find`, and `findOne`, and
must be represented explicitly in the application operation catalog.

## Decision

Project, deployment target, environment, resource, dependency resource, and deployment read models
expose a first-class `count` method. Application query services call `readModel.count(...)`
directly and never derive totals by loading lists. SQL-backed adapters implement these methods with
`count(...)` aggregate queries while preserving the same organization, lifecycle, project,
environment, status, and preview filtering semantics used by their corresponding list queries.

The public operation catalog exposes these aggregate reads as:

- `projects.count`
- `servers.count`
- `environments.count`
- `resources.count`
- `dependency-resources.count`
- `deployments.count`

The shared response contract is `{ count: number }`. Query inputs reuse each slice's existing list
input filters where relevant.

## UI Contract

Home dashboard numeric totals must call count queries. It may still call list queries only for UI
sections that render row previews, such as the first project relationship rows or latest deployment
activity.

## Acceptance Criteria

- Count query services delegate to `readModel.count` and fail if a list method is used to produce a
  dashboard total.
- PostgreSQL/PGlite read models generate SQL aggregate count queries instead of fetching row data.
- oRPC exposes count methods for all supported read models.
- The home page uses count calls for dashboard totals and keeps list calls only where it renders row
  previews.
- Operation catalog, CORE_OPERATIONS, application exports, contracts, and tests stay synchronized.
