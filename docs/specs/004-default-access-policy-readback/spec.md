# Default Access Policy Readback

## Status
- Round: Spec -> Test-First -> Code -> Post-Implementation Sync
- Artifact state: active for this behavior

## Business Outcome

Operators can confirm the generated default access policy that Web, CLI, and API will use before
or after changing it. The readback path closes the policy editing loop without requiring database
inspection or guessing from generated route output.

## Ubiquitous Language

| Term | Meaning | Context | Compatibility aliases |
| --- | --- | --- | --- |
| DefaultAccessDomainPolicy | Provider-neutral policy that controls generated default access URL creation. | Runtime Topology | Default access policy |
| System default access policy | Installation-wide default policy used when no server override exists. | Runtime Topology | System policy |
| Deployment-target default access override | Server-scoped policy that overrides the system policy for one deployment target/server. | Runtime Topology | Server default access override |
| Policy readback | Querying persisted policy state for a scope or all persisted scopes. | Runtime Topology | Show/list default access policy |

## Scenarios And Acceptance Criteria

| ID | Scenario | Given | When | Then |
| --- | --- | --- | --- | --- |
| DEF-ACCESS-POLICY-008 | Show system policy | A system default access policy is persisted. | The operator reads the system scope. | The query returns the persisted provider-neutral policy fields and does not generate routes. |
| DEF-ACCESS-POLICY-009 | Show server override | A deployment-target override is persisted for an existing server. | The operator reads that server scope. | The query returns the persisted override and validates that the server exists. |
| DEF-ACCESS-POLICY-010 | Missing policy readback | No durable policy is persisted for the requested scope. | The operator reads that scope. | The query returns `policy = null` so entrypoints can keep explicit form defaults without fabricating durable state. |
| DEF-ACCESS-POLICY-011 | List persisted policies | System and deployment-target policies are persisted. | The operator lists default access policies. | The query returns all persisted policy records with provider-neutral fields only. |
| DEF-ACCESS-ENTRY-007 | Entrypoint readback | Web, CLI, or API policy surfaces load policy state. | The operator opens or invokes the readback surface. | The surface dispatches `default-access-domain-policies.show` or `default-access-domain-policies.list` through the query bus. |

## Domain Ownership

- Bounded context: Runtime Topology
- Aggregate/resource owner: Default access policy repository state; not a core aggregate root in v1
- Upstream/downstream contexts: Resource access summaries and deployment route resolution consume policy state; readback does not mutate deployments, resources, domains, certificates, or route snapshots.

## Public Surfaces

- API: `GET /api/default-access-domain-policies` and `GET /api/default-access-domain-policies/show`
- CLI: `appaloft default-access list` and `appaloft default-access show --scope ...`
- Web/UI: system policy form and server override form prefill from persisted policy readback.
- Config: static config remains fallback only when no durable policy exists; readback returns durable state.
- Events: none.
- Public docs/help: existing `/docs/access/generated-routes/#default-access-policy` anchor.

## Non-Goals

- No generated route creation or route repair.
- No policy fallback config exposure as durable state.
- No organization/project/environment/resource policy scopes.
- No changes to historical deployment route snapshots.
- No new default access provider.

## Open Questions

- None.
