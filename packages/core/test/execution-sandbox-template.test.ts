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

  test("[SBX-DOM-003] accepts an equivalent persisted allowlist", () => {
    const limits = SandboxResourceLimits.create({
      cpuMillis: 1_000,
      memoryBytes: 512 * 1024 * 1024,
      diskBytes: 2 * 1024 * 1024 * 1024,
      maxProcesses: 32,
    })._unsafeUnwrap();
    const template = SandboxTemplate.create({
      id: SandboxTemplateId.rehydrate("sbt_git_workspace"),
      name: SandboxTemplateName.create("Git Workspace")._unsafeUnwrap(),
      image: "workspace@sha256:abc123",
      minimumIsolation: SandboxIsolationLevel.containerTrusted(),
      limits,
      networkPolicy: SandboxNetworkPolicy.create({
        mode: "allowlist",
        rules: [
          { kind: "domain", value: "github.com", ports: [22, 443] },
          { kind: "domain", value: "api.github.com", ports: [443] },
        ],
      })._unsafeUnwrap(),
      overridePolicy: {
        isolation: "strengthen-only",
        limits: "decrease-only",
        network: "immutable",
      },
      createdAt: CreatedAt.rehydrate("2026-07-28T00:00:00.000Z"),
    })._unsafeUnwrap();

    const persistedPolicy = SandboxNetworkPolicy.rehydrate({
      mode: "allowlist",
      rules: [
        { value: "api.github.com", ports: [443], kind: "domain" },
        { ports: [443, 22], value: "github.com", kind: "domain" },
      ],
    });

    expect(
      template
        .resolveCreatePolicy({
          requestedIsolation: SandboxIsolationLevel.containerTrusted(),
          limits,
          networkPolicy: persistedPolicy,
        })
        .isOk(),
    ).toBe(true);
  });

  test("[WS-REMOTE-AUTH-009] names the remote-default template command when allowlists differ", () => {
    const limits = SandboxResourceLimits.create({
      cpuMillis: 1_000,
      memoryBytes: 512 * 1024 * 1024,
      diskBytes: 2 * 1024 * 1024 * 1024,
      maxProcesses: 32,
    })._unsafeUnwrap();
    const template = SandboxTemplate.create({
      id: SandboxTemplateId.rehydrate("stp_github_only"),
      name: SandboxTemplateName.rehydrate("occupancy-opencode"),
      image: "ghcr.io/appaloft/agent-workspace-opencode:1.18.4",
      minimumIsolation: SandboxIsolationLevel.containerTrusted(),
      limits,
      networkPolicy: SandboxNetworkPolicy.rehydrate({
        mode: "allowlist",
        rules: [
          { kind: "domain", value: "github.com", ports: [443] },
          { kind: "domain", value: "api.github.com", ports: [443] },
        ],
      }),
      overridePolicy: {
        isolation: "strengthen-only",
        limits: "decrease-only",
        network: "immutable",
      },
      createdAt: CreatedAt.rehydrate("2026-08-15T00:00:00.000Z"),
    })._unsafeUnwrap();
    const wider = SandboxNetworkPolicy.rehydrate({
      mode: "allowlist",
      rules: [
        { kind: "domain", value: "github.com", ports: [443] },
        { kind: "domain", value: "api.github.com", ports: [443] },
        { kind: "domain", value: "opencode.ai", ports: [443] },
      ],
    });
    const denied = template.resolveCreatePolicy({
      requestedIsolation: SandboxIsolationLevel.containerTrusted(),
      limits,
      networkPolicy: wider,
    });
    expect(denied.isErr()).toBe(true);
    expect(denied._unsafeUnwrapErr().details).toMatchObject({
      code: "sandbox_template_network_policy_immutable",
      recovery: expect.stringContaining("--network-policy remote-default"),
    });
  });
});
