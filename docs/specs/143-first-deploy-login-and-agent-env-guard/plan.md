# Plan — First Deploy Login Fold And Agent-Env Guard

## Governing Sources

- [spec.md](./spec.md)
- [ADR-123](../../decisions/ADR-123-first-deploy-login-fold-and-agent-env-guard.md)

## Architecture

CLI presentation only. Reuse `loginControlPlane` and the existing profile store.
No new catalog operation. No core/application change.

- `coding-agent-environment.ts` detects agent/CI/non-TTY and formats the plan.
- `ensureDeployControlPlaneLogin` folds login for Cloud deploy.
- Shell retries execution-target resolution after a successful fold.
- `setup agent` returns the plan and skips skill/MCP writes without `--yes`.

## Test Strategy

- Helper unit tests for detection and plan copy.
- `ensureDeployControlPlaneLogin` starts login on a human path and blocks
  agent-env without `--yes`.
- Deploy command and setup-agent entrypoints prove no mutation without `--yes`.
- Shell Cloud deploy tests cover folded login and the agent-env plan.

## Risks

- Existing unit tests pass their own `environment` without agent/CI markers so
  they keep mutating. Real process env/TTY is what the shell guard uses.
