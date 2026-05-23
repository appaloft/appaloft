# Self-Hosted First Admin Bootstrap Workflow

## Purpose

Define how a self-hosted Appaloft instance creates the first local administrator and initial
organization before OAuth or multi-user organization management exists.

## Workflow

```text
installer/runtime config
  -> query bootstrap status
  -> if complete: return safe login/status output
  -> if required: resolve trusted email/name/password input
  -> generate one-time password when no password was supplied
  -> call application first-admin bootstrap command
  -> auth adapter creates local product user
  -> auth adapter creates initial organization and owner membership
  -> return console URL, login method summary, and one-time password only when generated
```

## Rules

- Bootstrap status is safe to expose publicly; it must not expose passwords, session tokens, account
  ids beyond safe user/organization metadata, or provider secrets.
- First-admin bootstrap itself is only valid while no product admin/organization owner exists.
- After a product admin or organization owner exists, Web must not show create-admin affordances on
  the login page, the setup page should send ordinary visitors to `/login`, and the setup endpoint
  must return `404` before dispatching the create command.
- User/session/provider implementation details stay behind application-owned ports.
- OAuth configuration is additive and optional. Missing OAuth never blocks local first-admin login.
- Existing first-admin state makes bootstrap idempotent and suppresses raw password output.
- Runtime startup may bootstrap directly from `APPALOFT_FIRST_ADMIN_EMAIL` and
  `APPALOFT_FIRST_ADMIN_PASSWORD` without a handoff file. This path must not echo or persist the raw
  supplied password in output. If no supplied password exists, startup must not generate an
  inaccessible password unless a trusted first-admin output file is configured.
- Public product health/version/readiness endpoints remain public; ordinary product mutations become
  protected by product-session and organization-role policy after this gate is implemented.
- When bootstrap is required, the HTTP adapter gates console document navigation before serving the
  SPA shell. The gate redirects browser document requests for console routes to
  `/bootstrap/auth/first-admin` and must not redirect API endpoints, docs routes, static assets,
  ACME challenges, or the first-admin route itself.

## Error Phases

- `first-admin-bootstrap-status`
- `first-admin-bootstrap`
- `product-authentication`
- `product-authorization`

## Related Specs

- [ADR-044: Self-Hosted First Admin Bootstrap](../decisions/ADR-044-self-hosted-first-admin-bootstrap.md)
- [Self-Hosted First Admin Bootstrap](../specs/053-self-hosted-first-admin-bootstrap/spec.md)
- [Self-Hosted Product Auth Errors](../errors/self-hosted-product-auth.md)
- [Self-Hosted Product Auth Test Matrix](../testing/self-hosted-product-auth-test-matrix.md)
