# TypeScript SDK And Interface Parity

## Status

- Round: Spec Round
- Artifact state: planned post-auth candidate for Phase 9 / `1.0.0-rc`
- Roadmap dependency: Phase 8 self-hosted auth and organization bootstrap must be accepted before
  SDK publication or SDK-driven internal smoke testing becomes release-gated.

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
- [Adapter Command/Query Boundary](../../architecture/adapter-command-query-boundary.md)
- [Error Model](../../errors/model.md)
- [neverthrow Conventions](../../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../../architecture/async-lifecycle-and-acceptance.md)
- [Product Roadmap](../../PRODUCT_ROADMAP.md)
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

## Current Implementation Notes And Migration Gaps

- `packages/orpc` already owns typed business transport routes and has a typed client helper for
  Web/internal usage, but the package is private and depends on server-side route construction.
- `packages/openapi` already generates public HTTP API metadata and is the right place to extend
  the OpenAPI artifact with Appaloft operation metadata for SDK generation.
- `@appaloft/ai-mcp` already generates tool descriptors from the operation catalog, proving the
  catalog can drive additional interface surfaces.
- Phase 8 auth/org behavior is not yet accepted, so SDK authentication and organization scoping
  must remain planned rather than published.
- No `CORE_OPERATIONS.md` or `operation-catalog.ts` row is added for the SDK itself because the SDK
  is an interface surface over existing operations, not a business operation.
