import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  ConfigureRuntimeMonitoringThresholdsCommand,
  createExecutionContext,
  InspectRuntimeUsageQuery,
  ListRuntimeMonitoringSamplesQuery,
  operationCatalog,
  RuntimeMonitoringRollupQuery,
  ShowRuntimeMonitoringThresholdsQuery,
} from "@appaloft/application";

import {
  createRuntimeMonitoringMcpToolServer,
  createRuntimeMonitoringToolHandlers,
  createRuntimeUsageMcpToolServer,
  createRuntimeUsageToolHandlers,
  toolContractSchema,
  toolContracts,
  toolContractsByOperationKey,
} from "../src";

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

  test("[RT-MON-002][RT-MON-003][MCP-TOOL-DESC-001] runtime monitoring reads expose generated tool descriptors", () => {
    expect(toolContractsByOperationKey.get("runtime-monitoring.samples.list")).toMatchObject({
      name: "runtime_monitoring_samples_list",
      kind: "query",
      domain: "runtime-monitoring",
      cliCommand: "appaloft runtime-monitoring samples <scope> --from <iso> --to <iso>",
      httpRoute: "GET /api/runtime-monitoring/samples",
      inputSchemaAvailable: true,
    });

    expect(toolContractsByOperationKey.get("runtime-monitoring.rollup")).toMatchObject({
      name: "runtime_monitoring_rollup",
      kind: "query",
      domain: "runtime-monitoring",
      cliCommand:
        "appaloft runtime-monitoring rollup <scope> --from <iso> --to <iso> --bucket <bucket>",
      httpRoute: "GET /api/runtime-monitoring/rollup",
      inputSchemaAvailable: true,
    });

    expect(
      toolContractsByOperationKey.get("runtime-monitoring.thresholds.configure"),
    ).toMatchObject({
      name: "runtime_monitoring_thresholds_configure",
      kind: "command",
      domain: "runtime-monitoring",
      cliCommand: "appaloft runtime-monitoring thresholds configure <scope> --rule <json>",
      httpRoute: "POST /api/runtime-monitoring/thresholds",
      inputSchemaAvailable: true,
    });

    expect(toolContractsByOperationKey.get("runtime-monitoring.thresholds.show")).toMatchObject({
      name: "runtime_monitoring_thresholds_show",
      kind: "query",
      domain: "runtime-monitoring",
      cliCommand: "appaloft runtime-monitoring thresholds show <scope>",
      httpRoute: "GET /api/runtime-monitoring/thresholds",
      inputSchemaAvailable: true,
    });
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

  test("[RT-MON-002][RT-MON-003] runtime monitoring MCP handlers dispatch shared query messages", async () => {
    const dispatched: unknown[] = [];
    const commandBus = {
      execute: async (_context: unknown, command: unknown) => {
        dispatched.push(command);
        return { ok: true, commandName: command?.constructor?.name };
      },
    };
    const queryBus = {
      execute: async (_context: unknown, query: unknown) => {
        dispatched.push(query);
        return { ok: true, queryName: query?.constructor?.name };
      },
    };
    const handlers = createRuntimeMonitoringToolHandlers({ commandBus, queryBus });
    const context = createExecutionContext({
      requestId: "req_runtime_monitoring_mcp_test",
      entrypoint: "mcp",
    });

    const samples = await handlers.runtime_monitoring_samples_list({
      context,
      input: {
        scope: { kind: "resource", resourceId: "res_api" },
        window: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T00:05:00.000Z",
        },
        signals: ["cpu"],
      },
    });
    const rollup = await handlers.runtime_monitoring_rollup({
      context,
      input: {
        "scope.kind": "server",
        "scope.serverId": "srv_prod",
        "window.from": "2026-01-01T00:00:00.000Z",
        "window.to": "2026-01-01T01:00:00.000Z",
        bucket: "minute",
      },
    });
    const configure = await handlers.runtime_monitoring_thresholds_configure({
      context,
      input: {
        scope: { kind: "resource", resourceId: "res_api" },
        rules: [{ signal: "disk", metric: "usedBytes", critical: 200 }],
      },
    });
    const show = await handlers.runtime_monitoring_thresholds_show({
      context,
      input: {
        scope: { kind: "resource", resourceId: "res_api" },
      },
    });

    expect(samples).toEqual({ ok: true, queryName: "ListRuntimeMonitoringSamplesQuery" });
    expect(rollup).toEqual({ ok: true, queryName: "RuntimeMonitoringRollupQuery" });
    expect(configure).toEqual({
      ok: true,
      commandName: "ConfigureRuntimeMonitoringThresholdsCommand",
    });
    expect(show).toEqual({ ok: true, queryName: "ShowRuntimeMonitoringThresholdsQuery" });
    expect(dispatched[0]).toBeInstanceOf(ListRuntimeMonitoringSamplesQuery);
    expect(dispatched[1]).toBeInstanceOf(RuntimeMonitoringRollupQuery);
    expect(dispatched[2]).toBeInstanceOf(ConfigureRuntimeMonitoringThresholdsCommand);
    expect(dispatched[3]).toBeInstanceOf(ShowRuntimeMonitoringThresholdsQuery);
  });

  test("[RT-USAGE-008] runtime usage MCP handler dispatches the shared inspect query", async () => {
    const dispatched: unknown[] = [];
    const handlers = createRuntimeUsageToolHandlers({
      queryBus: {
        execute: async (_context: unknown, query: unknown) => {
          dispatched.push(query);
          return { ok: true, queryName: query?.constructor?.name };
        },
      },
    });
    const context = createExecutionContext({
      requestId: "req_runtime_usage_mcp_test",
      entrypoint: "mcp",
    });

    const result = await handlers.runtime_usage_inspect({
      context,
      input: {
        scope: { kind: "resource", resourceId: "res_api" },
      },
    });

    expect(result).toEqual({ ok: true, queryName: "InspectRuntimeUsageQuery" });
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toBeInstanceOf(InspectRuntimeUsageQuery);
  });

  test("[RT-MON-003] runtime monitoring MCP handlers return schema errors without dispatch", async () => {
    const dispatched: unknown[] = [];
    const handlers = createRuntimeMonitoringToolHandlers({
      commandBus: {
        execute: async (_context: unknown, command: unknown) => {
          dispatched.push(command);
          return { ok: true };
        },
      },
      queryBus: {
        execute: async (_context: unknown, query: unknown) => {
          dispatched.push(query);
          return { ok: true };
        },
      },
    });

    const result = await handlers.runtime_monitoring_samples_list({
      context: createExecutionContext({
        requestId: "req_runtime_monitoring_mcp_invalid_test",
        entrypoint: "mcp",
      }),
      input: {
        scope: { kind: "resource", resourceId: "res_api" },
        window: {
          from: "2026-01-02T00:00:00.000Z",
          to: "2026-01-01T00:00:00.000Z",
        },
      },
    });

    expect(dispatched).toHaveLength(0);
    expect(
      typeof result === "object" &&
        result !== null &&
        "isErr" in result &&
        typeof result.isErr === "function" &&
        result.isErr(),
    ).toBe(true);
  });

  test("[RT-MON-002][RT-MON-003] runtime monitoring MCP server registers tools and dispatches calls by name", async () => {
    const dispatched: unknown[] = [];
    const server = createRuntimeMonitoringMcpToolServer({
      commandBus: {
        execute: async (_context: unknown, command: unknown) => {
          dispatched.push(command);
          return { ok: true, commandName: command?.constructor?.name };
        },
      },
      queryBus: {
        execute: async (_context: unknown, query: unknown) => {
          dispatched.push(query);
          return { ok: true, queryName: query?.constructor?.name };
        },
      },
    });
    const tools = server.listTools();

    expect(tools.map((tool) => tool.name)).toEqual([
      "runtime_monitoring_rollup",
      "runtime_monitoring_samples_list",
      "runtime_monitoring_thresholds_configure",
      "runtime_monitoring_thresholds_show",
    ]);
    for (const tool of tools) {
      expect(toolContractSchema.parse(tool)).toEqual(tool);
      expect(tool.domain).toBe("runtime-monitoring");
    }

    const context = createExecutionContext({
      requestId: "req_runtime_monitoring_mcp_server_test",
      entrypoint: "mcp",
    });
    const result = await server.callTool({
      name: "runtime_monitoring_rollup",
      context,
      input: {
        scope: { kind: "server", serverId: "srv_prod" },
        window: {
          from: "2026-01-01T00:00:00.000Z",
          to: "2026-01-01T01:00:00.000Z",
        },
        bucket: "minute",
      },
    });
    const missing = await server.callTool({
      name: "runtime_monitoring_missing",
      context,
      input: {},
    });

    expect(result).toEqual({ ok: true, queryName: "RuntimeMonitoringRollupQuery" });
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toBeInstanceOf(RuntimeMonitoringRollupQuery);
    expect(missing).toEqual({
      kind: "tool-call-error",
      code: "mcp_tool_not_registered",
      message: "MCP tool is not registered: runtime_monitoring_missing",
      toolName: "runtime_monitoring_missing",
      retryable: false,
    });
    expect(dispatched).toHaveLength(1);
  });

  test("[RT-USAGE-008] runtime usage MCP server registers inspect and rejects invalid inputs without dispatch", async () => {
    const dispatched: unknown[] = [];
    const server = createRuntimeUsageMcpToolServer({
      queryBus: {
        execute: async (_context: unknown, query: unknown) => {
          dispatched.push(query);
          return { ok: true, queryName: query?.constructor?.name };
        },
      },
    });
    const context = createExecutionContext({
      requestId: "req_runtime_usage_mcp_server_test",
      entrypoint: "mcp",
    });

    expect(server.listTools()).toEqual([
      {
        name: "runtime_usage_inspect",
        operationKey: "runtime-usage.inspect",
        kind: "query",
        domain: "runtime-usage",
        description:
          "Read runtime-usage.inspect through the Appaloft application operation catalog.",
        cliCommand: "appaloft runtime-usage inspect <scope>",
        httpRoute: "GET /api/runtime-usage/inspect",
        inputSchemaAvailable: true,
      },
    ]);

    const okResult = await server.callTool({
      name: "runtime_usage_inspect",
      context,
      input: {
        "scope.kind": "server",
        "scope.serverId": "srv_prod",
      },
    });
    const invalidResult = await server.callTool({
      name: "runtime_usage_inspect",
      context,
      input: {
        scope: { kind: "missing" },
      },
    });

    expect(okResult).toEqual({ ok: true, queryName: "InspectRuntimeUsageQuery" });
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]).toBeInstanceOf(InspectRuntimeUsageQuery);
    expect(
      typeof invalidResult === "object" &&
        invalidResult !== null &&
        "isErr" in invalidResult &&
        typeof invalidResult.isErr === "function" &&
        invalidResult.isErr(),
    ).toBe(true);
    expect(dispatched).toHaveLength(1);
  });
});
