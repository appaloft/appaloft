# Tasks: Account And Organization Settings

## Test-First

- [x] `ACCOUNT-SETTINGS-PROFILE-001`: add application and HTTP tests proving profile read/change
  dispatch through `AccountSettingsPort` and return safe metadata.
- [x] `ACCOUNT-SETTINGS-SESSION-001`: add application and HTTP tests proving session list/revoke
  dispatch through `AccountSettingsPort` and never expose token material.
- [x] `ACCOUNT-SETTINGS-DANGER-001`: add application and HTTP tests proving exact user-id
  confirmation is required for account deletion.
- [x] `ORG-SETTINGS-PROFILE-001`: add application and HTTP tests proving organization profile
  read/change use Appaloft-owned organization settings methods.
- [x] `ORG-SETTINGS-DANGER-001`: add application and HTTP tests proving exact organization-id
  confirmation and owner authorization for organization deletion.
- [x] `ORG-TEAM-OWNER-TRANSFER-001`: add domain/application/HTTP/CLI/Web source tests proving
  owner rows use dedicated ownership transfer while generic role update and remove stay non-owner.
- [x] `SETTINGS-WEB-001`: add Web source tests proving account and organization settings use a
  dedicated sidebar shell, shared oRPC contracts, and i18n keys.

## Source Of Truth

- [x] Add ADR-081 for account and organization settings boundary.
- [x] Add feature artifact `docs/specs/091-account-and-organization-settings`.
- [x] Position account/organization settings operations in `docs/BUSINESS_OPERATION_MAP.md`.
- [x] Add active settings operations to `docs/CORE_OPERATIONS.md`.
- [x] Extend the self-hosted product-auth test matrix.
- [x] Add command/query specs for account and organization settings operations.

## Implementation

- [x] Add account settings port, DI tokens, commands, queries, handlers, use cases, and exports.
- [x] Add organization profile/delete methods, commands, queries, handlers, use cases, and exports.
- [x] Add operation-catalog entries and shared schemas.
- [x] Implement Better Auth adapter methods behind Appaloft-owned ports.
- [x] Wire HTTP/oRPC routes and client contract entries.
- [x] Add contract response schemas.
- [x] Register application services and runtime dependencies.

## Entrypoints And Docs

- [x] Add account settings sidebar shell and account profile/security/sessions/danger-zone routes.
- [x] Refactor organization settings to use the settings sidebar shell with profile, members,
  invitations, deploy tokens, and danger-zone routes.
- [x] Add organization member owner transfer controls and hide generic owner role/remove actions.
- [x] Add i18n keys and localized resources.
- [x] Update console user menu to enter account profile settings.

## Verification

- [x] Run targeted application settings tests.
- [x] Run targeted HTTP/oRPC settings tests.
- [x] Run targeted Better Auth adapter tests.
- [x] Run Web source tests for settings surfaces.

## Post-Implementation Sync

- [x] Reconcile spec, plan, tasks, operation maps, test matrix, Web routes, contracts, and
  remaining migration gaps.
