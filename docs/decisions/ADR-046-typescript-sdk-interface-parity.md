# ADR-046: TypeScript SDK Interface Parity

## Status

Accepted

## Context

Phase 9 needs a public TypeScript SDK that external automation and internal black-box tests can use
without turning the SDK into a second application layer. Appaloft already has an operation catalog,
typed HTTP/oRPC routes, public docs coverage decisions, and generated OpenAPI output, but OpenAPI
alone does not preserve Appaloft operation semantics such as command/query kind, catalog key, docs
anchor, authentication policy, error family, or stream behavior.

The SDK boundary is public and release-sensitive. A handwritten SDK facade would drift from
`operation-catalog.ts`, while a generated SDK that only follows HTTP paths would make Appaloft look
like a path-shaped CRUD API instead of an operation client over explicit command/query messages.

## Decision

The TypeScript SDK is generated from the OpenAPI SDK contract enriched with Appaloft-specific
operation metadata.

- `@appaloft/sdk` is a public operation client package over the authenticated HTTP/oRPC contract.
  It must not import `@appaloft/core`, `@appaloft/application`, repositories, handlers, use cases,
  DI tokens, shell composition, persistence adapters, provider SDKs, or CLI local-state helpers.
- OpenAPI generation must annotate every catalog-backed HTTP/oRPC operation with stable
  `x-appaloft-*` metadata:
  - `x-appaloft-operation-key`;
  - `x-appaloft-operation-kind`;
  - `x-appaloft-operation-domain`;
  - `x-appaloft-message-name`;
  - `x-appaloft-docs-href` when the operation has documented public help coverage;
  - `x-appaloft-auth-policy`;
  - `x-appaloft-error-family`;
  - `x-appaloft-streaming`.
- The SDK generator must use the annotated OpenAPI artifact as the source for TypeScript operation
  groups and methods. It must not maintain a handwritten method inventory.
- The public SDK may layer typed resource handles over generated operations when one returned
  resource owns the identity required by its child operations. A resource handle is transport-only
  composition: it may inject parent ids, safe SDK defaults and idempotency keys, unwrap structured
  operation results and expose child handles, but it must not add business operations, bypass the
  generated operation client, or redefine command/query schemas.
- `createAppaloftClient` exposes resource handles as the primary ergonomic surface and retains the
  complete generated operation-result facade under `appaloft.operations`. This keeps interface
  parity inspectable and gives callers an explicit compatibility/error-control escape hatch.
- SDK resource methods throw `AppaloftSdkRequestError` for failed operation results. The error keeps
  the structured HTTP status, code, category, retryability and safe details; it must not parse or
  expose raw response bodies.
- CLI and SDK remain sibling adapters. CLI keeps local parsing, pure SSH, and local-state ownership
  where those entry workflows require it. SDK calls the authenticated HTTP/oRPC API.
- Product-session operations use the accepted Phase 8 product-auth rules. Bootstrap status and
  first-admin bootstrap remain bootstrap-public until the first-admin contract changes. Action
  deploy-token endpoints remain machine-token protected where ADR-043 governs them.
- SDK tests may be used for HTTP/auth/serialization/interface behavior against a running server.
  Domain, application, repository, and adapter unit tests stay at the layer they prove.
- Streaming helpers are generated only when stream behavior is explicitly marked in metadata and
  tested for cancellation and error handling. Until then, streaming can remain a lower-level or
  planned SDK surface.

## Consequences

- OpenAPI becomes the cross-language SDK contract for TypeScript first and future SDK languages
  later.
- Interface parity can be tested by comparing `operation-catalog.ts`, OpenAPI metadata, generated
  SDK files, CLI routes, HTTP/oRPC routes, Web usage, public docs decisions, and generated MCP/tool
  descriptors.
- Missing metadata is a release blocker for public SDK publication because it would allow generated
  clients to drift from Appaloft command/query semantics.
- Resource handles make ownership visible in code (`Sandbox -> Agent -> Run`) without changing the
  underlying aggregate or operation boundaries. `Agent` is an SDK convenience alias for the
  canonical `Sandbox Agent Runtime`, not a new aggregate.
- The SDK can become a stable black-box testing boundary only after auth/session/deploy-token,
  organization scope, 401/403, structured errors, and selected streaming semantics are covered by
  tests.

## Related Specs

- [TypeScript SDK And Interface Parity](../specs/052-typescript-sdk-interface-parity/spec.md)
- [TypeScript SDK And Interface Parity Tasks](../specs/052-typescript-sdk-interface-parity/tasks.md)
- [TypeScript SDK Interface Parity Test Matrix](../testing/typescript-sdk-interface-parity-test-matrix.md)
- [Self-Hosted Action Deploy Token Authorization](./ADR-043-self-hosted-action-deploy-token-authorization.md)
- [Self-Hosted Organization Team Operations](./ADR-045-self-hosted-organization-team-operations.md)
