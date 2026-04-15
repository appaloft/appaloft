import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { eventIterator, ORPCError, os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import {
  type AppLogger,
  type Command,
  type CommandBus,
  ConfigureServerCredentialCommand,
  CreateDeploymentCommand,
  type CreateDeploymentCommandInput,
  CreateDomainBindingCommand,
  CreateEnvironmentCommand,
  CreateProjectCommand,
  CreateResourceCommand,
  CreateSshCredentialCommand,
  configureServerCredentialCommandInputSchema,
  createDeploymentCommandInputSchema,
  createDomainBindingCommandInputSchema,
  createEnvironmentCommandInputSchema,
  createProjectCommandInputSchema,
  createResourceCommandInputSchema,
  createSshCredentialCommandInputSchema,
  DeploymentLogsQuery,
  type DeploymentProgressEvent,
  type DeploymentProgressObserver,
  DiffEnvironmentsQuery,
  deploymentLogsQueryInputSchema,
  diffEnvironmentsQueryInputSchema,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListDeploymentsQuery,
  ListDomainBindingsQuery,
  ListEnvironmentsQuery,
  ListGitHubRepositoriesQuery,
  ListPluginsQuery,
  ListProjectsQuery,
  ListProvidersQuery,
  ListResourcesQuery,
  ListServersQuery,
  ListSshCredentialsQuery,
  listDeploymentsQueryInputSchema,
  listDomainBindingsQueryInputSchema,
  listEnvironmentsQueryInputSchema,
  listGitHubRepositoriesQueryInputSchema,
  listResourcesQueryInputSchema,
  listSshCredentialsQueryInputSchema,
  PromoteEnvironmentCommand,
  promoteEnvironmentCommandInputSchema,
  type Query,
  type QueryBus,
  RegisterServerCommand,
  ResourceProxyConfigurationPreviewQuery,
  type ResourceRuntimeLogEvent,
  ResourceRuntimeLogsQuery,
  type ResourceRuntimeLogsQueryInput,
  type ResourceRuntimeLogsResult,
  registerServerCommandInputSchema,
  resourceProxyConfigurationPreviewQueryInputSchema,
  resourceRuntimeLogsQueryInputSchema,
  SetEnvironmentVariableCommand,
  ShowEnvironmentQuery,
  setEnvironmentVariableCommandInputSchema,
  showEnvironmentQueryInputSchema,
  TestServerConnectivityCommand,
  testServerConnectivityCommandInputSchema,
  UnsetEnvironmentVariableCommand,
  unsetEnvironmentVariableCommandInputSchema,
} from "@yundu/application";
import {
  createDeploymentResponseSchema,
  createDomainBindingResponseSchema,
  createEnvironmentResponseSchema,
  createProjectResponseSchema,
  createResourceResponseSchema,
  createSshCredentialResponseSchema,
  deploymentLogsResponseSchema,
  deploymentProgressEventSchema,
  diffEnvironmentResponseSchema,
  environmentSummarySchema,
  listDeploymentsResponseSchema,
  listDomainBindingsResponseSchema,
  listEnvironmentsResponseSchema,
  listGitHubRepositoriesResponseSchema,
  listPluginsResponseSchema,
  listProjectsResponseSchema,
  listProvidersResponseSchema,
  listResourcesResponseSchema,
  listServersResponseSchema,
  listSshCredentialsResponseSchema,
  promoteEnvironmentResponseSchema,
  proxyConfigurationViewSchema,
  registerServerResponseSchema,
  resourceRuntimeLogEventSchema,
  resourceRuntimeLogsResponseSchema,
  resourceRuntimeLogsStreamResponseSchema,
  testServerConnectivityResponseSchema,
} from "@yundu/contracts";
import { type DomainError, type Result } from "@yundu/core";
import { resolveYunduLocaleFromHeaders, translateDomainError } from "@yundu/i18n";
import { type Elysia } from "elysia";
import { z } from "zod";

export interface YunduOrpcContext {
  commandBus: CommandBus;
  executionContextFactory: ExecutionContextFactory;
  queryBus: QueryBus;
  logger: AppLogger;
  deploymentProgressObserver?: DeploymentProgressObserver;
}

interface YunduOrpcRequestContext extends YunduOrpcContext {
  executionContext: ExecutionContext;
}

type DeploymentProgressStreamEvent = DeploymentProgressEvent & {
  step: NonNullable<DeploymentProgressEvent["step"]>;
};

export interface RequestContextRunner {
  runWithRequest<T>(
    request: Request,
    context: ExecutionContext,
    callback: () => Promise<T>,
  ): Promise<T>;
}

const base = os.$context<YunduOrpcRequestContext>();
const emptyResponseSchema = z.null();

function readObjectProperty(input: unknown, key: string): unknown {
  return input && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
}

function serializeValidationIssues(input: unknown): unknown[] | undefined {
  if (!Array.isArray(input)) {
    return undefined;
  }

  return input.map((issue) => {
    if (!issue || typeof issue !== "object") {
      return {
        message: String(issue),
      };
    }

    const record = issue as Record<string, unknown>;
    return {
      ...(typeof record.code === "string" ? { code: record.code } : {}),
      ...(typeof record.message === "string" ? { message: record.message } : {}),
      ...(Array.isArray(record.path) ? { path: record.path } : {}),
      ...(typeof record.expected === "string" ? { expected: record.expected } : {}),
      ...(typeof record.received === "string" ? { received: record.received } : {}),
    };
  });
}

function extractErrorPayloadDetails(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const record = payload as Record<string, unknown>;
  const details: Record<string, unknown> = {};
  const issues = serializeValidationIssues(
    readObjectProperty(readObjectProperty(payload, "data"), "issues"),
  );

  if (typeof record.code === "string") {
    details.code = record.code;
  }

  if (typeof record.message === "string") {
    details.message = record.message;
  }

  if (typeof record.status === "number") {
    details.status = record.status;
  }

  if (issues && issues.length > 0) {
    details.validationIssues = issues;
  }

  return details;
}

function buildUnexpectedErrorContext(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return {
      message: String(error),
    };
  }

  const details: Record<string, unknown> = {
    name: error.name,
    message: error.message,
  };

  if (error instanceof ORPCError) {
    details.code = error.code;
    details.status = error.status;

    const payloadDetails = extractErrorPayloadDetails({
      code: error.code,
      status: error.status,
      message: error.message,
      data: error.data,
    });

    if (payloadDetails.validationIssues) {
      details.validationIssues = payloadDetails.validationIssues;
    }
  }

  const cause = error.cause;
  if (cause instanceof Error) {
    details.cause = {
      name: cause.name,
      message: cause.message,
      ...(() => {
        const causeIssues = serializeValidationIssues(readObjectProperty(cause, "issues"));
        return causeIssues && causeIssues.length > 0
          ? {
              validationIssues: causeIssues,
            }
          : {};
      })(),
    };
  }

  return details;
}

