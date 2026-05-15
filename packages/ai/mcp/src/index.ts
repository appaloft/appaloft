import {
  type Command,
  type CommandBus,
  ConfigureRuntimeMonitoringThresholdsCommand,
  type ExecutionContext,
  InspectRuntimeUsageQuery,
  ListRuntimeMonitoringSamplesQuery,
  type OperationCatalogEntry,
  operationCatalog,
  type Query,
  type QueryBus,
  RuntimeMonitoringRollupQuery,
  ShowRuntimeMonitoringThresholdsQuery,
} from "@appaloft/application";
import { z } from "zod";

type OperationTransportRoute = NonNullable<OperationCatalogEntry["transports"]["orpc"]>;

const toolNamePattern = /^[a-z][a-z0-9_]*$/;
const operationKeyPattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;

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

export interface ToolDescriptor extends ToolContract {
  readonly inputSchema?: OperationCatalogEntry["inputSchema"];
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
  return `${action} ${entry.key} through the Appaloft application operation catalog.`;
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
    ...(entry.inputSchema ? { inputSchema: entry.inputSchema } : {}),
  };
}

export const toolContracts = operationCatalog.map(toolDescriptorFromOperation);

export const toolContractsByOperationKey = new Map(
  toolContracts.map((contract) => [contract.operationKey, contract]),
);

export interface ToolExecutionRequest {
  context: ExecutionContext;
  input: unknown;
}

export type ToolExecutionResult = unknown;

export type ToolExecutionHandler = (request: ToolExecutionRequest) => Promise<ToolExecutionResult>;

export interface RuntimeMonitoringToolHandlerOptions {
  commandBus: Pick<CommandBus, "execute">;
  queryBus: Pick<QueryBus, "execute">;
}

export interface ToolCallRequest extends ToolExecutionRequest {
  name: string;
}

export interface ToolCallError {
  kind: "tool-call-error";
  code: "mcp_tool_not_registered";
  message: string;
  toolName: string;
  retryable: false;
}

export interface AppaloftMcpToolServer {
  listTools(): ToolContract[];
  callTool(request: ToolCallRequest): Promise<ToolExecutionResult | ToolCallError>;
}

export interface AppaloftMcpToolServerOptions {
  handlers: Partial<Record<string, ToolExecutionHandler>>;
  descriptors?: readonly ToolDescriptor[];
}

function toolNotRegistered(name: string): ToolCallError {
  return {
    kind: "tool-call-error",
    code: "mcp_tool_not_registered",
    message: `MCP tool is not registered: ${name}`,
    toolName: name,
    retryable: false,
  };
}

function serializableToolContract(descriptor: ToolDescriptor): ToolContract {
  return toolContractSchema.parse(descriptor);
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

  return {
    listTools() {
      return [...handlersByName.keys()]
        .map((name) => descriptorsByName.get(name))
        .filter((descriptor): descriptor is ToolDescriptor => Boolean(descriptor))
        .map(serializableToolContract)
        .sort((left, right) => left.name.localeCompare(right.name));
    },
    async callTool(request) {
      const handler = handlersByName.get(request.name);
      if (!handler) {
        return toolNotRegistered(request.name);
      }

      return handler({
        context: request.context,
        input: request.input,
      });
    },
  };
}

type RuntimeMonitoringQueryCreateResult =
  | ReturnType<typeof ListRuntimeMonitoringSamplesQuery.create>
  | ReturnType<typeof RuntimeMonitoringRollupQuery.create>
  | ReturnType<typeof ShowRuntimeMonitoringThresholdsQuery.create>;

type RuntimeMonitoringCommandCreateResult = ReturnType<
  typeof ConfigureRuntimeMonitoringThresholdsCommand.create
>;

type RuntimeUsageQueryCreateResult = ReturnType<typeof InspectRuntimeUsageQuery.create>;

async function dispatchQueryTool(
  options: Pick<RuntimeMonitoringToolHandlerOptions, "queryBus">,
  request: ToolExecutionRequest,
  createQuery: (
    input: unknown,
  ) => RuntimeMonitoringQueryCreateResult | RuntimeUsageQueryCreateResult,
): Promise<ToolExecutionResult> {
  const query = createQuery(request.input);
  if (query.isErr()) {
    return query;
  }

  return options.queryBus.execute(request.context, query.value as unknown as Query<unknown>);
}

async function dispatchCommandTool(
  options: RuntimeMonitoringToolHandlerOptions,
  request: ToolExecutionRequest,
  createCommand: (input: unknown) => RuntimeMonitoringCommandCreateResult,
): Promise<ToolExecutionResult> {
  const command = createCommand(request.input);
  if (command.isErr()) {
    return command;
  }

  return options.commandBus.execute(request.context, command.value as unknown as Command<unknown>);
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
  return {
    runtime_monitoring_samples_list: (request) =>
      dispatchQueryTool(options, request, (input) =>
        ListRuntimeMonitoringSamplesQuery.create(
          input as Parameters<typeof ListRuntimeMonitoringSamplesQuery.create>[0],
        ),
      ),
    runtime_monitoring_rollup: (request) =>
      dispatchQueryTool(options, request, (input) =>
        RuntimeMonitoringRollupQuery.create(
          input as Parameters<typeof RuntimeMonitoringRollupQuery.create>[0],
        ),
      ),
    runtime_monitoring_thresholds_configure: (request) =>
      dispatchCommandTool(options, request, (input) =>
        ConfigureRuntimeMonitoringThresholdsCommand.create(
          input as Parameters<typeof ConfigureRuntimeMonitoringThresholdsCommand.create>[0],
        ),
      ),
    runtime_monitoring_thresholds_show: (request) =>
      dispatchQueryTool(options, request, (input) =>
        ShowRuntimeMonitoringThresholdsQuery.create(
          input as Parameters<typeof ShowRuntimeMonitoringThresholdsQuery.create>[0],
        ),
      ),
  };
}

export function createRuntimeUsageToolHandlers(
  options: Pick<RuntimeMonitoringToolHandlerOptions, "queryBus">,
): Record<"runtime_usage_inspect", ToolExecutionHandler> {
  return {
    runtime_usage_inspect: (request) =>
      dispatchQueryTool(options, request, (input) =>
        InspectRuntimeUsageQuery.create(
          input as Parameters<typeof InspectRuntimeUsageQuery.create>[0],
        ),
      ),
  };
}

export function createRuntimeUsageMcpToolServer(
  options: Pick<RuntimeMonitoringToolHandlerOptions, "queryBus">,
): AppaloftMcpToolServer {
  return createAppaloftMcpToolServer({
    handlers: createRuntimeUsageToolHandlers(options),
  });
}

export function createRuntimeMonitoringMcpToolServer(
  options: RuntimeMonitoringToolHandlerOptions,
): AppaloftMcpToolServer {
  return createAppaloftMcpToolServer({
    handlers: createRuntimeMonitoringToolHandlers(options),
  });
}
