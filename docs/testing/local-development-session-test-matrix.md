# Local Development Session Test Matrix

| ID | Level | Planned binding | Required evidence |
| --- | --- | --- | --- |
| DEV-PLAN-001 | unit/contract | deployment config + shared normalization | identical common graph snapshot for dev/deploy |
| DEV-PLAN-002 | unit | development overlay parser | only command/watch differ |
| DEV-PLAN-003 | unit | plan builder | blocker before effects |
| DEV-START-004 | integration | foreground supervisor + signals | start and graceful Ctrl-C cleanup |
| DEV-START-005 | integration | manifest coordinator | detach/resume, no duplicate graph |
| DEV-STATE-006 | integration | manifest + live reconciliation | truthful states and stale recovery |
| DEV-LOG-007 | unit/integration | bounded log store | ordering, follow, redaction |
| DEV-HEALTH-008 | integration | loopback health adapter | ready/degraded/failed truth |
| DEV-GATEWAY-009 | integration | loopback gateway | stable `.localhost` route and cleanup |
| DEV-TLS-010 | unit/manual | local certificate/trust adapter | no trust mutation without confirmation |
| DEV-WATCH-011 | integration | fake/real watcher | native/restart/none behavior |
| DEV-STOP-012 | integration | process ownership reconciler | exact cleanup, unrelated process preserved |
| DEV-DATA-013 | unit/integration | storage cleanup plan | stop preserves, confirmed reset deletes exact targets |
| DEV-ERROR-014 | contract | CLI/TUI/JSON renderer | stable safe error fields |
| DEV-PARITY-015 | CLI | non-TTY/JSON paths | no renderer dependency |
| DEV-PACKAGE-016 | packaging | macOS/Linux bundle smoke | safe help/start/fallback |
| DEV-DEPLOY-017 | contract | shared config fixtures | deploy/dev common graph parity |

Real acceptance must include one single web service, one multi-service graph, health transition,
log follow, restart, Ctrl-C cleanup and an independent port/process/manifest zero-residual check.

## 2026-08-12 implementation evidence (pre-merge)

- Focused DEV tests and the Rust/Ratatui renderer tests pass, including plan parity, foreground and
  detached supervision, watch/restart, health, HTTPS certificate SANs, TUI/headless rendering and
  exact stop/reset cleanup.
- Real local single-service and multi-service source-CLI runs passed with log follow, resume,
  restart, Ctrl-C, port/process/manifest checks and zero owned residue.
- Public repository gates pass: `bun run lint`, `bun run typecheck`, `bun run test` (37/37 Turbo
  tasks outside the filesystem sandbox because loopback listen is required) and `bun run build`.
- Final evidence remains pre-merge until the implementation PR lands on public `main`.