async function logOrpcErrorResponse(
  logger: AppLogger,
  eventName: string,
  request: Request,
  response: Response,
): Promise<void> {
  if (response.status < 400) {
    return;
  }

  const bodyText = await response
    .clone()
    .text()
    .catch(() => "");

  let parsedBody: unknown;
  try {
    parsedBody = bodyText.length > 0 ? JSON.parse(bodyText) : undefined;
  } catch {
    parsedBody = undefined;
  }

  const payload =
    parsedBody && typeof parsedBody === "object" && "json" in parsedBody
      ? (parsedBody as Record<string, unknown>).json
      : parsedBody;

  logger.error(eventName, {
    method: request.method,
    url: request.url,
    httpStatus: response.status,
    ...extractErrorPayloadDetails(payload),
    ...(bodyText.length > 0
      ? {
          responseBody: bodyText.slice(0, 1000),
        }
      : {}),
  });
}

function toOrpcError(error: DomainError, context: ExecutionContext) {
  const message = translateDomainError(error, context.t);

  switch (error.code) {
    case "not_found":
      return new ORPCError("NOT_FOUND", {
        message,
        status: 404,
        data: {
          domainCode: error.code,
          locale: context.locale,
        },
      });
    case "conflict":
    case "resource_slug_conflict":
    case "deployment_not_redeployable":
      return new ORPCError("CONFLICT", {
        message,
        status: 409,
        data: {
          domainCode: error.code,
          locale: context.locale,
        },
      });
    case "domain_binding_proxy_required":
    case "domain_binding_context_mismatch":
    case "resource_context_mismatch":
      return new ORPCError("BAD_REQUEST", {
        message,
        status: 400,
        data: {
          domainCode: error.code,
          locale: context.locale,
        },
      });
    case "validation_error":
    case "invariant_violation":
      return new ORPCError("BAD_REQUEST", {
        message,
        status: 400,
        data: {
          domainCode: error.code,
          locale: context.locale,
        },
      });
    default:
      if (error.category === "provider") {
        return new ORPCError("BAD_GATEWAY", {
          message,
          status: 502,
          data: {
            domainCode: error.code,
            locale: context.locale,
          },
        });
      }

      if (error.category === "retryable") {
        return new ORPCError("SERVICE_UNAVAILABLE", {
          message,
          status: 503,
          data: {
            domainCode: error.code,
            locale: context.locale,
          },
        });
      }

      return new ORPCError("INTERNAL_SERVER_ERROR", {
        message,
        status: 500,
        data: {
          domainCode: error.code,
          locale: context.locale,
        },
      });
  }
}

