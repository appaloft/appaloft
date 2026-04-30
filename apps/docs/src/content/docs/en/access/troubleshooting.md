---
title: "Access troubleshooting"
description: "Troubleshoot default URLs, custom domains, DNS, and TLS failures."
docType: troubleshooting
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "dns"
  - "tls error"
  - "domain failed"
relatedOperations:
  - domain-bindings.create
  - certificates.issue-or-renew
sidebar:
  label: "Troubleshooting"
  order: 6
---

<h2 id="access-troubleshooting-order">Troubleshooting order</h2>

Check resource runtime state, then proxy readiness, then domain ownership, then certificate readiness.

When an app does not open, do not rely on one URL or one log line. Appaloft splits route intent and
status across readable surfaces:

- Resource detail and `appaloft resource show <resourceId>`: inspect the selected access URL and
  whether generated access, custom domains, or server-applied routes exist at the same time.
- `appaloft resource health <resourceId> --checks --public-access-probe`: compare runtime, health
  checks, proxy, and public access with stable blocking reasons instead of a generic access failure.
- `appaloft resource proxy-config <resourceId>`: inspect planned or provider-rendered proxy
  host/path/target entries, which is useful for route missing, stale, or failed states.
- `appaloft resource logs <resourceId>`: inspect application stdout/stderr for startup command,
  port, configuration, and runtime errors.
- `appaloft logs <deploymentId>`: inspect one deployment attempt's execution logs. These are
  deployment history, not current route state.
- `appaloft resource diagnose <resourceId>`: copy a safe diagnostic summary that combines access,
  proxy, health, runtime logs, deployment logs, and recommended actions.

The Web console, CLI, and HTTP API use the same operation contracts. The Web resource detail,
health, proxy configuration, logs, and diagnostic copy affordances map to
`/api/resources/{resourceId}`, `/api/resources/{resourceId}/health`,
`/api/resources/{resourceId}/proxy-configuration`, `/api/resources/{resourceId}/runtime-logs`, and
`/api/resources/{resourceId}/diagnostic-summary`; deployment logs map to
`/api/deployments/{deploymentId}/logs`.

<h2 id="access-dns-failures">DNS failures</h2>

Confirm record type, target value, TTL, and whether the record points at the current server or proxy entrypoint.
