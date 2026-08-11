import "../../../../application/node_modules/reflect-metadata/Reflect.js";

import {
  ListAgentTaskRunsQuery,
  ListSandboxAgentRuntimesQuery,
  ListSandboxesQuery,
  ListSandboxPortsQuery,
  ListSandboxPromotionsQuery,
  ListSandboxSnapshotsQuery,
  type Query,
  ShowSandboxQuery,
} from "@appaloft/application";
import { ok } from "@appaloft/core";
import { createRatatuiWorkspaceControlPresentation } from "../../src/workspace-control-renderer";

const binaryPath = process.env.APPALOFT_WORKSPACE_TUI_BINARY;
if (!binaryPath) throw new Error("APPALOFT_WORKSPACE_TUI_BINARY is required");

const workspace = {
  sandboxId: "sbx_real_renderer",
  status: "running",
  sourceKind: "template",
  source: { kind: "template", templateId: "tpl_agent" },
  requestedIsolation: "container-trusted",
  limits: {},
  networkPolicy: {},
  createdAt: "2026-08-11T00:00:00.000Z",
  providerKey: "local-test",
  provisionAttempts: 1,
};

await createRatatuiWorkspaceControlPresentation({ binaryPath }).start({
  executeCommand: async () => ok({}),
  executeQuery: async <T>(query: Query<T>) => {
    if (query instanceof ListSandboxesQuery) return ok({ items: [workspace] } as T);
    if (query instanceof ShowSandboxQuery) return ok(workspace as T);
    if (query instanceof ListSandboxAgentRuntimesQuery) {
      return ok({
        items: [
          {
            runtimeId: "sar_real_renderer",
            sandboxId: workspace.sandboxId,
            harnessKey: "fixture",
            harnessTemplateId: "fixture-default",
            status: "running",
            interaction: { transport: "managed-terminal", sessionId: "term_real" },
            capabilities: {},
            createdAt: workspace.createdAt,
          },
        ],
      } as T);
    }
    if (
      query instanceof ListSandboxPortsQuery ||
      query instanceof ListSandboxSnapshotsQuery ||
      query instanceof ListSandboxPromotionsQuery ||
      query instanceof ListAgentTaskRunsQuery
    ) {
      return ok({ items: [] } as T);
    }
    throw new Error(`Unexpected query ${query.constructor.name}`);
  },
});