function unwrapResult<T>(context: ExecutionContext, result: Result<T>): T {
  return result.match(
    (value) => value,
    (error) => {
      throw toOrpcError(error, context);
    },
  );
}

async function executeCommand<TMessage extends Command<TResult>, TResult>(
  context: YunduOrpcRequestContext,
  message: Result<TMessage>,
): Promise<TResult> {
  return unwrapResult(
    context.executionContext,
    await context.commandBus.execute(
      context.executionContext,
      unwrapResult(context.executionContext, message),
    ),
  );
}

async function executeQuery<TMessage extends Query<TResult>, TResult>(
  context: YunduOrpcRequestContext,
  message: Result<TMessage>,
): Promise<TResult> {
  return unwrapResult(
    context.executionContext,
    await context.queryBus.execute(
      context.executionContext,
      unwrapResult(context.executionContext, message),
    ),
  );
}

function createDeploymentStream(
  context: YunduOrpcRequestContext,
  input: CreateDeploymentCommandInput,
): AsyncGenerator<DeploymentProgressStreamEvent, { id: string }, void> {
  if (!context.deploymentProgressObserver) {
    throw new ORPCError("SERVICE_UNAVAILABLE", {
      message: "Deployment progress streaming is not available",
      status: 503,
    });
  }

  const deploymentProgressObserver = context.deploymentProgressObserver;

  return (async function* streamDeploymentProgress() {
    const events: DeploymentProgressStreamEvent[] = [];
    let wake: (() => void) | undefined;
    let commandResult: { id: string } | undefined;
    let commandError: unknown;
    let commandDone = false;

    const notify = () => {
      const currentWake = wake;
      wake = undefined;
      currentWake?.();
    };
    const unsubscribe = deploymentProgressObserver.subscribe((eventContext, event) => {
      if (eventContext.requestId !== context.executionContext.requestId) {
        return;
      }

      events.push(toDeploymentProgressStreamEvent(event));
      notify();
    });
    const command = executeCommand<CreateDeploymentCommand, { id: string }>(
      context,
      CreateDeploymentCommand.create(input),
    )
      .then((result) => {
        commandResult = result;
      })
      .catch((error: unknown) => {
        commandError = error;
      })
      .finally(() => {
        commandDone = true;
        notify();
      });

    try {
      while (!commandDone || events.length > 0) {
        const event = events.shift();

        if (event) {
          yield event;
          continue;
        }

        await new Promise<void>((resolve) => {
          wake = resolve;
          if (commandDone || events.length > 0) {
            notify();
          }
        });
      }

      await command;

      if (commandError) {
        throw commandError;
      }

      if (!commandResult) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Deployment stream finished without a deployment result",
          status: 500,
        });
      }

      return commandResult;
    } finally {
      unsubscribe();
    }
  })();
}

