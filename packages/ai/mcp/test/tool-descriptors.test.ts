import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  ConfigureRuntimeMonitoringThresholdsCommand,
  CreateProjectCommand,
  createExecutionContext,
  DeploymentPlanQuery,
  DoctorQuery,
  InspectRuntimeUsageQuery,
  ListRuntimeMonitoringSamplesQuery,
  operationCatalog,
  RuntimeMonitoringRollupQuery,
  ShowRuntimeMonitoringThresholdsQuery,
} from "@appaloft/application";

import {
  createAppaloftMcpPrompts,
  createAppaloftMcpResources,
  createAppaloftMcpServer,
  createOperationToolHandlers,
  createRuntimeMonitoringMcpToolServer,
  createRuntimeMonitoringToolHandlers,
  createRuntimeUsageMcpToolServer,
  createRuntimeUsageToolHandlers,
  handleAppaloftMcpJsonRpcRequest,
  operationMessageFactoryNames,
  runAppaloftMcpRemoteStdioProxy,
  toolContractSchema,
  toolContracts,
  toolContractsByOperationKey,
  toolDescriptorsByName,
} from "../src";

function isResultError(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "isErr" in value &&
    typeof value.isErr === "function" &&
    value.isErr()
  );
}

function mcpText(result: { content: { type: "text"; text: string }[] }): string {
  return result.content.map((part) => part.text).join("\n");
}

