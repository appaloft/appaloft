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
  - runtime-usage.inspect
  - servers.capacity.inspect
  - servers.capacity.prune
  - scheduled-runtime-prune-policies.configure
  - scheduled-runtime-prune-policies.list
  - scheduled-runtime-prune-policies.show
sidebar:
  label: "Diagnostics"
  order: 4
---

## Copy diagnostic summary [#diagnostic-summary-copy-support-payload]

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

## Look up an access failure by Request ID [#access-failure-request-id-lookup]

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

## Runtime target capacity inspect [#runtime-target-capacity-inspect]

When a deployment fails because the target is out of disk, inodes, Docker image store, or build
cache capacity, start with the read-only capacity diagnostic:

```bash title="Inspect server capacity without cleanup"
appaloft server capacity inspect srv_primary
```

This entrypoint only reads capacity signals. It does not run prune, delete Docker volumes, delete
`/var/lib/appaloft/runtime/state`, or stop containers. The output includes disk, inodes, Docker
image/build-cache usage, Appaloft runtime/state/source workspace usage, Appaloft-managed container
label/size evidence, source workspace metadata, safe reclaimable estimates, and warnings.

`safeReclaimableEstimate` is input for a later cleanup or prune decision. It does not mean Appaloft
has cleaned anything.

## Runtime usage attribution inspect [#runtime-usage-inspect]

When you need to see how Appaloft attributes runtime capacity to one scope, use the read-only usage
attribution query:

```bash title="Inspect runtime usage for a server scope"
appaloft runtime-usage inspect server:srv_primary
```

The HTTP API uses the same query boundary:

```http title="Inspect runtime usage over HTTP"
GET /api/runtime-usage/inspect?scope.kind=server&scope.serverId=srv_primary
```

The first implementation translates safe server-scope capacity diagnostics into
`runtime-usage.inspect/v1` totals, artifacts, warnings, and sourceErrors. This query does not save
samples, run prune, stop or restart runtimes, deploy, enforce quota, or evaluate threshold policy.
Appaloft-managed container labels can provide current resource/deployment attribution and runtime
ids when those labels are present. Source workspace metadata can provide deployment-id evidence for
resource rollups, and retained runtime identity metadata can add runtime ids when present. The
internal collector service writes sanitized observations through the `runtime-usage.inspect` query
boundary into the retained sample store; the disabled-by-default background collector runner writes
retained samples for active servers and runtime-owning resources/deployments/projects/environments
when enabled. Server/resource Web Monitor surfaces read retained samples, rollup summaries,
deployment marker counts, and threshold state when available, with browser-local live samples as
fallback. Threshold reads prefer exact-scope policy, then the nearest parent policy derivable from
retained sample scope evidence. Server/resource Web Monitor can also configure exact-scope CPU
`containerCpuPercent`, memory `usedBytes`, and disk `usedBytes` thresholds while preserving
existing advanced rules for exact-scope edits. Full Observe charts remain a governed follow-up
slice.

## Runtime monitoring samples and rollups [#runtime-monitoring-samples-and-rollups]

`runtime-monitoring.samples.list` and `runtime-monitoring.rollup` expose retained sample and rollup
read APIs. They return data only when a retained monitoring sample store already contains sanitized
samples for the requested scope and window. Current Web Monitor surfaces prefer retained samples;
when none exist, they fall back to browser-local Monitor sparklines from `runtime-usage.inspect`
polling. They also read `runtime-monitoring.rollup` series, deployment marker counts, and top
contributor counts to show backend rollup state. Their links to logs, events, and diagnostics carry
the current monitoring window and stable scope id as query parameters so those governed surfaces can
preserve operator context without copying logs into monitoring records. Resource runtime logs use
that handoff as the log `since` boundary, resource/server deployment tables filter to matching
deployment timestamps, and diagnostic summary copies pass the window as `observationFrom` and
`observationTo` so copied deployment/runtime log evidence stays scoped. Those
browser-local points are not stored monitoring samples.

```bash title="Read retained runtime monitoring samples"
appaloft runtime-monitoring samples resource:res_api --from 2026-01-01T00:00:00.000Z --to 2026-01-01T01:00:00.000Z --signal cpu
```

```http title="Read a retained runtime monitoring rollup"
GET /api/runtime-monitoring/rollup?scope.kind=resource&scope.resourceId=res_api&window.from=2026-01-01T00%3A00%3A00.000Z&window.to=2026-01-01T01%3A00%3A00.000Z&bucket=minute
```

These queries read only bounded, sanitized retained observations. They do not collect fresh metrics,
run cleanup, stop or restart runtimes, copy log lines into monitoring records, or enforce thresholds.

## External observability handoff [#external-observability-handoff]

Appaloft runtime monitoring is intentionally smaller than a metrics platform. Use external
observability systems for Prometheus or PromQL, Grafana dashboards, custom metric ingestion,
application APM, tracing, alert routing, incident workflows, billing analytics, autoscaling, quota
enforcement, and long-retention analytics. Appaloft keeps only the deployment-platform maintenance
view: bounded retained usage samples, shallow rollups, deployment markers, non-enforcing threshold
state, scoped time-window handoffs to existing logs, health, diagnostics, and safe cleanup
dry-runs, and target-side filtering where those surfaces already expose a compatible boundary.

## Runtime monitoring thresholds [#runtime-monitoring-thresholds]

