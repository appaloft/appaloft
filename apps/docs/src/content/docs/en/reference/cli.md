---
title: "CLI reference"
description: "CLI commands, flags, prompts, and documentation links."
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "cli"
  - "command"
  - "terminal"
relatedOperations:
  - projects.create
  - projects.list
  - projects.show
  - servers.register
  - resources.create
  - deployments.create
sidebar:
  label: "CLI reference"
  order: 9
---

## Command shape [#cli-command-shape]

The CLI is a first-class input surface. Commands collect user input and execute shared business operations.

## Help links [#cli-help-links]

CLI help, interactive prompts, and recovery messages should point to stable public docs anchors.

## Appaloft login and CLI profiles [#cli-remote-control-plane-login]

`appaloft login` and `appaloft auth login` default to Appaloft Cloud at `https://app.appaloft.com`. Pass `--url <url>` to connect to self-hosted Appaloft or another trusted endpoint. After verification, the CLI stores the endpoint, profile name, auth reference, and handshake summary in a local CLI profile. The profile lives under `APPALOFT_HOME` or the user's local Appaloft home, not in repository config.

Login first checks `/api/version` and verifies the current organization context. `appaloft auth status`, `appaloft logout`, `appaloft auth logout`, `appaloft context list`, `appaloft context show`, and `appaloft context use <profile>` only manage local profile/context state.

Login is not deployment takeover and it is not SSH PGlite state adoption. It does not create projects, resources, deployments, source links, or domain bindings; it does not add `controlPlane` to `deployments.create`; and it does not write tokens, cookies, database URLs, SSH keys, credential ids, tenant/org secret identities, or raw secret values to committed `appaloft.yml`.

Interactive login uses a browser auth-session exchange. The CLI creates a short-lived login session, prints `verificationUriComplete` and the user code, waits for the user to press Enter before opening the browser when browser opening is enabled, then polls for authorization. With `--no-browser` or CI, it only prints the URL and code. After the browser confirms, the CLI writes a profile only after one-time exchange succeeds and the current organization context verifies. Denied, expired, timed-out, interrupted, failed-exchange, and failed-context sessions do not write partial profiles.

AI agents and CI/automation should not use the browser/user-code flow as the default auth path.
Noninteractive use should prefer scoped, expiring, revocable tokens:

- `APPALOFT_TOKEN=<scoped-token> appaloft <command>` for one-off noninteractive commands;
- `appaloft auth token login --stdin` reads a token from stdin, verifies the endpoint/current organization, and writes a local profile;
- `appaloft auth token login --token-file <path>` lets the user place a token in a controlled secret file for the CLI to read; the agent should not open or print that file.

Do not pass raw tokens as argv values, and do not paste product-session cookies, bearer tokens,
deploy tokens, browser cookies, or token file contents into chat, logs, screenshots, or committed
config. `APPALOFT_AUTH_COOKIE` is only trusted local operator legacy/diagnostic compatibility, not
an AI-agent setup path. `APPALOFT_TOKEN` takes precedence over the legacy cookie in env credential
resolution.

## Remote Appaloft dispatch [#cli-remote-control-plane-dispatch]

With an active profile, or with explicit `--control-plane-mode cloud|self-hosted`, `--control-plane-url <url>`, `APPALOFT_CONTROL_PLANE_MODE`, or `APPALOFT_CONTROL_PLANE_URL`, ordinary CLI business commands resolve an execution target first. `controlPlane.mode: none` and `--control-plane-mode none` continue to use the local CLI/SSH runtime.

A remote target performs compatibility/auth handshake before the business request, then dispatches non-streaming, non-webhook-signature generated SDK operations through the shared typed HTTP/API contract. The CLI does not maintain a separate business schema; the same operation key and input schema are shared with HTTP/oRPC, Web, SDK, and MCP.

Without a profile, URL, token, or other trusted remote source, `auto` and default behavior fall back to local mode. That fallback does not contact public Cloud, scan networks, upload SSH PGlite state, or adopt an SSH server.

`serve`, `db`, `remote-state`, `init`, top-level quick `deploy`, local terminal attach, source-package, and streaming commands remain local or return `control_plane_unsupported` when remote mode is selected explicitly. If remote mode is selected and auth, handshake, or operation capability is not available, the CLI fails instead of silently rerunning locally.

## Local docs path [#cli-local-server-docs]

When the local Appaloft server is running, CLI docs links should prefer local `/docs/*` URLs.

## Automation [#cli-automation]

Automation should prefer explicit flags or config-file fields over non-replayable interactive input.
