import { describe, expect, test } from "bun:test";
import { InMemoryOccupancyAgentRepository } from "../src/occupancy-agent";

const key = {
  tenantId: "tenant_a",
  subjectId: "usr_1",
  projectId: "prj_notes",
  repositoryIdentity: "github.com/acme/notes",
  branch: "main",
};

describe("OccupancyAgent occupy", () => {
  test("[WS-AGENT-ID-008] occupy creates an agt_* Agent and returns its name", async () => {
    const agents = new InMemoryOccupancyAgentRepository(() => "agt_created");
    const occupied = await agents.occupy({
      ...key,
      sandboxId: "sbx_one",
      name: "resonant-silence",
      now: "2026-08-24T00:00:00.000Z",
    });
    expect(occupied.isOk()).toBe(true);
    expect(occupied._unsafeUnwrap()).toEqual({
      agentId: "agt_created",
      name: "resonant-silence",
      sandboxId: "sbx_one",
    });
  });

  test("[WS-AGENT-ID-009] occupy resume keeps the Agent id when the Sandbox changes", async () => {
    const agents = new InMemoryOccupancyAgentRepository((prefix) => `${prefix}_kept`);
    const first = await agents.occupy({
      ...key,
      sandboxId: "sbx_one",
      name: "resonant-silence",
      now: "2026-08-24T00:00:00.000Z",
    });
    const second = await agents.occupy({
      ...key,
      sandboxId: "sbx_two",
      name: "ignored-name",
      now: "2026-08-24T00:00:01.000Z",
    });
    expect(first._unsafeUnwrap().agentId).toBe("agt_kept");
    expect(second._unsafeUnwrap()).toEqual({
      agentId: "agt_kept",
      name: "resonant-silence",
      sandboxId: "sbx_two",
    });
  });

  test("[WS-AGENT-ID-010] forceNew retires the previous Agent and allocates a new id", async () => {
    let sequence = 0;
    const agents = new InMemoryOccupancyAgentRepository(() => `agt_${++sequence}`);
    const first = await agents.occupy({
      ...key,
      sandboxId: "sbx_one",
      name: "resonant-silence",
      now: "2026-08-24T00:00:00.000Z",
    });
    const second = await agents.occupy({
      ...key,
      sandboxId: "sbx_two",
      name: "copper-harbor",
      forceNew: true,
      preferredAgentId: first._unsafeUnwrap().agentId,
      now: "2026-08-24T00:00:01.000Z",
    });
    expect(first._unsafeUnwrap().agentId).toBe("agt_1");
    expect(second._unsafeUnwrap()).toEqual({
      agentId: "agt_2",
      name: "copper-harbor",
      sandboxId: "sbx_two",
    });
  });
});
