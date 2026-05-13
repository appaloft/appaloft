---
title: "First admin bootstrap"
description: "Create the local first admin after self-hosted install, log in to the console, and handle OAuth and recovery safely."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "first admin"
  - "bootstrap"
  - "local admin"
  - "OAuth"
  - "login"
  - "product_auth_missing"
  - "product_auth_forbidden"
relatedOperations:
  - "auth.bootstrap-status"
  - "auth.bootstrap-first-admin"
sidebar:
  label: "First admin"
  order: 2
---

<h2 id="self-hosting-first-admin-bootstrap">First admin bootstrap</h2>

A self-hosted Appaloft instance needs one local admin the first time it starts. This account logs in
to the Web console, finishes organization setup, and can manage deploy tokens and members after
admin authorization surfaces are available.

The installer can create the first admin from trusted install input:

```sh
curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- \
  --first-admin-email admin@example.com \
  --first-admin-name "Admin"
```

When `--first-admin-password` is not provided, the installer generates a one-time password and
prints it once from trusted handoff output after the Appaloft container becomes healthy. Save it
immediately. If the installer is rerun after an admin or organization owner already exists,
bootstrap is skipped safely and the password is not shown again.

To provide your own initial password, pass:

```sh
curl -fsSL https://appaloft.com/install.sh | sudo sh -s -- \
  --first-admin-email admin@example.com \
  --first-admin-password "$APPALOFT_INITIAL_ADMIN_PASSWORD"
```

The installer does not echo a supplied password. Do not place passwords in repository config, shell
history, CI logs, issues, pull request comments, or deployment output.

If the installer did not receive a first-admin email, open the printed console URL after install.
The console checks bootstrap status and sends first-time visitors to
`/bootstrap/auth/first-admin`. You can also open that setup path directly. The page reads bootstrap
status first; if the instance already has an admin, it sends you to `/login` instead of creating
another account.

CLI bootstrap uses the same application command/query path:

```sh
appaloft auth bootstrap-status
appaloft auth bootstrap-first-admin \
  --email admin@example.com \
  --display-name "Admin"
```

<h2 id="self-hosting-first-admin-login">Log in to the console</h2>

The installer prints the console URL. Without a domain, it is usually the server's `3721` port. With
`--domain`, use that HTTPS domain.

Log in with the first-admin email and password. After login, Appaloft recognizes your user session
and protects product mutations by organization role. A mutation without a session returns
`401 product_auth_missing`; a logged-in user outside the organization or without enough role returns
`403 product_auth_forbidden`.

To end the browser session, use the **Sign out** control in the console header or user menu. The
console clears its cached session state and returns to `/login`.

<h2 id="self-hosting-first-admin-public-api">Bootstrap status and setup API</h2>

Install and console setup flows can read the public bootstrap status:

```http
GET /api/bootstrap/auth/status
```

When the status says a first admin is required, a setup flow can call the setup endpoint once:

```http
POST /api/bootstrap/auth/first-admin
```

These bootstrap endpoints are intentionally public; they do not require an existing product session.
Safety comes from the one-time and idempotent setup rule: after an admin or organization owner
exists, setup does not create another admin or return a password.

<h2 id="self-hosting-first-admin-oauth">OAuth is optional</h2>

Google, GitHub, or generic OIDC can be configured later. When the client id, client secret,
callback URL, or trusted origin is missing, OAuth login should stay disabled, but local first-admin
login should still work.

Use the local admin for the first login. After the console is reachable, add OAuth configuration:

| Provider | Required settings |
| --- | --- |
| GitHub | `APPALOFT_GITHUB_CLIENT_ID`, `APPALOFT_GITHUB_CLIENT_SECRET`, `APPALOFT_GITHUB_REDIRECT_URI` |
| Google | `APPALOFT_GOOGLE_CLIENT_ID`, `APPALOFT_GOOGLE_CLIENT_SECRET`, `APPALOFT_GOOGLE_REDIRECT_URI` |
| OIDC | `APPALOFT_OIDC_CLIENT_ID`, `APPALOFT_OIDC_CLIENT_SECRET`, `APPALOFT_OIDC_DISCOVERY_URL`, `APPALOFT_OIDC_REDIRECT_URI` |

Callback URLs use the auth API origin. GitHub and Google default to
`<APPALOFT_BETTER_AUTH_URL>/api/auth/callback/<provider>`, and generic OIDC defaults to
`<APPALOFT_BETTER_AUTH_URL>/api/auth/oauth2/callback/oidc`. Configure the browser console origin
through `APPALOFT_WEB_ORIGIN` so it is trusted by the auth runtime.

Do not manually edit database user, member, or organization rows to bypass first login.

<h2 id="self-hosting-first-admin-next-team">Next: manage organization members</h2>

The first admin becomes the owner of the initial organization. After login, use
[Organization team management](/docs/en/self-hosting/organization-team-management/) to read the
current organization context, invite members, update roles, remove members, and recover from
`401 product_auth_missing` or `403 product_auth_forbidden`.

<h2 id="self-hosting-first-admin-recovery">Recovery and troubleshooting</h2>

If the generated one-time password is lost, rerunning the installer will not show the old password
again. Prefer an existing admin session or a formal admin recovery flow when available. For early
self-hosted instances with no usable admin, restore from a trusted backup instead of editing auth
database tables directly.

If you cannot log in after install:

- Confirm you are using the console URL printed by the installer, not a project resource domain.
- Check that the first-admin email matches the install input.
- Check whether installer output says bootstrap was skipped; if it was skipped, the instance
  already has an admin or owner.
- For `401 product_auth_missing`, log in again. For `403 product_auth_forbidden`, confirm the user
  belongs to the target organization and has admin or owner role.