function createResourceRuntimeLogStream(
  context: YunduOrpcRequestContext,
  input: ResourceRuntimeLogsQueryInput,
): AsyncGenerator<ResourceRuntimeLogEvent, { resourceId: string; deploymentId?: string }, void> {
  const streamResult = (result: ResourceRuntimeLogsResult) => ({
    resourceId: result.resourceId,
    ...(result.deploymentId ? { deploymentId: result.deploymentId } : {}),
  });

  return (async function* streamResourceRuntimeLogs() {
    const result: ResourceRuntimeLogsResult = await executeQuery(
      context,
      ResourceRuntimeLogsQuery.create({
        ...input,
        follow: true,
      }),
    );

    if (result.mode === "bounded") {
      for (const line of result.logs) {
        yield {
          kind: "line",
          line,
        };
      }

      return streamResult(result);
    }

    try {
      for await (const event of result.stream) {
        yield event;

        if (event.kind === "closed" || event.kind === "error") {
          break;
        }
      }

      return streamResult(result);
    } finally {
      await result.stream.close();
    }
  })();
}

function toDeploymentProgressStreamEvent(
  event: DeploymentProgressEvent,
): DeploymentProgressStreamEvent {
  return {
    ...event,
    step: event.step ?? {
      current: 1,
      total: 1,
      label: event.phase,
    },
  };
}

function createRequestExecutionContext(
  executionContextFactory: ExecutionContextFactory,
  entrypoint: "http" | "rpc",
  request: Request,
): ReturnType<ExecutionContextFactory["create"]> {
  const requestId = request.headers.get("x-request-id");

  return executionContextFactory.create({
    entrypoint,
    locale: resolveYunduLocaleFromHeaders(request.headers),
    ...(requestId ? { requestId } : {}),
  });
}

export const listProjectsProcedure = base
  .route({
    method: "GET",
    path: "/projects",
    successStatus: 200,
  })
  .output(listProjectsResponseSchema)
  .handler(async ({ context }) => executeQuery(context, ListProjectsQuery.create()));

export const createProjectProcedure = base
  .route({
    method: "POST",
    path: "/projects",
    successStatus: 201,
  })
  .input(createProjectCommandInputSchema)
  .output(createProjectResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, CreateProjectCommand.create(input)),
  );

export const listServersProcedure = base
  .route({
    method: "GET",
    path: "/servers",
    successStatus: 200,
  })
  .output(listServersResponseSchema)
  .handler(async ({ context }) => executeQuery(context, ListServersQuery.create()));

export const registerServerProcedure = base
  .route({
    method: "POST",
    path: "/servers",
    successStatus: 201,
  })
  .input(registerServerCommandInputSchema)
  .output(registerServerResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, RegisterServerCommand.create(input)),
  );

export const configureServerCredentialProcedure = base
  .route({
    method: "POST",
    path: "/servers/{serverId}/credentials",
    successStatus: 200,
  })
  .input(configureServerCredentialCommandInputSchema)
  .output(emptyResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ConfigureServerCredentialCommand.create(input)),
  );

export const listSshCredentialsProcedure = base
  .route({
    method: "GET",
    path: "/credentials/ssh",
    successStatus: 200,
  })
  .input(listSshCredentialsQueryInputSchema)
  .output(listSshCredentialsResponseSchema)
  .handler(async ({ context }) => executeQuery(context, ListSshCredentialsQuery.create()));

export const createSshCredentialProcedure = base
  .route({
    method: "POST",
    path: "/credentials/ssh",
    successStatus: 201,
  })
  .input(createSshCredentialCommandInputSchema)
  .output(createSshCredentialResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, CreateSshCredentialCommand.create(input)),
  );

export const testServerConnectivityProcedure = base
  .route({
    method: "POST",
    path: "/servers/{serverId}/connectivity-tests",
    successStatus: 200,
  })
  .input(testServerConnectivityCommandInputSchema)
  .output(testServerConnectivityResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, TestServerConnectivityCommand.create(input)),
  );

export const testDraftServerConnectivityProcedure = base
  .route({
    method: "POST",
    path: "/servers/connectivity-tests",
    successStatus: 200,
  })
  .input(testServerConnectivityCommandInputSchema)
  .output(testServerConnectivityResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, TestServerConnectivityCommand.create(input)),
  );

export const listEnvironmentsProcedure = base
  .route({
    method: "GET",
    path: "/environments",
    successStatus: 200,
  })
  .input(listEnvironmentsQueryInputSchema)
  .output(listEnvironmentsResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ListEnvironmentsQuery.create(input)),
  );

