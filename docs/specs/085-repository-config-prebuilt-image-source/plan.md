# Repository Config Prebuilt Image Source Plan

## Scope

Add repository config support for a prebuilt Docker/OCI image source. Keep registry credentials,
pull-secret setup, source-package artifacts, hosted artifact storage, and runtime sizing outside
this MVP.

## Domain And Operation Mapping

| Concern | Decision |
| --- | --- |
| Bounded context | Workload delivery Resource source/runtime profile |
| Existing commands | `resources.create`, `resources.configure-source`, `resources.configure-runtime`, `deployments.create` |
| Existing queries | `resources.show` |
| New operation key | None; repository config image source is a workflow/profile extension |
| Deployment admission | No change; `deployments.create` remains ids-only |
| Durable provenance | Not needed; image source is Resource profile state, not preview-owned ephemeral state |

## Implementation Plan

1. Extend `@appaloft/deployment-config` parser and JSON schema with `source.type = image` and
   `source.image`.
2. Reject Git-only source fields and non-`prebuilt-image` runtime strategies for image source.
3. Map parsed image source declarations into CLI `DeploymentPromptSeed.sourceLocator` and
   `deploymentMethod = prebuilt-image`.
4. Reuse existing Resource source/runtime configure orchestration and drift checks.
5. Update workflow docs, test matrix, public docs, and AI-facing deploy skill docs.
6. Add parser and CLI config deploy tests for accepted mapping, unsafe rejection, and idempotency.

## Test Strategy

| Matrix ID | Automated coverage |
| --- | --- |
| CONFIG-FILE-IMAGE-SOURCE-001 | `packages/deployment-config/test/appaloft-config.test.ts` |
| CONFIG-FILE-IMAGE-SOURCE-002 | `packages/deployment-config/test/appaloft-config.test.ts` |
| CONFIG-FILE-IMAGE-SOURCE-003 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-IMAGE-SOURCE-004 | `packages/adapters/cli/test/deployment-config.test.ts` |
| CONFIG-FILE-IMAGE-SOURCE-005 | `packages/deployment-config/test/appaloft-config.test.ts` |

## Appaloft YAML Sync Decision

Prebuilt image source is application delivery intent: it chooses the artifact source and runtime
planning strategy for future deployments. It belongs in `appaloft.yaml` as `source.type = image`,
while credentials, registry accounts, and pull-secret material stay outside YAML.

## Open Questions

- Registry pull-secret references need a separate secret-custody decision before they can be
  repository-config driven.
- Hosted artifact storage and source-package deploy remain separate product boundaries.
