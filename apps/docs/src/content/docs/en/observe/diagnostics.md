---
title: "Diagnostics"
description: "Copy safe diagnostic summaries without exposing secrets."
docType: troubleshooting
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "diagnostic"
  - "support payload"
  - "secret masking"
relatedOperations:
  - resources.diagnostic-summary
  - resources.access-failure-evidence.lookup
  - servers.capacity.inspect
sidebar:
  label: "Diagnostics"
  order: 4
---

<h2 id="diagnostic-summary-copy-support-payload">Copy diagnostic summary</h2>

Diagnostic summaries should include stable IDs, status, error codes, and safe context while masking secret values.

Prefer Appaloft-generated diagnostic summaries over manually assembling logs, environment variables, and server command output.

Diagnostic summaries should include:

- Stable project, resource, environment, and deployment ids.
- Latest failed phase and error code.
- Safe source/runtime/health/network summaries.
- Server and proxy readiness summary.
- Access URL, domain, and certificate status.
- Access-failure request id, affected hostname/path, safe related ids, and next action.
- Masked secret key names and presence, without values.

<h2 id="access-failure-request-id-lookup">Look up an access failure by Request ID</h2>

When an Appaloft generated URL or custom domain fails, the error page shows a request id. Resource
owners can use that request id to find the short-retention safe evidence:

```bash title="Look up access failure evidence"
appaloft resource access-failure req_abc123
```

Narrow the lookup with a resource, hostname, or path when useful:

```bash title="Narrow by resource and path"
appaloft resource access-failure req_abc123 --resource res_web --host web.example.com --path /
```

The result contains only the safe envelope, matched source, related ids, next action, `capturedAt`,
and `expiresAt`. If the evidence expired or filters do not match, Appaloft returns a stable
not-found result instead of leaking other resource details. Do not share screenshots, SSH output,
raw Traefik logs, cookies, Authorization headers, or provider raw payloads as diagnostic evidence.

<h2 id="runtime-target-capacity-inspect">Runtime target capacity inspect</h2>

When a deployment fails because the target is out of disk, inodes, Docker image store, or build
cache capacity, start with the read-only capacity diagnostic:

```bash title="Inspect server capacity without cleanup"
appaloft server capacity inspect srv_primary
```

This entrypoint only reads capacity signals. It does not run prune, delete Docker volumes, delete
`/var/lib/appaloft/runtime/state`, or stop containers. The output includes disk, inodes, Docker
image/build-cache usage, Appaloft runtime/state/source workspace usage, safe reclaimable estimates,
and warnings.

`safeReclaimableEstimate` is input for a later cleanup or prune decision. It does not mean Appaloft
has cleaned anything.

<h2 id="diagnostic-secret-masking">Secret masking</h2>

Do not copy private keys, full environment variable values, tokens, or database connection strings. Prefer Appaloft-generated safe summaries.

Never share:

- SSH private keys.
- API tokens or session tokens.
- Database connection strings.
- Full `.env` files.
- Certificate private keys.
- Complete server shell history.

<h2 id="diagnostic-when-to-copy">When to copy diagnostics</h2>

Copy diagnostics when:

- Deployment failed and the message is not enough.
- Generated access, custom domain, or TLS state disagrees.
- Health checks and runtime logs appear contradictory.
- A teammate or support person needs context.

Before sharing extra logs, trim to the relevant time window and check for sensitive values.

CLI example:

```bash title="Copy support-safe diagnostics"
appaloft resource diagnose res_web \
  --deployment dep_123 \
  --deployment-logs \
  --runtime-logs \
  --tail 50
```

Diagnostic summary shape:

```json title="Safe diagnostic payload"
{
  "resourceId": "res_web",
  "deploymentId": "dep_123",
  "failedPhase": "verify",
  "errorCode": "health_check_failed",
  "accessFailure": {
    "requestId": "req_abc123",
    "code": "resource_access_upstream_timeout",
    "affected": { "hostname": "web.example.com", "path": "/" },
    "nextAction": "check-health"
  },
  "secrets": [
    { "key": "DATABASE_URL", "value": "***" }
  ],
  "nextAction": "Check health path and runtime logs."
}
```
