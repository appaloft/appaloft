# Plan: Local Development Session

## Architecture

1. Add the optional development overlay to `@appaloft/deployment-config` and keep common graph
   normalization in the same exported conversion used by Deploy.
2. Add public-neutral Development Plan/Session DTOs and a local runtime supervisor under the runtime
   adapter. The supervisor owns process groups, log files, health, watch, gateway and manifests.
3. Add a CLI coordinator with default foreground execution and explicit headless subcommands.
4. Extend the current Rust/Ratatui sidecar protocol with a development mode; do not add another TUI
   framework or lifecycle owner.
5. Reuse structured `DomainError`/Result conventions and generate no product event or table.

## Test-First Seams

- Config parser/common deploy-dev normalization.
- Pure plan builder and blocker classification.
- Fake process, clock, watcher, health and gateway ports for lifecycle tests.
- Real child-process and loopback HTTP acceptance in a temporary source tree.
- Renderer protocol/parser tests plus packaged TUI smoke.
- Signal cleanup test outside the Codex sandbox when PTY/listener permissions require it.

## Delivery Sequence

1. Merge ADR/Spec/Test Matrix governance and create one public vertical-slice Ticket.
2. RED config/plan parity and lifecycle tests.
3. Implement headless plan/start/status/logs/stop/reset and real-process acceptance.
4. RED renderer protocol/interaction tests, then add Development TUI mode.
5. Update bilingual CLI docs, operation map/workflow references and release packaging.
6. Run focused gates, full public lint/typecheck/test/build and docs-impact classification.

## Rollback

Revert the additive CLI/config/renderer mode. Stop exact active manifests first; preserve declared
persistent data and leave existing Deploy/Workspace operations untouched.
