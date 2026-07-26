import { describe, expect, test } from "bun:test";
import {
  ActiveAgentWorkspaceReferenceCount,
  AgentAdapterDefinitionDigest,
  AgentAdapterId,
  AgentAdapterInstallation,
  AgentAdapterInstallationId,
  AgentAdapterVersion,
  CreatedAt,
  UpdatedAt,
} from "../src";

function installation() {
  return AgentAdapterInstallation.install({
    id: AgentAdapterInstallationId.rehydrate("aai_demo"),
    definitionDigest: AgentAdapterDefinitionDigest.rehydrate(`sha256:${"a".repeat(64)}`),
    adapterId: AgentAdapterId.rehydrate("codex"),
    adapterVersion: AgentAdapterVersion.rehydrate("1.0.0"),
    installedAt: CreatedAt.rehydrate("2026-07-26T12:00:00.000Z"),
  });
}

describe("AgentAdapterInstallation", () => {
  test("[ADAPTER-INSTALL-007] a new installation is available for new Workspaces", () => {
    const result = installation();

    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(result.value.isEnabled()).toBe(true);
    expect(result.value.assertAvailableForNewWorkspace().isOk()).toBe(true);
  });

  test("[ADAPTER-DISABLE-008] disable is idempotent and blocks only new Workspace use", () => {
    const result = installation();
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;

    const at = UpdatedAt.rehydrate("2026-07-26T12:01:00.000Z");
    expect(result.value.disable(at).isOk()).toBe(true);
    expect(result.value.disable(at).isOk()).toBe(true);
    expect(result.value.isEnabled()).toBe(false);
    expect(result.value.assertAvailableForNewWorkspace().isErr()).toBe(true);
  });

  test("[ADAPTER-DISABLE-008] uninstall is fenced by active Workspace references", () => {
    const result = installation();
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;

    expect(
      result.value.assertCanUninstall(ActiveAgentWorkspaceReferenceCount.rehydrate(1)).isErr(),
    ).toBe(true);
    expect(
      result.value.assertCanUninstall(ActiveAgentWorkspaceReferenceCount.rehydrate(0)).isOk(),
    ).toBe(true);
  });
});
