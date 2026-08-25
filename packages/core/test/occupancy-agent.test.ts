import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  OccupancyAgent,
  OccupancyAgentId,
  OccupancyAgentStatus,
  SandboxDisplayName,
  SandboxId,
  UpdatedAt,
} from "../src";

const createdAt = CreatedAt.rehydrate("2026-08-24T00:00:00.000Z");
const updatedAt = UpdatedAt.rehydrate("2026-08-24T00:00:01.000Z");

function createAgent() {
  return OccupancyAgent.create({
    id: OccupancyAgentId.rehydrate("agt_resonant"),
    name: SandboxDisplayName.rehydrate("resonant-silence"),
    key: {
      tenantId: "tenant_a",
      subjectId: "usr_1",
      projectId: "prj_notes",
      repositoryIdentity: "github.com/acme/notes",
      branch: "main",
    },
    sandboxId: SandboxId.rehydrate("sbx_one"),
    createdAt,
    updatedAt,
  })._unsafeUnwrap();
}

describe("OccupancyAgent", () => {
  test("[WS-AGENT-ID-008] create records an active agt_* Agent bound to a Sandbox", () => {
    const agent = createAgent();
    expect(agent.id.value).toBe("agt_resonant");
    expect(agent.displayName().value).toBe("resonant-silence");
    expect(agent.sandboxId().value).toBe("sbx_one");
    expect(agent.toState().status.value).toBe("active");
    expect(agent.pullDomainEvents().map((event) => event.type)).toEqual([
      "occupancy-agent-created",
    ]);
  });

  test("[WS-AGENT-ID-009] retarget keeps the Agent id and name when the Sandbox is replaced", () => {
    const agent = createAgent();
    expect(
      agent
        .retarget({
          sandboxId: SandboxId.rehydrate("sbx_two"),
          at: UpdatedAt.rehydrate("2026-08-24T00:00:02.000Z"),
        })
        .isOk(),
    ).toBe(true);
    expect(agent.id.value).toBe("agt_resonant");
    expect(agent.displayName().value).toBe("resonant-silence");
    expect(agent.sandboxId().value).toBe("sbx_two");
    expect(agent.pullDomainEvents().at(-1)?.type).toBe("occupancy-agent-retargeted");
  });

  test("[WS-AGENT-ID-010] retire then create is a new Agent; retired cannot retarget", () => {
    const agent = createAgent();
    expect(agent.retire({ at: UpdatedAt.rehydrate("2026-08-24T00:00:03.000Z") }).isOk()).toBe(true);
    expect(agent.toState().status.value).toBe("retired");
    expect(
      agent
        .retarget({
          sandboxId: SandboxId.rehydrate("sbx_two"),
          at: UpdatedAt.rehydrate("2026-08-24T00:00:04.000Z"),
        })
        .isErr(),
    ).toBe(true);
    expect(OccupancyAgentStatus.create("retired")._unsafeUnwrap().isActive).toBe(false);
    expect(OccupancyAgentId.create("sbx_one").isErr()).toBe(true);
  });
});
