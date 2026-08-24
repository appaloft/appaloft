# `projects.list-summaries`

## Status

Active read-only query for the contextual Dashboard Projects destination.

## Ownership

The query reads Project-owned identity plus bounded observation summaries. It does not introduce a
new aggregate, admit mutations, or move Resource and Deployment lifecycle ownership into Project.
Tenant identity comes from `ExecutionContext`; callers cannot select a tenant.

## Input

- `cursor?`: opaque continuation cursor;
- `limit`: defaults to `24`, maximum `100`;
- `search?`: case-insensitive Project name or slug search;
- `sort`: `recent-activity-desc`, `name-asc`, or `name-desc`.

## Output

Each item contains Project id, name, slug, optional description, bounded active Resource count,
attention count/status, and latest activity time. The response may contain `nextCursor`.

The response never embeds Resource or Deployment collections. Attention and activity are
observation summaries only and cannot authorize a command.

## Entrypoints

- HTTP/oRPC: `GET /api/projects/summaries`;
- Dashboard: `/projects`;
- generated SDK and tool metadata: derived from the operation catalog;
- CLI: not applicable because `projects.list` remains the compact CLI selection surface.

## Tests

- `DASH-DATA-001`: bounded defaults, deterministic sort, and no nested graphs;
- `DASH-DATA-005`: one Project-list request with no per-item fan-out.
