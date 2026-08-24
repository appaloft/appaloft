# `project-environments.overview`

## Status

Active read-only query for the contextual Dashboard Project Overview destination.

## Ownership

The query composes Project and Environment identity with bounded Resource observation summaries. It
does not move Resource, Deployment, health, access, or configuration lifecycle ownership into the
Project. Tenant identity comes from `ExecutionContext`; the supplied Project and Environment must
belong to that tenant and to each other.

## Input

- `projectId`: owning Project id;
- `environmentId`: active Environment id;
- `cursor?`: opaque Resource continuation cursor;
- `limit`: defaults to `50`, maximum `100`;
- `search?`: case-insensitive Resource name or slug search;
- `sort`: `name-asc`, `name-desc`, `recent-activity-desc`, or `attention-desc`;
- `health?`: optional `healthy`, `attention`, or `unknown` observation filter.

## Output

The response contains Project and active Environment identity, active Environment choices, a bounded
Resource page, an optional next cursor, an attention summary, and generation time. Each Resource row
contains only identity plus current health/access, latest Deployment summary, and attention state.

The query never performs a Resource-by-Resource health or Deployment request. Observation summaries
cannot authorize a mutation; commands continue to validate authoritative owner state.

## Entrypoints

- HTTP/oRPC: `GET /api/projects/{projectId}/environments/{environmentId}/overview`;
- Dashboard: `/projects/{projectId}/overview?environment={environmentId}`;
- generated SDK: `appaloft.projectEnvironments.overview`;
- CLI: not applicable because compact Project/Resource selection uses existing list/show operations.

## Tests

- `DASH-DATA-002`: bounded projection, deterministic sort/cursor, and no row fan-out;
- `DASH-DATA-004`: observation state cannot admit a command;
- `DASH-DATA-005`: one Project Overview read with no per-Resource request pattern.
