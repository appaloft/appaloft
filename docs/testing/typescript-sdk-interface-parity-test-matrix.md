# TypeScript SDK Interface Parity Test Matrix

## Normative Contract

Tests for TypeScript SDK and interface parity must prove that public SDK generation follows the
same operation catalog, HTTP/oRPC routes, command/query schemas, public docs coverage, auth/error
contracts, and stream semantics as CLI, Web, generated OpenAPI, and generated MCP/tool descriptors.

## Global References

- [ADR-046: TypeScript SDK Interface Parity](../decisions/ADR-046-typescript-sdk-interface-parity.md)
- [TypeScript SDK And Interface Parity](../specs/052-typescript-sdk-interface-parity/spec.md)
- [Adapter Command/Query Boundary](../architecture/adapter-command-query-boundary.md)
- [Error Model](../errors/model.md)
- [Self-Hosted Product Auth Errors](../errors/self-hosted-product-auth.md)
- [Self-Hosted Action Auth Error Spec](../errors/self-hosted-action-auth.md)

## Matrix

| Test ID | Layer | Case | Expected result |
| --- | --- | --- | --- |
| TS-SDK-OPENAPI-001 | OpenAPI contract | Catalog-backed HTTP/oRPC operations carry Appaloft metadata | Each OpenAPI operation that maps to an operation catalog HTTP/oRPC route includes operation key, kind, domain, message name, docs href when documented, auth policy, error family, and streaming flag. |
| TS-SDK-OPENAPI-002 | OpenAPI contract | Catalog/OpenAPI route parity | Every operation catalog entry with HTTP/oRPC route metadata appears in the OpenAPI SDK contract by normalized method and path. |
| TS-SDK-OPENAPI-003 | OpenAPI contract | No SDK-only operations | Every OpenAPI operation annotated with `x-appaloft-operation-key` maps back to exactly one operation catalog entry. |
| TS-SDK-GEN-001 | SDK generator | Generated TypeScript operation facade | Generated SDK operation groups and methods are reproducible from OpenAPI operation ids plus `x-appaloft-operation-key` metadata, without a handwritten method inventory. |
| TS-SDK-FACADE-001 | SDK runtime | Typed facade dispatch | `createAppaloftClient` exposes generated operation-key groups such as `projects.create`, `projects.list`, `projects.show`, nested kebab-case groups, explicit path/query/body overrides, callable group nodes, and streaming facade methods while preserving SDK result and stream semantics. |
| TS-SDK-FACADE-002 | SDK generator | Public facade manifest snapshot | The generated public SDK facade entry list is committed as `appaloft.<group>.<method> -> <operationKey> <method> <path>` lines, so adding, removing, or renaming SDK entries creates a reviewable snapshot diff. |
| TS-SDK-BOUNDARY-001 | package boundary | SDK import boundary | `@appaloft/sdk` imports no `core`, `application`, repository, handler, use-case, DI token, shell, persistence, provider SDK, or CLI local-state module. |
| TS-SDK-AUTH-001 | SDK runtime | Product-session and deploy-token auth | SDK request configuration follows accepted product-session, deploy-token, organization scope, 401, and 403 semantics. |
| TS-SDK-ERROR-001 | SDK runtime | Structured error handling | SDK callers receive typed structured errors and do not need to branch on raw human message text. |
| TS-SDK-STREAM-001 | SDK runtime | Streaming helpers | Stream-capable operations expose explicit cancellation, reconnect/error, and typed event behavior only when OpenAPI metadata marks them as streaming. |
| TS-SDK-DOCS-001 | public docs | TypeScript SDK reference docs | Public docs expose a stable TypeScript SDK help anchor covering installation, authentication, generated operation descriptors, structured errors, and streaming. |
| TS-SDK-BLACKBOX-001 | e2e | Running-server representative SDK smoke | A running Appaloft server can be exercised through the published SDK for representative create/list/show flows where HTTP/auth/serialization is the behavior under test. |
| TS-SDK-RELEASE-001 | release packaging | Published SDK package readiness | The npm release job prepares and publishes `@appaloft/sdk` with generated operation descriptors, built JavaScript, type declarations, public package metadata, and no runtime `workspace:*` dependencies. |

## Current Implementation Notes And Migration Gaps

OpenAPI metadata parity, the initial SDK generator, the `@appaloft/sdk` import-boundary check, SDK
auth/error runtime behavior, typed facade dispatch, public facade manifest coverage, and stream
helper behavior are automated through `TS-SDK-OPENAPI-*`, `TS-SDK-GEN-001`,
`TS-SDK-FACADE-001`, `TS-SDK-FACADE-002`, `TS-SDK-BOUNDARY-001`, `TS-SDK-AUTH-001`,
`TS-SDK-ERROR-001`, and `TS-SDK-STREAM-001`.
Public SDK reference docs are registered under `typescript-sdk.operation-client` and covered by
`TS-SDK-DOCS-001` plus the public docs registry checks. `TS-SDK-BLACKBOX-001` is automated by
`packages/sdk/test/running-server-smoke.test.ts`, which exercises representative project
create/list/show calls through the SDK against a real local Elysia/oRPC HTTP mount.
`TS-SDK-RELEASE-001` is automated by `scripts/test/sdk-release-packaging.test.ts` and the
`release:npm:prepare -- --sdk-only` dry run, which prove the SDK package metadata, generated
operation descriptor outputs, build outputs, and release publish job wiring.
