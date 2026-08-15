# Plan: Instant Local Scratch

## Governing Sources

- [ADR-116](../../decisions/ADR-116-instant-local-scratch-session-boundary.md)
- [ADR-107](../../decisions/ADR-107-task-oriented-workspace-activation-presentation.md)
- [ADR-103](../../decisions/ADR-103-profile-aware-workspace-open-and-attach.md)
- [ADR-094](../../decisions/ADR-094-agent-workspace-entry-workflow.md)
- [ADR-110](../../decisions/ADR-110-local-development-session-boundary.md)
- [workspaces.open](../../commands/workspaces.open.md)
- [Spec 125](../125-workspace-code-activation/spec.md)
- [Instant Local Scratch Test Matrix](../../testing/instant-local-scratch-test-matrix.md)

## Architecture Approach

1. Split `makeWorkspaceOpenCommand("code" | "open")`. `open` keeps Git preflight +
   `workspaces.open`. Default `code` resolves a Scratch session.
2. Add a CLI-local scratch coordinator beside the existing Git helper. Analogous to R2a
   `DevelopmentSession`: coordination record only, no aggregate, table or catalog operation.
3. Probe PATH for `opencode`, then `pi`. Missing both prints an install prompt. Refusal is the
   only hard pre-attach failure.
4. Print the scratch banner before attach. `--no-attach` stops after resolution/banner/harness
   choice and is the source-CLI acceptance seam.
5. Offer the existing public Appaloft skill from the checkout `skills/appaloft` tree. OpenCode
   receives `OPENCODE_CONFIG_CONTENT` with official `skills.paths` plus optional local
   `appaloft mcp stdio`. Pi receives `--skill <abs-path>`. Do not write project files or parse
   vendor TUI output. Packaged binaries without the skill tree print the harness without claiming
   an offer.
6. `--profile` and `--new` on `code` keep durable-open meaning and therefore keep Git
   fail-closed. They are not scratch flags.
7. Cloud does not wrap default `code`. Entitlement / managed template / placement stay on
   `workspaces.open`.

## CQRS, Read Model And Event Impact

- Command/query: none. No `code.open`.
- Read model / event / persistence: none.
- Error: add scratch harness/path codes only. Existing `workspace_git_*` stay on durable open.

## Entrypoints And Documentation

- CLI: default `appaloft code` presentation changes.
- SDK/API/Web/MCP: not applicable for slice 1.
- Public docs: `agent-workspace-open`, skill `cli-entrypoints.md`, operation map, workflow.
- Changelog: document the R1.1 default-door change.

## Roadmap And Compatibility

- Roadmap: R7 Instant Local Scratch; R1.1 historically complete.
- Compatibility: public minor. `workspace open` unchanged. Default `code` no longer auto-manages.
- Migration: `appaloft workspace open` is the durable/managed door.

## Testing Strategy

- CLI unit: empty, dirty, logged-out, banner, harness order, `--no-attach`, no `workspaces.open`.
- Regression: `workspace open` still fail-closes on Git.
- Docs/package: help without runtime composition.
- Source-CLI smoke after Code: `appaloftdev code --help` and `--no-attach` in empty/dirty dirs.

## Risks And Migration Gaps

- Users who typed `appaloft code` for managed Workspace must switch to `workspace open`.
- Harness probe must not execute vendor binaries beyond a cheap existence/version check.
- Skill injection must not write secrets or Cloud rows.
- Later same-agent durable reconnect must not be faked in slice 1.
