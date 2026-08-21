# First Deploy Login Fold And Agent-Env Guard Test Matrix

## Governing Sources

- [Spec 143](../specs/143-first-deploy-login-and-agent-env-guard/spec.md)
- [ADR-123](../decisions/ADR-123-first-deploy-login-fold-and-agent-env-guard.md)

## Coverage

| ID | Layer | Scenario | Expected | Automation | Status |
| --- | --- | --- | --- | --- | --- |
| `DEPLOY-DOOR-LOGIN-001` | CLI | Unauthenticated Cloud deploy | Starts existing login; does not print `Run appaloft login` as the dead-end | `cli-session-login.test.ts`, `deploy-door-guard.test.ts`, `run-control-plane-cli.test.ts` | Passing |
| `DEPLOY-DOOR-LOGIN-002` | CLI | Agent-env / CI / non-TTY without `--yes` | Prints the plan; no login write, project create, deploy, or skill write | `coding-agent-environment.test.ts`, `cli-session-login.test.ts`, `deploy-door-guard.test.ts`, `control-plane-client.test.ts`, `run-control-plane-cli.test.ts` | Passing |
