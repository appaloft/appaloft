# Public Operation Input Contract Test Matrix

## Normative Contract

Deployment-critical public command inputs must fail closed. A command schema must reject unknown
top-level fields and unknown fields inside owned nested input objects before command dispatch or
state mutation. CLI, HTTP/oRPC, generated SDK metadata, and MCP consume the same application
operation schema and must not silently reinterpret or discard unsupported intent.

Validation failures use the stable `validation_error` code with `phase = command-validation`.
Privacy-safe issue details include one code, path, and message per rejected issue. They may identify
field names but must never echo input values, certificate material, credentials, tokens, secrets,
or raw provider/runtime output.

This matrix covers these command families:

- `resources.configure-network`, including the nested resource network profile also consumed by
  `resources.create`;
- managed domain-binding create, route, ownership, delete, and verification-retry commands;
- certificate issue/renew, import, retry, revoke, and delete commands.

Operations outside this matrix are not declared strict.

## Governing Sources

- [ADR-001: Deploy API Required Fields](../decisions/ADR-001-deploy-api-required-fields.md)
- [ADR-026: Aggregate Mutation Command Boundary](../decisions/ADR-026-aggregate-mutation-command-boundary.md)
- [ADR-033: Error Knowledge Contract](../decisions/ADR-033-error-knowledge-contract.md)
- [ADR-080: Appaloft As MCP Transport Boundary](../decisions/ADR-080-appaloft-as-mcp-transport-boundary.md)
- [Error Model](../errors/model.md)
- [Resource Lifecycle Error Spec](../errors/resources.lifecycle.md)
- [Routing, Domain Binding, And TLS Error Spec](../errors/routing-domain-tls.md)
- [Public error reference](../../apps/docs/src/content/docs/reference/errors-statuses.mdx)

## Matrix

| ID | Scenario | Surface | Automation level | Test binding | Expected result |
| --- | --- | --- | --- | --- | --- |
| `OP-INPUT-STRICT-001` | Selected resource-network, domain-binding, and certificate command schemas receive unknown top-level or owned nested fields. | Application command schema and public contract mirror | Unit / contract | `packages/application/test/operation-input-contract.test.ts`; `packages/contracts/test/operation-input-contract.test.ts` | Parse fails before command construction; no unsupported field is stripped into an accepted command. |
| `OP-INPUT-ERROR-002` | Selected command parsing receives invalid or unsupported fields, including a secret-looking value, while an operation outside the slice fails validation. | Application error boundary, CLI, MCP | Unit | `packages/application/test/operation-input-contract.test.ts` | Selected commands return `validation_error`, `phase = command-validation`, and aligned safe issue arrays using only `unsupported_field` or `invalid_input`; input values are absent. Operations outside the slice retain their prior error shape. |
| `OP-INPUT-HTTP-003` | Authenticated resource-network and certificate HTTP requests include invalid, unsupported top-level, or unsupported nested fields; a typed RPC request does the same; an unrelated query receives invalid input. | HTTP/oRPC | Adapter integration | `packages/orpc/test/resource-network-profile.http.test.ts`; `packages/orpc/test/certificate-lifecycle.http.test.ts` | Selected commands return HTTP 400 with normalized `validation_error` and safe issue details without dispatch. Typed RPC responses preserve the oRPC envelope, and query validation is not mislabeled as command validation. |
| `OP-INPUT-MCP-004` | MCP descriptors and handlers expose selected strict operation inputs. | MCP descriptor and dispatch | Contract / integration | `packages/ai/mcp/test/tool-descriptors.test.ts` | JSON schemas use `additionalProperties: false`; unsupported input returns the shared validation error before dispatch. |
| `OP-INPUT-DOCS-005` | Users and agents need to understand unknown-field rejection and recovery. | Public docs, registry, command spec | Docs contract | `packages/docs-registry/test/help-topics.test.ts`; `packages/docs-registry/test/operation-coverage.test.ts` | Both locales expose `operation-input-validation`; registry covers CLI, HTTP/API, and MCP; `resources.configure-network` marks MCP Active. |

## Compatibility And Migration

- Version impact: patch bug fix. Unknown fields were never supported input and were silently ignored;
  callers must remove or correct them after the fix.
- Stable code: `validation_error` remains unchanged.
- Stable phase: input-shape failures use `command-validation`.
