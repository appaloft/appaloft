# resources.list-dependency-bindings Query Spec

## Metadata

- Operation key: `resources.list-dependency-bindings`
- Query class: `ListResourceDependencyBindingsQuery`
- Input schema: `ListResourceDependencyBindingsQueryInput`
- Handler: `ListResourceDependencyBindingsQueryHandler`
- Query service: `ListResourceDependencyBindingsQueryService`
- Domain / bounded context: Dependency Resources / Resource binding read model
- Current status: proposed for Phase 7 Code Round

## Purpose

List active dependency binding summaries for one Resource.

## Input Model

| Field | Required | Domain meaning |
| --- | --- | --- |
| `resourceId` | Yes | Resource whose dependency bindings are listed. |

## Output Model

Returns `schemaVersion = "resources.dependency-bindings.list/v1"`, `items`, and `generatedAt`.

Each item includes safe Resource identity, Dependency Resource identity, dependency kind/source
mode/lifecycle status, target exposure metadata, masked connection summary, binding readiness, and
snapshot readiness.

The query never returns raw passwords, tokens, auth headers, cookies, SSH credentials, provider
tokens, private keys, sensitive query parameters, raw connection URLs, or raw environment values.
