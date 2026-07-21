# TypeScript SDK And Interface Parity

## Status

- Round: Code Round / Post-Implementation Sync
- Artifact state: SDK/interface-parity slice accepted for Phase 9 / `0.11.0`
- Roadmap dependency: Phase 8 self-hosted auth and organization bootstrap is accepted. SDK
  publication, interface-parity checks, and representative SDK running-server coverage are now
  automated for the SDK slice.

## Business Outcome

Appaloft should have a published TypeScript SDK for external automation and internal black-box tests
without turning the SDK into a parallel application layer. The SDK is an operation client over the
same authenticated HTTP/oRPC contracts used by Web and external automation, with generated OpenAPI
as the cross-language public contract artifact. CLI, HTTP/oRPC, Web, SDK, and generated MCP/tool
descriptors remain sibling entrypoints over the operation catalog.

This makes Appaloft easier to test and automate while preserving the product rule that business
behavior lives in explicit command/query operations and their application handlers, not in transport
adapters or client convenience wrappers.

The TypeScript SDK is the first language implementation of the generated SDK line, not a
handwritten special case. Future Python, Go, or other language SDKs should be generated from the
same OpenAPI artifact plus Appaloft operation metadata extensions.

## Source Of Truth

- [Business Operation Map](../../BUSINESS_OPERATION_MAP.md)
- [Core Operations](../../CORE_OPERATIONS.md)
- [ADR-046: TypeScript SDK Interface Parity](../../decisions/ADR-046-typescript-sdk-interface-parity.md)
- [Adapter Command/Query Boundary](../../architecture/adapter-command-query-boundary.md)
- [Error Model](../../errors/model.md)
- [neverthrow Conventions](../../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../../architecture/async-lifecycle-and-acceptance.md)
- [Product Roadmap](../../PRODUCT_ROADMAP.md)
- [TypeScript SDK Interface Parity Test Matrix](../../testing/typescript-sdk-interface-parity-test-matrix.md)
- `@appaloft/openapi` generated public API contract

## Ubiquitous Language

