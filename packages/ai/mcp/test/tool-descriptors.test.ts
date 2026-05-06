import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import { operationCatalog } from "@appaloft/application";

import { toolContractSchema, toolContracts, toolContractsByOperationKey } from "../src";

describe("MCP tool descriptors", () => {
  test("[MCP-TOOL-DESC-001] every operation catalog entry has one generated tool descriptor", () => {
    expect(toolContracts).toHaveLength(operationCatalog.length);

    for (const entry of operationCatalog) {
      const descriptor = toolContractsByOperationKey.get(entry.key);

      expect(descriptor, entry.key).toBeDefined();
      expect(descriptor?.operationKey).toBe(entry.key);
      expect(descriptor?.kind).toBe(entry.kind);
      expect(descriptor?.domain).toBe(entry.domain);
      expect(descriptor?.inputSchemaAvailable).toBe(Boolean(entry.inputSchema));
    }
  });

  test("[MCP-TOOL-DESC-002] descriptors are serializable and preserve CLI/API transport metadata", () => {
    const names = new Set<string>();

    for (const descriptor of toolContracts) {
      expect(names.has(descriptor.name), descriptor.name).toBe(false);
      names.add(descriptor.name);

      const serializable = toolContractSchema.parse(descriptor);
      const entry = operationCatalog.find((candidate) => candidate.key === descriptor.operationKey);

      expect(entry, descriptor.operationKey).toBeDefined();
      expect(serializable.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(serializable.name).not.toContain(".");
      expect(serializable.name).not.toContain("-");
      expect(serializable.description).toContain(descriptor.operationKey);

      if (entry?.transports.cli) {
        expect(serializable.cliCommand).toBe(entry.transports.cli);
      }

      if (entry?.transports.orpc) {
        expect(serializable.httpRoute).toBe(
          `${entry.transports.orpc.method} ${entry.transports.orpc.path}`,
        );
      }

      if (entry?.transports.orpcAdditional) {
        expect(serializable.alternateHttpRoutes).toEqual(
          entry.transports.orpcAdditional.map((route) => `${route.method} ${route.path}`),
        );
      }
    }
  });

  test("[MCP-TOOL-DESC-003] high-value deployment and resource tools use operation-key names", () => {
    expect(toolContractsByOperationKey.get("deployments.plan")).toMatchObject({
      name: "deployments_plan",
      httpRoute: "GET /api/deployments/plan",
    });
    expect(toolContractsByOperationKey.get("deployments.create")).toMatchObject({
      name: "deployments_create",
      cliCommand:
        "appaloft deploy [path-or-source] [--config appaloft.yml] [--env KEY=VALUE] [--secret KEY=ci-env:NAME] [--preview pull-request]",
      httpRoute: "POST /api/deployments",
      alternateHttpRoutes: ["POST /api/deployments/stream"],
    });
    expect(toolContractsByOperationKey.get("resources.configure-source")).toMatchObject({
      name: "resources_configure_source",
    });
    expect(toolContractsByOperationKey.get("source-events.ingest")).toMatchObject({
      name: "source_events_ingest",
      httpRoute: "POST /api/resources/{resourceId}/source-events/generic-signed",
      alternateHttpRoutes: ["POST /api/integrations/github/source-events"],
    });
    expect(toolContractsByOperationKey.get("servers.register")).toMatchObject({
      name: "servers_register",
      cliCommand: "appaloft server register",
      httpRoute: "POST /api/servers",
    });
    expect(toolContractsByOperationKey.get("preview-policies.configure")).toMatchObject({
      name: "preview_policies_configure",
      cliCommand: "appaloft preview policy configure",
      httpRoute: "POST /api/preview-policies",
    });
    expect(toolContractsByOperationKey.get("preview-policies.show")).toMatchObject({
      name: "preview_policies_show",
      cliCommand: "appaloft preview policy show",
      httpRoute: "POST /api/preview-policies/show",
    });
    expect(toolContractsByOperationKey.get("preview-environments.list")).toMatchObject({
      name: "preview_environments_list",
      cliCommand: "appaloft preview environment list",
      httpRoute: "GET /api/preview-environments",
    });
    expect(toolContractsByOperationKey.get("preview-environments.show")).toMatchObject({
      name: "preview_environments_show",
      cliCommand: "appaloft preview environment show",
      httpRoute: "GET /api/preview-environments/{previewEnvironmentId}",
    });
    expect(toolContractsByOperationKey.get("preview-environments.delete")).toMatchObject({
      name: "preview_environments_delete",
      cliCommand: "appaloft preview environment delete",
      httpRoute: "DELETE /api/resources/{resourceId}/preview-environments/{previewEnvironmentId}",
    });
    expect(toolContractsByOperationKey.has("server.docker-swarm-target")).toBe(false);
  });

  test("[SCHED-TASK-SECRET-001] scheduled task descriptors do not contain secret examples", () => {
    for (const operationKey of [
      "scheduled-tasks.create",
      "scheduled-tasks.configure",
      "scheduled-tasks.run-now",
      "scheduled-task-runs.logs",
    ]) {
      const descriptor = toolContractsByOperationKey.get(operationKey);
      expect(descriptor, operationKey).toBeDefined();
      expect(
        [
          descriptor?.description ?? "",
          descriptor?.cliCommand ?? "",
          descriptor?.httpRoute ?? "",
          ...(descriptor?.alternateHttpRoutes ?? []),
        ].join("\n"),
      ).not.toMatch(/(?:password|secret|token)\s*[:=]/i);
    }
  });
});
