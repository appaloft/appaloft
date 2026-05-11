# Plan: TypeScript SDK And Interface Parity

## Governing Sources

- Domain model: [Domain Model](../../DOMAIN_MODEL.md)
- Operation map: [Business Operation Map](../../BUSINESS_OPERATION_MAP.md)
- Operation catalog source: [Core Operations](../../CORE_OPERATIONS.md)
- Public API generation: `@appaloft/openapi`
- Architecture:
  [Adapter Command/Query Boundary](../../architecture/adapter-command-query-boundary.md),
  [Async Lifecycle And Acceptance](../../architecture/async-lifecycle-and-acceptance.md)
- Error contracts:
  [Error Model](../../errors/model.md),
  [neverthrow Conventions](../../errors/neverthrow-conventions.md)
- Roadmap: [Product Roadmap](../../PRODUCT_ROADMAP.md)

## Architecture Approach

- Package placement: add a future `packages/sdk` package published as `@appaloft/sdk`. If a
  generator package is needed, place it in a dedicated tooling package such as
  `packages/sdk-generator` rather than inside the SDK runtime.
- Dependency direction: `@appaloft/sdk` may consume public contracts, HTTP/oRPC client plumbing,
  generated operation metadata, and safe error DTOs. It must not import `@appaloft/core`,
  `@appaloft/application`, repositories, use cases, handlers, DI tokens, shell composition,
  persistence adapters, provider SDKs, or CLI local-state helpers.
- Generation baseline: use the generated OpenAPI artifact as the cross-language SDK contract.
  Extend OpenAPI operations with `x-appaloft-*` metadata derived from `operation-catalog.ts`,
  command/query kind, docs/help anchors, auth policy, error families, and stream behavior.
- Interface shape: expose operation-grouped client methods such as `projects.create`,
  `deployments.create`, and `deployments.recoveryReadiness`, generated from OpenAPI operation ids
  plus `x-appaloft-operation-key` metadata rather than handwritten parallel semantics.
- Multi-language shape: treat TypeScript as the first generated SDK language. Future Python, Go, or
  other SDKs should reuse the same OpenAPI SDK contract and generator metadata, with only
  language-specific runtime code for fetch/HTTP, auth, typed errors, cancellation, pagination, and
  streaming.
- Auth shape: wait for Phase 8 auth/org acceptance before freezing SDK configuration. The SDK
  should support the accepted deploy-token/session headers, organization scope selection, and typed
  401/403 errors.
- CLI/HTTP parity: keep CLI and HTTP as sibling adapters. CLI keeps local parsing, pure SSH, and
  local state ownership where applicable; SDK uses the authenticated server API. Both reuse the
  same command/query schema vocabulary.
- Internal testing: add SDK-backed black-box tests only for server/auth/serialization/interface
  behavior. Keep domain/application tests close to the layer under test.

## Decision And Spec Gates

- ADR required before Code Round: yes, because the implementation will freeze the public SDK
  package boundary, OpenAPI extension contract, generation substrate, auth configuration semantics,
  streaming behavior, and compatibility policy.
- `CORE_OPERATIONS.md` update: not for the SDK surface itself. Update only when a new business
  operation is added or an existing operation changes.
- `operation-catalog.ts` update: not for the SDK surface itself. Code Round should add golden
  parity tests that fail when OpenAPI metadata or SDK surface generation drifts from the catalog.
- Public docs required before release: yes. SDK installation, authentication, error handling,
  streaming limitations, and operation examples need stable public anchors.

## Roadmap And Compatibility

- Roadmap target: Phase 9, after Phase 8 self-hosted auth and organization bootstrap.
- Version target: `1.0.0-rc` line unless explicitly pulled forward after auth closes.
- Compatibility impact: `pre-1.0-policy`; new public npm package and public client API. Avoid
  broad compatibility promises until auth/org and operation catalog freeze rules are accepted.
- Release notes: must call out that the SDK is an operation client over authenticated HTTP/oRPC,
  not an embedded application runtime.

## Testing Strategy

- Add an interface-parity test matrix before Code Round. Initial rows should cover:
  - every public operation with HTTP/oRPC transport metadata appears in the OpenAPI SDK contract;
  - every OpenAPI SDK operation has `x-appaloft-operation-key`, command/query kind, docs anchor,
    and auth/error metadata where applicable;
  - every SDK method maps to an operation catalog key;
  - every SDK input type reuses the command/query schema or generated contract type;
  - TS SDK generated operation files are reproducible from the OpenAPI SDK contract;
  - SDK imports reject core/application/persistence/provider/shell dependencies;
  - auth/session/deploy-token headers follow Phase 8 semantics;
  - 401/403 and structured errors are typed and do not rely on message text;
  - SDK e2e tests can create/list/show representative resources against a running PGlite server;
  - streaming/read-follow helpers have explicit behavior and cancellation semantics.
- Use SDK e2e tests for black-box API confidence. Keep command/query handler tests and domain
  tests at their native layers.

## Risks And Migration Gaps

- Publishing before Phase 8 auth closes would bake unstable auth and organization semantics into a
  public package.
- A handwritten SDK facade can drift from the operation catalog. The TypeScript SDK must be
  generated from the same OpenAPI SDK contract intended for future non-TypeScript SDKs.
- Re-exporting too much from contracts could accidentally publish internal DTOs. The first SDK
  should expose only public operation types and safe error shapes.
- Streaming helpers may expose transport details too early. Treat them as explicit subpath or
  lower-level API until lifecycle and cancellation semantics are tested.
- The existing private `@appaloft/orpc` client is useful input but is not itself the public SDK
  boundary because it also owns server route construction.
- OpenAPI alone does not carry enough Appaloft semantics for DDD/interface parity. Missing
  `x-appaloft-*` metadata would let generated SDKs drift into path-shaped CRUD clients instead of
  operation clients.
