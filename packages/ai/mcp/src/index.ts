import * as applicationMessages from "@appaloft/application";
import {
  type Command,
  type CommandBus,
  createExecutionContext,
  type ExecutionContext,
  type ExecutionContextFactory,
  type OperationCatalogEntry,
  operationCatalog,
  type Query,
  type QueryBus,
} from "@appaloft/application";
import { domainError, err, type Result } from "@appaloft/core";
import { z } from "zod";

type OperationTransportRoute = NonNullable<OperationCatalogEntry["transports"]["orpc"]>;
type JsonObject = Record<string, unknown>;
type JsonRpcId = number | string | null;

const toolNamePattern = /^[a-z][a-z0-9_]*$/;
const operationKeyPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const defaultProtocolVersion = "2025-06-18";

export const toolNameSchema = z.string().regex(toolNamePattern);

export const toolContractSchema = z.object({
  name: toolNameSchema,
  operationKey: z.string().regex(operationKeyPattern),
  kind: z.enum(["command", "query"]),
  domain: z.string(),
  description: z.string(),
  cliCommand: z.string().optional(),
  httpRoute: z.string().optional(),
  alternateHttpRoutes: z.array(z.string()).optional(),
  inputSchemaAvailable: z.boolean(),
});

export type ToolContract = z.infer<typeof toolContractSchema>;

export type McpJsonSchema = JsonObject;

export interface ToolDescriptor extends ToolContract {
  readonly inputSchema?: OperationCatalogEntry["inputSchema"];
  readonly inputJsonSchema: McpJsonSchema;
}

export interface McpToolAnnotations {
  readonly title: string;
  readonly readOnlyHint: boolean;
  readonly destructiveHint?: boolean;
  readonly idempotentHint?: boolean;
  readonly openWorldHint: boolean;
}

export interface McpTool extends ToolContract {
  readonly title: string;
  readonly annotations: McpToolAnnotations;
  readonly inputSchema: McpJsonSchema;
}

export interface ToolExecutionRequest {
  context: ExecutionContext;
  input: unknown;
}

export type ToolExecutionResult = unknown;

export type ToolExecutionHandler = (request: ToolExecutionRequest) => Promise<ToolExecutionResult>;

export interface OperationToolHandlerOptions {
  commandBus: Pick<CommandBus, "execute">;
  queryBus: Pick<QueryBus, "execute">;
}

export interface RuntimeMonitoringToolHandlerOptions extends OperationToolHandlerOptions {}

export interface ToolCallRequest extends ToolExecutionRequest {
  name: string;
}

export interface ToolCallError {
  kind: "tool-call-error";
  code: "mcp_tool_not_registered" | "mcp_operation_message_not_registered";
  message: string;
  toolName: string;
  retryable: false;
}

export interface AppaloftMcpToolServer {
  listTools(): ToolContract[];
  listMcpTools(): McpTool[];
  hasTool(name: string): boolean;
  callTool(request: ToolCallRequest): Promise<ToolExecutionResult | ToolCallError>;
}

export interface AppaloftMcpToolServerOptions {
  handlers: Partial<Record<string, ToolExecutionHandler>>;
  descriptors?: readonly ToolDescriptor[];
}

export interface AppaloftMcpResource {
  uri: string;
  name: string;
  description: string;
  mimeType: "application/json" | "text/markdown";
  text: string;
}

export interface AppaloftMcpPromptArgument {
  name: string;
  description: string;
  required?: boolean;
}

export interface AppaloftMcpPrompt {
  name: string;
  description: string;
  arguments?: AppaloftMcpPromptArgument[];
  getMessages(args?: JsonObject): {
    role: "assistant" | "user";
    content: {
      type: "text";
      text: string;
    };
  }[];
}

export interface AppaloftMcpServerOptions extends OperationToolHandlerOptions {
  descriptors?: readonly ToolDescriptor[];
  executionContextFactory?: ExecutionContextFactory;
  resources?: readonly AppaloftMcpResource[];
  prompts?: readonly AppaloftMcpPrompt[];
}

export interface AppaloftMcpServer {
  listTools(): McpTool[];
  hasTool(name: string): boolean;
  callTool(input: { name: string; arguments?: unknown; context?: ExecutionContext }): Promise<{
    content: { type: "text"; text: string }[];
    structuredContent?: JsonObject;
    isError?: boolean;
  }>;
  listResources(): Omit<AppaloftMcpResource, "text">[];
  readResource(uri: string): { contents: { uri: string; mimeType: string; text: string }[] };
  listPrompts(): Omit<AppaloftMcpPrompt, "getMessages">[];
  getPrompt(
    name: string,
    args?: JsonObject,
  ): {
    description: string;
    messages: ReturnType<AppaloftMcpPrompt["getMessages"]>;
  };
}

