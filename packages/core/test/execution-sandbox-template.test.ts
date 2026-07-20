import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  SandboxIsolationLevel,
  SandboxNetworkPolicy,
  SandboxResourceLimits,
  SandboxTemplate,
  SandboxTemplateId,
  SandboxTemplateName,
} from "../src";

describe("SandboxTemplate", () => {
  test("[SBX-DOM-003] prevents callers from weakening immutable template policy", () => {
    const template = SandboxTemplate.create({
      id: SandboxTemplateId.rehydrate("sbt_python"),
      name: SandboxTemplateName.create("Python 3.13")._unsafeUnwrap(),
      image: "python@sha256:abc123",
      minimumIsolation: SandboxIsolationLevel.gvisor(),
      limits: SandboxResourceLimits.create({
        cpuMillis: 1_000,
        memoryBytes: 512 * 1024 * 1024,
        diskBytes: 2 * 1024 * 1024 * 1024,
        maxProcesses: 32,
      })._unsafeUnwrap(),
      networkPolicy: SandboxNetworkPolicy.defaultDeny(),
      overridePolicy: {
        isolation: "strengthen-only",
        limits: "decrease-only",
        network: "immutable",
      },
      createdAt: CreatedAt.rehydrate("2026-07-20T00:00:00.000Z"),
    })._unsafeUnwrap();

    expect(
      template
        .resolveCreatePolicy({
          requestedIsolation: SandboxIsolationLevel.containerTrusted(),
        })
        .isErr(),
    ).toBe(true);
    expect(
      template
        .resolveCreatePolicy({
          limits: SandboxResourceLimits.create({
            cpuMillis: 2_000,
            memoryBytes: 512 * 1024 * 1024,
            diskBytes: 2 * 1024 * 1024 * 1024,
            maxProcesses: 32,
          })._unsafeUnwrap(),
        })
        .isErr(),
    ).toBe(true);
    expect(
      template.resolveCreatePolicy({ requestedIsolation: SandboxIsolationLevel.microvm() }).isOk(),
    ).toBe(true);
  });
});
