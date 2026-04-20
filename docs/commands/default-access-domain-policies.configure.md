# default-access-domain-policies.configure Command Spec

## Normative Contract

`default-access-domain-policies.configure` is the accepted future command for changing generated default access domain policy.

This command is not active until it is added to `CORE_OPERATIONS.md`, `operation-catalog.ts`, Web/API/CLI entrypoints, and tests in the same Code Round. Until then, static installation/server configuration may select a provider, but user-facing policy editing must not be exposed.

Command success means the provider-neutral policy state has been accepted and persisted for the requested scope. It does not reconfigure existing deployment route snapshots and does not create or mutate `DomainBinding` state.

```ts
type ConfigureDefaultAccessDomainPolicyResult = Result<{ id: string }, DomainError>;
```

## Global References

This command inherits:

- [ADR-017: Default Access Domain And Proxy Routing](../decisions/ADR-017-default-access-domain-and-proxy-routing.md)
- [ADR-002: Routing, Domain, And TLS Boundary](../decisions/ADR-002-routing-domain-tls-boundary.md)
- [Error Model](../errors/model.md)
- [neverthrow Conventions](../errors/neverthrow-conventions.md)
- [Async Lifecycle And Acceptance](../architecture/async-lifecycle-and-acceptance.md)

## Purpose

Configure whether Appaloft generates default public access hostnames for resources and which provider-neutral strategy is used.

It is not:

- a deployment command;
- a domain binding command;
- a certificate command;
- a proxy installation command;
- a concrete generated-domain provider adapter;
- a UI preference stored only in the Web console.

## Input Model

The v1 command input is:

```ts
type ConfigureDefaultAccessDomainPolicyInput = {
  scope:
    | { kind: "system" }
    | { kind: "deployment-target"; serverId: string };
  mode: "disabled" | "provider" | "custom-template";
  providerKey?: string;
  templateRef?: string;
  idempotencyKey?: string;
};
```

| Field | Requirement | Meaning |
| --- | --- | --- |
| `scope` | Required | Policy scope to configure. V1 supports system default and deployment-target/server override. |
| `mode` | Required | Whether generation is disabled, provider-backed, or template-backed. |
| `providerKey` | Conditional | Required for `provider` and `custom-template`; opaque provider registry key. |
| `templateRef` | Conditional | Required for `custom-template`; opaque template/config reference, not raw provider algorithm text. |
| `idempotencyKey` | Optional | Caller-supplied dedupe key for repeated configure attempts. |

The command must not accept concrete DNS service names, provider-specific hostname suffixes, raw hostname-generation algorithms, or provider SDK settings as domain fields.

## Admission Flow

The command must:

1. Validate command input.
2. Resolve the policy scope.
3. Resolve the provider key through the provider registry or injected provider configuration.
4. Reject unsupported provider/scope/mode combinations.
5. Persist provider-neutral policy state.
6. Publish or record a policy-configured event when the event spec exists.
7. Return `ok({ id })`.

## State And Snapshot Rules

Policy changes apply only to future route resolution.

Existing deployment route snapshots remain immutable. Historical deployment/read-model output must continue to show the generated route that was resolved for that attempt.

`ResourceAccessSummary` should refresh after policy changes only when a new deployment or route-resolution process produces a new route snapshot. The command must not rewrite current resource access state by itself.

## Handler Boundary

The handler must delegate to an application use case and return the typed `Result`.

It must not:

- instantiate concrete provider implementations;
- call DNS or certificate providers directly;
- mutate deployments or domain bindings;
- restart proxy containers;
- update route snapshots for existing deployment attempts;
- perform Web/CLI prompt logic.

## Error Codes

All errors use [Error Model](../errors/model.md). Command-specific codes and phases:

| Error code | Phase | Retriable | Meaning |
| --- | --- | --- | --- |
| `validation_error` | `command-validation` | No | Input shape, scope, mode, provider key, or template ref is invalid. |
| `not_found` | `scope-resolution` | No | Deployment target/server scope does not exist. |
| `default_access_provider_unavailable` | `provider-resolution` | Conditional | Requested provider key is not registered or unavailable. |
| `default_access_policy_conflict` | `policy-admission` | No | Existing policy state conflicts with the requested mutation or idempotency key. |
| `infra_error` | `policy-persistence` or `event-publication` | Conditional | Policy state or event could not be safely persisted. |

## Relationship To Deployment And Routing

`deployments.create` reads resolved policy state during route snapshot resolution. It must not accept policy fields directly.

`domain-bindings.create` remains the durable custom-domain command. Configuring default access policy does not create domain bindings or certificates.

Concrete generated-domain provider packages live under:

```text
packages/providers/default-access-domain-*
```

## Current Implementation Notes And Migration Gaps

No active public command currently configures default access domain policy.

Shell/static configuration currently selects the default access provider and generated access routes
are projected through provider-neutral `ResourceAccessSummary` state.

The future command must change policy without treating existing generated routes as durable domain
bindings. Route precedence hardening and policy-driven refresh behavior remain follow-up workflow
details.

## Open Questions

- None for the command boundary, v1 scopes, or provider package location.
