# Deployment Runtime Ownership Reconciliation Test Matrix

| Test ID | Layer | Scenario | Expected | Automated evidence |
| --- | --- | --- | --- | --- |
| DEP-RUNTIME-001 | application | Retry after failed attempt with older succeeded runtime owner | Retry supersedes the runtime owner, not the latest failed attempt. | `deployment-retry-redeploy.test.ts` and existing `create-deployment.test.ts` `DEP-CREATE-ASYNC-012A`. |
| DEP-RUNTIME-002 | adapter/integration | Successful replacement cleanup | Exact superseded labels are absent on readback; current labels and route remain. | `docker-container-commands.test.ts` exact Resource/Deployment label fence plus existing create replacement lifecycle coverage. |
| DEP-RUNTIME-003 | adapter/integration | Failed candidate compensation | Candidate runtime is absent; previous runtime and route remain. | `deployment-retry-redeploy.test.ts` `DEP-RUNTIME-003`; cancellation receives only the failed source Deployment. |
| DEP-RUNTIME-004 | application/persistence | Cleanup failure retry | Retryable exact cleanup is retried with the same ownership target and bounded state. | `deployment-retry-redeploy.test.ts`, `docker-container-commands.test.ts`, and `runtime-target-capacity.test.ts`. |
| DEP-RUNTIME-005 | application | Current route/runtime protection | Current Deployment cannot become a cleanup candidate. | `server-capacity-prune.test.ts` `RT-CAP-PRUNE-013` and `cleanup-preview.test.ts` `DEPLOYMENTS-CLEANUP-PREVIEW-007`. |
| DEP-RUNTIME-006 | application/adapter | Missing Resource with fully labelled running runtime | Candidate is an orphan and exact product prune can match it. | `server-capacity-prune.test.ts` `DEP-RUNTIME-006`; provider target and ownership checks remain mandatory. |
| DEP-RUNTIME-007 | application | Explicit rollback candidate | Deployment and recovery assets are protected. | `server-capacity-prune.test.ts` `RT-CAP-PRUNE-013` and `storage-runtime-cleanup.test.ts` `STOR-CLEANUP-003`. |
| DEP-RUNTIME-008 | adapter | Shared image, volume, network, or incomplete ownership | Asset is preserved with a safe blocking reason. | `storage-runtime-cleanup.test.ts` `STOR-CLEANUP-002/003`; deployment cleanup tests reject broad image/volume prune and Compose cleanup does not request volume deletion. |
| DEP-RUNTIME-009 | application/Cloud integration | Preview and Dev Seed cleanup | Product lifecycle cleanup completes and exact provider readback is empty. | Existing `cleanup-preview.test.ts` provenance/runtime cases plus Cloud workflow and Dev Seed integration gates. |
| DEP-RUNTIME-010 | application/adapter | Repeat cleanup after absence | Success is idempotent and unrelated assets are unchanged. | `docker-container-commands.test.ts` and `runtime-target-capacity.test.ts` exact absence readback. |
