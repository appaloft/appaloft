# Plan: Appaloft Connections

## Governing Sources

- [Operations](../../OPERATIONS.md)
- [Providers](../../PROVIDERS.md)
- [External Edge Access And DNS](../075-external-edge-access-and-dns/spec.md)
- [SSH Onboarding Provider](../092-ssh-onboarding-provider/spec.md)
- [Appaloft Connections Spec](spec.md)

## Architecture Approach

- Add a provider-neutral connection catalog and connection read model.
- Keep all provider API details behind adapter ports and concrete provider packages.
- Expose all surfaces through the operation catalog first, then route CLI, HTTP, Web, and future
  tools through the same application services.
- Model temporary setup separately from persistent connections:
  - temporary one-click DNS setup does not store reusable provider tokens;
  - persistent provider credentials are encrypted or secret-reference backed;
  - provider app installations exchange short-lived runtime tokens.
- Keep identity connections separate from source connections.
- Keep billing downstream from domain/application facts.

## Entrypoint Impact

| Surface | Plan |
| --- | --- |
| Operation catalog | Add neutral `connections.*` operations. |
| CLI | Add `appaloft connections ...` and DNS convenience wrappers. |
| HTTP/oRPC | Add route/handler equivalents for catalog, connect, callback, plan, accept, revoke, and status. |
| Web | Add a central Connections area plus contextual DNS/source/server/notification entrypoints. |
| Config | Use provider enablement and secret refs, not raw secret values. |
| Future MCP/tools | Tools call operation catalog entries and never receive long-lived credentials. |

## Testing Strategy

| ID | Level | Test intent |
| --- | --- | --- |
| APP-CONN-001 | unit/contract | Neutral vocabulary and catalog shape do not contain hosted-only terms. |
| APP-CONN-002 | unit/UI | Category support states show supported/deferred without all-provider implication. |
| APP-CONN-003 | adapter/contract | Domain Connect temporary flow stores no reusable token. |
| APP-CONN-004 | adapter/application | Persistent DNS apply manages only accepted Appaloft-owned records. |
| APP-CONN-005 | adapter/application | DNS conflicts fail closed by default. |
| APP-CONN-006 | application/UI | GitHub login does not grant source access. |
| APP-CONN-007 | persistence/application | GitHub App installation readback maps to source connection. |
| APP-CONN-008 | adapter/contract | Provider app tokens are short-lived and redacted. |
| APP-CONN-009 | application | Infrastructure onboarding returns generic SSH target proposals. |
| APP-CONN-010 | authz/application | High-cost provider mutation requires explicit accepted plan. |
| APP-CONN-011 | adapter/contract | Notification payloads are sent/redacted through capability-scoped adapter. |
| APP-CONN-012 | source scan/application | Connection commands do not mutate billing ledgers. |
| APP-CONN-013 | operation/tool contract | Tool/agent operations do not expose long-lived secrets. |
| APP-CONN-014 | CLI/API contract | CLI and HTTP share operation semantics and JSON status. |
| APP-CONN-015 | Web/e2e | Central and contextual Web flows use the same application services. |
| APP-CONN-016 | adapter/contract | Fake providers cover success/conflict/revoke/expiry/rate-limit/error paths. |

## Migration Notes

- Existing GitHub App source-provider behavior should become the first `source/github` compatibility
  slice.
- Existing GitHub OAuth login remains identity/auth only.
- Existing external edge/DNS and SSH onboarding specs should reference connection ids once the
  neutral model exists.
- Hosted/private distributions can decorate provider availability and official app defaults without
  changing public Appaloft contracts.

## Risks

- Provider tokens and raw responses can leak if adapters are not strictly translated.
- DNS mutation can damage user domains if conflict and ownership rules do not fail closed.
- Infrastructure provider actions can create cost, so plan/accept/readback must be explicit.
- Coupling the model to one hosted distribution would make Community/self-host workflows weaker.
