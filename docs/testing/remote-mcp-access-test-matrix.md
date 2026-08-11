# Remote MCP Access For Agent Workspaces Test Matrix

| ID | Layer | Evidence |
| --- | --- | --- |
| MCP-ACCESS-MANIFEST-001 | Adapter SDK | Pass: manifest fixture accepts bounded requirements and rejects endpoint/header/command/secret fields, duplicate ids, and invalid tool names. |
| MCP-ACCESS-BIND-002 | Profile compiler | Pass: exact references compile into immutable safe bindings. |
| MCP-ACCESS-BIND-003 | Application | Pass: missing, duplicate, stale, and unknown bindings fail before effects; tenant isolation remains repository-scoped. |
| MCP-ACCESS-ISSUE-004 | Runtime port | Pass: exact scope reaches issuer; output is gateway-only and bounded. |
| MCP-ACCESS-HARNESS-005 | Runtime adapters | Pass: Pi pinned-extension and OpenCode built-in remote MCP configs use the same capability contract; Pi's CLI allowlist preserves the conservative built-ins and appends only deterministic names derived from issued effective MCP tools. |
| MCP-ACCESS-POLICY-006 | Contract | Pass: effective tool names can narrow but never expand the request. |
| MCP-ACCESS-REVOKE-007 | Application/runtime | Pass: partial issue rollback, run completion/cancellation, Runtime replacement/terminate, and scope reconciliation revoke exact grants idempotently. |
| MCP-ACCESS-REDACT-008 | Security | Pass: persisted Runtime markers contain only capability ids, expiry, and the binding digest; endpoint credentials and MCP configuration are delivered through bounded stdin/environment composition and never enter argv, snapshots, events, or logs. |
| MCP-ACCESS-CONFORMANCE-009 | Conformance | Pass: deterministic Adapter/Profile/issuer/harness fixtures prove the lifecycle without a live MCP provider. |

Real hosted connection, organization authorization, audit, credential custody, and Gateway proxy are
covered by the Cloud Spec 054 matrix, not by public fixtures.

Verification on 2026-08-09: 42 focused tests, full public typecheck, full public build, Biome on all
changed files, `check:ash`, query batching, CI test-boundary checks, and `git diff --check` pass. The
full public test command exposes an existing order/concurrency-sensitive
`agent-workspace-open` case that passes when its file is run alone; it is tracked separately from
this slice.

Regression verification on 2026-08-12: focused Pi and Remote MCP harness tests prove exact MCP tool
allowlisting, bounded name sanitization, and absence of gateway URL/token material from argv. Full
public `lint:ci`, typecheck, test, and build gates pass.
