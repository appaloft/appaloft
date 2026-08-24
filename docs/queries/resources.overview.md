# `resources.overview`

## Status

Active read-only query for the contextual Dashboard Resource Overview and latest Deployments
destinations.

## Ownership

The query validates that the Resource belongs to the supplied Project and Environment in the current
tenant. It composes safe observation data without becoming a new aggregate or changing Resource and
Deployment mutation ownership.

## Input

- `projectId`: owning Project id;
- `environmentId`: owning Environment id;
- `resourceId`: selected Resource id.

## Output

The response contains Resource identity/kind/lifecycle, current health and public-access summary,
configuration readiness, network summary, capability flags, and at most five latest Deployment
summaries.

It deliberately excludes log lines, metric series, secrets, terminal data, provider credentials,
and unbounded Deployment history. Destination-specific streams or queries start only after their
Resource destination becomes active.

## Entrypoints

- HTTP/oRPC: `GET /api/projects/{projectId}/environments/{environmentId}/resources/{resourceId}/overview`;
- Dashboard: `/projects/{projectId}/resources/{resourceId}/overview?environment={environmentId}` and
  `/projects/{projectId}/resources/{resourceId}/deployments?environment={environmentId}`;
- generated SDK: `appaloft.resources.overview`;
- CLI: not applicable because `resources.show` and `deployments.list --resource-id` remain the compact
  CLI surfaces.

## Tests

- `DASH-DATA-003`: owner consistency, five-item Deployment cap, and sensitive-data absence;
- `DASH-DATA-006`: inactive logs/metrics/configuration/terminal destinations make no requests;
- `DASH-PERF-003`: warm Resource open adds no more than two product-data requests.
