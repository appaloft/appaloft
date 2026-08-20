import { expect, test } from "bun:test";
import { Effect } from "effect";

import {
  memoryFolderProjectLinkStore,
  writeFolderProjectLink,
} from "../src/folder-project-link.js";
import { resolveFolderLinkedProjectId } from "../src/folder-project-onboarding.js";
import { occupancyProjectIdFromSandboxes } from "../src/occupancy-context.js";

test("[WS-REMOTE-ENV-149][WS-REMOTE-RES-151][WS-REMOTE-PROJSHOW-169] copies occupancy activation projectId", () => {
  expect(
    occupancyProjectIdFromSandboxes([
      {
        sandboxId: "sbx_old",
        status: "ready",
        occupancy: {
          repositoryIdentity: "github.com/acme/old",
          commitSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        },
        activation: { project: { projectId: "prj_old" } },
        lastActivityAt: "2026-08-16T00:00:00.000Z",
      },
      {
        sandboxId: "sbx_kzg0h1jwp5vu",
        status: "ready",
        occupancy: {
          repositoryIdentity: "github.com/traefik/whoami",
          commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        },
        activation: { project: { projectId: "prj_42ymkffgt1eh" } },
        lastActivityAt: "2026-08-18T00:00:00.000Z",
      },
    ]),
  ).toBe("prj_42ymkffgt1eh");
});

test("[WS-REMOTE-ENV-150][WS-REMOTE-RES-152][WS-REMOTE-PROJSHOW-170] missing occupancy project stays omitted", () => {
  expect(
    occupancyProjectIdFromSandboxes([
      {
        sandboxId: "sbx_ready",
        status: "ready",
      },
    ]),
  ).toBeUndefined();
});

test("[FOLDER-ONBOARD-004] folder link wins over latest occupancy project", async () => {
  const store = memoryFolderProjectLinkStore();
  await writeFolderProjectLink(
    {
      cwd: "/tmp/hello-static",
      projectId: "prj_folder",
      identity: "folder.local/cwd/hello-static",
    },
    store,
  );
  const linked = await Effect.runPromise(resolveFolderLinkedProjectId("/tmp/hello-static", store));
  expect(linked).toBe("prj_folder");
});
