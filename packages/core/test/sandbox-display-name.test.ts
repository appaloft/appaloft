import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  Sandbox,
  SandboxDisplayName,
  SandboxId,
  SandboxIsolationLevel,
  SandboxNetworkPolicy,
  SandboxResourceLimits,
} from "../src";

function sandboxWithName(name: SandboxDisplayName) {
  return Sandbox.create({
    id: SandboxId.rehydrate("sbx_demo"),
    name,
    source: { kind: "image", image: "python@sha256:abc123" },
    requestedIsolation: SandboxIsolationLevel.gvisor(),
    limits: SandboxResourceLimits.create({
      cpuMillis: 1_000,
      memoryBytes: 512 * 1024 * 1024,
      diskBytes: 2 * 1024 * 1024 * 1024,
      maxProcesses: 32,
    })._unsafeUnwrap(),
    networkPolicy: SandboxNetworkPolicy.defaultDeny(),
    createdAt: CreatedAt.rehydrate("2026-08-21T00:00:00.000Z"),
  })._unsafeUnwrap();
}

describe("Sandbox display name", () => {
  test("[SBX-DOM-005] two generates are kebab adjective-noun and stay stable once stored", () => {
    const first = SandboxDisplayName.generate(() => 0.11);
    const second = SandboxDisplayName.generate(() => 0.73);
    expect(first.value).toMatch(/^[a-z]+-[a-z]+$/);
    expect(second.value).toMatch(/^[a-z]+-[a-z]+$/);
    expect(first.isGeneratedKebabPair()).toBe(true);
    expect(second.isGeneratedKebabPair()).toBe(true);
    expect(first.value).not.toBe(second.value);

    const stored = sandboxWithName(first);
    expect(stored.displayName().value).toBe(first.value);
    expect(Sandbox.rehydrate(stored.toState()).displayName().value).toBe(first.value);
  });

  test("[SBX-DOM-005][WS-AGENT-NAME-001][WS-AGENT-NAME-002][WS-AGENT-NAME-003] folder keeps directory; git occupy generates kebab", () => {
    expect(SandboxDisplayName.resolve({ directoryName: "hello-static" }).value).toBe(
      "hello-static",
    );
    expect(
      SandboxDisplayName.resolve({
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
      }).isGeneratedKebabPair(),
    ).toBe(true);
    expect(
      SandboxDisplayName.resolve({
        name: "supportive-balance",
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
      }).value,
    ).toBe("supportive-balance");
    expect(
      SandboxDisplayName.resolve({
        repositoryIdentity: "folder.local/cwd/appaloft",
      }).value,
    ).toBe("appaloft");
    expect(SandboxDisplayName.create("sbx_hidden").isErr()).toBe(true);
  });
});
