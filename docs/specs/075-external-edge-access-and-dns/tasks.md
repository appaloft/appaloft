# Tasks: External Edge Access And DNS

## Spec Round

- [x] Position external edge access as future Runtime Topology work, not current implementation.
- [x] Define DNS management as narrow Appaloft-managed access intent, not a general DNS product.
- [x] Define edge delivery as external provider orchestration, not Appaloft-owned CDN
  infrastructure.
- [x] Record hard non-goals for general zone editing, provider raw payload exposure, implicit
  deployment admission mutation, WAF/security-rule products, edge compute, and broad cache purge.
- [x] Add roadmap positioning as a post-`1.0.0` track by default.
- [x] Add operation-map positioning as a future governed workflow.
- [x] Record that a future ADR is required before command specs or code.

## ADR Round

- [ ] Decide `EdgeProviderConnection` ownership, lifecycle, persistence, credential custody,
  rotation, usage visibility, and deletion safety.
- [ ] Decide `EdgeDeliveryPolicy` ownership and precedence.
- [ ] Decide DNS record ownership, adoption, unmanaged-record conflict handling, and deletion
  safety.
- [ ] Decide external edge route snapshot fields and rollback participation.
- [ ] Decide async process attempt ownership for provider apply, verify, and purge work.
- [ ] Decide provider capability vocabulary and package boundary.

## Local Specs Round

- [ ] Add command/query specs for accepted provider connection operations.
- [ ] Add command/query specs for accepted DomainBinding edge delivery operations.
- [ ] Add query spec for accepted read-only edge configuration preview.
- [ ] Add workflow spec for external edge route apply/verify.
- [ ] Add workflow spec for scoped cache purge.
- [ ] Add event specs for accepted lifecycle and projection events.
- [ ] Add error spec for provider, DNS, proxy, TLS, origin, cache, drift, and purge failures.
- [ ] Add testing matrix with stable ids for every accepted scenario.
- [ ] Add implementation plan after ADR/local specs are accepted.

## Code Round

- [ ] Implement provider-neutral value objects and ports without provider SDK types in core or
  application command schemas.
- [ ] Implement hermetic fake provider before concrete provider packages.
- [ ] Implement provider connection lifecycle through explicit commands and masked queries.
- [ ] Implement DomainBinding edge delivery configuration through explicit commands.
- [ ] Implement DNS record ownership/adoption guards.
- [ ] Implement provider apply/verify with process attempt visibility.
- [ ] Implement read-only preview and diagnostics.
- [ ] Implement scoped purge only after purge safety specs are accepted.
- [ ] Implement rollback snapshot behavior only after recovery semantics are accepted.
- [ ] Keep `deployments.create` ids-only.

## Docs Round

- [ ] Add public docs only after the behavior is implemented or explicitly marked unavailable.
- [ ] Document what Appaloft manages and what remains provider/user managed.
- [ ] Document DNS limitations and unmanaged-record safety.
- [ ] Document cache purge scope and safety.
- [ ] Add CLI help/API descriptions/future MCP metadata links to stable public anchors.
- [ ] Keep internal DDD/CQRS terminology out of primary user docs.

## Verification

- [ ] Run focused unit tests for value objects and provider-neutral policies.
- [ ] Run application tests for command/query admission and no implicit deployment mutation.
- [ ] Run persistence tests for masked provider connection/read-model state.
- [ ] Run hermetic provider fake workflow tests for apply, verify, observe, and purge.
- [ ] Run CLI/API/Web parity tests for accepted operations.
- [ ] Run generated SDK/future MCP descriptor tests when operation metadata changes.
- [ ] Keep real provider smoke tests opt-in and secret-gated.