export const createEnvironmentProcedure = base
  .route({
    method: "POST",
    path: "/environments",
    successStatus: 201,
  })
  .input(createEnvironmentCommandInputSchema)
  .output(createEnvironmentResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, CreateEnvironmentCommand.create(input)),
  );

export const listResourcesProcedure = base
  .route({
    method: "GET",
    path: "/resources",
    successStatus: 200,
  })
  .input(listResourcesQueryInputSchema)
  .output(listResourcesResponseSchema)
  .handler(async ({ input, context }) => executeQuery(context, ListResourcesQuery.create(input)));

export const createResourceProcedure = base
  .route({
    method: "POST",
    path: "/resources",
    successStatus: 201,
  })
  .input(createResourceCommandInputSchema)
  .output(createResourceResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, CreateResourceCommand.create(input)),
  );

export const createDomainBindingProcedure = base
  .route({
    method: "POST",
    path: "/domain-bindings",
    successStatus: 201,
  })
  .input(createDomainBindingCommandInputSchema)
  .output(createDomainBindingResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, CreateDomainBindingCommand.create(input)),
  );

export const listDomainBindingsProcedure = base
  .route({
    method: "GET",
    path: "/domain-bindings",
    successStatus: 200,
  })
  .input(listDomainBindingsQueryInputSchema)
  .output(listDomainBindingsResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ListDomainBindingsQuery.create(input)),
  );

export const showEnvironmentProcedure = base
  .route({
    method: "GET",
    path: "/environments/{environmentId}",
    successStatus: 200,
  })
  .input(showEnvironmentQueryInputSchema)
  .output(environmentSummarySchema)
  .handler(async ({ input, context }) => executeQuery(context, ShowEnvironmentQuery.create(input)));

export const setEnvironmentVariableProcedure = base
  .route({
    method: "POST",
    path: "/environments/{environmentId}/variables",
    successStatus: 204,
  })
  .input(setEnvironmentVariableCommandInputSchema)
  .output(emptyResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, SetEnvironmentVariableCommand.create(input)),
  );

export const unsetEnvironmentVariableProcedure = base
  .route({
    method: "DELETE",
    path: "/environments/{environmentId}/variables/{key}",
    successStatus: 204,
  })
  .input(unsetEnvironmentVariableCommandInputSchema)
  .output(emptyResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, UnsetEnvironmentVariableCommand.create(input)),
  );

export const promoteEnvironmentProcedure = base
  .route({
    method: "POST",
    path: "/environments/{environmentId}/promote",
    successStatus: 200,
  })
  .input(promoteEnvironmentCommandInputSchema)
  .output(promoteEnvironmentResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, PromoteEnvironmentCommand.create(input)),
  );

export const diffEnvironmentsProcedure = base
  .route({
    method: "GET",
    path: "/environments/{environmentId}/diff/{otherEnvironmentId}",
    successStatus: 200,
  })
  .input(diffEnvironmentsQueryInputSchema)
  .output(diffEnvironmentResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, DiffEnvironmentsQuery.create(input)),
  );

export const listDeploymentsProcedure = base
  .route({
    method: "GET",
    path: "/deployments",
    successStatus: 200,
  })
  .input(listDeploymentsQueryInputSchema)
  .output(listDeploymentsResponseSchema)
  .handler(async ({ input, context }) => executeQuery(context, ListDeploymentsQuery.create(input)));

export const createDeploymentProcedure = base
  .route({
    method: "POST",
    path: "/deployments",
    successStatus: 201,
  })
  .input(createDeploymentCommandInputSchema)
  .output(createDeploymentResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, CreateDeploymentCommand.create(input)),
  );

export const createDeploymentStreamProcedure = base
  .route({
    method: "POST",
    path: "/deployments/stream",
    successStatus: 200,
  })
  .input(createDeploymentCommandInputSchema)
  .output(eventIterator(deploymentProgressEventSchema, createDeploymentResponseSchema))
  .handler(({ input, context }) => createDeploymentStream(context, input));

