# Railway-Like Folder Onboarding Test Matrix

## Governing Sources

- [Railway-Like Folder Onboarding](../specs/142-railway-like-folder-onboarding/spec.md)
- [ADR-122](../decisions/ADR-122-railway-like-folder-onboarding.md)
- [Remote Agent Door Test Matrix](./remote-agent-door-test-matrix.md)

## Coverage

| ID | Layer | Scenario | Expected | Automation | Status |
| --- | --- | --- | --- | --- | --- |
| `FOLDER-ONBOARD-001` | CLI | Unlinked no-git cwd | Decision creates a Project named after the directory; Effect path persists the link. | `packages/adapters/cli/test/folder-project-onboarding.test.ts` | Passing |
| `FOLDER-ONBOARD-002` | CLI | Git remote cwd | Identity is the remote; binding or same-name Project is reused, else create. | `folder-project-onboarding.test.ts`, `remote-code-session.test.ts` | Passing |
| `FOLDER-ONBOARD-003` | CLI | Second command same cwd | Reuses persisted link; no second create. | `folder-project-onboarding.test.ts`, `project-command.test.ts` | Passing |
| `FOLDER-ONBOARD-004` | CLI | `project use` then later command | Folder link project id changes; later resolve uses it. | `project-command.test.ts`, `occupancy-context.test.ts` | Passing |
| `FOLDER-ONBOARD-005` | CLI | Exactly one Project | Uses that Project. | `folder-project-onboarding.test.ts` | Passing |
| `FOLDER-ONBOARD-006` | CLI | Several Projects | TTY prompts; `--yes` creates directory-named Project. | `folder-project-onboarding.test.ts` | Passing |
| `FOLDER-ONBOARD-007` | CLI / application | No git | Occupy/deploy succeed; no whoami resume; no `git init` / fetch / clone / materialize; leftover partial folder occupancy is repaired or replaced without `workspace_open_partial_recovery_required`; source `local-folder`. | `remote-code-session.test.ts`, `packages/application/test/agent-workspace-open.test.ts`, community initializer test | Passing |
| `FOLDER-ONBOARD-008` | CLI | Status and login | Status lines name create/reuse; missing login is immediate `Run appaloft login`. | `folder-project-onboarding.test.ts`, `remote-code-session.test.ts` | Passing |