describe("MCP tool descriptors", () => {
  test("[MCP-REMOTE-STDIO-001] remote stdio proxy forwards JSON-RPC over HTTP with bearer auth", async () => {
    const requests: Request[] = [];
    let stdout = "";
    const stdin = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"jsonrpc":"2.0","id":1,"method":"ping"}\n'));
        controller.close();
      },
    });

    await runAppaloftMcpRemoteStdioProxy({
      endpoint: "https://app.appaloft.com/mcp",
      authorization: "Bearer tok_remote_mcp_secret_1234",
      stdin,
      stdout: {
        write(data) {
          stdout += data;
        },
      },
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response('{"jsonrpc":"2.0","id":1,"result":{}}', {
          headers: {
            "content-type": "application/json",
          },
        });
      },
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://app.appaloft.com/mcp");
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer tok_remote_mcp_secret_1234");
    expect(await requests[0]?.text()).toBe('{"jsonrpc":"2.0","id":1,"method":"ping"}');
    expect(stdout).toBe('{"jsonrpc":"2.0","id":1,"result":{}}\n');
    expect(stdout).not.toContain("tok_remote_mcp_secret_1234");
  });

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

  test("[APPALOFT-MCP-010] MCP tools expose host annotations for read-only, idempotent, and destructive operations", () => {
    const server = createAppaloftMcpServer({
      commandBus: {
        execute: async () => ({ ok: true }),
      },
      queryBus: {
        execute: async () => ({ ok: true }),
      },
    });
    const toolsByName = new Map(server.listTools().map((tool) => [tool.name, tool]));

    expect(toolsByName.get("runtime_usage_inspect")).toMatchObject({
      title: "Runtime Usage Inspect",
      annotations: {
        title: "Runtime Usage Inspect",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    });
    expect(toolsByName.get("projects_create")).toMatchObject({
      title: "Projects Create",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    });
    expect(toolsByName.get("projects_delete")).toMatchObject({
      title: "Projects Delete",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
    });
    expect(toolsByName.get("deployments_prune")).toMatchObject({
      annotations: {
        destructiveHint: true,
      },
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

  test("[APPALOFT-MCP-001] every descriptor has a message factory and generated operation handler", () => {
    const handlers = createOperationToolHandlers({
      commandBus: {
        execute: async () => ({ ok: true }),
      },
      queryBus: {
        execute: async () => ({ ok: true }),
      },
    });

    expect(Object.keys(handlers)).toHaveLength(operationCatalog.length);

    for (const entry of operationCatalog) {
      const descriptor = toolContractsByOperationKey.get(entry.key);

      expect(descriptor, entry.key).toBeDefined();
      expect(toolDescriptorsByName.get(descriptor?.name ?? ""), entry.key).toBe(descriptor);
      expect(operationMessageFactoryNames.has(entry.messageName), entry.messageName).toBe(true);
      expect(handlers[descriptor?.name ?? ""], entry.key).toBeFunction();
    }
  });

  test("[APPALOFT-MCP-002] generated operation handlers dispatch representative command, query, and no-input query messages", async () => {
    const dispatched: unknown[] = [];
    const commandBus = {
      execute: async (context: unknown, command: unknown) => {
        dispatched.push({ context, message: command });
        return { ok: true, commandName: command?.constructor?.name };
      },
    };
    const queryBus = {
      execute: async (context: unknown, query: unknown) => {
        dispatched.push({ context, message: query });
        return { ok: true, queryName: query?.constructor?.name };
      },
    };
    const handlers = createOperationToolHandlers({ commandBus, queryBus });
    const context = createExecutionContext({
      requestId: "req_appaloft_mcp_dispatch_test",
      entrypoint: "mcp",
    });

    const createdProject = await handlers.projects_create({
      context,
      input: {
        name: "Agent demo",
        description: "Created through MCP",
      },
    });
    const deploymentPlan = await handlers.deployments_plan({
      context,
      input: {
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceId: "res_demo",
        serverId: "srv_demo",
      },
    });
    const doctor = await handlers.system_doctor({
      context,
      input: {},
    });

    expect(createdProject).toEqual({ ok: true, commandName: "CreateProjectCommand" });
    expect(deploymentPlan).toEqual({ ok: true, queryName: "DeploymentPlanQuery" });
    expect(doctor).toEqual({ ok: true, queryName: "DoctorQuery" });
    expect(dispatched.map((item) => item.message)).toEqual([
      expect.any(CreateProjectCommand),
      expect.any(DeploymentPlanQuery),
      expect.any(DoctorQuery),
    ]);
    for (const item of dispatched) {
      expect(item.context.entrypoint).toBe("mcp");
    }
  });

  test("[APPALOFT-MCP-003] generated handlers return schema errors before dispatch", async () => {
    const dispatched: unknown[] = [];
    const handlers = createOperationToolHandlers({
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

    const result = await handlers.projects_create({
      context: createExecutionContext({
        requestId: "req_appaloft_mcp_invalid_test",
        entrypoint: "mcp",
      }),
      input: {
        description: "missing name",
      },
    });

    expect(isResultError(result)).toBe(true);
    expect(dispatched).toHaveLength(0);
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
    expect(isResultError(result)).toBe(true);
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
          "Read runtime-usage.inspect through the Appaloft application operation catalog. Shared with CLI and HTTP/API.",
        cliCommand: "appaloft runtime-usage inspect <scope>",
        httpRoute: "GET /api/runtime-usage/inspect",
        inputSchemaAvailable: true,
      },
    ]);
    expect(server.listMcpTools()[0]).toMatchObject({
      name: "runtime_usage_inspect",
      title: "Runtime Usage Inspect",
      annotations: {
        title: "Runtime Usage Inspect",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
      inputSchema: expect.objectContaining({}),
    });

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
    expect(isResultError(invalidResult)).toBe(true);
    expect(dispatched).toHaveLength(1);
  });

  test("[APPALOFT-MCP-005][APPALOFT-MCP-006] resources and prompts expose read-only workflow context", () => {
    const resources = createAppaloftMcpResources();
    const prompts = createAppaloftMcpPrompts();

    expect(resources.map((resource) => resource.uri)).toEqual([
      "appaloft://operation-catalog",
      "appaloft://tools/high-value",
      "appaloft://skill/appaloft",
      "appaloft://skill/deploy-protocol",
      "appaloft://tools/mcp-guide",
      "appaloft://docs/agent",
    ]);
    expect(
      resources.find((resource) => resource.uri === "appaloft://operation-catalog")?.text,
    ).toContain('"operationKey": "deployments.create"');
    expect(resources.map((resource) => resource.text).join("\n")).not.toMatch(
      /(?:password|secret|token)\s*[:=]/i,
    );

    expect(prompts.map((prompt) => prompt.name)).toEqual([
      "appaloft-first-deploy",
      "appaloft-recover-deployment",
      "appaloft-configure-resource",
      "appaloft-observe-runtime",
      "appaloft-publish-static-artifact",
    ]);
    expect(
      prompts[0]?.getMessages({ source: "repo", goal: "demo app" })[0]?.content.text,
    ).toContain("deployments_create");
    expect(prompts[1]?.getMessages({ deploymentId: "dep_demo" })[0]?.content.text).toContain(
      "recovery readiness",
    );
  });

  test("[APPALOFT-MCP-002][APPALOFT-MCP-007] full MCP server lists tools and returns MCP-shaped tool results", async () => {
    const commandBus = {
      execute: async (context: unknown, command: unknown) => ({
        entrypoint: context.entrypoint,
        commandName: command?.constructor?.name,
      }),
    };
    const queryBus = {
      execute: async (context: unknown, query: unknown) => ({
        entrypoint: context.entrypoint,
        queryName: query?.constructor?.name,
      }),
    };
    const server = createAppaloftMcpServer({ commandBus, queryBus });

    expect(server.listTools()).toHaveLength(operationCatalog.length);
    expect(server.listTools().find((tool) => tool.name === "projects_create")).toMatchObject({
      inputSchema: expect.objectContaining({
        type: "object",
      }),
      operationKey: "projects.create",
    });

    const commandResult = await server.callTool({
      name: "projects_create",
      arguments: { name: "MCP project" },
    });
    const queryResult = await server.callTool({
      name: "system_doctor",
      arguments: {},
    });
    const missingResult = await server.callTool({
      name: "missing_tool",
      arguments: {},
    });

    expect(JSON.parse(mcpText(commandResult))).toEqual({
      entrypoint: "mcp",
      commandName: "CreateProjectCommand",
    });
    expect(commandResult.structuredContent).toEqual({
      entrypoint: "mcp",
      commandName: "CreateProjectCommand",
    });
    expect(JSON.parse(mcpText(queryResult))).toEqual({
      entrypoint: "mcp",
      queryName: "DoctorQuery",
    });
    expect(queryResult.structuredContent).toEqual({
      entrypoint: "mcp",
      queryName: "DoctorQuery",
    });
    expect(missingResult.isError).toBe(true);
    expect(mcpText(missingResult)).toContain("mcp_tool_not_registered");
  });

  test("[APPALOFT-MCP-007] JSON-RPC adapter supports initialize, tools, resources, prompts, and errors", async () => {
    const server = createAppaloftMcpServer({
      commandBus: {
        execute: async (_context: unknown, command: unknown) => ({
          commandName: command?.constructor?.name,
        }),
      },
      queryBus: {
        execute: async (_context: unknown, query: unknown) => ({
          queryName: query?.constructor?.name,
        }),
      },
    });

    await expect(
      handleAppaloftMcpJsonRpcRequest(server, {
        jsonrpc: "2.0",
        method: "notifications/initialized",
      }),
    ).resolves.toBeNull();

    await expect(
      handleAppaloftMcpJsonRpcRequest(server, {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
      }),
    ).resolves.toMatchObject({
      result: {
        protocolVersion: "2025-06-18",
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      },
    });
    await expect(
      handleAppaloftMcpJsonRpcRequest(server, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
      }),
    ).resolves.toMatchObject({
      result: {
        tools: expect.arrayContaining([expect.objectContaining({ name: "deployments_create" })]),
      },
    });
    await expect(
      handleAppaloftMcpJsonRpcRequest(server, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "projects_create",
          arguments: { name: "RPC project" },
        },
      }),
    ).resolves.toMatchObject({
      result: {
        content: [
          {
            type: "text",
            text: expect.stringContaining("CreateProjectCommand"),
          },
        ],
        structuredContent: {
          commandName: "CreateProjectCommand",
        },
      },
    });
    await expect(
      handleAppaloftMcpJsonRpcRequest(server, {
        jsonrpc: "2.0",
        id: "missing-tool",
        method: "tools/call",
        params: {
          name: "missing_tool",
          arguments: {},
        },
      }),
    ).resolves.toMatchObject({
      error: {
        code: -32602,
        data: {
          toolName: "missing_tool",
        },
      },
    });
    await expect(
      handleAppaloftMcpJsonRpcRequest(server, {
        jsonrpc: "2.0",
        id: 4,
        method: "resources/list",
      }),
    ).resolves.toMatchObject({
      result: {
        resources: expect.arrayContaining([
          expect.objectContaining({ uri: "appaloft://operation-catalog" }),
        ]),
      },
    });
    const resourceRead = await handleAppaloftMcpJsonRpcRequest(server, {
      jsonrpc: "2.0",
      id: 5,
      method: "resources/read",
      params: { uri: "appaloft://tools/mcp-guide" },
    });
    expect(resourceRead).toMatchObject({
      result: {
        contents: [
          {
            mimeType: "text/markdown",
            uri: "appaloft://tools/mcp-guide",
          },
        ],
      },
    });
    expect(JSON.stringify(resourceRead)).toContain("operation-catalog.ts");
    await expect(
      handleAppaloftMcpJsonRpcRequest(server, {
        jsonrpc: "2.0",
        id: 6,
        method: "prompts/list",
      }),
    ).resolves.toMatchObject({
      result: {
        prompts: expect.arrayContaining([
          expect.objectContaining({ name: "appaloft-first-deploy" }),
        ]),
      },
    });
    await expect(
      handleAppaloftMcpJsonRpcRequest(server, {
        jsonrpc: "2.0",
        id: 7,
        method: "prompts/get",
        params: {
          name: "appaloft-first-deploy",
          arguments: { source: "repo" },
        },
      }),
    ).resolves.toMatchObject({
      result: {
        messages: [
          expect.objectContaining({
            content: expect.objectContaining({
              text: expect.stringContaining("repo"),
            }),
          }),
        ],
      },
    });
    await expect(
      handleAppaloftMcpJsonRpcRequest(server, {
        jsonrpc: "2.0",
        id: 8,
        method: "no/such-method",
      }),
    ).resolves.toMatchObject({
      error: {
        code: -32601,
      },
    });
  });
});
