---
title: "Advanced reference"
description: "Control-plane modes, packaging, self-hosting, providers, plugins, and advanced runtime notes."
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "advanced"
  - "control plane"
  - "provider"
  - "plugin"
  - "binary"
relatedOperations:
  - control-plane-portability.export-plan
  - control-plane-portability.export
  - control-plane-portability.import-plan
  - control-plane-portability.import
  - control-plane-portability.artifacts.list
  - control-plane-portability.artifacts.show
  - control-plane-portability.artifacts.delete
  - tunnels.start
  - tunnels.list
  - tunnels.show
  - tunnels.revoke
sidebar:
  label: "Advanced reference"
  order: 12
---

## Control-plane modes [#advanced-control-plane-modes]

Appaloft supports local-first, self-hosted, and future cloud-assisted control-plane paths.
`appaloft doctor`, `GET /api/system/doctor`, and the Web Instance page expose local readiness,
provider/plugin diagnostics, and configured scheduled worker activation without starting workers or
dispatching maintenance work.

## Whole-instance portability [#whole-instance-portability]

Owners can export the control-plane database to a passphrase-encrypted artifact and validate it
before importing. The artifact uses AES-256-GCM with a per-artifact salt and authenticated checksum;
the passphrase is accepted from stdin and is never returned in operation readback.

```bash title="Export and validate an instance artifact"
appaloft instance portability export-plan
printf '%s\n' "$APPALOFT_EXPORT_PASSPHRASE" | \
  appaloft instance portability export --output ./appaloft.instance --passphrase-stdin
printf '%s\n' "$APPALOFT_EXPORT_PASSPHRASE" | \
  appaloft instance portability import-plan ./appaloft.instance --mode merge --passphrase-stdin
```

`merge` preserves target rows and rejects incompatible conflicts. `replace` requires
`--acknowledge-replace`; Appaloft creates rollback evidence before the database transaction and
leaves the target unchanged if validation or import fails. Source and target must use the same
supported schema revision. List, inspect, and explicitly delete artifact metadata with
`appaloft instance portability artifact list|show|delete`.

## Temporary tunnels [#temporary-tunnels]

Self-hosted Appaloft can start time-bounded Cloudflare Quick Tunnel or ngrok sessions for a local or
private HTTP origin. Public origins, credential-bearing URLs, non-HTTP schemes, and unsafe provider
output are rejected. Provider tokens are read only from the provider environment (`NGROK_AUTHTOKEN`
for ngrok) and are not persisted or returned.

```bash title="Start, inspect, and revoke a temporary tunnel"
appaloft tunnel start --provider cloudflare-quick --origin http://127.0.0.1:3000 --duration-minutes 60
appaloft tunnel list
appaloft tunnel show tun_123
appaloft tunnel revoke tun_123
```

Enable orphan and expiry cleanup with `APPALOFT_TUNNEL_RECONCILER_ENABLED=true`. Configure its
interval and claim batch using `APPALOFT_TUNNEL_RECONCILE_INTERVAL_SECONDS` and
`APPALOFT_TUNNEL_RECONCILE_BATCH_SIZE`. A distribution may deny tunnel start entirely; check its
capability and authorization readback rather than assuming that the installed provider binary
implies access.

## Maintenance worker activation [#maintenance-worker-activation]

Maintenance workers are background pollers. `appaloft doctor`, `GET /api/system/doctor`, and the
Web Instance page show configured worker status only; they do not start workers, tick schedulers, or
run maintenance work.

By default at the configuration-library level, the certificate retry scheduler starts with the
backend service so accepted certificate work can retry. Preview cleanup retry, preview expiry
cleanup, storage-volume backup, the scheduled task runner, scheduled runtime prune, scheduled
history retention, tunnel reconciliation, and the runtime monitoring collector require explicit
configuration and are disabled by default. The official self-host image explicitly overrides that
default for storage-volume backup and tunnel reconciliation; other distributions choose their own
safe defaults.

Even when a worker is enabled, it still follows its safety mode: scheduled runtime prune requires a
configured prune policy, history retention follows retention policy, the runtime monitoring
collector records bounded samples, and the scheduled task runner only runs due scheduled task runs.
The doctor output and Web Instance panel also show the safe `APPALOFT_*` configuration keys for each
worker, so a disabled worker remains explicit until an operator changes the matching setting.

## Binary packaging [#advanced-binary-packaging]

The binary embeds Web console assets and public docs assets separately. Docs are served under `/docs/*`. When `APPALOFT_DOCS_STATIC_DIR` is set, Appaloft serves docs from that directory while Web console assets keep their own source.

## Provider boundary [#advanced-provider-boundary]

Provider docs explain what users can configure and observe without leaking provider SDK types.

## Plugin boundary [#advanced-plugin-boundary]

Plugin docs explain compatibility, permissions, and sandbox assumptions.
