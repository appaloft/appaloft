---
title: "Proxy readiness and terminal sessions"
description: "Understand proxy readiness and controlled terminal troubleshooting."
docType: troubleshooting
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "proxy"
  - "terminal"
  - "shell"
  - "default access"
relatedOperations:
  - servers.configure-edge-proxy
  - servers.bootstrap-proxy
  - terminal-sessions.open
sidebar:
  label: "Proxy and terminal"
  order: 4
---

<h2 id="server-proxy-readiness">Proxy readiness</h2>

Proxy readiness determines whether default access URLs and routes work. Proxy repair is an explicit operation.

The server edge proxy kind is future route intent: `none` means generated access or custom-domain routes should not choose this server as a proxy-backed target; `traefik` and `caddy` let later proxy readiness or deployment ensure flows realize provider-owned proxy configuration. Changing the kind does not start the proxy immediately, delete existing route snapshots, or clean up deployment/domain/audit history.

```bash title="Change future proxy intent"
appaloft server proxy configure srv_primary --kind traefik
```

When changing from `none` to `traefik` or `caddy`, run explicit repair or let a later deployment ensure step handle proxy readiness:

```bash title="Repair proxy readiness explicitly"
appaloft server proxy repair srv_primary
```

<h2 id="server-terminal-session">Open a terminal session</h2>

Terminal sessions are controlled troubleshooting tools, not the normal deployment path.

<h2 id="server-terminal-safe-copy">Copy output safely</h2>

Terminal output can contain paths, environment details, or runtime data. Prefer diagnostic summaries before sharing output.