`runtime-monitoring.thresholds.configure` writes exact-scope warning/critical threshold policy.
`runtime-monitoring.thresholds.show` reads the exact policy first, then can inherit the nearest
parent policy from retained sample scope evidence. Server/resource Web Monitor surfaces read
threshold state and provides CPU `containerCpuPercent`, memory `usedBytes`, and disk `usedBytes`
warning/critical threshold configuration; other advanced metrics remain configurable through
CLI/API. Saving inherited readback creates an exact-scope override. Thresholds are
observation-only state; they never throttle, resize, restart, redeploy, prune, reject deployments,
change billing, or trigger automated repair.

Repository config can also declare Resource-scope threshold policy with
[`monitoring.thresholds`](../environments/reference/config-file#environment-config-file-monitoring-thresholds).

```bash title="Configure a non-enforcing threshold"
appaloft runtime-monitoring thresholds configure resource:res_api --rule '{"signal":"cpu","metric":"containerCpuPercent","warning":70,"critical":90,"comparator":"greater-than-or-equal"}'
```

```http title="Read threshold policy and latest state"
GET /api/runtime-monitoring/thresholds?scope.kind=resource&scope.resourceId=res_api
```

To preview target-owned cleanup, run prune in dry-run mode:

```bash title="Dry-run runtime target prune"
appaloft server capacity prune srv_primary --before 2026-01-01T00:00:00.000Z
```

Docker build cache and unused image cleanup are explicit opt-in categories:

```bash title="Dry-run Docker cache and image prune"
appaloft server capacity prune srv_primary --before 2026-01-01T00:00:00.000Z --category docker-build-cache --category unused-images
```

Old SSH remote-state marker archives are also explicit opt-in:

```bash title="Dry-run remote-state marker prune"
appaloft server capacity prune srv_primary --before 2026-01-01T00:00:00.000Z --category remote-state-markers
```

Large dry-runs return bounded candidate details plus summary counts and estimated reclaimable
bytes. For SSH PGlite state, live `pglite`, `locks`, `source-links`, `server-applied-routes`, and
`sync-revision.txt` are not remote-state marker candidates. The `ssh-pglite` backend remains the
authoritative standalone SSH state mode; console/Postgres-managed deploys do not create remote
PGlite sync backups. Upload safety backups under
`state/backups/sync-*` are retained within the configured recovery window and sync-backup count cap
before older archives become eligible for sync retention or explicit marker cleanup.

Destructive prune still requires `--dry-run false`. Appaloft never runs broad `docker system prune`
or Docker volume prune from this command, and it preserves Appaloft state roots, active runtimes,
live remote state, rollback candidates, deployment snapshots, audit/events, logs, and business
state. Archiving a Resource first stops its current runtime; after that archive succeeds, its
stopped current container may become eligible for exact stopped-container prune, but any explicitly
retained rollback candidate remains protected.

## Scheduled runtime prune policy [#scheduled-runtime-prune-policy]

Scheduled runtime prune policies let operators configure the retention window that the internal
runtime prune scheduler reads before it dispatches safe capacity cleanup work. The scheduler still
uses the same `servers.capacity.prune` boundary as manual prune, so destructive cleanup remains
disabled unless a policy explicitly enables it.

Create or replace a policy with a scope, retention window, target selector, and cleanup categories:

```bash title="Configure scheduled runtime prune policy"
appaloft server capacity policy configure \
  --scope project \
  --server-id srv_primary \
  --retention-days 14 \
  --category stopped-containers
```

The default policy is enabled, retries on failure, and runs as dry-run because `--destructive`
defaults to `false`. Add `--destructive true` only after a dry-run has shown the expected
candidates. Docker build cache, unused image cleanup, and remote-state markers remain explicit
categories. A preview-oriented policy can include stopped containers, preview/source workspaces,
Docker cache, unused images, and remote-state markers, but remote-state markers are never implied by
the default category set.

List configured policies when checking what the scheduler can read:

```bash title="List scheduled runtime prune policies"
appaloft server capacity policy list --server-id srv_primary --enabled-only true
```

Show one policy by id when auditing a scheduler decision:

```bash title="Show scheduled runtime prune policy"
appaloft server capacity policy show rtp_primary
```

The HTTP API exposes the same command/query surfaces at `POST /api/servers/capacity/policies`,
`GET /api/servers/capacity/policies`, and
`GET /api/servers/capacity/policies/{policyId}`. Policy readback is safe: it includes ids, scope,
retention days, enabled state, destructive mode, category names, retry behavior, and update time,
but not runtime command output or secrets.

Policy precedence follows Appaloft configuration precedence:

```text title="Scheduled runtime prune policy precedence"
defaults < system < organization < project < environment < deployment snapshot
```

Configured policies can use the `deployment-snapshot` scope. Repository or deployment-snapshot
configuration does not yet create those policy records automatically, so create them through the
policy command or API. Use operator work to inspect accepted scheduled prune attempts and failures.

## Secret masking [#diagnostic-secret-masking]

Do not copy private keys, full environment variable values, tokens, or database connection strings. Prefer Appaloft-generated safe summaries.

Never share:

- SSH private keys.
- API tokens or session tokens.
- Database connection strings.
- Full `.env` files.
- Certificate private keys.
- Complete server shell history.

## When to copy diagnostics [#diagnostic-when-to-copy]

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
  --deployment-timeline \
  --runtime-logs \
  --tail 50
```

Add `--summary` when you want section status, stable error codes, and next diagnostic context before
copying the full JSON. Keep the default JSON output, or pass `--json`, when sharing a structured
payload with support or an issue tracker.

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
