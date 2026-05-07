---
title: "Errors and statuses"
description: "User-visible errors, phases, and status values."
docType: reference
localeState:
  zh-CN: complete
  en-US: complete
searchAliases:
  - "error"
  - "status"
  - "phase"
relatedOperations:
  - operator-work.list
  - operator-work.show
sidebar:
  label: "Errors and statuses"
  order: 4
---

<h2 id="reference-error-shape">Error shape</h2>

User-visible errors should include stable code, category, phase, and actionable recovery guidance.

<h2 id="error-knowledge-contract">Error Knowledge Contract</h2>

Appaloft errors should not collapse to a message string. Public entrypoints should preserve stable `code`, `category`, `phase`, `retryable`, safe details, and known error knowledge:

- `responsibility`: whether the failure mainly belongs to the user, operator, system, provider, or Appaloft.
- `actionability`: whether callers should fix input, wait and retry, run diagnostics, rely on automatic recovery, report a bug, or take no user action.
- `links`: human public docs, agent-readable guides, related specs, runbooks, or source symbols.
- `remedies`: recovery actions that are safe to show or suggest.

Web, CLI, HTTP/API, and future MCP tools should render errors from those fields instead of branching on message text.

<h2 id="operator-work-ledger">Operator work ledger</h2>

When deployment, proxy bootstrap, certificate, or remote-state background work does not finish as expected, inspect the work ledger before guessing which recovery command to run:

```bash title="View background work"
appaloft work list
appaloft work show <workId>
```

The work ledger is read-only. It summarizes attempt kind, status, phase, related resource/server/deployment/certificate ids, stable error code/category, retriability, and safe `nextActions`. `diagnostic` means run a diagnostic first; `manual-review` means an operator should inspect the item; `retry` only means a future recovery command may consider retrying, and the query itself will not execute a retry; `no-action` means the item does not currently require user action.

This entrypoint does not retry, cancel, recover, dead-letter, delete, or prune anything. Recovery, cleanup, and retry capabilities are exposed through separate explicit commands so viewing status cannot accidentally mutate runtime or remote SSH state.

<h2 id="remote-state-resolution">SSH remote state resolution</h2>

`infra_error` + `remote-state-resolution` means Appaloft reached the SSH target but could not prepare the server-owned `ssh-pglite` state root before deployment identity resolution. Common causes are insufficient disk or inode capacity, a read-only filesystem, missing write permission for the configured runtime root, or a remote shell command failure while creating the state, lock, backup, or journal directories.

Recommended handling:

1. Inspect the error details printed by the CLI, especially `stateBackend`, `host`, `port`, `exitCode`, `reason`, and `stderr`.
2. If `stderr` mentions no space, quota, read-only filesystem, or permission denied, fix the SSH target capacity or permissions for the configured runtime root, usually `/var/lib/appaloft/runtime/state`.
3. Run `appaloft server capacity inspect` or an equivalent SSH diagnostic before retrying when the error points at target capacity.
4. Retry the deploy after the target can create and write the Appaloft state directories.

<h2 id="remote-state-lock">SSH remote state lock</h2>

`infra_error` + `remote-state-lock` means the SSH `ssh-pglite` state root is protected by another Appaloft process, or a previously cancelled process left a lock that has not aged past its stale window. It is usually an operator-diagnosable infrastructure error, not invalid deployment input.

Recommended handling:

1. Inspect safe details such as `lockOwner`, `correlationId`, `lockHeartbeatAt`, `staleAfterSeconds`, and `waitedSeconds`.
2. Appaloft deploy and cleanup commands already use bounded waiting and stale-only lock recovery when the heartbeat has aged past the stale window.
3. If the heartbeat is still updating, wait for the active deployment or retry later.
4. If the error repeats, run `appaloft remote-state lock inspect --server-host <host>` with the same SSH target options to inspect remote lock owner metadata without entering the deployment mutation path.
5. Run `appaloft remote-state lock recover-stale --server-host <host>` only when diagnostics show the heartbeat is older than the stale window. This archives stale lock metadata and does not force-delete active locks.
6. Do not directly delete the remote lock directory unless diagnostics prove no active process owns it and a recovered journal is retained.

<h2 id="reference-status-shape">Status shape</h2>

Statuses should distinguish resource, deployment, runtime, proxy, access URL, and certificate readiness.
