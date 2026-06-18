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
- Treat connector authorization as its own lifecycle, not as a static catalog URL:
  - `connect.start` creates an authorization attempt with owner, connector, requested capability,
    return URL, provider state, expiry, and redacted diagnostics;
  - provider-specific OAuth/app-install/device-code/manual-secret details stay behind an
    authorization adapter;
  - `connect.callback` validates the attempt state, translates provider response, writes credential
    material through a credential-store port, and records only a redacted secret reference and safe
    external account/installation/zone readback on the connection;
  - abandoned attempts expire and cannot be replayed.
- Keep identity connections separate from source connections.
- Keep billing downstream from domain/application facts.

## Entrypoint Impact

| Surface | Plan |
| --- | --- |
| Operation catalog | Add neutral `connections.*` operations. |
| CLI | Add `appaloft connectors ...` and DNS convenience wrappers. |
| HTTP/oRPC | Add route/handler equivalents for catalog, connect, callback, plan, accept, apply, revoke, and status. |
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
| APP-CONN-017 | authz/application | Connection lifecycle and readiness are tenant/owner scoped. |
| APP-CONN-018 | docs/source scan | Category names are not treated as concrete connector keys. |
| APP-CONN-019 | application/API/UI/adapter | Domain binding DNS readiness checks owner-scoped connected zones, route conflicts, and plan generation without frontend zone guessing. |
| APP-CONN-020 | application/adapter/persistence | Stateful provider authorization attempts validate callback state, store credentials behind a port, and expose no raw secret values. |
| APP-CONN-021 | application/API/UI/adapter | Domain binding connect flow authorizes a provider, discovers zones, rematches the hostname, and applies DNS through the owner-scoped connection. |

## Migration Notes

- Existing GitHub App source-provider behavior is the first `source/github` compatibility slice;
  durable installation records are projected into `connections.list` and `connections.show`.
- Existing GitHub OAuth login remains identity/auth only.
- Existing external edge/DNS and SSH onboarding specs should reference connection ids once the
  neutral model exists.
- Domain binding DNS apply must first call the readiness query. That query uses provider-neutral
  zone listing, so Cloudflare, Route53, DNSPod, GoDaddy, and other DNS providers can plug into the
  same flow without Web-specific branching.
- Hosted/private distributions can decorate provider availability and official app defaults without
  changing public Appaloft contracts.

## Risks

- Provider tokens and raw responses can leak if adapters are not strictly translated.
- DNS mutation can damage user domains if conflict and ownership rules do not fail closed.
- Infrastructure provider actions can create cost, so plan/accept/readback must be explicit and
  durable accepted-plan ids must match the connector, mutation capability, and owner before apply.
- Coupling the model to one hosted distribution would make Community/self-host workflows weaker.
