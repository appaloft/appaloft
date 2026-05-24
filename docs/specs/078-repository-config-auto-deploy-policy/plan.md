# Repository Config Auto-Deploy Policy Plan

## Scope

Add repository config support for git-push Resource auto-deploy policy. Keep generic signed webhook
secret setup, webhook endpoint creation, source-event ingestion, replay, and retention outside this
MVP.

## Domain And Operation Mapping

| Concern | Decision |
| --- | --- |
| Bounded context | Workload delivery Resource auto-deploy policy |
| Existing commands | `resources.configure-auto-deploy`, `deployments.create` |
| Existing queries | `resources.show` |
| New operation key | None; repository config auto-deploy is a workflow/profile extension |
| Deployment admission | No change; `deployments.create` remains ids-only |
| Durable provenance | Not needed; auto-deploy policy is Resource profile state, not preview-owned ephemeral state |

## Implementation Plan

1. Extend `@appaloft/deployment-config` parser and generated JSON schema with top-level
   `autoDeploy`.
2. Map parsed declarations into CLI `DeploymentPromptSeed.autoDeployPolicy`.
3. Add CLI config deploy orchestration that reads current Resource detail, configures missing or
   drifted policies, disables existing policy when requested, and leaves matching policies alone.
4. Update workflow docs, source auto-deploy docs, test matrices, public docs, and AI-facing deploy
   docs.
5. Add parser, CLI workflow, idempotency, drift, and disable tests.

## Test Strategy

| Matrix ID | Automated coverage |
| --- | --- |
| CONFIG-FILE-AUTO-DEPLOY-001 | `packages/deployment-config/test/appaloft-config.test.ts` |
| CONFIG-FILE-AUTO-DEPLOY-002 | `packages/deployment-config/test/appaloft-config.test.ts` |
| CONFIG-FILE-AUTO-DEPLOY-003 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-AUTO-DEPLOY-004 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-AUTO-DEPLOY-005 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-AUTO-DEPLOY-006 | `packages/adapters/cli/test/deployment-config.test.ts` |

## Appaloft YAML Sync Decision

Source-event auto-deploy policy is Resource-owned application delivery intent and affects when the
Resource receives deployment attempts, so it belongs in `appaloft.yaml` as high-level
`autoDeploy`. The YAML must not expose source-event records, delivery attempts, webhook signatures,
provider accounts, or secret values.

## Open Questions

- Generic signed webhook declarations remain a follow-up slice because they need a repository-safe
  secret-reference and endpoint publication contract.
- Product-grade preview policy remains separate from Resource auto-deploy policy.
