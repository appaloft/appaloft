---
title: "Register and test a server"
description: "Register a deployment target server and run connectivity checks."
docType: task
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "server"
  - "connectivity"
  - "ssh test"
relatedOperations:
  - servers.register
  - servers.show
  - servers.rename
  - servers.deactivate
  - servers.delete-check
  - servers.delete
  - servers.test-connectivity
sidebar:
  label: "Register and test"
  order: 2
---

![Server connectivity flow](/docs/diagrams/server-connectivity.svg)

<h2 id="server-deployment-target">What a server is</h2>

A server is a target Appaloft can connect to, inspect, and deploy applications onto. Users see SSH address, credential, connectivity state, runtime summary, and proxy readiness.

A server is not a project or a resource. One server can host multiple resources, and resource access still depends on network profile and proxy readiness.

Registering a server makes Appaloft able to execute deployment plans. It does not deploy an app by itself.

Reading server detail confirms a deployment target's host, provider, masked credential summary, proxy status, and current deployment, resource, and domain rollups. This read does not run connectivity checks, repair proxy state, or mutate the server.

Renaming a server changes only the display name. It does not change server id, host, provider, credential, proxy, lifecycle, or historical deployment/domain/audit references. Active and inactive servers can both be renamed; deleted servers are not visible through the normal rename entrypoint.

Deactivating a server prevents it from being used as a new deployment, scheduling, or proxy configuration target. Deactivation does not stop existing runtime work and does not delete deployment history, domains, certificates, credentials, routes, logs, or audit records.

Before deletion, run the delete safety check. The check returns blocker reasons such as the server still being active, retained deployment history, active deployments, resource placement, domains, certificates, attached credentials, server-applied routes, default access policy, terminal sessions, runtime tasks, logs, or audit retention. The check is a preview and does not delete anything.

Server deletion is only for a deactivated server with no blockers. Deletion removes the server from normal list, detail, and new deployment target selection, but it does not automatically clean up deployment history, resources, domains, certificates, credentials, routes, logs, or audit records. CLI deletion requires explicit confirmation, such as `--confirm srv_primary`.

<h2 id="server-connectivity-test">Connectivity test</h2>

Connectivity checks confirm that Appaloft can reach the server and read required runtime information. A failed check does not mean old deployments failed, but it should block new deployments that depend on the server.

Checks should cover:

- DNS/IP and port reachability.
- SSH credential validity.
- User permissions required for deployment.
- Basic runtime environment requirements.
- Proxy or Docker diagnostics when relevant.

<h2 id="server-registration-inputs">Registration inputs</h2>

Register host, port, user, credential source, and optional labels. Do not put resource, environment, or domain concerns into server registration.

Common inputs:

- `host`: server address.
- `port`: SSH port, usually 22.
- `user`: system user.
- credential: SSH key path, saved credential, or one-time secret input.
- display name / labels: helps users identify the server.

<h2 id="server-registration-surfaces">Entrypoints</h2>

The Web console should guide registration and connectivity testing together. After SSH input, users should immediately see test results and next steps.

The CLI fits local SSH bootstrap because it can read local key paths and ask for confirmation.

The HTTP API fits automated server registration, but should never echo secrets. Connectivity results should be structured.

<h2 id="server-registration-recovery">Recovery</h2>

Common failures:

- Timeout: check host, port, firewall, and network.
- Authentication failure: check SSH key, user, and authorized keys.
- Permission failure: check whether the user can run required deployment commands.
- Missing runtime: follow diagnostic instructions or select a supported provider/runtime.

After connectivity passes, continue with [SSH credentials](/docs/en/servers/credentials/ssh-keys/) and [Proxy readiness](/docs/en/servers/operations/proxy-and-terminal/).

CLI examples:

```bash title="Register a server"
appaloft server register \
  --name primary \
  --host 203.0.113.10 \
  --port 22 \
  --provider generic-ssh \
  --proxy-kind traefik
```

```bash title="Run connectivity test"
appaloft server test srv_primary
```

```bash title="Read server detail"
appaloft server show srv_primary
```

```bash title="Rename a server"
appaloft server rename srv_primary --name "Primary SSH server"
```

```bash title="Deactivate a server"
appaloft server deactivate srv_primary
```

```bash title="Check delete safety"
appaloft server delete-check srv_primary
```

```bash title="Delete a deactivated server with no blockers"
appaloft server delete srv_primary --confirm srv_primary
```
