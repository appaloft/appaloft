# Plan: TypeScript SDK And Interface Parity

## Governing Sources

- Domain model: [Domain Model](../../DOMAIN_MODEL.md)
- Operation map: [Business Operation Map](../../BUSINESS_OPERATION_MAP.md)
- Operation catalog source: [Core Operations](../../CORE_OPERATIONS.md)
- Public API generation: `@appaloft/openapi`
- Architecture:
  [ADR-046: TypeScript SDK Interface Parity](../../decisions/ADR-046-typescript-sdk-interface-parity.md),
  [Adapter Command/Query Boundary](../../architecture/adapter-command-query-boundary.md),
  [Async Lifecycle And Acceptance](../../architecture/async-lifecycle-and-acceptance.md)
- Error contracts:
  [Error Model](../../errors/model.md),
  [neverthrow Conventions](../../errors/neverthrow-conventions.md)
- Roadmap: [Product Roadmap](../../PRODUCT_ROADMAP.md)

## Architecture Approach

- Package placement: `packages/sdk` is the public `@appaloft/sdk` package. SDK generation tooling
  lives in `packages/sdk-generator`, not inside the SDK runtime.
- Dependency direction: `@appaloft/sdk` owns its public runtime error/version types and generated
  operation metadata. It has no runtime dependency on private workspace packages and must not import
  `@appaloft/core`,
  `@appaloft/application`, repositories, use cases, handlers, DI tokens, shell composition,
  persistence adapters, provider SDKs, or CLI local-state helpers.
- Generation baseline: use the generated OpenAPI artifact as the cross-language SDK contract.
  Extend OpenAPI operations with `x-appaloft-*` metadata derived from `operation-catalog.ts`,
  command/query kind, docs/help anchors, auth policy, error families, and stream behavior.
- Interface shape: expose operation-grouped client methods such as `projects.create`,
  `deployments.create`, and `deployments.recoveryReadiness`, generated from OpenAPI operation ids
  plus `x-appaloft-operation-key` metadata rather than handwritten parallel semantics.
- Resource shape: decorate the generated client with thin SDK-owned handles for
  `Sandbox -> Agent -> Run`. Handles carry returned ids, call only generated operations, preserve
  explicit overrides and expose the untouched generated result facade under `appaloft.operations`.
  No core/application import or SDK-only route is permitted.
- Multi-language shape: treat TypeScript as the first generated SDK language. Future Python, Go, or
  other SDKs should reuse the same OpenAPI SDK contract and generator metadata, with only
  language-specific runtime code for fetch/HTTP, auth, typed errors, cancellation, pagination, and
  streaming.
- Auth shape: Phase 8 auth/org acceptance is complete for the SDK slice. The SDK supports the
  accepted deploy-token/session headers, organization scope selection through operation inputs, and
  typed 401/403 errors.
- CLI/HTTP parity: keep CLI and HTTP as sibling adapters. CLI keeps local parsing, pure SSH, and
  local state ownership where applicable; SDK uses the authenticated server API. Both reuse the
  same command/query schema vocabulary.
- Internal testing: add SDK-backed black-box tests only for server/auth/serialization/interface
  behavior. Keep domain/application tests close to the layer under test.

## Decision And Spec Gates

- ADR required before Code Round: complete through
  [ADR-046: TypeScript SDK Interface Parity](../../decisions/ADR-046-typescript-sdk-interface-parity.md),
  which freezes the public SDK package boundary, OpenAPI extension contract, generation substrate,
  auth configuration semantics, streaming behavior, and compatibility policy.
- `CORE_OPERATIONS.md` update: not for the SDK surface itself. Update only when a new business
  operation is added or an existing operation changes.
- `operation-catalog.ts` update: not for the SDK surface itself. Code Round should add golden
  parity tests that fail when OpenAPI metadata or SDK surface generation drifts from the catalog.
- Public docs required before release: yes. SDK installation, authentication, error handling,
  streaming limitations, and operation examples need stable public anchors.

## Roadmap And Compatibility

- Roadmap target: post-GA TypeScript SDK ergonomics and release hardening.
- Version target: next feature release after `1.1.0`.
- Compatibility impact: the Sandbox/Agent surface is private preview and may move to resource
  handles in a minor release; the previous generated result facade remains available under
  `appaloft.operations` as the explicit migration path.
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
  - Sandbox, Agent and Run resource handles inject the correct parent ids and defaults;
  - failed resource calls retain structured error fields;
  - the built npm package root imports successfully in Node and Bun.
- The first Code Round closed `TS-SDK-OPENAPI-001`, `TS-SDK-OPENAPI-002`, and
  `TS-SDK-OPENAPI-003`: OpenAPI metadata parity with `operation-catalog.ts`. The next partial Code
  Round added initial SDK generation and package-boundary automation for `TS-SDK-GEN-001` and
  `TS-SDK-BOUNDARY-001`.
- After Phase 8 auth/org acceptance, the SDK runtime added product-session cookie auth,
  deploy-token bearer auth, organization scope via operation input/path/query data, and typed
  structured error handling for `TS-SDK-AUTH-001` and `TS-SDK-ERROR-001`.
- The SDK runtime now has a lower-level stream helper for `TS-SDK-STREAM-001`. Generated
  operation-specific streaming facades can build on this helper once publication/docs shape is
  settled.
- Public SDK reference docs now cover installation, authentication, operation examples, structured
  errors, and streaming under the stable `typescript-sdk.operation-client` help topic.
- `TS-SDK-BLACKBOX-001` now has a representative running-server smoke in
  `packages/sdk/test/running-server-smoke.test.ts`: the SDK calls a locally served Elysia/oRPC
  HTTP mount for project create/list/show with product-session auth, while command/query buses are
  stubbed to keep the test at the server/API boundary.
- `TS-SDK-RELEASE-001` now verifies that `@appaloft/sdk` is prepared as a public npm package with
  generated operation descriptors, built ESM JavaScript, declaration files, public package
  metadata, and no runtime workspace dependencies. The release npm job publishes `packages/sdk`
  after `release:npm:prepare` builds it.
- Use SDK e2e tests for black-box API confidence. Keep command/query handler tests and domain
  tests at their native layers.

## Risks And Migration Gaps

- Generated high-level streaming facade semantics remain a later enhancement; the lower-level
  streaming helper remains the published initial stream surface.
- A handwritten SDK facade can drift from the operation catalog. The TypeScript SDK must be
  generated from the same OpenAPI SDK contract intended for future non-TypeScript SDKs.
- Resource handles can drift if they invent routes or schemas. Tests must prove every handle calls
  a generated method, and `appaloft.operations` remains the canonical complete inventory.
- Re-exporting too much from contracts could accidentally publish internal DTOs. The first SDK
  should expose only public operation types and safe error shapes.
- Streaming helpers may expose transport details too early. Treat them as explicit subpath or
  lower-level API until lifecycle and cancellation semantics are tested.
- The existing private `@appaloft/orpc` client is useful input but is not itself the public SDK
  boundary because it also owns server route construction.
- OpenAPI alone does not carry enough Appaloft semantics for DDD/interface parity. Missing
  `x-appaloft-*` metadata would let generated SDKs drift into path-shaped CRUD clients instead of
  operation clients.