| Term | Meaning | Context |
| --- | --- | --- |
| TypeScript SDK | Published package that exposes typed operation methods for JavaScript and TypeScript consumers over the authenticated HTTP/oRPC contract. | Public interface |
| Operation client | Client facade whose methods map to operation catalog entries and command/query input schemas. | Interface parity |
| OpenAPI SDK contract | Generated OpenAPI artifact used as the stable cross-language SDK generation input. | Public interface |
| Appaloft OpenAPI extension | `x-appaloft-*` metadata that preserves operation catalog semantics, command/query kind, docs anchors, auth policy, error families, and stream behavior in the OpenAPI artifact. | Public interface |
| SDK generator | Build-time tool that reads the OpenAPI SDK contract and Appaloft extensions to generate language SDK operation methods, types, and parity checks. | Public interface |
| Interface parity | CLI, HTTP/oRPC, Web, SDK, and generated MCP/tool surfaces use the same operation keys, schemas, error contracts, and public docs/help anchors. | Public interface |
| SDK test boundary | Internal test style that uses the published SDK against a running Appaloft server only when the server/API boundary is the behavior under test. | Testing |
| Resource handle | SDK object that carries a returned resource identity and exposes only child operations that can be derived from generated operation contracts. | Public interface |
| Agent | SDK convenience alias for one Sandbox Agent Runtime subordinate to a Sandbox. It does not introduce a second domain aggregate. | Public interface compatibility alias |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| TS-SDK-SPEC-001 | SDK follows operation catalog through OpenAPI metadata | An operation appears in `CORE_OPERATIONS.md` and `operation-catalog.ts` with HTTP/oRPC transport metadata | The OpenAPI SDK contract and SDK surface are generated | The OpenAPI operation includes Appaloft operation metadata, and the SDK exposes the operation using the catalog key/grouping and the shared command/query input schema without inventing an SDK-only business method. |
| TS-SDK-SPEC-002 | SDK respects auth baseline | Phase 8 auth/org rules define deploy-token, session, organization, 401, and 403 semantics | A caller configures the SDK | The SDK supports the accepted auth headers/session behavior and returns typed errors without branching on raw message text. |
| TS-SDK-SPEC-003 | SDK stays outside core/application | The SDK package is built | Import-boundary checks run | The SDK does not import `@appaloft/core`, `@appaloft/application`, repository ports, command/query handlers, use cases, DI tokens, or shell composition. |
| TS-SDK-SPEC-004 | CLI and HTTP remain sibling adapters | A CLI command and SDK method invoke the same business operation | Interface parity tests inspect dispatch/contract behavior | CLI parses flags and dispatches through command/query buses; SDK calls authenticated HTTP/oRPC; neither redefines business input schemas or embeds domain policy. |
| TS-SDK-SPEC-005 | Internal tests use the right boundary | A test suite needs to prove HTTP/auth/serialization behavior | The test is written | It may use the published SDK against a running Appaloft server. Domain/application behavior tests still use direct domain objects, handlers, use cases, buses, or testkit fixtures instead of forcing everything through the SDK. |
| TS-SDK-SPEC-006 | Public package release is intentional | Release packaging prepares npm artifacts | Release preflight runs | `@appaloft/sdk` has exports, type declarations, package metadata, compatibility notes, docs/help anchors, and release notes aligned with the roadmap and operation catalog. |
| TS-SDK-SPEC-007 | Non-TS SDKs reuse the same generator contract | A future Python, Go, or other language SDK is added | The SDK package is generated | It uses the same OpenAPI SDK contract and Appaloft extensions as the TypeScript SDK, with only language-specific runtime code for auth, transport, errors, cancellation, and streaming. |
| TS-SDK-SPEC-008 | Sandbox ownership is visible in the SDK | A Sandbox create operation returns a ready descriptor | The caller creates an Agent and submits a Run | The caller can use `sandbox.agents.create({ harness: "pi" })` and `agent.runs.create({ task })`; the SDK injects parent ids, admitted Pi template default, fresh context and idempotency keys into the existing generated operations. |
| TS-SDK-SPEC-009 | Generated operation facade remains available | A caller needs non-throwing structured operation results or an operation not covered by a resource handle | The caller uses `appaloft.operations` | The complete generated operation facade remains available with the existing `AppaloftSdkOperationResult` behavior and no SDK-only route or business method. |
| TS-SDK-SPEC-010 | Published ESM entry is executable | Release packaging builds `@appaloft/sdk` | Node or Bun imports the package root | `createAppaloftClient` is defined and callable from the published `dist/index.js`; release tests execute the built package rather than only checking that files exist. |

## Boundaries

- The SDK is a public client package, not a domain, application, shell, or persistence package.
- The SDK may depend on public contracts, HTTP/oRPC client machinery, error DTOs, and generated
  operation metadata.
- The SDK operation facade must be generated from the OpenAPI SDK contract plus Appaloft extensions,
  not maintained as a handwritten operation list.
- The SDK must not depend on `core`, `application`, repositories, use cases, handlers, DI tokens,
  `tsyringe`, shell bootstrap, persistence packages, provider SDKs, or local CLI state helpers.
- The SDK does not make CLI call HTTP by default. CLI remains a local adapter where local or SSH
  runtime ownership is part of the entry workflow.
- The SDK may be used by tests only when the running server boundary is relevant. Lower-level tests
  should keep using the layer they are proving.
- Cross-language SDKs may live under future `sdks/<language>` packages or separate release
  repositories, but their generated operation surface must come from the same OpenAPI SDK contract.

## Public Surfaces

- Package: future `@appaloft/sdk` npm package.
- Typed facade: `createAppaloftClient({ baseUrl, auth })` returns resource handles for ownership-led
  flows such as `Sandbox -> Agent -> Run`, plus the complete generated operation-result facade at
  `appaloft.operations`.
