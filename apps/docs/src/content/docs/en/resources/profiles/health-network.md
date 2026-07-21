---
title: "Health and network profiles"
description: "Configure readiness checks, listener ports, and proxy targets."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "health"
  - "readiness"
  - "network"
  - "port"
relatedOperations:
  - resources.configure-health
  - resources.reset-health
  - resources.configure-network
sidebar:
  label: "Health and network"
  order: 4
---

## Health profile [#resource-health-profile]

The health profile controls how verify decides whether the app is usable. It should match the path users actually depend on, not only process existence.

Common fields:

- Health check type, such as HTTP.
- Check path, such as `/health`.
- Expected status code.
- Interval, timeout, retries, and start period.

If no health check is configured, Appaloft can fall back to weaker runtime checks, but UI and docs should make that clear.

Resetting the health profile removes the reusable health policy for future deployments and current health observation. It keeps runtime commands, network settings, deployment history, and the current runtime unchanged.

## Network profile [#resource-network-profile]

The network profile describes listener ports, protocols, and proxy targets. It answers where the proxy should send traffic.

Common fields:

- Internal listener port.
- Protocol, such as HTTP.
- Whether proxy/public access is required.
- Optional service name or target hint.

Custom domains are separate access configuration. Make network profile and generated access work before handling DNS/TLS.

Saving the network profile is a durable resource profile edit. It only affects future deployment admission and route planning. It does not edit historical deployment snapshots, immediately apply proxy routes, or restart the current runtime.

## Readiness failures [#resource-readiness-failures]

If health checks fail, inspect the listener port, path, startup time, and proxy target before retrying or changing the profile.

Troubleshooting order:

1. Inspect runtime logs.
2. Confirm the app listener port.
3. Confirm health path and expected status.
4. Confirm start period is long enough.
5. Confirm proxy readiness and generated access.

## Entrypoints [#resource-health-network-surfaces]

The Web console should expose health/network fields during resource creation and configuration, including defaults.

The CLI should allow configuring health and network profiles and point failures at the relevant profile rather than a generic failure.

The HTTP API should return profile summaries, latest health observations, and structured errors.

Related pages: [Generated access routes](/docs/en/access/generated-routes/) and [Logs and health](/docs/en/observe/logs-health/).

CLI examples:

```bash title="Configure HTTP health check"
appaloft resource configure-health res_web \
  --path /health \
  --method GET \
  --expected-status 200 \
  --interval 5 \
  --timeout 5 \
  --retries 10 \
  --start-period 15
```

```bash title="Reset health policy"
appaloft resource reset-health res_web
```

```bash title="Configure network profile"
appaloft resource configure-network res_web \
  --internal-port 3000 \
  --upstream-protocol http \
  --exposure-mode reverse-proxy
```