export const deploymentLogsProcedure = base
  .route({
    method: "GET",
    path: "/deployments/{deploymentId}/logs",
    successStatus: 200,
  })
  .input(deploymentLogsQueryInputSchema)
  .output(deploymentLogsResponseSchema)
  .handler(async ({ input, context }) => executeQuery(context, DeploymentLogsQuery.create(input)));

export const resourceRuntimeLogsProcedure = base
  .route({
    method: "GET",
    path: "/resources/{resourceId}/runtime-logs",
    successStatus: 200,
  })
  .input(resourceRuntimeLogsQueryInputSchema)
  .output(resourceRuntimeLogsResponseSchema)
  .handler(async ({ input, context }) => {
    const result: ResourceRuntimeLogsResult = await executeQuery(
      context,
      ResourceRuntimeLogsQuery.create({
        ...input,
        follow: false,
      }),
    );

    if (result.mode !== "bounded") {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Runtime log query returned a stream for a bounded request",
        status: 500,
      });
    }

    return {
      resourceId: result.resourceId,
      deploymentId: result.deploymentId,
      logs: result.logs,
    };
  });

export const resourceRuntimeLogsStreamProcedure = base
  .route({
    method: "GET",
    path: "/resources/{resourceId}/runtime-logs/stream",
    successStatus: 200,
  })
  .input(resourceRuntimeLogsQueryInputSchema)
  .output(eventIterator(resourceRuntimeLogEventSchema, resourceRuntimeLogsStreamResponseSchema))
  .handler(({ input, context }) => createResourceRuntimeLogStream(context, input));

export const resourceProxyConfigurationPreviewProcedure = base
  .route({
    method: "GET",
    path: "/resources/{resourceId}/proxy-configuration",
    successStatus: 200,
  })
  .input(resourceProxyConfigurationPreviewQueryInputSchema)
  .output(proxyConfigurationViewSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ResourceProxyConfigurationPreviewQuery.create(input)),
  );

export const listProvidersProcedure = base
  .route({
    method: "GET",
    path: "/providers",
    successStatus: 200,
  })
  .output(listProvidersResponseSchema)
  .handler(async ({ context }) => executeQuery(context, ListProvidersQuery.create()));

export const listPluginsProcedure = base
  .route({
    method: "GET",
    path: "/plugins",
    successStatus: 200,
  })
  .output(listPluginsResponseSchema)
  .handler(async ({ context }) => executeQuery(context, ListPluginsQuery.create()));

export const listGitHubRepositoriesProcedure = base
  .route({
    method: "GET",
    path: "/integrations/github/repositories",
    successStatus: 200,
  })
  .input(listGitHubRepositoriesQueryInputSchema)
  .output(listGitHubRepositoriesResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ListGitHubRepositoriesQuery.create(input)),
  );

export const yunduOrpcRouter = {
  projects: {
    list: listProjectsProcedure,
    create: createProjectProcedure,
  },
  servers: {
    list: listServersProcedure,
    create: registerServerProcedure,
    configureCredential: configureServerCredentialProcedure,
    testConnectivity: testServerConnectivityProcedure,
    testDraftConnectivity: testDraftServerConnectivityProcedure,
  },
  credentials: {
    ssh: {
      list: listSshCredentialsProcedure,
      create: createSshCredentialProcedure,
    },
  },
  environments: {
    list: listEnvironmentsProcedure,
    create: createEnvironmentProcedure,
    show: showEnvironmentProcedure,
    setVariable: setEnvironmentVariableProcedure,
    unsetVariable: unsetEnvironmentVariableProcedure,
    promote: promoteEnvironmentProcedure,
    diff: diffEnvironmentsProcedure,
  },
  resources: {
    list: listResourcesProcedure,
    create: createResourceProcedure,
    proxyConfiguration: resourceProxyConfigurationPreviewProcedure,
    logs: resourceRuntimeLogsProcedure,
    logsStream: resourceRuntimeLogsStreamProcedure,
  },
  domainBindings: {
    list: listDomainBindingsProcedure,
    create: createDomainBindingProcedure,
  },
  deployments: {
    list: listDeploymentsProcedure,
    create: createDeploymentProcedure,
    createStream: createDeploymentStreamProcedure,
    logs: deploymentLogsProcedure,
  },
  providers: {
    list: listProvidersProcedure,
  },
  plugins: {
    list: listPluginsProcedure,
  },
  integrations: {
    github: {
      repositories: {
        list: listGitHubRepositoriesProcedure,
      },
    },
  },
} as const;

