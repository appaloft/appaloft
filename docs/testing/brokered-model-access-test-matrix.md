# Brokered Model Access Test Matrix

| ID | Layer | Scenario | Expected evidence | Automated binding | Status |
| --- | --- | --- | --- | --- | --- |
| MODEL-ACCESS-BIND-001 | application/runtime | Exact Profile binding reaches Harness and issuer | Same safe `model-api` connection reference and Runtime/Sandbox/run ids; no resolution in public application. | `packages/application/test/sandbox-agent-runtime.test.ts`; Pi/OpenCode harness tests | automated |
| MODEL-ACCESS-BIND-002 | runtime adapter | Missing model binding | Failure before capability issue and child launch with safe setup guidance. | Pi/OpenCode harness tests | automated |
| MODEL-ACCESS-BIND-003 | runtime adapter | Ambiguous model bindings | Failure before capability issue and child launch. | Pi/OpenCode harness tests | automated |
| MODEL-ACCESS-CAP-004 | runtime adapter | Capability-only Pi/OpenCode config | Gateway URL/token/protocol/model only; no provider secret in env/stdin/argv/result. | Pi/OpenCode harness tests | automated |
| MODEL-ACCESS-REVOKE-005 | contract/Cloud companion | Revoked access | Next request is denied; Workspace data remains; later authorized capability may be issued. | Cloud broker matrix | companion |
| MODEL-ACCESS-SURFACE-006 | contract | Cross-surface parity | Existing Profile/Workspace operation schemas serve CLI/SDK/HTTP/oRPC/MCP/Console; no secret field. | operation-catalog, oRPC, SDK and MCP parity suites | automated |
| MODEL-ACCESS-COMPAT-007 | application/runtime | Future compatible harness | Same issuer contract without Agent-name branch. | shared `SandboxAgentModelAccessProvider` contract and registry/custom harness tests | automated |
