# TypeScript SDK And Interface Parity Tasks

- [x] Position the SDK/interface-parity target in `BUSINESS_OPERATION_MAP.md` as a post-auth public
  interface workflow, not a new business operation.
- [x] Add the roadmap target after Phase 8 self-hosted auth and organization bootstrap.
- [x] Create this Spec Round artifact with source-of-truth boundaries, scenarios, non-goals, and
  open questions.
- [x] Decide the planning direction for the public SDK substrate: generated OpenAPI is the
  cross-language SDK contract, enriched with Appaloft operation metadata from the operation catalog.
- [x] Add or update an ADR before Code Round for the public SDK package boundary, OpenAPI extension
  contract, generator substrate, auth semantics, streaming behavior, and compatibility policy.
- [x] Define the OpenAPI `x-appaloft-*` extension set for operation key, command/query kind, docs
  anchor, auth policy, error families, and stream behavior.
- [x] Add SDK generation tooling that reads the OpenAPI SDK contract and produces the TypeScript
  operation facade rather than maintaining a handwritten SDK method list.
- [x] Define the SDK package boundary for `@appaloft/sdk`, including exports, type declarations,
  runtime dependencies, and forbidden imports.
- [x] Add an interface-parity test matrix covering operation catalog, OpenAPI metadata, SDK, CLI,
  HTTP/oRPC, Web, and generated MCP/tool operation alignment.
- [x] Add golden tests proving OpenAPI SDK operations and generated SDK methods stay synchronized
  with `operation-catalog.ts`; first close OpenAPI metadata parity through `TS-SDK-OPENAPI-*`.
- [x] Add import-boundary checks proving the SDK does not depend on `core`, `application`,
  persistence, providers, handlers, use cases, DI tokens, or shell composition.
- [x] Add SDK auth/error tests once Phase 8 defines deploy-token, session, organization, 401, and
  403 semantics.
- [x] Add lower-level SDK streaming helper tests for stream-marked operations, cancellation, and
  structured stream errors.
- [x] Add representative SDK black-box tests against a running Appaloft server, limited to
  server/API boundary behavior.
- [x] Update public docs/help anchors for SDK installation, authentication, errors, streaming, and
  operation examples before publishing.
- [x] Add release packaging and publishing checks for `@appaloft/sdk`.
- [x] Run Post-Implementation Sync after Code Round: roadmap, operation map, public docs,
  test matrix, package metadata, release notes, and migration gaps.