- API contract: generated OpenAPI SDK contract enriched with Appaloft operation metadata.
- API transport: authenticated HTTP/oRPC routes after Phase 8 auth/org baseline.
- Generator: future SDK generation tooling that consumes OpenAPI plus `x-appaloft-*` extensions for
  TypeScript first and later non-TypeScript SDKs.
- Docs/help: public SDK reference and per-operation docs anchor decisions must align with the
  operation catalog.
- Tests: SDK e2e/smoke coverage over running server, plus import-boundary and operation parity
  checks.
- Release: package manifest, generated declarations, changelog/release notes, and package
  publishing preflight.

## Non-Goals

- Publishing application commands, query handlers, use cases, repositories, aggregates, or value
  objects as SDK API.
- Adding SDK-only business operations or generic CRUD helpers that do not map to operation catalog
  entries.
- Handwriting the TypeScript SDK operation facade as a one-off client that future language SDKs
  cannot share.
- Making all internal tests use the SDK.
- Forcing CLI to use HTTP when it is acting as a local adapter or pure CLI/SSH entry workflow.
- Adding new business endpoints in this Spec Round.

## Open Questions

- Should `@appaloft/contracts` remain private with SDK type re-exports, or become a separate
  public advanced package later?
- Which streaming operations need first-class SDK helpers in the initial release versus lower-level
  transport escape hatches?
- Should the SDK expose TanStack Query helpers as a separate subpath, or keep Web-specific query
  utilities in `@appaloft/orpc` until the SDK public shape stabilizes?
- Should the SDK generator live as an internal package in this repository first, or as a reusable
  release tool once the first non-TypeScript SDK is planned?

## Facade Design Notes

PocketBase's collection/resource style is ergonomic because users start from a stable resource noun,
but Appaloft operations are not generic CRUD rows. The facade therefore uses catalog operation keys
instead of dynamic collection names. Stripe's generated resource clients show the value of explicit
method groups and stable errors; Appaloft follows that shape while preserving result objects instead
of moving to throw-only behavior. Octokit's endpoint metadata and route interpolation match
Appaloft's operation catalog well, so the facade keeps the descriptor-backed request path available
for route-level disambiguation. Supabase JS is fluent and domain-oriented, but its query-builder
style would blur Appaloft command/query boundaries, so this facade does not introduce chained query
builders. Linear's SDK is close to the desired product API feel, but Appaloft keeps operation keys as
the cross-language source of truth so Python, Go, and Rust SDKs can generate the same grouped
surface.

Facade names are generated from operation keys with language-friendly identifier rules:
kebab-case segments become camelCase, dots become group nesting, and duplicate HTTP route variants
for the same operation key choose one default facade descriptor. Streaming operation keys such as
`deployments.stream-events` prefer the streaming descriptor; non-streaming keys prefer the
non-streaming descriptor. Operation descriptors are generated internals, not public SDK API.

The TypeScript facade accepts one operation input object. Fields matching route path parameters are
interpolated into the path. Remaining fields default to query parameters for `GET`, `DELETE`, and
streaming operations, and to JSON body for other methods. Callers can always pass explicit
`pathParams`, `query`, or `body` to override that split.

Resource handles do not replace this generated facade. They call it and carry only identities that
were returned by the server. The first ownership-led chain is:

```ts
const sandbox = await appaloft.sandboxes.create(input);
const agent = await sandbox.agents.create({ harness: "pi" });
const run = await agent.runs.create({ task });
```

The SDK maps the public `Agent` alias to the canonical Sandbox Agent Runtime operation, defaults Pi
to the admitted `aht_pi_managed_v1` harness template used by the CLI, defaults Run context to
`fresh`, and generates idempotency keys when callers omit them. Callers can override the template,
context and idempotency keys explicitly. Failed resource operations throw a structured
`AppaloftSdkRequestError`; callers that prefer non-throwing operation results use
`appaloft.operations`.

## Current Implementation Notes And Migration Gaps

- `packages/orpc` already owns typed business transport routes and has a typed client helper for
  Web/internal usage, but the package is private and depends on server-side route construction.
- `packages/openapi` already generates public HTTP API metadata and is the right place to extend
  the OpenAPI artifact with Appaloft operation metadata for SDK generation.
