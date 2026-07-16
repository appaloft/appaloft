# Deployment Proof Test Matrix

| ID | Scenario | Surface | Automation | Binding | Status |
| --- | --- | --- | --- | --- | --- |
| DEP-PROOF-VERDICT-001 | Complete matching evidence is verified. | application | unit | `packages/application/test/deployment-proof.test.ts` | passed |
| DEP-PROOF-VERDICT-002 | Health 200 with unchanged workload/config generation is never verified. | application/adapter | integration | `packages/application/test/deployment-proof.test.ts` | passed |
| DEP-PROOF-VERDICT-003 | Missing digest/readback yields partial or unverified. | application | unit | `packages/application/test/deployment-proof.test.ts` | passed |
| DEP-PROOF-VERDICT-004 | External workload change yields stale. | application/adapter | integration | `packages/application/test/deployment-proof.test.ts` | passed |
| DEP-PROOF-VERDICT-005 | Failed health, artifact, or route/workload mismatch yields failed. | application | unit | `packages/application/test/deployment-proof.test.ts` | passed |
| DEP-PROOF-EFFECT-001 | Profile/config change requires artifact/workload effect. | application | unit | `packages/application/test/deployment-proof.test.ts` | passed |
| DEP-PROOF-SAFE-001 | Secret values are represented only by fingerprints/redacted summaries. | contracts/application | unit | `packages/application/test/deployment-proof.test.ts` | passed |
| DEP-PROOF-RECOVERY-001 | Rollback candidate retained/unavailable is explicit. | application | unit | `packages/application/test/deployment-proof.test.ts` | passed |
| DEP-PROOF-SCOPE-001 | Not-found/resource mismatch/tenant scope fails closed. | application/HTTP | integration | `packages/application/test/deployment-proof.test.ts`, `packages/orpc/test/deployment-proof.http.test.ts` | passed |
| DEP-PROOF-ADAPTER-001 | Local Docker returns image/container/config generation evidence. | runtime adapter | integration | `packages/adapters/runtime/test/deployment-proof-evidence.test.ts` | passed |
| DEP-PROOF-ADAPTER-002 | Compose, generic SSH, Swarm, static, and unsupported targets return truthful evidence/gaps. | runtime adapter | integration | `packages/adapters/runtime/test/deployment-proof-evidence.test.ts` | passed |
| DEP-PROOF-ADAPTER-003 | Managed public route identity is read from the proxy response; matching identity passes, while missing or mismatched identity fails without trusting the container label. | runtime adapter/provider | integration | `packages/adapters/runtime/test/deployment-proof-evidence.test.ts`; Caddy/Traefik provider tests | passing |
| DEP-PROOF-CONTRACT-001 | Contract, operation catalog, HTTP, CLI JSON, SDK, and MCP share v1 schema. | published contract | integration | contract/oRPC/CLI/SDK/MCP tests | passed |
| DEP-PROOF-WEB-001 | Detail renders all dimensions, mismatches, actions, and unavailable evidence. | Web | component/e2e | deployment detail Web tests | passed |
| DEP-PROOF-SMOKE-001 | Real Docker v1 -> changed config/profile -> v2 is verified with changed identity. | real runtime | smoke | `bun run smoke:deployment-proof` / `scripts/smoke/deployment-proof.ts` | passed |
| DEP-PROOF-SMOKE-002 | Command success and health 200 with unchanged workload is not verified. | real runtime/fixture | smoke | `bun run smoke:deployment-proof` / `scripts/smoke/deployment-proof.ts` | passed |
| DEP-PROOF-SMOKE-003 | A real managed proxy route that still serves an older deployment identity cannot produce verified proof even when the response is HTTP 200. | real runtime/proxy | smoke | `bun run smoke:deployment-route-proof` | passing |