export type YunduOrpcRouter = typeof yunduOrpcRouter;

export function createYunduOpenApiHandler() {
  return new OpenAPIHandler(yunduOrpcRouter);
}

export function createYunduRpcHandler() {
  return new RPCHandler(yunduOrpcRouter);
}

function createRequestRunner(
  request: Request,
  executionContext: ExecutionContext,
  requestContextRunner?: RequestContextRunner,
): <T>(callback: () => Promise<T>) => Promise<T> {
  if (requestContextRunner) {
    return <T>(callback: () => Promise<T>) =>
      requestContextRunner.runWithRequest(request, executionContext, callback);
  }

  return <T>(callback: () => Promise<T>) => callback();
}

export function mountYunduOrpcRoutes(
  app: Elysia,
  context: YunduOrpcContext & {
    requestContextRunner?: RequestContextRunner;
  },
): Elysia {
  const openApiHandler = createYunduOpenApiHandler();
  const rpcHandler = createYunduRpcHandler();

  const openApiRouteHandler = async ({ request }: { request: Request }) => {
    const executionContext = createRequestExecutionContext(
      context.executionContextFactory,
      "http",
      request,
    );
    const run = createRequestRunner(request, executionContext, context.requestContextRunner);
    try {
      const { matched, response } = await run(() =>
        openApiHandler.handle(request, {
          prefix: "/api",
          context: {
            ...context,
            executionContext,
          },
        }),
      );

      if (!matched) {
        return new Response("Not Found", {
          status: 404,
        });
      }

      await logOrpcErrorResponse(context.logger, "orpc_http_handler_error", request, response);
      return response;
    } catch (error) {
      context.logger.error("orpc_http_handler_unhandled_error", {
        method: request.method,
        url: request.url,
        ...buildUnexpectedErrorContext(error),
      });
      throw error;
    }
  };

  const rpcRouteHandler = async ({ request }: { request: Request }) => {
    const executionContext = createRequestExecutionContext(
      context.executionContextFactory,
      "rpc",
      request,
    );
    const run = createRequestRunner(request, executionContext, context.requestContextRunner);
    try {
      const { matched, response } = await run(() =>
        rpcHandler.handle(request, {
          prefix: "/api/rpc",
          context: {
            ...context,
            executionContext,
          },
        }),
      );

      if (!matched) {
        return new Response("Not Found", {
          status: 404,
        });
      }

      await logOrpcErrorResponse(context.logger, "orpc_rpc_handler_error", request, response);
      return response;
    } catch (error) {
      context.logger.error("orpc_rpc_handler_unhandled_error", {
        method: request.method,
        url: request.url,
        ...buildUnexpectedErrorContext(error),
      });
      throw error;
    }
  };

  const routes = [
    "/api/projects",
    "/api/credentials/ssh",
    "/api/servers",
    "/api/servers/connectivity-tests",
    "/api/servers/:serverId/credentials",
    "/api/servers/:serverId/connectivity-tests",
    "/api/environments",
    "/api/environments/:environmentId",
    "/api/environments/:environmentId/variables",
    "/api/environments/:environmentId/variables/:key",
    "/api/environments/:environmentId/promote",
    "/api/environments/:environmentId/diff/:otherEnvironmentId",
    "/api/resources",
    "/api/domain-bindings",
    "/api/deployments",
    "/api/deployments/stream",
    "/api/deployments/:deploymentId/logs",
    "/api/providers",
    "/api/plugins",
    "/api/integrations/github/repositories",
  ] as const;

  let mounted = app;

  mounted = mounted.all("/api/rpc", rpcRouteHandler, {
    parse: "none",
  }) as unknown as Elysia;
  mounted = mounted.all("/api/rpc/*", rpcRouteHandler, {
    parse: "none",
  }) as unknown as Elysia;

  for (const route of routes) {
    mounted = mounted.all(route, openApiRouteHandler, {
      parse: "none",
    }) as unknown as Elysia;
  }

  return mounted;
}
