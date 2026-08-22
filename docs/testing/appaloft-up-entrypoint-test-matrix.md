# Appaloft Up Entrypoint Test Matrix

## Governing Sources

- [Spec 144](../specs/144-appaloft-up-entrypoint/spec.md)
- [Spec 142](../specs/142-railway-like-folder-onboarding/spec.md)
- [Spec 143](../specs/143-first-deploy-login-and-agent-env-guard/spec.md)
- [Deployment Create Test Matrix](./deployments.create-test-matrix.md)

## Coverage

| ID | Layer | Scenario | Expected | Automation | Status |
| --- | --- | --- | --- | --- | --- |
| `UP-ENTRY-001` | Shell / CLI | `appaloft up` or `appaloft up <path>` | Routes normalized cwd/path and options into the existing deploy workflow; no new business operation or nested CLI process. | `apps/shell/test/up-entrypoint.test.ts` | Automated — passed |
| `UP-ENTRY-002` | Shell / CLI | Same starting state and arguments through `up` and `deploy` | Both spellings reach one workflow and produce equivalent mutations, result/error payload, and exit status; `deploy` remains accepted in 1.x. | `packages/adapters/cli/test/deploy-door-guard.test.ts`, `packages/adapters/cli/test/deployment-create-command.test.ts` | Automated — passed |
| `UP-ENTRY-003` | CLI | Unlinked or unauthenticated human folder runs `up` | Existing folder onboarding and folded login execute, then the same invocation continues. | `apps/shell/test/up-entrypoint.test.ts`, `packages/adapters/cli/test/folder-project-onboarding.test.ts` | Automated — passed |
| `UP-ENTRY-004` | Shell / CLI | Coding-agent, CI, or non-TTY `up` without `--yes` | Prints the existing plan and records zero login writes, project creates, deployments, or skill writes; `--yes` reaches the guarded deploy path. | `apps/shell/test/up-entrypoint.test.ts`, `apps/shell/test/run-control-plane-cli.test.ts`, `apps/shell/test/remote-pglite-state-sync.test.ts`, `packages/adapters/cli/test/deploy-door-guard.test.ts` | Automated — passed |
| `UP-ENTRY-005` | Shell / CLI | `up --json` and equivalent `deploy --json` | Stdout parses as the same JSON schema; human status stays off stdout; equivalent failure exits are non-zero. | `packages/adapters/cli/test/deployment-create-command.test.ts`, `packages/adapters/cli/test/deploy-door-guard.test.ts` | Automated — passed |
| `UP-ENTRY-006` | CLI adapter | Deployment is accepted and later succeeds or fails | CLI waits for terminal status; only succeeded exits zero and may print a real URL; terminal failed exits non-zero with diagnostic evidence. | `packages/adapters/cli/test/deployment-create-command.test.ts`, `packages/adapters/cli/test/deployment-interaction.test.ts` | Automated — passed |
| `UP-ENTRY-007` | Shell / docs registry | Root help and `up --help` | Help leads with `up`, states inherited login/onboarding, `--yes`, JSON, and terminal-proof behavior, and identifies `deploy` as the supported 1.x compatibility spelling. | `apps/shell/test/up-entrypoint.test.ts`, `packages/docs-registry/test/help-topics.test.ts`, `packages/docs-registry/test/operation-coverage.test.ts` | Automated — passed |

## Existing Regression Evidence

- `FOLDER-ONBOARD-001` through `FOLDER-ONBOARD-009` continue to govern folder
  identity, link persistence, and onboarding.
- `DEPLOY-DOOR-LOGIN-001` and `DEPLOY-DOOR-LOGIN-002` continue to govern folded
  login and coding-agent / CI / non-TTY mutation protection.
- `DEP-CREATE-ENTRY-010` continues to govern terminal deployment completion and
  failure semantics. `UP-ENTRY-006` proves that `up` reaches that same contract.
