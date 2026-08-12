import "../../../../application/node_modules/reflect-metadata/Reflect.js";

import { spawn } from "node:child_process";
import { ListResourcesQuery, type Query } from "@appaloft/application";
import { ok } from "@appaloft/core";
import {
  createBoundedOperatePresentation,
  type OperateRendererSession,
} from "../../src/operate-presentation";
import { openLoopbackWorkspaceControlRenderer } from "../../src/workspace-control-renderer";

const binaryPath = process.env.APPALOFT_WORKSPACE_TUI_BINARY;
if (!binaryPath) throw new Error("APPALOFT_WORKSPACE_TUI_BINARY is required");

await createBoundedOperatePresentation({
  coordinator: {
    snapshot: async (_context, input) =>
      ({
        protocol: "operate/v1",
        observedAt: "2026-08-13T00:00:00.000Z",
        target: { resourceId: input.resourceId, deploymentId: "dep_failed" },
        resource: {
          resource: {
            id: input.resourceId,
            name: "api",
            lastDeploymentStatus: "failed",
          },
        },
        sections: {
          health: {
            availability: "unavailable",
            error: { code: "resource_health_unavailable" },
          },
          logs: {
            availability: "available",
            value: { lines: [{ message: "boot failed" }] },
          },
          recovery: {
            availability: "available",
            value: {
              rollbackReady: true,
              rollback: { recommendedCandidateId: "dep_good" },
            },
          },
        },
      }) as never,
    previewAction: async (_context, action) => ({
      token: "confirm_real_renderer",
      action,
      readinessGeneratedAt: "2026-08-13T00:00:01.000Z",
      consequence: "Create a governed recovery attempt",
    }),
    confirmAction: async () => ({ accepted: true, result: { id: "dep_recovery" } }),
  },
  openRenderer: async () =>
    (await openLoopbackWorkspaceControlRenderer({
      launch: async ({ port, token }) => {
        const child = spawn(binaryPath, [], {
          shell: false,
          stdio: "inherit",
          env: {
            ...process.env,
            APPALOFT_TUI_MODE: "operate",
            APPALOFT_WORKSPACE_TUI_PORT: String(port),
            APPALOFT_WORKSPACE_TUI_TOKEN: token,
          },
        });
        const exited = new Promise<void>((resolveExit, rejectExit) => {
          child.once("error", rejectExit);
          child.once("exit", () => resolveExit());
        });
        return { exited, terminate: () => child.kill("SIGTERM") };
      },
    })) as unknown as OperateRendererSession,
}).start(
  {
    executeCommand: async () => ok({}),
    executeQuery: async <T>(query: Query<T>) => {
      if (query instanceof ListResourcesQuery) {
        return ok({ items: [{ id: "res_real_operate", name: "api" }] } as T);
      }
      throw new Error(`Unexpected query ${query.constructor.name}`);
    },
  },
  {},
);
