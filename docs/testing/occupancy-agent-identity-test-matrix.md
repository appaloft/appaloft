# Occupancy Agent Identity Test Matrix

| ID | Setup | Expected | Test | Status |
| --- | --- | --- | --- | --- |
| WS-AGENT-NAME-001 | Git occupy create | kebab `SandboxDisplayName`, not `repo@sha` | `packages/core/test/sandbox-display-name.test.ts` | Passing |
| WS-AGENT-NAME-007 | CLI occupy chrome | no invented folder+harness name; wake/banner use `WorkspaceOpenResult.name` | `packages/adapters/cli/test/occupancy-agent-name.test.ts` | Passing |
| WS-AGENT-ID-008 | Occupy create | persist `agt_*` and return `agentId` + name | `packages/core/test/occupancy-agent.test.ts`, `packages/application/test/occupancy-agent.test.ts`, `packages/application/test/agent-workspace-open.test.ts`, `packages/persistence/pg/test/occupancy-agent-repository.test.ts` | Passing |
| WS-AGENT-ID-009 | Occupy resume / retarget | same `agentId` and name; `sandboxId` may change | `packages/core/test/occupancy-agent.test.ts`, `packages/application/test/occupancy-agent.test.ts`, `packages/persistence/pg/test/occupancy-agent-repository.test.ts` | Passing |
| WS-AGENT-ID-010 | `--new` / `forceNew` | previous Agent retired; new `agt_*` | `packages/core/test/occupancy-agent.test.ts`, `packages/application/test/occupancy-agent.test.ts`, `packages/persistence/pg/test/occupancy-agent-repository.test.ts` | Passing |
