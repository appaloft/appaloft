# Discovery: Local Development Session

## Status

- Round: Grill / Discovery complete
- Owner decision: accepted on 2026-08-12. The owner selected the recommended R2a direction and
  explicitly delegated the remaining frontier decisions to the implementation agent, provided the
  recommended answers are recorded before Code Round.
- Proposed scope: public local-only `appaloft dev` task surface, shared deployment-config/service
  graph, replaceable Rust/Ratatui presentation, and a durable local runtime manifest.
- Code changes allowed: no, until ADR, Spec, Plan, Test Matrix and an actor-visible Ticket are accepted.

## Business Outcome

A developer can enter a repository and run `appaloft dev` to plan, start, inspect, follow logs and
stop the whole declared application/service graph. The same repository configuration that drives
Deploy remains the input truth; development adds only an explicit execution overlay and local
session evidence. A failed or interrupted session cleans up processes, listeners and generated
artifacts without deleting declared persistent data.

## Facts From The Current Product

- `appaloft.yml` already parses a provider-neutral service graph and the Deploy entry flow converts
  it through `deploymentPromptSeedFromConfig` into existing `RequestedDeploymentConfig` shapes.
- `deployments.plan` and runtime target backends own production Deployment planning/execution;
  creating a fake Deployment for a foreground dev process would corrupt lifecycle language.
- `workspace-control-tui` is an accepted Rust/Ratatui sidecar with a bounded loopback protocol,
  deterministic teardown, headless fallback and packaged macOS/Linux artifacts.
- Top-level `appaloft worker` already starts the control-plane durable-work runtime. It cannot be
  reused for a user device without breaking an accepted public command contract.
- Existing Resource logs/health/runtime controls are production/runtime-target operations. Local
  dev readback needs its own session-scoped runtime evidence while reusing their error vocabulary.

## Auto-Grill Decision Tree

| Frontier question | Recommended and accepted answer | Consequence |
| --- | --- | --- |
| Product slice | R2a is local-only; remote Mac/VPS execution starts in R2b | Local lifecycle and failure semantics stabilize before relay fleet work. |
| Lifecycle truth | `DevelopmentSession` is a runtime coordination record, not a Deployment, Resource or Workspace | No fake deployment history and no second application/service graph. |
| Graph truth | Reuse deployment config, service keys, source/runtime/network/health/env/secrets and storage intent | Dev-only values may override execution command/watch mode, never identity or topology. |
| Config overlay | Add optional root/service `development.command` and `development.watch`; otherwise use the existing start command or a deterministic detector result | No implicit framework guess may survive as unreported truth. |
| Execution substrate | Host processes for `workspace-commands`; user Compose for `docker-compose`; unsupported services fail before mutation | R2a does not invent a second container planner. |
| Default UX | `appaloft dev [path]` is foreground and interactive; Ctrl-C performs bounded graceful stop | A session cannot silently continue billing or consuming ports. |
| Detached UX | `--detach` is explicit; re-running the same source/config identity resumes its manifest | Status/logs/stop work after the invoking terminal exits. |
| TUI | Extend the existing Rust/Ratatui sidecar with a development mode; Bun remains lifecycle/IO owner | Framework can still be replaced without changing dev contracts. |
| Headless parity | `dev plan/start/status/logs/stop/reset`, `--no-tui` and structured JSON remain first-class | CI and agents never depend on an interactive renderer. |
| Watch | `native` trusts the declared command's watcher; `restart` uses bounded source watching; `none` is stable | No silent rebuild loop or terminal scraping. |
| Environment | Base config env, then explicit `--env-file`, then explicit CLI env overlay; secret refs resolve locally and never enter manifest/log output | Running dev never mutates Cloud or production Environment state. |
| URLs | Stable service-key `.localhost` HTTP routes; HTTPS is explicit and uses a local generated CA/certificate | No silent Keychain/system trust mutation. |
| Trust | Certificate generation is automatic and local; installing trust requires an explicit command/confirmation | Headless and sandboxed runs can remain HTTP or untrusted-HTTPS. |
| Readiness | Service is ready only after process plus declared health succeeds; no health declaration yields `running-unverified` | A listening child or log line is not readiness proof. |
| Persistent data | Preserve only explicitly declared storage; `stop` preserves it and `reset` is destructive and confirmed | Cleanup does not erase user data. |
| Crash/re-run | Stale PID/listener evidence is reconciled before resume; unrelated processes are never killed | Ownership is session id + process start evidence, not PID alone. |
| Platforms | Production support is macOS/Linux; Windows remains safe headless/help until an independent PTY/process gate | Matches the accepted renderer and CLI release boundary. |

## Candidate Journey

1. Resolve one source root and at most one deployment config/profile.
2. Normalize the existing deployment seed and explicit development overlay into a bounded plan.
3. Print/render services, commands, ports, URLs, health policy, watch mode and unsupported blockers.
4. Start the graph, persist a local manifest and stream structured service events/logs.
5. Route `.localhost` requests and evaluate declared health until every required service is ready or
   the session reaches a visible failed/degraded state.
6. Allow TUI or headless status/log/restart/stop operations over the same session identity.
7. On Ctrl-C, stop, failure or explicit reset, remove only owned processes/listeners/generated files;
   preserve declared persistent data unless reset was explicitly confirmed.

## Rejected Alternatives

- Calling `deployments.create` and labelling the resulting production attempt "dev".
- A Cloud-only Dev aggregate or private service graph.
- Rebuilding Pi/OpenCode/Claude Code/Codex conversations inside the dev TUI.
- OpenTUI as the first production renderer after its released embedded-terminal/teardown gate failed.
- An implicit background daemon, hidden system certificate trust, or destructive cleanup on exit.
- Inferring readiness from logs, port binding or process existence alone.

## Public/Private Boundary

R2a is public. Cloud may provide authentication/config injection to later remote execution, but it
does not own a Dev aggregate, Dev table, service graph or local supervisor. R2b may transport the
same public plan/session commands through an outbound Worker; it cannot redefine their lifecycle.

## Open Questions

No question remains that changes R2a ownership or acceptance. Styling, default gateway port and
watch debounce are implementation constants covered by tests, not new product decisions.
