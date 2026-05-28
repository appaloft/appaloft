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

<h2 id="cli-command-shape">Command shape</h2>

The CLI is a first-class input surface. Commands collect user input and execute shared business operations.

<h2 id="cli-help-links">Help links</h2>

CLI help, interactive prompts, and recovery messages should point to stable public docs anchors.

<h2 id="cli-remote-control-plane-login">Remote control-plane login</h2>

`appaloft login --url <url>` and `appaloft auth login --url <url>` store the endpoint, profile name, auth reference, and handshake summary for Appaloft Cloud or a self-hosted control plane in a local CLI profile. The profile lives under `APPALOFT_HOME` or the user's local Appaloft home, not in repository config.

Login first checks `/api/version` and verifies the current organization context. `appaloft auth status`, `appaloft logout`, `appaloft auth logout`, `appaloft context list`, `appaloft context show`, and `appaloft context use <profile>` only manage local profile/context state.

Login is not deployment takeover and it is not SSH PGlite state adoption. It does not create projects, resources, deployments, source links, or domain bindings; it does not add `controlPlane` to `deployments.create`; and it does not write tokens, cookies, database URLs, SSH keys, credential ids, tenant/org secret identities, or raw secret values to committed `appaloft.yml`.

Current Cloud support requires an explicit `--url` plus trusted local token or session input. Default Cloud URL selection and browser/device/OIDC login remain future capabilities.

<h2 id="cli-remote-control-plane-dispatch">Remote control-plane dispatch</h2>

With an active profile, or with explicit `--control-plane-mode cloud|self-hosted`, `--control-plane-url <url>`, `APPALOFT_CONTROL_PLANE_MODE`, or `APPALOFT_CONTROL_PLANE_URL`, ordinary CLI business commands resolve an execution target first. `controlPlane.mode: none` and `--control-plane-mode none` continue to use the local CLI/SSH runtime.

A remote target performs compatibility/auth handshake before the business request, then dispatches non-streaming, non-webhook-signature generated SDK operations through the shared typed HTTP/API contract. The CLI does not maintain a separate business schema; the same operation key and input schema are shared with HTTP/oRPC, Web, SDK, and MCP.

Without a profile, URL, token, or other trusted remote source, `auto` and default behavior fall back to local mode. That fallback does not contact public Cloud, scan networks, upload SSH PGlite state, or adopt an SSH server.

`serve`, `db`, `remote-state`, `init`, top-level quick `deploy`, local terminal attach, source-package, and streaming commands remain local or return `control_plane_unsupported` when remote mode is selected explicitly. If remote mode is selected and auth, handshake, or operation capability is not available, the CLI fails instead of silently rerunning locally.

<h2 id="cli-local-server-docs">Local docs path</h2>

When the local Appaloft server is running, CLI docs links should prefer local `/docs/*` URLs.

<h2 id="cli-automation">Automation</h2>

Automation should prefer explicit flags or config-file fields over non-replayable interactive input.