interface OperationMessageFactory {
  create(input: unknown): Result<Command<unknown> | Query<unknown>>;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

function operationKeyToToolName(operationKey: string): string {
  return operationKey.replaceAll(".", "_").replaceAll("-", "_");
}

function routeLabel(route: OperationTransportRoute): string {
  return `${route.method} ${route.path}`;
}

function firstHttpRoute(entry: OperationCatalogEntry): string | undefined {
  if (entry.transports.orpc) {
    return routeLabel(entry.transports.orpc);
  }

  if (entry.transports.orpcStream) {
    return routeLabel(entry.transports.orpcStream);
  }

  return undefined;
}

function alternateHttpRoutes(entry: OperationCatalogEntry): string[] {
  return [
    ...(entry.transports.orpcAdditional ?? []).map(routeLabel),
    ...(entry.transports.orpc && entry.transports.orpcStream
      ? [routeLabel(entry.transports.orpcStream)]
      : []),
  ];
}

function descriptionFor(entry: OperationCatalogEntry): string {
  const action = entry.kind === "command" ? "Run" : "Read";
  const transports = [
    ...(entry.transports.cli ? ["CLI"] : []),
    ...(entry.transports.orpc || entry.transports.orpcAdditional || entry.transports.orpcStream
      ? ["HTTP/API"]
      : []),
  ];
  const transportSuffix = transports.length > 0 ? ` Shared with ${transports.join(" and ")}.` : "";

  return `${action} ${entry.key} through the Appaloft application operation catalog.${transportSuffix}`;
}

function stripJsonSchemaDialect(schema: unknown): McpJsonSchema {
  if (Array.isArray(schema)) {
    return schema.map((item) => stripJsonSchemaDialect(item)) as unknown as McpJsonSchema;
  }

  if (!schema || typeof schema !== "object") {
    return schema as McpJsonSchema;
  }

  const entries = Object.entries(schema)
    .filter(([key]) => key !== "$schema")
    .map(([key, value]) => [key, stripJsonSchemaDialect(value)] as const);

  return Object.fromEntries(entries);
}

function inputJsonSchemaFor(entry: OperationCatalogEntry): McpJsonSchema {
  if (!entry.inputSchema) {
    return {
      type: "object",
      additionalProperties: false,
      properties: {},
    };
  }

  return stripJsonSchemaDialect(
    z.toJSONSchema(entry.inputSchema, {
      io: "input",
    }),
  );
}

export function toolDescriptorFromOperation(entry: OperationCatalogEntry): ToolDescriptor {
  const alternateRoutes = alternateHttpRoutes(entry);

  return {
    name: operationKeyToToolName(entry.key),
    operationKey: entry.key,
    kind: entry.kind,
    domain: entry.domain,
    description: descriptionFor(entry),
    ...(entry.transports.cli ? { cliCommand: entry.transports.cli } : {}),
    ...(firstHttpRoute(entry) ? { httpRoute: firstHttpRoute(entry) } : {}),
    ...(alternateRoutes.length > 0 ? { alternateHttpRoutes: alternateRoutes } : {}),
    inputSchemaAvailable: Boolean(entry.inputSchema),
    inputJsonSchema: inputJsonSchemaFor(entry),
    ...(entry.inputSchema ? { inputSchema: entry.inputSchema } : {}),
  };
}

export const toolContracts = operationCatalog.map(toolDescriptorFromOperation);

export const toolContractsByOperationKey = new Map(
  toolContracts.map((contract) => [contract.operationKey, contract]),
);

export const toolContractsByName = new Map(
  toolContracts.map((contract) => [contract.name, contract]),
);

const operationEntriesByToolName = new Map(
  operationCatalog.map((entry) => [operationKeyToToolName(entry.key), entry]),
);

export const toolDescriptorsByName = new Map(
  toolContracts.map((descriptor) => [descriptor.name, descriptor]),
);

const operationMessageFactoriesByName = new Map<string, OperationMessageFactory>();

for (const entry of operationCatalog) {
  const exported = (applicationMessages as Record<string, unknown>)[entry.messageName];

  if (
    exported &&
    typeof exported === "function" &&
    "create" in exported &&
    typeof (exported as { create?: unknown }).create === "function"
  ) {
    operationMessageFactoriesByName.set(
      entry.messageName,
      exported as unknown as OperationMessageFactory,
    );
  }
}

export const operationMessageFactoryNames = new Set(operationMessageFactoriesByName.keys());

function toolNotRegistered(name: string): ToolCallError {
  return {
    kind: "tool-call-error",
    code: "mcp_tool_not_registered",
    message: `MCP tool is not registered: ${name}`,
    toolName: name,
    retryable: false,
  };
}

function operationMessageNotRegistered(name: string, entry: OperationCatalogEntry): ToolCallError {
  return {
    kind: "tool-call-error",
    code: "mcp_operation_message_not_registered",
    message: `MCP operation message is not registered: ${entry.messageName}`,
    toolName: name,
    retryable: false,
  };
}

function serializableToolContract(descriptor: ToolDescriptor): ToolContract {
  return toolContractSchema.parse(descriptor);
}

function titleForOperationKey(operationKey: string): string {
  return operationKey
    .split(".")
    .flatMap((segment) => segment.split("-"))
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function isDestructiveOperation(
  operationKey: string,
  operationKind: OperationCatalogEntry["kind"],
): boolean {
  if (operationKind === "query") {
    return false;
  }

  return /(?:^|[.-])(?:archive|cancel|cleanup|delete|expire|prune|remove|revoke|rotate|stop)(?:$|[.-])/.test(
    operationKey,
  );
}

function toolAnnotationsFor(input: {
  operationKey: string;
  kind: OperationCatalogEntry["kind"];
}): McpToolAnnotations {
  return {
    title: titleForOperationKey(input.operationKey),
    readOnlyHint: input.kind === "query",
    destructiveHint: isDestructiveOperation(input.operationKey, input.kind),
    idempotentHint: input.kind === "query",
    openWorldHint: true,
  };
}

function mcpToolFromDescriptor(descriptor: ToolDescriptor): McpTool {
  return {
    ...serializableToolContract(descriptor),
    title: titleForOperationKey(descriptor.operationKey),
    annotations: toolAnnotationsFor(descriptor),
    inputSchema: descriptor.inputJsonSchema,
  };
}

function isOperationMessage(value: unknown): value is Command<unknown> | Query<unknown> {
  return value instanceof applicationMessages.Command || value instanceof applicationMessages.Query;
}

function createOperationMessage(
  factory: OperationMessageFactory,
  input: unknown,
): Result<Command<unknown> | Query<unknown>> {
  return factory.create(input ?? {});
}

async function dispatchOperationTool(
  options: OperationToolHandlerOptions,
  entry: OperationCatalogEntry,
  request: ToolExecutionRequest,
): Promise<ToolExecutionResult> {
  const factory = operationMessageFactoriesByName.get(entry.messageName);
  if (!factory) {
    return err(
      domainError.infra("MCP operation message is not registered", {
        operationKey: entry.key,
        messageName: entry.messageName,
      }),
    );
  }

  const message = createOperationMessage(factory, request.input);
  if (message.isErr()) {
    return message;
  }

  if (entry.kind === "command" && isOperationMessage(message.value)) {
    return options.commandBus.execute(request.context, message.value as Command<unknown>);
  }

  if (entry.kind === "query" && isOperationMessage(message.value)) {
    return options.queryBus.execute(request.context, message.value as Query<unknown>);
  }

  return err(
    domainError.infra("MCP operation message kind mismatch", {
      operationKey: entry.key,
      messageName: entry.messageName,
      expectedKind: entry.kind,
    }),
  );
}

export function createOperationToolHandlers(
  options: OperationToolHandlerOptions,
  entries: readonly OperationCatalogEntry[] = operationCatalog,
): Record<string, ToolExecutionHandler> {
  return Object.fromEntries(
    entries.map((entry) => [
      operationKeyToToolName(entry.key),
      (request: ToolExecutionRequest) => dispatchOperationTool(options, entry, request),
    ]),
  );
}

function descriptorsForOperationKeys(operationKeys: readonly string[]): ToolDescriptor[] {
  const keys = new Set(operationKeys);
  return toolContracts.filter((descriptor) => keys.has(descriptor.operationKey));
}

function handlersForOperationKeys(
  options: OperationToolHandlerOptions,
  operationKeys: readonly string[],
): Record<string, ToolExecutionHandler> {
  const keys = new Set(operationKeys);
  return createOperationToolHandlers(
    options,
    operationCatalog.filter((entry) => keys.has(entry.key)),
  );
}

export function createRuntimeMonitoringToolHandlers(
  options: RuntimeMonitoringToolHandlerOptions,
): Record<
  | "runtime_monitoring_samples_list"
  | "runtime_monitoring_rollup"
  | "runtime_monitoring_thresholds_configure"
  | "runtime_monitoring_thresholds_show",
  ToolExecutionHandler
> {
  return handlersForOperationKeys(options, [
    "runtime-monitoring.samples.list",
    "runtime-monitoring.rollup",
    "runtime-monitoring.thresholds.configure",
    "runtime-monitoring.thresholds.show",
  ]) as Record<
    | "runtime_monitoring_samples_list"
    | "runtime_monitoring_rollup"
    | "runtime_monitoring_thresholds_configure"
    | "runtime_monitoring_thresholds_show",
    ToolExecutionHandler
  >;
}

export function createRuntimeUsageToolHandlers(
  options: Pick<RuntimeMonitoringToolHandlerOptions, "queryBus">,
): Record<"runtime_usage_inspect", ToolExecutionHandler> {
  return handlersForOperationKeys(
    {
      commandBus: {
        execute: async () =>
          err(domainError.infra("Runtime usage MCP server does not expose command tools")),
      },
      queryBus: options.queryBus,
    },
    ["runtime-usage.inspect"],
  ) as Record<"runtime_usage_inspect", ToolExecutionHandler>;
}

export function createAppaloftMcpToolServer(
  options: AppaloftMcpToolServerOptions,
): AppaloftMcpToolServer {
  const descriptors = options.descriptors ?? toolContracts;
  const descriptorsByName = new Map(descriptors.map((descriptor) => [descriptor.name, descriptor]));
  const handlersByName = new Map<string, ToolExecutionHandler>();

  for (const [name, handler] of Object.entries(options.handlers)) {
    if (!handler || !descriptorsByName.has(name)) {
      continue;
    }

    handlersByName.set(name, handler);
  }

  const listRegisteredDescriptors = () =>
    [...handlersByName.keys()]
      .map((name) => descriptorsByName.get(name))
      .filter((descriptor): descriptor is ToolDescriptor => Boolean(descriptor))
      .sort((left, right) => left.name.localeCompare(right.name));

  return {
    listTools() {
      return listRegisteredDescriptors().map(serializableToolContract);
    },
    listMcpTools() {
      return listRegisteredDescriptors().map(mcpToolFromDescriptor);
    },
    hasTool(name) {
      return handlersByName.has(name);
    },
    async callTool(request) {
      const handler = handlersByName.get(request.name);
      if (!handler) {
        const entry = operationEntriesByToolName.get(request.name);
        return entry
          ? operationMessageNotRegistered(request.name, entry)
          : toolNotRegistered(request.name);
      }

      return handler({
        context: request.context,
        input: request.input,
      });
    },
  };
}

export function createRuntimeUsageMcpToolServer(
  options: Pick<RuntimeMonitoringToolHandlerOptions, "queryBus">,
): AppaloftMcpToolServer {
  return createAppaloftMcpToolServer({
    descriptors: descriptorsForOperationKeys(["runtime-usage.inspect"]),
    handlers: createRuntimeUsageToolHandlers(options),
  });
}

export function createRuntimeMonitoringMcpToolServer(
  options: RuntimeMonitoringToolHandlerOptions,
): AppaloftMcpToolServer {
  return createAppaloftMcpToolServer({
    descriptors: descriptorsForOperationKeys([
      "runtime-monitoring.samples.list",
      "runtime-monitoring.rollup",
      "runtime-monitoring.thresholds.configure",
      "runtime-monitoring.thresholds.show",
    ]),
    handlers: createRuntimeMonitoringToolHandlers(options),
  });
}

function highValueToolSummary(): JsonObject[] {
  const keys = [
    "projects.create",
    "servers.register",
    "environments.create",
    "resources.create",
    "resources.configure-source",
    "resources.configure-runtime",
    "resources.configure-network",
    "resources.configure-health",
    "resources.configure-access",
    "deployments.plan",
    "deployments.create",
    "deployments.show",
    "deployments.timeline",
    "deployments.recovery-readiness",
    "deployments.retry",
    "deployments.redeploy",
    "deployments.force-redeploy",
    "deployments.rollback",
    "static-artifacts.publish-payload",
    "static-artifacts.publish-archive",
  ];

  return keys
    .map((key) => toolContractsByOperationKey.get(key))
    .filter((tool): tool is ToolDescriptor => Boolean(tool))
    .map((tool) => ({
      name: tool.name,
      operationKey: tool.operationKey,
      kind: tool.kind,
      domain: tool.domain,
      cliCommand: tool.cliCommand,
      httpRoute: tool.httpRoute,
    }));
}

export function createAppaloftMcpResources(): AppaloftMcpResource[] {
  return [
    {
      uri: "appaloft://operation-catalog",
      name: "Appaloft operation catalog",
      description: "All Appaloft MCP tools mapped one-to-one to operation catalog entries.",
      mimeType: "application/json",
      text: JSON.stringify(
        toolContracts.map((tool) => ({
          ...serializableToolContract(tool),
          inputSchema: tool.inputJsonSchema,
        })),
        null,
        2,
      ),
    },
    {
      uri: "appaloft://tools/high-value",
      name: "High-value Appaloft tools",
      description: "Common deployment, observation, recovery, and static artifact tools.",
      mimeType: "application/json",
      text: JSON.stringify(highValueToolSummary(), null, 2),
    },
    {
      uri: "appaloft://skill/appaloft",
      name: "Appaloft skill protocol",
      description: "Concise AI-facing Appaloft skill instructions.",
      mimeType: "text/markdown",
      text: [
        "# Appaloft Skill",
        "",
        "Use the Appaloft skill as the AI-facing entrypoint. Classify the user's intent, choose CLI, HTTP/API, Web, repository config, or MCP based on the active surface, and use existing Appaloft operations only.",
        "",
        "Do not invent `quick-deploy.create`, bypass adapters, call provider SDKs directly, or expose raw secrets. Return URL or access state first, then ids, status, logs, diagnostics, recovery readiness, and the next safe action.",
      ].join("\n"),
    },
    {
      uri: "appaloft://skill/deploy-protocol",
      name: "Appaloft deploy protocol",
      description: "Safe first-deploy workflow for AI agents.",
      mimeType: "text/markdown",
      text: [
        "# Deploy Protocol",
        "",
        "Inspect safe project metadata only. Select deployment mode before asking for ids. Create or select project, server, environment, and resource context through Appaloft operations. Configure Resource profile before deployment admission. Plan when useful, deploy, observe, then return URL/access state first.",
        "",
        "Use `deployments_plan`, `deployments_create`, `deployments_show`, `deployments_logs`, `resources_health`, `resources_diagnostic_summary`, and `deployments_recovery_readiness` as the core MCP path when tools are available.",
      ].join("\n"),
    },
    {
      uri: "appaloft://tools/mcp-guide",
      name: "Appaloft MCP guide",
      description: "Boundary guidance for using Appaloft MCP tools.",
      mimeType: "text/markdown",
      text: [
        "# Appaloft MCP Guide",
        "",
        "Tools are generated from `packages/application/src/operation-catalog.ts` and dispatch through the shared command/query buses. Resources and prompts provide context only. Authentication, tenant context, operation guards, confirmations, redaction, and structured errors stay in the application/runtime boundary.",
        "",
        "Prefer small, explicit tool calls. For destructive commands, inspect readback or delete-safety tools first and require exact confirmation fields when the operation schema requires them.",
      ].join("\n"),
    },
    {
      uri: "appaloft://docs/agent",
      name: "Public agent docs",
      description: "Stable public docs pointers for Appaloft AI entrypoints.",
      mimeType: "application/json",
      text: JSON.stringify(
        {
          appaloftSkill: "/docs/agent/appaloft-skill/#appaloft-skill",
          deploySkill: "/docs/agent/deploy-skill/#agent-deploy-skill",
          mcpServer: "/docs/agent/mcp-server/#appaloft-mcp-server",
        },
        null,
        2,
      ),
    },
  ];
}

function arg(args: JsonObject | undefined, name: string, fallback: string): string {
  const value = args?.[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function createAppaloftMcpPrompts(): AppaloftMcpPrompt[] {
  return [
    {
      name: "appaloft-first-deploy",
      description: "Guide an agent through a safe first deployment with Appaloft.",
      arguments: [
        { name: "source", description: "Path, repository, image, or static artifact to deploy." },
        { name: "goal", description: "User-visible deployment goal or app name." },
      ],
      getMessages: (args) => [
        {
          role: "user",
          content: {
            type: "text",
            text: `Deploy ${arg(args, "source", "the current project")} with Appaloft for ${arg(args, "goal", "the user's goal")}. Inspect only safe metadata, avoid secrets, select or create context through existing project/server/environment/resource tools, configure the Resource profile, call deployments_plan when useful, call deployments_create, observe status/logs/health, and return URL/access state first.`,
          },
        },
      ],
    },
    {
      name: "appaloft-recover-deployment",
      description: "Diagnose and recover an existing Appaloft deployment.",
      arguments: [
        { name: "deploymentId", description: "Deployment id to inspect.", required: true },
        { name: "resourceId", description: "Resource id for health and diagnostics." },
      ],
      getMessages: (args) => [
        {
          role: "user",
          content: {
            type: "text",
            text: `Recover deployment ${arg(args, "deploymentId", "<deploymentId>")}. Read deployment detail, logs, events, resource diagnostics, health, and recovery readiness before choosing retry, redeploy, rollback, or a configuration fix. Preserve structured error codes and do not expose raw secrets.`,
          },
        },
      ],
    },
    {
      name: "appaloft-configure-resource",
      description:
        "Configure source, runtime, network, health, access, variables, dependencies, or storage for a Resource.",
      arguments: [{ name: "resourceId", description: "Resource id to configure.", required: true }],
      getMessages: (args) => [
        {
          role: "user",
          content: {
            type: "text",
            text: `Configure resource ${arg(args, "resourceId", "<resourceId>")} through explicit Appaloft resource-profile tools. Do not add profile fields to deployments_create. Read effective config after changes and redeploy or restart only when needed.`,
          },
        },
      ],
    },
    {
      name: "appaloft-observe-runtime",
      description: "Inspect runtime usage, monitoring samples, logs, health, and operator work.",
      arguments: [{ name: "scope", description: "Runtime scope, such as a server or resource." }],
      getMessages: (args) => [
        {
          role: "user",
          content: {
            type: "text",
            text: `Observe Appaloft runtime scope ${arg(args, "scope", "selected by the user")}. Use runtime usage, runtime monitoring samples/rollups, resource health, runtime logs, deployment logs, and operator-work read tools. Summarize signals, status, and safe next actions.`,
          },
        },
      ],
    },
    {
      name: "appaloft-publish-static-artifact",
      description:
        "Publish a prebuilt static artifact through neutral Appaloft static artifact operations.",
      arguments: [
        {
          name: "resourceId",
          description: "Resource id that owns the publication.",
          required: true,
        },
        { name: "artifact", description: "Directory, inline payload, or zip archive to publish." },
      ],
      getMessages: (args) => [
        {
          role: "user",
          content: {
            type: "text",
            text: `Publish static artifact ${arg(args, "artifact", "provided by the user")} for resource ${arg(args, "resourceId", "<resourceId>")}. Use static-artifacts publish payload/archive tools when bytes are already available, list publications for readback, and avoid hosted/provider-specific assumptions.`,
          },
        },
      ],
    },
  ];
}

function createDefaultMcpExecutionContext(factory?: ExecutionContextFactory): ExecutionContext {
  return factory
    ? factory.create({
        entrypoint: "mcp",
        actor: {
          kind: "system",
          id: "mcp",
          label: "appaloft-mcp",
        },
      })
    : createExecutionContext({
        entrypoint: "mcp",
        actor: {
          kind: "system",
          id: "mcp",
          label: "appaloft-mcp",
        },
      });
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function structuredContentFor(value: unknown): JsonObject {
  return isJsonObject(value) ? value : { value };
}

function resultToMcpText(result: unknown): {
  content: { type: "text"; text: string }[];
  structuredContent?: JsonObject;
  isError?: boolean;
} {
  const isResult =
    typeof result === "object" &&
    result !== null &&
    "isErr" in result &&
    typeof (result as { isErr?: unknown }).isErr === "function" &&
    "isOk" in result &&
    typeof (result as { isOk?: unknown }).isOk === "function";

  if (isResult) {
    const value = result as {
      isErr(): boolean;
      error?: unknown;
      value?: unknown;
    };

    if (value.isErr()) {
      return {
        isError: true,
        structuredContent: structuredContentFor(value.error),
        content: [{ type: "text", text: JSON.stringify(value.error, null, 2) }],
      };
    }

    return {
      structuredContent: structuredContentFor(value.value),
      content: [{ type: "text", text: JSON.stringify(value.value, null, 2) }],
    };
  }

  const isToolCallError =
    typeof result === "object" &&
    result !== null &&
    "kind" in result &&
    (result as { kind?: unknown }).kind === "tool-call-error";

  return {
    ...(isToolCallError ? { isError: true } : {}),
    structuredContent: structuredContentFor(result),
    content: [
      {
        type: "text",
        text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
      },
    ],
  };
}

export function createAppaloftMcpServer(options: AppaloftMcpServerOptions): AppaloftMcpServer {
  const toolServer = createAppaloftMcpToolServer({
    descriptors: options.descriptors ?? toolContracts,
    handlers: createOperationToolHandlers(options),
  });
  const resources = options.resources ?? createAppaloftMcpResources();
  const resourcesByUri = new Map(resources.map((resource) => [resource.uri, resource]));
  const prompts = options.prompts ?? createAppaloftMcpPrompts();
  const promptsByName = new Map(prompts.map((prompt) => [prompt.name, prompt]));

  return {
    listTools() {
      return toolServer.listMcpTools();
    },
    hasTool(name) {
      return toolServer.hasTool(name);
    },
    async callTool(input) {
      const result = await toolServer.callTool({
        name: input.name,
        context: input.context ?? createDefaultMcpExecutionContext(options.executionContextFactory),
        input: input.arguments ?? {},
      });

      return resultToMcpText(result);
    },
    listResources() {
      return resources.map(({ text: _text, ...resource }) => resource);
    },
    readResource(uri) {
      const resource = resourcesByUri.get(uri);
      if (!resource) {
        throw new Error(`MCP resource is not registered: ${uri}`);
      }

      return {
        contents: [
          {
            uri: resource.uri,
            mimeType: resource.mimeType,
            text: resource.text,
          },
        ],
      };
    },
    listPrompts() {
      return prompts.map(({ getMessages: _getMessages, ...prompt }) => prompt);
    },
    getPrompt(name, args) {
      const prompt = promptsByName.get(name);
      if (!prompt) {
        throw new Error(`MCP prompt is not registered: ${name}`);
      }

      return {
        description: prompt.description,
        messages: prompt.getMessages(args),
      };
    },
  };
}

function parseRequest(value: unknown): JsonRpcRequest | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const request = value as Record<string, unknown>;
  if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
    return null;
  }

  return request as unknown as JsonRpcRequest;
}

function readParamsObject(params: unknown): JsonObject {
  return params && typeof params === "object" && !Array.isArray(params)
    ? (params as JsonObject)
    : {};
}

function jsonRpcResult(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

function jsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

export async function handleAppaloftMcpJsonRpcRequest(
  server: AppaloftMcpServer,
  value: unknown,
  options?: {
    context?: ExecutionContext;
  },
): Promise<JsonRpcResponse | null> {
  const request = parseRequest(value);
  if (!request) {
    return jsonRpcError(null, -32600, "Invalid Request");
  }

  if (request.id === undefined) {
    return null;
  }

  const id = request.id;

  try {
    switch (request.method) {
      case "initialize":
        return jsonRpcResult(id, {
          protocolVersion: defaultProtocolVersion,
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
          },
          serverInfo: {
            name: "appaloft-mcp",
            version: "0.1.0",
          },
        });
      case "tools/list":
        return jsonRpcResult(id, {
          tools: server.listTools(),
        });
      case "tools/call": {
        const params = readParamsObject(request.params);
        const name = params.name;
        if (typeof name !== "string") {
          return jsonRpcError(id, -32602, "tools/call requires params.name");
        }
        if (!server.hasTool(name)) {
          return jsonRpcError(id, -32602, `MCP tool is not registered: ${name}`, {
            toolName: name,
          });
        }

        return jsonRpcResult(
          id,
          await server.callTool({
            name,
            arguments: params.arguments,
            ...(options?.context ? { context: options.context } : {}),
          }),
        );
      }
      case "resources/list":
        return jsonRpcResult(id, {
          resources: server.listResources(),
        });
      case "resources/read": {
        const params = readParamsObject(request.params);
        const uri = params.uri;
        if (typeof uri !== "string") {
          return jsonRpcError(id, -32602, "resources/read requires params.uri");
        }

        return jsonRpcResult(id, server.readResource(uri));
      }
      case "prompts/list":
        return jsonRpcResult(id, {
          prompts: server.listPrompts(),
        });
      case "prompts/get": {
        const params = readParamsObject(request.params);
        const name = params.name;
        if (typeof name !== "string") {
          return jsonRpcError(id, -32602, "prompts/get requires params.name");
        }

        return jsonRpcResult(id, server.getPrompt(name, readParamsObject(params.arguments)));
      }
      case "ping":
        return jsonRpcResult(id, {});
      default:
        return jsonRpcError(id, -32601, `Method not found: ${request.method}`);
    }
  } catch (error) {
    return jsonRpcError(id, -32603, error instanceof Error ? error.message : String(error));
  }
}

async function jsonRpcResponsesForHttpRequest(
  server: AppaloftMcpServer,
  value: unknown,
  options?: {
    context?: ExecutionContext;
  },
): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (!Array.isArray(value)) {
    return handleAppaloftMcpJsonRpcRequest(server, value, options);
  }

  const responses = await Promise.all(
    value.map((request) => handleAppaloftMcpJsonRpcRequest(server, request, options)),
  );

  return responses.filter((response): response is JsonRpcResponse => Boolean(response));
}

function mcpHttpHeaders(protocolVersion = defaultProtocolVersion): Headers {
  return new Headers({
    "content-type": "application/json; charset=utf-8",
    "mcp-protocol-version": protocolVersion,
  });
}

export async function handleAppaloftMcpHttpRequest(input: {
  server: AppaloftMcpServer;
  request: Request;
  context?: ExecutionContext;
}): Promise<Response> {
  const headers = mcpHttpHeaders(input.request.headers.get("mcp-protocol-version") ?? undefined);

  if (input.request.method === "GET") {
    return new Response(
      JSON.stringify(
        {
          schemaVersion: "appaloft.mcp.http-endpoint/v1",
          protocolVersion: defaultProtocolVersion,
          transport: "streamable-http",
          methods: ["POST"],
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
          },
          serverInfo: {
            name: "appaloft-mcp",
            version: "0.1.0",
          },
        },
        null,
        2,
      ),
      { headers },
    );
  }

  if (input.request.method !== "POST") {
    return new Response(
      JSON.stringify({
        error: {
          code: "mcp_method_not_allowed",
          message: "Appaloft MCP HTTP transport accepts GET metadata and POST JSON-RPC requests.",
        },
      }),
      { status: 405, headers },
    );
  }

  const body = await input.request.json().catch(() => null);
  const response = await jsonRpcResponsesForHttpRequest(input.server, body, {
    ...(input.context ? { context: input.context } : {}),
  });

  if (response === null || (Array.isArray(response) && response.length === 0)) {
    return new Response(null, { status: 202, headers });
  }

  return new Response(JSON.stringify(response), { headers });
}

export function createAppaloftMcpHttpFetchHandler(input: {
  server: AppaloftMcpServer;
  contextFactory?: (request: Request) => ExecutionContext | Promise<ExecutionContext>;
  endpointPath?: string;
}): (request: Request) => Promise<Response> {
  const endpointPath = input.endpointPath ?? "/mcp";

  return async (request) => {
    const url = new URL(request.url);
    if (url.pathname !== endpointPath) {
      return new Response("Not found", { status: 404 });
    }

    const context = input.contextFactory ? await input.contextFactory(request) : undefined;
    return handleAppaloftMcpHttpRequest({
      server: input.server,
      request,
      ...(context ? { context } : {}),
    });
  };
}

export function startAppaloftMcpHttpServer(input: {
  server: AppaloftMcpServer;
  hostname?: string;
  port?: number;
  contextFactory?: (request: Request) => ExecutionContext | Promise<ExecutionContext>;
  endpointPath?: string;
}): ReturnType<typeof Bun.serve> {
  return Bun.serve({
    hostname: input.hostname ?? "127.0.0.1",
    port: input.port ?? 3939,
    fetch: createAppaloftMcpHttpFetchHandler({
      server: input.server,
      ...(input.contextFactory ? { contextFactory: input.contextFactory } : {}),
      ...(input.endpointPath ? { endpointPath: input.endpointPath } : {}),
    }),
  });
}

export async function runAppaloftMcpStdioServer(input: {
  server: AppaloftMcpServer;
  stdin?: ReadableStream<Uint8Array>;
  stdout?: { write(data: string): void };
}): Promise<void> {
  const stdin = input.stdin ?? Bun.stdin.stream();
  const stdout = input.stdout ?? process.stdout;
  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of stdin) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const response = await handleAppaloftMcpJsonRpcRequest(input.server, JSON.parse(trimmed));
      if (response) {
        stdout.write(`${JSON.stringify(response)}\n`);
      }
    }
  }

  if (buffer.trim()) {
    const response = await handleAppaloftMcpJsonRpcRequest(input.server, JSON.parse(buffer.trim()));
    if (response) {
      stdout.write(`${JSON.stringify(response)}\n`);
    }
  }
}

export async function runAppaloftMcpRemoteStdioProxy(input: {
  endpoint: string;
  authorization: string;
  fetch?: typeof fetch;
  stdin?: ReadableStream<Uint8Array>;
  stdout?: { write(data: string): void };
}): Promise<void> {
  const stdin = input.stdin ?? Bun.stdin.stream();
  const stdout = input.stdout ?? process.stdout;
  const requestFetch = input.fetch ?? fetch;
  const decoder = new TextDecoder();
  let buffer = "";

  async function forward(line: string): Promise<void> {
    const response = await requestFetch(input.endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: input.authorization,
        "content-type": "application/json",
      },
      body: line,
    });

    if (response.status === 202 || response.status === 204) {
      return;
    }

    const text = await response.text();
    if (text.trim()) {
      stdout.write(`${text.trimEnd()}\n`);
    }
  }

  for await (const chunk of stdin) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) {
        await forward(trimmed);
      }
    }
  }

  if (buffer.trim()) {
    await forward(buffer.trim());
  }
}
