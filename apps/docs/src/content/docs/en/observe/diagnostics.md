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
- Masked secret key names and presence, without values.

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
  "secrets": [
    { "key": "DATABASE_URL", "value": "***" }
  ],
  "nextAction": "Check health path and runtime logs."
}
```
