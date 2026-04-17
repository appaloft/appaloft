---
name: analyze-appaloft-trace
description: Analyze Appaloft OpenTelemetry traces from Jaeger trace URLs, Jaeger API JSON, local trace JSON files, or trace IDs. Use when Codex needs to fetch a Jaeger trace, extract the trace ID, summarize latency, identify the critical path, group spans by Appaloft command/query/repository/read-model/adapter/database/http categories, or explain performance/errors using Appaloft span naming and attributes.
---

# Analyze Appaloft Trace

## Workflow

1. Extract the trace ID from the user's input. Accept Jaeger UI URLs such as `http://localhost:16686/trace/{traceId}`, Jaeger API URLs such as `/api/traces/{traceId}`, raw trace IDs, local JSON files, or stdin JSON.
2. Run `packages/observability/scripts/analyze-jaeger-trace.ts` with Bun to fetch or read the trace and produce a compact summary. Prefer the script output over loading the full Jaeger JSON into context.
3. Use the summary to answer with:
   - overall trace duration, span count, services, and root span
   - slowest categories and spans
   - longest causal path
   - error spans and relevant Appaloft error attributes
   - actionable performance interpretation tied to Appaloft span conventions
4. If the task requires changing classification rules, read `references/appaloft-span-taxonomy.md` before editing the script.

## Script

Run from the repository root:

```bash
bun packages/observability/scripts/analyze-jaeger-trace.ts "http://localhost:16686/trace/{traceId}"
```

Equivalent package script:

```bash
bun run --cwd packages/observability trace:analyze -- "http://localhost:16686/trace/{traceId}"
```

Useful options:

```bash
bun packages/observability/scripts/analyze-jaeger-trace.ts {traceId} --base-url http://localhost:16686
bun packages/observability/scripts/analyze-jaeger-trace.ts trace.json --top 20
bun packages/observability/scripts/analyze-jaeger-trace.ts --stdin --json < trace.json
```

The CLI lives in `packages/observability` so it can directly import Appaloft span attribute constants from `@appaloft/application`. Keep the skill as orchestration and interpretation guidance, not the owner of project-specific analyzer code.

Environment:

- `JAEGER_BASE_URL`: default base URL for raw trace IDs. Defaults to `http://localhost:16686`.

## Interpretation Rules

- Treat `appaloft.command.*`, `appaloft.query.*`, `appaloft.repository.*`, `appaloft.read_model.*`, and `appaloft.adapter.*` spans as Appaloft-defined application spans.
- Treat `db.*` spans or spans with `db.system.name` as database work.
- Treat HTTP method span names like `GET /api/projects/:id` as server boundary spans.
- Prefer low-cardinality route/name fields for conclusions. Do not infer business identity from path IDs unless the trace attributes explicitly include stable Appaloft fields.
- Mention that summed span duration can double-count nested spans. Use self-time estimates and the causal path when deciding where time is concentrated.

## References

- `references/appaloft-span-taxonomy.md`: current Appaloft span categories and attribute keys used by the analyzer.
