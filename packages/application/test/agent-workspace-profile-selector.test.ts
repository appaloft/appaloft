import { describe, expect, test } from "bun:test";
import {
  selectWorkspaceProfileInstallation,
  workspaceProfileAmbiguousError,
} from "../src/agent-workspace-profile-selector";

describe("Workspace Profile selector", () => {
  test("[WS-REMOTE-PROFILE-AMBIGUOUS-176] lists selector, installationIds, and a copy-pasteable code --profile command", () => {
    const error = workspaceProfileAmbiguousError("appaloft-remote", [
      "awpi_ptlsoktb2iq1",
      "awpi_b87sxo84xe7u",
    ]);
    expect(error.message).toContain('selector "appaloft-remote" is ambiguous');
    expect(error.details?.code).toBe("workspace_open_profile_ambiguous");
    expect(error.details?.selector).toBe("appaloft-remote");
    expect(error.details?.installationIds).toEqual(["awpi_ptlsoktb2iq1", "awpi_b87sxo84xe7u"]);
    expect(error.details?.guidance).toBe(
      "Installations: awpi_ptlsoktb2iq1, awpi_b87sxo84xe7u. Retry with appaloft code --profile awpi_ptlsoktb2iq1",
    );
  });

  test("[WS-REMOTE-PROFILE-LIVE-178] prefers the live occupancy when duplicate names exist", () => {
    const selected = selectWorkspaceProfileInstallation({
      selector: "appaloft-remote",
      candidates: [
        { id: "awpi_dead", installedAt: "2026-08-19T00:00:00.000Z" },
        { id: "awpi_live", installedAt: "2026-08-16T00:00:00.000Z" },
      ],
      liveInstallationIds: ["awpi_live"],
    });
    expect(selected._unsafeUnwrap()).toBe("awpi_live");
  });

  test("[WS-REMOTE-PROFILE-LIVE-178] prefers Project default, then oldest, when no live occupancy exists", () => {
    const fromDefault = selectWorkspaceProfileInstallation({
      selector: "appaloft-remote",
      candidates: [
        { id: "awpi_new", installedAt: "2026-08-19T00:00:00.000Z" },
        { id: "awpi_default", installedAt: "2026-08-16T00:00:00.000Z" },
      ],
      projectDefaultInstallationId: "awpi_default",
    });
    expect(fromDefault._unsafeUnwrap()).toBe("awpi_default");

    const oldest = selectWorkspaceProfileInstallation({
      selector: "appaloft-remote",
      candidates: [
        { id: "awpi_new", installedAt: "2026-08-19T00:00:00.000Z" },
        { id: "awpi_old", installedAt: "2026-08-16T00:00:00.000Z" },
      ],
    });
    expect(oldest._unsafeUnwrap()).toBe("awpi_old");
  });

  test("[WS-REMOTE-PROFILE-AMBIGUOUS-176] stays ambiguous only when more than one live occupancy shares the selector", () => {
    const selected = selectWorkspaceProfileInstallation({
      selector: "appaloft-remote",
      candidates: [
        { id: "awpi_a", installedAt: "2026-08-16T00:00:00.000Z" },
        { id: "awpi_b", installedAt: "2026-08-19T00:00:00.000Z" },
      ],
      liveInstallationIds: ["awpi_a", "awpi_b"],
    });
    expect(selected.isErr()).toBe(true);
    if (selected.isOk()) return;
    expect(selected.error.details?.code).toBe("workspace_open_profile_ambiguous");
    expect(selected.error.details?.installationIds).toEqual(["awpi_a", "awpi_b"]);
    expect(selected.error.details?.guidance).toContain("appaloft code --profile awpi_a");
  });
});
