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
  });
});