- ADR-046 accepts the SDK package boundary and OpenAPI `x-appaloft-*` metadata contract. OpenAPI
  metadata parity (`TS-SDK-OPENAPI-*`), initial SDK generation tooling (`TS-SDK-GEN-001`), and the
  `@appaloft/sdk` import-boundary check (`TS-SDK-BOUNDARY-001`) are implemented.
- `packages/sdk-generator` collects Appaloft operation descriptors from annotated OpenAPI metadata
  and renders a reproducible TypeScript operation facade source string plus a committed public
  facade manifest snapshot. The package is build-time tooling and does not maintain a handwritten
  method inventory.
- The generator now also renders language-friendly facade paths and a generated
  `GeneratedAppaloftClient` TypeScript interface from operation metadata. This closes the initial
  high-level facade gap for TypeScript while keeping the same path tree suitable for future
  Python, Go, or Rust generators.
- `packages/sdk` defines the runtime SDK package boundary and exposes `createAppaloftClient` as the
  public root API. It has no runtime dependencies, uses generated operation descriptors internally,
  supports product-session cookie auth, deploy-token bearer auth, operation input/path/query
  organization scoping, and typed structured errors without parsing human message text. Unexpected
  HTML/non-JSON responses remain sanitized; HTTP 502, 503, and 504 variants are classified as
  retriable transport failures while non-gateway variants remain non-retriable.
- The SDK root does not export generated descriptors, descriptor request clients, or low-level
  `request(...)`/`stream(...)` helpers. Those remain package-internal implementation details for
  transport tests and repository-internal adapters.
- Streaming facade methods return `AsyncIterable` values; they are not converted to callback APIs
  or throw-only request helpers.
- Public SDK reference docs are active at
  `/docs/reference/typescript-sdk/#typescript-sdk-operation-client` and
  `/docs/en/reference/typescript-sdk/#typescript-sdk-operation-client`. They cover installation,
  base URL configuration, product-session cookie auth, deploy-token bearer auth, organization
  scoping, operation examples, structured error handling, and lower-level streaming behavior.
- `packages/sdk/test/running-server-smoke.test.ts` covers `TS-SDK-BLACKBOX-001` by starting the
  real Elysia/oRPC HTTP mount on an ephemeral local port and exercising representative
  project create/list/show calls through the SDK with product-session authorization. The command
  and query buses remain stubbed so the test proves the server/API/serialization/auth boundary,
  not persistence or project-domain policy.
- Sandbox resource handles now expose `sandboxes.create -> sandbox.agents.create ->
  agent.runs.create` plus Sandbox-scoped file, exec and terminate methods. They call the generated
  operation client, while `appaloft.operations` retains the complete non-throwing facade.
- The SDK npm build now uses TypeScript ESM emission with explicit `.js` relative imports. Release
  tests import the built package in Node and Bun, closing the malformed package-root re-export gap.
- `scripts/test/sdk-release-packaging.test.ts` and `release:npm:prepare -- --sdk-only` cover
  `TS-SDK-RELEASE-001`: `@appaloft/sdk` builds to `dist/index.js` plus `dist/index.d.ts`, carries
  generated operation descriptor JavaScript and declarations, carries public npm metadata,
  contains no runtime `workspace:*` dependencies, and is included in the release npm publish job.
- `@appaloft/ai-mcp` already generates tool descriptors from the operation catalog, proving the
  catalog can drive additional interface surfaces.
- No `CORE_OPERATIONS.md` or `operation-catalog.ts` row is added for the SDK itself because the SDK
  is an interface surface over existing operations, not a business operation.
- The operation catalog and OpenAPI metadata do not yet expose enough stable schema-to-TypeScript
  mappings for per-operation input/output DTO aliases in the generated facade. The current facade
  therefore types methods through the shared SDK result and input helpers while preserving result
  behavior. Generator TODO: attach request body, query, path, response, and stream envelope schema
  names to operation descriptors, then emit per-operation method signatures from those schema ids.
