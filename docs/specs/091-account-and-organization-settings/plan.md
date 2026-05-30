# Plan: Account And Organization Settings

## Governing Sources

- Domain model: identity governance `Organization`; account profile/session state behind auth
  adapter ports.
- Decisions/ADRs: [ADR-045](../../decisions/ADR-045-self-hosted-organization-team-operations.md)
  and [ADR-081](../../decisions/ADR-081-account-and-organization-settings-boundary.md).
- Local specs: this feature artifact and existing `organizations.*` command/query specs.
- Test matrix:
  [Self-Hosted Product Auth Test Matrix](../../testing/self-hosted-product-auth-test-matrix.md).

## Architecture Approach

- Domain/application placement:
  - add `AccountSettingsPort` for account profile/session/deletion operations;
  - extend organization settings through Appaloft-owned organization profile/delete methods;
  - keep confirmation and narrow update semantics in application use cases.
- Repository/specification/visitor impact:
  - no new core repository in this slice; auth-provider state remains behind adapter ports.
- Event/CQRS/read-model impact:
  - queries read safe account/organization/session models;
  - commands update or delete through ports and return safe readbacks;
  - no events are emitted in this slice.
- Entrypoint impact:
  - add HTTP/oRPC routes and typed client contract entries;
  - refactor Web account and organization settings into dedicated sidebar routes.
- Persistence/migration impact:
  - no Appaloft persistence migration; Better Auth-compatible persistence remains adapter-owned.

## Roadmap And Compatibility

- Roadmap target: post Phase 8 self-hosted auth closure and pre-1.0 settings hardening.
- Version target: pre-1.0 policy.
- Compatibility impact: additive public operations and Web routes; destructive operations are new
  and exact-confirmation gated.

## Testing Strategy

- Matrix ids:
  - `ACCOUNT-SETTINGS-PROFILE-001`
  - `ACCOUNT-SETTINGS-SESSION-001`
  - `ACCOUNT-SETTINGS-DANGER-001`
  - `ORG-SETTINGS-PROFILE-001`
  - `ORG-SETTINGS-DANGER-001`
  - `SETTINGS-WEB-001`
- Test-first rows:
  - application tests prove port dispatch and confirmation rules;
  - HTTP/oRPC tests prove authorization and shared message dispatch;
  - Web source tests prove oRPC/i18n/sidebar shell usage without Better Auth coupling.
- Acceptance/e2e:
  - browser e2e is deferred for this slice.
- Contract/integration/unit:
  - Better Auth adapter tests prove the port implementation boundary where feasible.

## Risks And Migration Gaps

- Better Auth server APIs differ by version; adapter implementation may need to use
  `auth.$context.internalAdapter` inside the adapter only.
- Public docs for account settings need a later Docs Round after the docs IA selects the page.
- Organization deletion does not currently check Appaloft child-resource blockers because Better
  Auth organization state is not yet the owner of Appaloft resource lifecycles.
