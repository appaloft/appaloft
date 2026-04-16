# Yundu Span Taxonomy

Use this reference only when updating the analyzer or when the script output needs explanation.

## Yundu Application Spans

Known span name prefixes:

- `yundu.command.{command}`: command bus execution
- `yundu.query.{query}`: query bus execution
- `yundu.repository.{aggregate}.{operation}`: aggregate repository work
- `yundu.read_model.{model}.{operation}`: query-side read model work
- `yundu.adapter.{adapter}.{operation}`: adapter or integration boundary work
- `yundu.runtime_logs.{operation}`: runtime log open, bounded collection, and external process work

Known Yundu attribute keys:

- `yundu.actor.id`
- `yundu.actor.kind`
- `yundu.command.name`
- `yundu.deployment.id`
- `yundu.entrypoint`
- `yundu.error.category`
- `yundu.error.code`
- `yundu.handler.name`
- `yundu.integration.key`
- `yundu.locale`
- `yundu.mutation_spec.name`
- `yundu.query.name`
- `yundu.read_model.name`
- `yundu.repository.name`
- `yundu.resource.id`
- `yundu.request.id`
- `yundu.runtime.kind`
- `yundu.runtime_logs.close_reason`
- `yundu.runtime_logs.command`
- `yundu.runtime_logs.follow`
- `yundu.runtime_logs.line_count`
- `yundu.runtime_logs.service_name`
- `yundu.runtime_logs.tail_lines`
- `yundu.selection_spec.name`
- `yundu.source.locator`
- `yundu.target.provider_key`

## Infrastructure Spans

- HTTP server spans are named as `{METHOD} {route}` when a route is available. Relevant attributes include `http.request.method`, `http.route`, `http.response.status_code`, `url.path`, and `yundu.request.id`.
- Database spans use names such as `db.postgresql.select`. Relevant attributes include `db.system.name`, `db.operation.name`, `db.collection.name`, `server.address`, and `db.response.returned_rows`.

## Classification Preference

Classify by stable Yundu span names first, then by attributes. If both a Yundu adapter prefix and an integration key are present, keep the primary category as `adapter` and surface the integration key in span details.
