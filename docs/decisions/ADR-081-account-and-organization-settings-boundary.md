# ADR-081: Account And Organization Settings Boundary

## Status

Accepted

## Context

Self-hosted Appaloft already has first-admin bootstrap, product-session authorization, current
organization context, team management, and deploy-token lifecycle operations. Operators now need a
settings-grade account and organization experience: user profile updates, safe session management,
organization profile updates, and explicit danger-zone deletion flows.

Better Auth provides useful user, session, and organization primitives, but Appaloft must keep
identity settings portable. The Web console also needs settings navigation that behaves like the
product console sidebar while keeping account and organization settings outside the product
workspace sidebar.

## Decision

Account and organization settings are Appaloft-owned operations in the identity governance context.

- Account settings use a dedicated `AccountSettingsPort` in the application layer for profile,
  session, and account deletion operations.
- Organization settings extend the organization/team boundary through Appaloft-owned
  organization-profile and organization-deletion methods. Better Auth may implement those methods,
  but Better Auth types, route contracts, table shapes, provider payloads, session tokens, and
  invite secrets must not leak into core, application, contracts, Web, CLI, or docs.
- Account profile update is intentionally narrow: display name and avatar URL are mutable.
  Email/password changes remain account-security behavior and continue to use the configured auth
  runtime security endpoints/status.
- Account session management exposes safe session metadata and single-session revocation. Bulk
  revoke and device policy can be added later through new operations.
- Account deletion is a signed-in user danger-zone command. It requires exact user-id
  confirmation, deletes the signed-in account through the auth adapter, and does not delete
  organizations, resources, deployments, deploy tokens, audit state, or retained history.
- Organization deletion is an owner-protected danger-zone command. It requires exact organization-id
  confirmation and deletes the organization membership/profile/invitation record through the auth
  adapter, but it does not cascade Appaloft projects, resources, deployments, deploy tokens, audit
  state, runtime state, or retained history.
- Destructive commands must have read-side observability through current-context/profile/session
  queries before Web enables the controls.
- Web account and organization settings use a dedicated settings sidebar shell with console-style
  sidebar primitives. Account and organization sidebars have different item sets and must use
  localized i18n keys.

## Consequences

- Replacing Better Auth requires adapter work only; application messages and Web contracts stay
  stable.
- Destructive identity operations stay explicit and confirmation-gated instead of being hidden in
  generic update commands.
- Settings UI can share a shell and interaction model while keeping account profile/security/session
  concerns separate from organization profile/team/token/danger-zone concerns.
- Future SSO, SCIM, MFA, organization creation, invitation revocation/resend, and bulk session
  operations need their own specs and operation keys before implementation.

## Related Specs

- [Account And Organization Settings](../specs/091-account-and-organization-settings/spec.md)
- [Self-Hosted Organization Team Operations](../specs/054-self-hosted-organization-team-operations/spec.md)
- [Self-Hosted Product Auth Test Matrix](../testing/self-hosted-product-auth-test-matrix.md)
