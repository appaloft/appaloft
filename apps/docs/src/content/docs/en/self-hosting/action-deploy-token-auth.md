---
title: "Self-hosted Action deploy tokens"
description: "Configure deploy tokens for GitHub Action server API mode on self-hosted Appaloft."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "deploy token"
  - "appaloft-token"
  - "GitHub Action"
  - "self-hosted auth"
  - "401"
  - "403"
relatedOperations:
  - "deploy-tokens.create"
  - "deploy-tokens.list"
  - "deploy-tokens.show"
  - "deploy-tokens.rotate"
  - "deploy-tokens.revoke"
sidebar:
  label: "Action deploy tokens"
  order: 5
---

## Action deploy token authentication [#self-hosting-action-deploy-token-auth]

Self-hosted server API mode rejects GitHub Action mutation requests that do not include a deploy
token. A deploy token is a machine credential for automation. It is not a Web console login session,
and it should not be committed to repository config, workflow file text, URL query strings, or logs.

## Save the GitHub Secret after install [#self-hosting-action-token-setup]

Plain SSH install does not create an Action deploy token by default. If you need GitHub Action
server API mode immediately, pass `--bootstrap-deploy-token` during install. The installer prints a
bootstrap JSON after the Appaloft container is healthy, and the `token` field appears only when the
token is created:

```json
{
  "schemaVersion": "deploy-token.bootstrap/v1",
  "created": true,
  "organizationId": "org_self_hosted",
  "actionSecretName": "APPALOFT_TOKEN",
  "tokenId": "dpt_...",
  "secretSuffix": "abcd1234",
  "token": "aplt_dt_..."
}
```

Save the `token` value as a GitHub repository or organization secret named `APPALOFT_TOKEN`. Pass it
to the Action through the `appaloft-token` input:

```yaml
- uses: appaloft/deploy-action@v1
  with:
    control-plane-mode: self-hosted
    control-plane-url: https://console.example.com
    appaloft-token: ${{ secrets.APPALOFT_TOKEN }}
```

When the installer is rerun and an active deploy token already exists, the output contains safe
metadata only and does not show the raw token again.

## Scopes and current limits [#self-hosting-action-token-scope]

Deploy tokens can be limited by workflow command, project, environment, resource, server, and
repository. When a token uniquely names project, environment, resource, and server, ordinary
self-hosted Action deploys can omit those ids; the server uses the token scope with source-link and
repository facts to resolve the target. The current installer creates the initial self-hosted
Action token so server API deploy, server config deploy, and preview cleanup paths have an
authentication boundary.

After the first admin is created, administrators can manage deploy tokens through CLI or
product-session protected HTTP/API entrypoints. CLI uses the same application command/query
messages:

- `appaloft deploy-token create --organization-id org_self_hosted --display-name "GitHub Action" --workflow-commands source-link-deploy,server-config-deploy,preview-cleanup`
- `appaloft deploy-token list --organization-id org_self_hosted`
- `appaloft deploy-token show dpt_... --organization-id org_self_hosted`

HTTP/API entrypoints are:

- `POST /api/deploy-tokens` creates a token. The raw token in the response is shown once.
- `GET /api/deploy-tokens?organizationId=...` lists safe metadata.
- `GET /api/deploy-tokens/{tokenId}?organizationId=...` shows one token's safe metadata.

Web token management and MCP descriptors use the same deploy-token operation contracts. Do not rely
on manual database edits to expand or bypass token scopes.

## 401 and 403 [#self-hosting-action-auth-errors]

`401 action_auth_missing` means the Action did not send a bearer token. Check that the workflow
passes `appaloft-token: ${{ secrets.APPALOFT_TOKEN }}` and that the GitHub Secret name matches.

`401 action_auth_invalid` means the token is malformed, unknown, expired, revoked, or cannot be
verified by the server. When copying the secret, copy only the `aplt_dt_...` token value, not the
entire bootstrap JSON.

`403 action_auth_forbidden` means the token is valid but its scope does not allow this request. The
usual causes are a repository, project, environment, resource, server, or workflow command mismatch.
It also happens when explicit bootstrap ids or an existing source link point outside the token
scope. Update the token scope, relink the source, or remove the conflicting bootstrap ids.

## Rotation and revocation [#self-hosting-action-token-rotation]

The raw token is shown once. Do not place it in issues, pull request comments, workflow logs, or
deployment output.

If a token is exposed, delete or replace `APPALOFT_TOKEN` in GitHub Secrets first, pause workflows
that use that secret, then call the admin-session protected API:

- `appaloft deploy-token rotate dpt_... --organization-id org_self_hosted --confirm dpt_...`
- `appaloft deploy-token revoke dpt_... --organization-id org_self_hosted --confirm dpt_...`

- `POST /api/deploy-tokens/{tokenId}/rotate` rotates a token. The new raw token in the response is
  shown once.
- `POST /api/deploy-tokens/{tokenId}/revoke` revokes a token. Later Action requests using the old
  token are rejected as invalid credentials.

Until Web token management is complete, keep GitHub Secret visibility narrow and treat raw token
API responses as one-time sensitive output.
