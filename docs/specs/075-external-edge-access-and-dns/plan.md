# Plan: External Edge Access And DNS

## Source-Of-Truth Alignment

- Existing ADRs are not sufficient for implementation because this behavior introduces external
  provider connection state, provider-side DNS mutation, cache purge, and route rollback semantics.
- Before Code Round, create or update an ADR governing external edge provider connection ownership,
  DNS record adoption, edge delivery policy ownership, async apply/verify/purge attempts, and
  rollback snapshot use.
- This artifact positions the future behavior only. It does not add public operation catalog
  entries and does not authorize code.

## Bounded Context And Package Impact

- Runtime Topology:
  - Owns the provider-neutral language for external edge access because it extends public access,
    DomainBinding, DeploymentTarget reachability, and route snapshots.
  - `DomainBinding` remains the durable custom-domain owner.
  - `DeploymentTarget` remains the target-local edge proxy intent/readiness owner.
  - Deployment snapshots may record resolved external edge route state for one attempt.
- Application:
  - Future command/query handlers dispatch explicit messages through command/query buses.
  - Application services coordinate DomainBinding, provider connection state, provider ports,
    process attempts, events, read models, and error translation.
- Provider packages:
  - Concrete external edge providers live outside core/application, for example under
    `packages/providers/edge-access-*` or another ADR-approved package pattern.
  - Provider packages own API clients, provider raw payload translation, retries, and diagnostics.
- Persistence:
  - Provider connection state, adopted DNS record ownership, edge route snapshots, purge receipts,
    and observations require dedicated persistence/read models after the ADR selects ownership.
  - Persistence adapters must not store provider raw payloads unless a future spec defines a
    redacted, bounded diagnostic record.
- CLI/API/Web:
  - All mutation surfaces must map to operation catalog entries.
  - Web renders provider state and diagnostics but does not contain provider business logic.
- Public docs:
  - Add docs only when public behavior exists, or record a migration gap while the feature is still
    planned.

## Operation Catalog Impact

No operation catalog change in this documentation-only round.

Future candidate operation groups:

- Provider connection lifecycle:
  - `edge-provider-connections.create`
  - `edge-provider-connections.list`
  - `edge-provider-connections.show`
  - `edge-provider-connections.rotate-credential`
  - `edge-provider-connections.delete-check`
  - `edge-provider-connections.delete`
- Domain-bound edge delivery:
  - `domain-bindings.configure-edge-delivery`
  - `domain-bindings.edge-delivery.show`
  - `domain-bindings.edge-delivery.verify`
  - `domain-bindings.edge-delivery.purge-cache`
- Read-only preview:
  - `resources.edge-configuration.preview`

These names must be rechecked during the future ADR/spec round. Do not add them to
`CORE_OPERATIONS.md` or `operation-catalog.ts` until implementation is in scope.

## Workflow Position

Future workflow:

```text
edge-provider connection
  -> DomainBinding edge-delivery configuration
  -> DNS/provider route plan
  -> provider apply
  -> DNS/provider observation
  -> route readiness projection
  -> optional scoped purge
  -> rollback-safe snapshot reuse
```

The workflow must not:

- mutate DNS from `deployments.create`;
- bypass DomainBinding ownership;
- apply unmanaged DNS record changes;
- create provider routes without observable process/readiness state;
- hide post-acceptance failures in logs only.

## Domain Model Updates

The current Sync Round records the future boundary in `docs/DOMAIN_MODEL.md` without declaring the
future types implemented.

Future ADR/spec work must decide:

- `EdgeProviderConnection` ownership and repository boundary;
- `EdgeDeliveryPolicy` placement;
- `DnsRecordIntent` and DNS observation value-object/read-model shape;
- route snapshot fields safe enough for rollback, audit, diagnostics, and support;
- provider capability vocabulary for DNS, proxy, TLS, tunnel, cache, purge, and observation.

## Error And Diagnostics Strategy

Future error specs must include stable codes for at least:

- provider connection invalid or unauthorized;
- provider capability unsupported;
- DNS record conflict;
- unmanaged DNS record collision;
- provider propagation pending;
- DNS verification mismatch;
- proxied route disabled or unsupported;
- TLS mode conflict;
- origin unreachable;
- purge scope unsupported;
- purge provider failure;
- edge route drift.

Categories should follow the global error model:

- `validation` for malformed or unsafe input;
- `conflict` for unmanaged/adopted record collision or stale desired state;
- `integration` for external provider API failures;
- `async-processing` for post-acceptance apply/verify/purge failures;
- `timeout` for bounded propagation waits.

## Testing Strategy

Future test matrices must cover:

- operation catalog parity across CLI, HTTP/oRPC, Web, SDK, and generated future MCP/tool metadata;
- provider connection credential masking and rotation;
- domain binding admission and edge delivery policy validation;
- DNS record ownership/adoption guardrails;
- provider apply/verify idempotency;
- provider raw payload redaction;
- scoped purge only;
- no implicit `deployments.create` mutation;
- rollback snapshot use and refusal when provider capability or ownership evidence is missing;
- diagnostics for DNS, proxy, TLS, origin, cache, and provider API failures.

Use hermetic provider fakes first. Real provider smoke tests must be opt-in and secret-gated.

## Public Documentation Outcome

Future public docs should add task-oriented pages or anchors for:

- connecting an external edge provider;
- preparing a domain for Appaloft-managed access;
- configuring edge delivery for a resource domain;
- verifying DNS and edge readiness;
- purging cached content safely;
- diagnosing DNS, TLS, proxy, origin, and cache drift;
- understanding what Appaloft will and will not manage.

Until implementation exists, public docs must not claim this feature is available.

## Implementation Order

1. ADR for external edge access and DNS ownership.
2. Local command/query/workflow/error/testing specs.
3. Provider-neutral value objects, ports, and fake provider.
4. Provider connection lifecycle and masked read models.
5. DomainBinding edge-delivery configuration and DNS intent/adoption guards.
6. Route apply/verify workflow with durable process attempt visibility.
7. Read-only preview and diagnostic surfaces.
8. Scoped cache purge.
9. Rollback snapshot participation.
10. Public docs, CLI/API/Web/SDK/generated metadata parity.

## Deferred Gaps

- Provider-specific advanced rules, edge compute, WAF, bot controls, image optimization, and global
  load balancing remain out of scope until separately governed.
- General DNS zone editing remains explicitly out of scope.
- Appaloft-owned hosted CDN or object storage remains a separate product boundary.
