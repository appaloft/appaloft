# Repository Config Preview Policy Plan

## Scope

Add repository config support for product-grade pull request preview policy. Keep GitHub App
installation identity, webhook secrets, feedback token custody, comments/checks customization,
project/global policy selection, and cleanup command parameters outside this MVP.

## Domain And Operation Mapping

| Concern | Decision |
| --- | --- |
| Bounded context | Preview lifecycle preview policy |
| Existing commands | `preview-policies.configure`, `deployments.create` |
| Existing queries | `preview-policies.show` |
| New operation key | None; repository config preview policy is a workflow/profile extension |
| Deployment admission | No change; `deployments.create` remains ids-only |
| Durable provenance | Not needed; preview policy is Resource-scoped configuration, not preview-owned ephemeral state |
| PR preview safety | PR preview deploys must not mutate preview policy from the PR branch |

## Implementation Plan

1. Extend `@appaloft/deployment-config` parser and JSON schema with
   `preview.pullRequest.policy`.
2. Reject unsafe identity, secret, provider, and unknown fields under the policy declaration.
3. Map parsed policy declarations into CLI `DeploymentPromptSeed.previewPolicy`.
4. Reconcile ordinary trusted config deploy through `ShowPreviewPolicyQuery` and
   `ConfigurePreviewPolicyCommand` before deployment admission.
5. Skip preview policy mutation when the seed is resolving a PR preview deployment.
6. Update workflow docs, test matrix, public docs, and AI-facing deploy skill docs.
7. Add parser and CLI config deploy tests for accepted mapping, unsafe rejection, configure,
   idempotency, and PR preview skip behavior.

## Test Strategy

| Matrix ID | Automated coverage |
| --- | --- |
| CONFIG-FILE-PREVIEW-POLICY-001 | `packages/deployment-config/test/appaloft-config.test.ts` |
| CONFIG-FILE-PREVIEW-POLICY-002 | `packages/deployment-config/test/appaloft-config.test.ts` |
| CONFIG-FILE-PREVIEW-POLICY-003 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-PREVIEW-POLICY-004 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-PREVIEW-POLICY-005 | `packages/adapters/cli/test/deployment-config.test.ts` |

## Appaloft YAML Sync Decision

Product-grade preview policy is application delivery governance: it controls whether and how pull
request preview deployments are admitted for the selected Resource. It belongs in `appaloft.yaml`
as safe, provider-neutral `preview.pullRequest.policy` fields. GitHub App installation identity,
webhook secrets, feedback tokens, provider accounts, tenant/org identity, and cleanup credentials
stay outside YAML.

## Open Questions

- Project/global preview policy selection may be useful later, but needs trusted scope selection
  semantics outside committed repository config.
- Comments/checks/status feedback customization needs a separate public contract before it can be
  repository-config driven.
