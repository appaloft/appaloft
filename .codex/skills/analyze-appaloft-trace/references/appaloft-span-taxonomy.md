# Appaloft Span Taxonomy

Use this reference only when updating the analyzer or when the script output needs explanation.

## Appaloft Application Spans

Known span name prefixes:

- `appaloft.command.{command}`: command bus execution
- `appaloft.query.{query}`: query bus execution
- `appaloft.repository.{aggregate}.{operation}`: aggregate repository work
- `appaloft.read_model.{model}.{operation}`: query-side read model work
- `appaloft.adapter.{adapter}.{operation}`: adapter or integration boundary work
- `appaloft.runtime_logs.{operation}`: runtime log open, bounded collection, and external process work

Known Appaloft attribute keys:

- `appaloft.actor.id`
- `appaloft.actor.kind`
- `appaloft.command.name`
- `appaloft.deployment.id`
- `appaloft.entrypoint`
- `appaloft.error.category`
- `appaloft.error.code`
- `appaloft.handler.name`
- `appaloft.integration.key`
- `appaloft.locale`
- `appaloft.mutation_spec.name`
- `appaloft.query.name`
- `appaloft.read_model.name`
- `appaloft.repository.name`
- `appaloft.resource.id`
- `appaloft.request.id`
- `appaloft.runtime.kind`
- `appaloft.runtime_logs.close_reason`
- `appaloft.runtime_logs.command`
- `appaloft.runtime_logs.follow`
- `appaloft.runtime_logs.line_count`
- `appaloft.runtime_logs.service_name`
- `appaloft.runtime_logs.tail_lines`
- `appaloft.selection_spec.name`
- `appaloft.source.locator`
- `appaloft.target.provider_key`

## Infrastructure Spans

- HTTP server spans are named as `{METHOD} {route}` when a route is available. Relevant attributes include `http.request.method`, `http.route`, `http.response.status_code`, `url.path`, and `appaloft.request.id`.
- Database spans use names such as `db.postgresql.select`. Relevant attributes include `db.system.name`, `db.operation.name`, `db.collection.name`, `server.address`, and `db.response.returned_rows`.

## Classification Preference

Classify by stable Appaloft span names first, then by attributes. If both a Appaloft adapter prefix and an integration key are present, keep the primary category as `adapter` and surface the integration key in span details.
