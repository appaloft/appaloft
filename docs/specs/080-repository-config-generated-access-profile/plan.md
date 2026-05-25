# Repository Config Generated Access Profile Plan

## Scope

| Item | Decision |
| --- | --- |
| Owner context | Resource / repository config entry workflow |
| Existing commands | `resources.configure-access`, `deployments.create` |
| Existing queries | `resources.show` |
| New operation key | None |
| Public surface | `appaloft.yaml` / generated JSON schema / config deploy docs |
| Adapter boundary | CLI/Action config workflow dispatches command/query bus only |

## Implementation Plan

1. Extend deployment config schema with optional `access.generated`.
2. Map parsed declarations into `DeploymentPromptSeed.generatedAccessProfile`.
3. Reconcile after Resource resolution by reading `resources.show` and dispatching
   `resources.configure-access` only when the existing profile differs.
4. Keep final `deployments.create` ids-only.
5. Update parser/schema tests, CLI workflow tests, docs, public docs, and AI-facing deploy docs.

## Test Binding

| Matrix ID | Automation |
| --- | --- |
| CONFIG-FILE-GENERATED-ACCESS-001 | `packages/deployment-config/test/appaloft-config.test.ts` |
| CONFIG-FILE-GENERATED-ACCESS-002 | `packages/deployment-config/test/appaloft-config.test.ts` |
| CONFIG-FILE-GENERATED-ACCESS-003 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-GENERATED-ACCESS-004 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-GENERATED-ACCESS-005 | `packages/adapters/cli/test/deployment-config.test.ts` |

## Sync Checklist

- ADR index
- Deployment config test matrix
- Repository config workflow docs
- Public config-file docs
- AI-facing Appaloft deploy skill docs
- Generated JSON schema
