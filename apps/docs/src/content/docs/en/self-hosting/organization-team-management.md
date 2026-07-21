---
title: "Organization team management"
description: "Invite members, inspect members and invitations, update non-owner roles, transfer ownership, remove non-owner members, and handle 401/403 safely."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "organization"
  - "team"
  - "members"
  - "invitations"
  - "roles"
  - "APPALOFT_AUTH_COOKIE"
  - "APPALOFT_AUTHORIZATION"
  - "product_auth_missing"
  - "product_auth_forbidden"
relatedOperations:
  - "organizations.current-context"
  - "organizations.switch-current"
  - "organizations.list-members"
  - "organizations.list-invitations"
  - "organizations.invite-member"
  - "organizations.change-member-role"
  - "organizations.transfer-owner"
  - "organizations.remove-member"
sidebar:
  label: "Team"
  order: 3
---

## Organization team management [#self-hosting-organization-team-management]

The first admin becomes the owner of the initial organization. After login, you can read the current
organization context, switch to an organization already visible to the current session, inspect
members and invitations, and manage members with an owner or admin role.

These operations require a valid product session. HTTP/API requests use the login cookie or an
authorization header. The CLI reads equivalent session input from `APPALOFT_AUTH_COOKIE` or
`APPALOFT_AUTHORIZATION`; do not write those values to shell history, CI logs, repository files,
issues, or pull request comments.

## Inspect current context [#self-hosting-organization-current-context]

```sh
appaloft organization context
appaloft organization switch org_second
```

The command returns safe metadata for the current user, current organization, current role,
selectable organizations, and configured login methods. Output does not include session tokens,
cookies, OAuth provider tokens, invitation secrets, or raw deploy-token values.
The switch command only selects organizations already visible to the current product session;
selecting the current organization again is idempotent.

## Inspect members and invitations [#self-hosting-organization-members]

```sh
appaloft organization members list --organization-id org_self_hosted
appaloft organization invitations list --organization-id org_self_hosted --status pending
```

Member lists return member ids, safe user metadata, roles, joined timestamps, and similar safe
fields. Invitation lists return safe invitation metadata without raw invitation tokens.

## Invite, transfer ownership, update roles, and remove members [#self-hosting-organization-member-management]

```sh
appaloft organization member invite --organization-id org_self_hosted --email operator@example.com --role developer
appaloft organization member role mem_operator --organization-id org_self_hosted --role admin
appaloft organization owner transfer mem_admin mem_operator --organization-id org_self_hosted
appaloft organization member remove mem_operator --organization-id org_self_hosted
```

Available roles are `owner`, `admin`, `developer`, `billing`, and `viewer`. Owners and admins can
manage members. Early self-hosted builds adapt the auth runtime's default `member` role back to
Appaloft `developer` until richer custom role persistence is available.

Generic role updates can only change non-owner members to non-owner roles, and generic member
removal can only remove non-owner members. Owners cannot be demoted, created, or removed through
those generic operations; use `appaloft organization owner transfer <fromMemberId> <toMemberId>`.
After transfer, the target member becomes owner and the previous owner becomes admin.

## HTTP/API routes [#self-hosting-organization-http-api]

The same operations are available through HTTP/API:

```http
GET /api/organizations/current-context
POST /api/organizations/current-context/switch
GET /api/organizations/{organizationId}/members
GET /api/organizations/{organizationId}/invitations
POST /api/organizations/{organizationId}/invitations
POST /api/organizations/{organizationId}/members/{memberId}/role
POST /api/organizations/{organizationId}/owner-transfer
DELETE /api/organizations/{organizationId}/members/{memberId}
```

HTTP/API routes and CLI commands execute the same Appaloft operations. The auth runtime is an
implementation detail; callers do not need, and should not depend on, underlying auth routes,
tables, or provider payloads.

## Web console status [#self-hosting-organization-web-status]

The Web console `/organization` page can read the current organization context, switch to another
visible organization, inspect members and invitations, invite members, update non-owner roles,
transfer ownership, remove non-owner members, and manage deploy-token create, rotate, and revoke
actions. Browser-driven self-hosted auth e2e coverage remains later Phase 8 work.

## Recovery and troubleshooting [#self-hosting-organization-recovery]

- For `401 product_auth_missing`, log in again or provide a trusted session handoff to the CLI.
- For `403 product_auth_forbidden`, confirm that the current user belongs to the target
  organization. Member management and deploy-token management also require an owner or admin role.
- If a member cannot be removed or demoted, check whether that member is an owner. Owners must be
  transferred to another member first.
- Do not edit auth database tables directly to bypass member, role, or invitation state; use
  CLI/HTTP/API or restore from a trusted backup.
