import {
  type AppLogger,
  ArchiveEnvironmentCommand,
  ArchiveProjectCommand,
  ArchiveResourceCommand,
  archiveEnvironmentCommandInputSchema,
  archiveProjectCommandInputSchema,
  archiveResourceCommandInputSchema,
  BootstrapServerProxyCommand,
  bootstrapServerProxyCommandInputSchema,
  CheckServerDeleteSafetyQuery,
  type Command,
  type CommandBus,
  ConfigureDefaultAccessDomainPolicyCommand,
  ConfigureResourceHealthCommand,
  ConfigureResourceNetworkCommand,
  ConfigureResourceRuntimeCommand,
  ConfigureResourceSourceCommand,
  ConfigureServerCredentialCommand,
  ConfigureServerEdgeProxyCommand,
  ConfirmDomainBindingOwnershipCommand,
  CreateDeploymentCommand,
  type CreateDeploymentCommandInput,
  CreateDomainBindingCommand,
  CreateEnvironmentCommand,
  CreateProjectCommand,
  CreateResourceCommand,
  CreateSshCredentialCommand,
  checkServerDeleteSafetyQueryInputSchema,
  configureDefaultAccessDomainPolicyCommandInputSchema,
  configureResourceHealthCommandInputSchema,
  configureResourceNetworkCommandInputSchema,
  configureResourceRuntimeCommandInputSchema,
  configureResourceSourceCommandInputSchema,
  configureServerCredentialCommandInputSchema,
  configureServerEdgeProxyCommandInputSchema,
  confirmDomainBindingOwnershipCommandInputSchema,
  createDeploymentCommandInputSchema,
  createDomainBindingCommandInputSchema,
  createEnvironmentCommandInputSchema,
  createProjectCommandInputSchema,
  createResourceCommandInputSchema,
  createSshCredentialCommandInputSchema,
  DeactivateServerCommand,
  DeleteResourceCommand,
  DeleteServerCommand,
  DeleteSshCredentialCommand,
  type DeploymentEventStreamEnvelope,
  DeploymentLogsQuery,
  type DeploymentProgressEvent,
  type DeploymentProgressObserver,
  DiffEnvironmentsQuery,
  deactivateServerCommandInputSchema,
  deleteResourceCommandInputSchema,
  deleteServerCommandInputSchema,
  deleteSshCredentialCommandInputSchema,
  deploymentLogsQueryInputSchema,
  diffEnvironmentsQueryInputSchema,
  EnvironmentEffectivePrecedenceQuery,
  type ExecutionContext,
  type ExecutionContextFactory,
  environmentEffectivePrecedenceQueryInputSchema,
  ImportCertificateCommand,
  IssueOrRenewCertificateCommand,
  importCertificateCommandInputSchema,
  issueOrRenewCertificateCommandInputSchema,
  ListCertificatesQuery,
  ListDefaultAccessDomainPoliciesQuery,
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
  listCertificatesQueryInputSchema,
  listDefaultAccessDomainPoliciesQueryInputSchema,
  listDeploymentsQueryInputSchema,
  listDomainBindingsQueryInputSchema,
  listEnvironmentsQueryInputSchema,
  listGitHubRepositoriesQueryInputSchema,
  listResourcesQueryInputSchema,
  listSshCredentialsQueryInputSchema,
  OpenTerminalSessionCommand,
  openTerminalSessionCommandInputSchema,
  PromoteEnvironmentCommand,
  promoteEnvironmentCommandInputSchema,
  type Query,
  type QueryBus,
  RegisterServerCommand,
  RenameProjectCommand,
  RenameServerCommand,
  ResourceDiagnosticSummaryQuery,
  ResourceEffectiveConfigQuery,
  ResourceHealthQuery,
  ResourceProxyConfigurationPreviewQuery,
  type ResourceRuntimeLogEvent,
  ResourceRuntimeLogsQuery,
  type ResourceRuntimeLogsQueryInput,
  type ResourceRuntimeLogsResult,
  RotateSshCredentialCommand,
  registerServerCommandInputSchema,
  renameProjectCommandInputSchema,
  renameServerCommandInputSchema,
  resourceDiagnosticSummaryQueryInputSchema,
  resourceEffectiveConfigQueryInputSchema,
  resourceHealthQueryInputSchema,
  resourceProxyConfigurationPreviewQueryInputSchema,
  resourceRuntimeLogsQueryInputSchema,
  rotateSshCredentialCommandInputSchema,
  SetEnvironmentVariableCommand,
  SetResourceVariableCommand,
  ShowDefaultAccessDomainPolicyQuery,
  ShowDeploymentQuery,
  ShowEnvironmentQuery,
  ShowProjectQuery,
  ShowResourceQuery,
  ShowServerQuery,
  ShowSshCredentialQuery,
  StreamDeploymentEventsQuery,
  type StreamDeploymentEventsQueryInput,
  type StreamDeploymentEventsResult,
  setEnvironmentVariableCommandInputSchema,
  setResourceVariableCommandInputSchema,
  showDefaultAccessDomainPolicyQueryInputSchema,
  showDeploymentQueryInputSchema,
  showEnvironmentQueryInputSchema,
  showProjectQueryInputSchema,
  showResourceQueryInputSchema,
  showServerQueryInputSchema,
  showSshCredentialQueryInputSchema,
  streamDeploymentEventsQueryInputSchema,
  TestServerConnectivityCommand,
  testDraftServerConnectivityCommandInputSchema,
  testRegisteredServerConnectivityCommandInputSchema,
  UnsetEnvironmentVariableCommand,
  UnsetResourceVariableCommand,
  unsetEnvironmentVariableCommandInputSchema,
  unsetResourceVariableCommandInputSchema,
} from "@appaloft/application";
import {
  archiveEnvironmentResponseSchema,
  archiveProjectResponseSchema,
  archiveResourceResponseSchema,
  bootstrapServerProxyResponseSchema,
  checkServerDeleteSafetyResponseSchema,
  configureDefaultAccessDomainPolicyResponseSchema,
  configureResourceHealthResponseSchema,
  configureResourceNetworkResponseSchema,
  configureResourceRuntimeResponseSchema,
  configureResourceSourceResponseSchema,
  configureServerEdgeProxyResponseSchema,
  confirmDomainBindingOwnershipResponseSchema,
  createDeploymentResponseSchema,
  createDomainBindingResponseSchema,
  createEnvironmentResponseSchema,
  createProjectResponseSchema,
  createResourceResponseSchema,
  createSshCredentialResponseSchema,
  deactivateServerResponseSchema,
  deleteResourceResponseSchema,
  deleteServerResponseSchema,
  deleteSshCredentialResponseSchema,
  deploymentEventStreamEnvelopeSchema,
  deploymentEventStreamResponseSchema,
  deploymentEventStreamStreamResponseSchema,
  deploymentLogsResponseSchema,
  deploymentProgressEventSchema,
  diffEnvironmentResponseSchema,
  environmentEffectivePrecedenceResponseSchema,
  environmentSummarySchema,
  importCertificateResponseSchema,
  issueOrRenewCertificateResponseSchema,
  listCertificatesResponseSchema,
  listDefaultAccessDomainPoliciesResponseSchema,
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
  renameProjectResponseSchema,
  renameServerResponseSchema,
  resourceDetailSchema,
  resourceDiagnosticSummarySchema,
  resourceEffectiveConfigResponseSchema,
  resourceHealthSummarySchema,
  resourceRuntimeLogEventSchema,
  resourceRuntimeLogsResponseSchema,
  resourceRuntimeLogsStreamResponseSchema,
  rotateSshCredentialResponseSchema,
  setResourceVariableResponseSchema,
  showDefaultAccessDomainPolicyResponseSchema,
  showDeploymentResponseSchema,
  showProjectResponseSchema,
  showServerResponseSchema,
  showSshCredentialResponseSchema,
  terminalSessionDescriptorSchema,
  testServerConnectivityResponseSchema,
  unsetResourceVariableResponseSchema,
} from "@appaloft/contracts";
import { type DomainError, type Result } from "@appaloft/core";
import { resolvePublicDocsHelpHref } from "@appaloft/docs-registry";
import { resolveAppaloftLocaleFromHeaders, translateDomainError } from "@appaloft/i18n";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { eventIterator, ORPCError, os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { type Elysia } from "elysia";
import { z } from "zod";

export interface AppaloftOrpcContext {
  commandBus: CommandBus;
  executionContextFactory: ExecutionContextFactory;
  queryBus: QueryBus;
  logger: AppLogger;
  deploymentProgressObserver?: DeploymentProgressObserver;
}

interface AppaloftOrpcRequestContext extends AppaloftOrpcContext {
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

const base = os.$context<AppaloftOrpcRequestContext>();
const emptyResponseSchema = z.null();
export const createDeploymentDocsHref = resolvePublicDocsHelpHref("deployment.source");

function routeDescription(
  summary: string,
  topicId: Parameters<typeof resolvePublicDocsHelpHref>[0],
): string {
  return `${summary} Public docs: ${resolvePublicDocsHelpHref(topicId)}`;
}

export const apiDocsHrefs = {
  createDeployment: createDeploymentDocsHref,
  serverCredential: resolvePublicDocsHelpHref("server.ssh-credential"),
  serverConnectivity: resolvePublicDocsHelpHref("server.connectivity-test"),
  serverDeploymentTarget: resolvePublicDocsHelpHref("server.deployment-target"),
  serverProxyReadiness: resolvePublicDocsHelpHref("server.proxy-readiness"),
  environmentVariablePrecedence: resolvePublicDocsHelpHref("environment.variable-precedence"),
  environmentDiffPromote: resolvePublicDocsHelpHref("environment.diff-promote"),
  environmentLifecycle: resolvePublicDocsHelpHref("environment.lifecycle"),
  defaultAccessRoute: resolvePublicDocsHelpHref("domain.generated-access-route"),
  defaultAccessPolicy: resolvePublicDocsHelpHref("default-access.policy"),
  resourceSourceProfile: resolvePublicDocsHelpHref("resource.source-profile"),
  resourceRuntimeProfile: resolvePublicDocsHelpHref("resource.runtime-profile"),
  resourceHealthProfile: resolvePublicDocsHelpHref("resource.health-profile"),
  resourceNetworkProfile: resolvePublicDocsHelpHref("resource.network-profile"),
  domainCustomBinding: resolvePublicDocsHelpHref("domain.custom-domain-binding"),
  domainOwnershipCheck: resolvePublicDocsHelpHref("domain.ownership-check"),
  certificateReadiness: resolvePublicDocsHelpHref("certificate.readiness"),
  runtimeLogs: resolvePublicDocsHelpHref("observability.runtime-logs"),
  healthSummary: resolvePublicDocsHelpHref("observability.health-summary"),
  diagnosticSummary: resolvePublicDocsHelpHref("diagnostics.safe-support-payload"),
  terminalSession: resolvePublicDocsHelpHref("server.terminal-session"),
  projectLifecycle: resolvePublicDocsHelpHref("project.lifecycle"),
} as const;

export const apiRouteDescriptions = {
  createDeployment: routeDescription(
    "Creates a deployment from an explicit project, server, environment, and resource context.",
    "deployment.source",
  ),
  projectLifecycle: routeDescription("Read, rename, and archive projects.", "project.lifecycle"),
  showServer: routeDescription(
    "Reads one deployment target with proxy status and usage rollups.",
    "server.deployment-target",
  ),
  renameServer: routeDescription(
    "Renames the display label for one deployment target without changing its identity.",
    "server.deployment-target",
  ),
  configureServerEdgeProxy: routeDescription(
    "Configures the desired edge proxy kind for future server access routing.",
    "server.proxy-readiness",
  ),
  deactivateServer: routeDescription(
    "Marks one deployment target inactive so it cannot receive new work.",
    "server.deployment-target",
  ),
  checkServerDeleteSafety: routeDescription(
    "Previews whether a deployment target can be safely deleted.",
    "server.deployment-target",
  ),
  deleteServer: routeDescription(
    "Deletes an inactive deployment target only after delete-safety blockers are clear.",
    "server.deployment-target",
  ),
  configureServerCredential: routeDescription(
    "Configures the SSH credential Appaloft uses for server connectivity and deployment.",
    "server.ssh-credential",
  ),
  createSshCredential: routeDescription(
    "Creates a reusable SSH credential from a private key input.",
    "server.ssh-credential",
  ),
  showSshCredential: routeDescription(
    "Reads one reusable SSH credential with masked detail and server usage visibility.",
    "server.ssh-credential",
  ),
  deleteSshCredential: routeDescription(
    "Deletes one reusable SSH credential only when no visible active or inactive server uses it.",
    "server.ssh-credential",
  ),
  rotateSshCredential: routeDescription(
    "Rotates one reusable SSH credential in place after usage visibility and acknowledgement checks.",
    "server.ssh-credential",
  ),
  testServerConnectivity: routeDescription(
    "Tests whether Appaloft can reach and inspect a server.",
    "server.connectivity-test",
  ),
  bootstrapServerProxy: routeDescription(
    "Repairs or bootstraps provider-owned edge proxy infrastructure.",
    "server.proxy-readiness",
  ),
  configureDefaultAccessDomainPolicy: routeDescription(
    "Configures generated access routes for deployed resources.",
    "default-access.policy",
  ),
  listDefaultAccessDomainPolicies: routeDescription(
    "Lists persisted default access policy records.",
    "default-access.policy",
  ),
  showDefaultAccessDomainPolicy: routeDescription(
    "Reads one persisted default access policy scope.",
    "default-access.policy",
  ),
  configureResourceSource: routeDescription(
    "Configures the source profile used by later deployment detect and plan stages.",
    "resource.source-profile",
  ),
  configureResourceRuntime: routeDescription(
    "Configures runtime settings such as strategy, commands, and publish directory.",
    "resource.runtime-profile",
  ),
  configureResourceHealth: routeDescription(
    "Configures readiness and health checks used during verification.",
    "resource.health-profile",
  ),
  configureResourceNetwork: routeDescription(
    "Configures ports, protocols, and exposure behavior for resource access.",
    "resource.network-profile",
  ),
  setResourceVariable: routeDescription(
    "Sets one resource-scoped variable or secret override.",
    "environment.variable-precedence",
  ),
  unsetResourceVariable: routeDescription(
    "Removes one resource-scoped variable override.",
    "environment.variable-precedence",
  ),
  resourceEffectiveConfig: routeDescription(
    "Reads the masked effective configuration for one resource.",
    "environment.variable-precedence",
  ),
  environmentEffectivePrecedence: routeDescription(
    "Reads masked environment variables after environment precedence resolution.",
    "environment.variable-precedence",
  ),
  createDomainBinding: routeDescription(
    "Creates a custom domain binding for a resource.",
    "domain.custom-domain-binding",
  ),
  confirmDomainBindingOwnership: routeDescription(
    "Confirms that a user controls the custom domain.",
    "domain.ownership-check",
  ),
  issueOrRenewCertificate: routeDescription(
    "Requests certificate issuance or renewal for a domain binding.",
    "certificate.readiness",
  ),
  importCertificate: routeDescription(
    "Imports a manual certificate for a domain binding.",
    "certificate.readiness",
  ),
  setEnvironmentVariable: routeDescription(
    "Sets an environment variable with explicit kind, exposure, scope, and secret handling.",
    "environment.variable-precedence",
  ),
  unsetEnvironmentVariable: routeDescription(
    "Removes an environment variable in a specific exposure and optional scope.",
    "environment.variable-precedence",
  ),
  promoteEnvironment: routeDescription(
    "Promotes one environment configuration set into another.",
    "environment.diff-promote",
  ),
  archiveEnvironment: routeDescription(
    "Archives one environment while keeping deployment history readable.",
    "environment.lifecycle",
  ),
  diffEnvironments: routeDescription(
    "Compares two environment configuration sets.",
    "environment.diff-promote",
  ),
  deploymentLogs: routeDescription("Reads deployment logs.", "observability.runtime-logs"),
  resourceRuntimeLogs: routeDescription(
    "Reads resource runtime logs.",
    "observability.runtime-logs",
  ),
  resourceDiagnosticSummary: routeDescription(
    "Returns a support-safe diagnostic summary.",
    "diagnostics.safe-support-payload",
  ),
  resourceHealth: routeDescription(
    "Reads current resource health.",
    "observability.health-summary",
  ),
  resourceProxyConfigurationPreview: routeDescription(
    "Previews generated proxy configuration for a resource.",
    "resource.network-profile",
  ),
  openTerminalSession: routeDescription(
    "Opens a controlled terminal session for server or resource troubleshooting.",
    "server.terminal-session",
  ),
} as const;
export const createDeploymentRouteDescription = apiRouteDescriptions.createDeployment;

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
    case "certificate_attempt_conflict":
    case "project_archived":
    case "environment_archived":
    case "resource_slug_conflict":
    case "resource_archived":
    case "resource_delete_blocked":
    case "server_delete_blocked":
    case "server_inactive":
    case "deployment_not_redeployable":
    case "credential_in_use":
    case "credential_rotation_requires_usage_acknowledgement":
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
    case "certificate_not_allowed":
    case "resource_context_mismatch":
    case "terminal_session_context_mismatch":
    case "terminal_session_workspace_unavailable":
    case "terminal_session_policy_denied":
    case "terminal_session_not_found":
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

      if (error.category === "timeout") {
        return new ORPCError("GATEWAY_TIMEOUT", {
          message,
          status: 504,
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
  context: AppaloftOrpcRequestContext,
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
  context: AppaloftOrpcRequestContext,
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
  context: AppaloftOrpcRequestContext,
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
  context: AppaloftOrpcRequestContext,
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

function createDeploymentEventStream(
  context: AppaloftOrpcRequestContext,
  input: StreamDeploymentEventsQueryInput,
): AsyncGenerator<DeploymentEventStreamEnvelope, { deploymentId: string }, void> {
  return (async function* streamDeploymentEvents() {
    const result: StreamDeploymentEventsResult = await executeQuery(
      context,
      StreamDeploymentEventsQuery.create({
        ...input,
        follow: true,
      }),
    );

    if (result.mode === "bounded") {
      for (const envelope of result.envelopes) {
        yield envelope;
      }

      return {
        deploymentId: result.deploymentId,
      };
    }

    try {
      for await (const envelope of result.stream) {
        yield envelope;

        if (envelope.kind === "closed" || envelope.kind === "error") {
          break;
        }
      }

      return {
        deploymentId: result.deploymentId,
      };
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
    locale: resolveAppaloftLocaleFromHeaders(request.headers),
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

export const showProjectProcedure = base
  .route({
    method: "GET",
    path: "/projects/{projectId}",
    description: apiRouteDescriptions.projectLifecycle,
    successStatus: 200,
  })
  .input(showProjectQueryInputSchema)
  .output(showProjectResponseSchema)
  .handler(async ({ input, context }) => executeQuery(context, ShowProjectQuery.create(input)));

export const renameProjectProcedure = base
  .route({
    method: "POST",
    path: "/projects/{projectId}/rename",
    description: apiRouteDescriptions.projectLifecycle,
    successStatus: 200,
  })
  .input(renameProjectCommandInputSchema)
  .output(renameProjectResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, RenameProjectCommand.create(input)),
  );

export const archiveProjectProcedure = base
  .route({
    method: "POST",
    path: "/projects/{projectId}/archive",
    description: apiRouteDescriptions.projectLifecycle,
    successStatus: 200,
  })
  .input(archiveProjectCommandInputSchema)
  .output(archiveProjectResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ArchiveProjectCommand.create(input)),
  );

export const listServersProcedure = base
  .route({
    method: "GET",
    path: "/servers",
    successStatus: 200,
  })
  .output(listServersResponseSchema)
  .handler(async ({ context }) => executeQuery(context, ListServersQuery.create()));

export const showServerProcedure = base
  .route({
    method: "GET",
    path: "/servers/{serverId}",
    description: apiRouteDescriptions.showServer,
    successStatus: 200,
  })
  .input(showServerQueryInputSchema)
  .output(showServerResponseSchema)
  .handler(async ({ input, context }) => executeQuery(context, ShowServerQuery.create(input)));

export const renameServerProcedure = base
  .route({
    method: "POST",
    path: "/servers/{serverId}/rename",
    description: apiRouteDescriptions.renameServer,
    successStatus: 200,
  })
  .input(renameServerCommandInputSchema)
  .output(renameServerResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, RenameServerCommand.create(input)),
  );

export const configureServerEdgeProxyProcedure = base
  .route({
    method: "POST",
    path: "/servers/{serverId}/edge-proxy/configuration",
    description: apiRouteDescriptions.configureServerEdgeProxy,
    successStatus: 200,
  })
  .input(configureServerEdgeProxyCommandInputSchema)
  .output(configureServerEdgeProxyResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ConfigureServerEdgeProxyCommand.create(input)),
  );

export const deactivateServerProcedure = base
  .route({
    method: "POST",
    path: "/servers/{serverId}/deactivate",
    description: apiRouteDescriptions.deactivateServer,
    successStatus: 200,
  })
  .input(deactivateServerCommandInputSchema)
  .output(deactivateServerResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, DeactivateServerCommand.create(input)),
  );

export const checkServerDeleteSafetyProcedure = base
  .route({
    method: "GET",
    path: "/servers/{serverId}/delete-check",
    description: apiRouteDescriptions.checkServerDeleteSafety,
    successStatus: 200,
  })
  .input(checkServerDeleteSafetyQueryInputSchema)
  .output(checkServerDeleteSafetyResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, CheckServerDeleteSafetyQuery.create(input)),
  );

export const deleteServerProcedure = base
  .route({
    method: "DELETE",
    path: "/servers/{serverId}",
    description: apiRouteDescriptions.deleteServer,
    successStatus: 200,
  })
  .input(deleteServerCommandInputSchema)
  .output(deleteServerResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, DeleteServerCommand.create(input)),
  );

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
    description: apiRouteDescriptions.configureServerCredential,
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

export const showSshCredentialProcedure = base
  .route({
    method: "GET",
    path: "/credentials/ssh/{credentialId}",
    description: apiRouteDescriptions.showSshCredential,
    successStatus: 200,
  })
  .input(showSshCredentialQueryInputSchema)
  .output(showSshCredentialResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ShowSshCredentialQuery.create(input)),
  );

export const deleteSshCredentialProcedure = base
  .route({
    method: "DELETE",
    path: "/credentials/ssh/{credentialId}",
    description: apiRouteDescriptions.deleteSshCredential,
    successStatus: 200,
  })
  .input(deleteSshCredentialCommandInputSchema)
  .output(deleteSshCredentialResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, DeleteSshCredentialCommand.create(input)),
  );

export const rotateSshCredentialProcedure = base
  .route({
    method: "POST",
    path: "/credentials/ssh/{credentialId}/rotate",
    description: apiRouteDescriptions.rotateSshCredential,
    successStatus: 200,
  })
  .input(rotateSshCredentialCommandInputSchema)
  .output(rotateSshCredentialResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, RotateSshCredentialCommand.create(input)),
  );

export const createSshCredentialProcedure = base
  .route({
    method: "POST",
    path: "/credentials/ssh",
    description: apiRouteDescriptions.createSshCredential,
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
    description: apiRouteDescriptions.testServerConnectivity,
    successStatus: 200,
  })
  .input(testRegisteredServerConnectivityCommandInputSchema)
  .output(testServerConnectivityResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, TestServerConnectivityCommand.create(input)),
  );

export const testDraftServerConnectivityProcedure = base
  .route({
    method: "POST",
    path: "/servers/connectivity-tests",
    description: apiRouteDescriptions.testServerConnectivity,
    successStatus: 200,
  })
  .input(testDraftServerConnectivityCommandInputSchema)
  .output(testServerConnectivityResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, TestServerConnectivityCommand.create(input)),
  );

export const bootstrapServerProxyProcedure = base
  .route({
    method: "POST",
    path: "/servers/{serverId}/edge-proxy/bootstrap",
    description: apiRouteDescriptions.bootstrapServerProxy,
    successStatus: 200,
  })
  .input(bootstrapServerProxyCommandInputSchema)
  .output(bootstrapServerProxyResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, BootstrapServerProxyCommand.create(input)),
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

export const configureDefaultAccessDomainPolicyProcedure = base
  .route({
    method: "POST",
    path: "/default-access-domain-policies",
    description: apiRouteDescriptions.configureDefaultAccessDomainPolicy,
    successStatus: 200,
  })
  .input(configureDefaultAccessDomainPolicyCommandInputSchema)
  .output(configureDefaultAccessDomainPolicyResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ConfigureDefaultAccessDomainPolicyCommand.create(input)),
  );

export const listDefaultAccessDomainPoliciesProcedure = base
  .route({
    method: "GET",
    path: "/default-access-domain-policies",
    description: apiRouteDescriptions.listDefaultAccessDomainPolicies,
    successStatus: 200,
  })
  .input(listDefaultAccessDomainPoliciesQueryInputSchema)
  .output(listDefaultAccessDomainPoliciesResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ListDefaultAccessDomainPoliciesQuery.create(input)),
  );

export const showDefaultAccessDomainPolicyProcedure = base
  .route({
    method: "GET",
    path: "/default-access-domain-policies/show",
    description: apiRouteDescriptions.showDefaultAccessDomainPolicy,
    successStatus: 200,
  })
  .input(showDefaultAccessDomainPolicyQueryInputSchema)
  .output(showDefaultAccessDomainPolicyResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ShowDefaultAccessDomainPolicyQuery.create(input)),
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

export const showResourceProcedure = base
  .route({
    method: "GET",
    path: "/resources/{resourceId}",
    successStatus: 200,
  })
  .input(showResourceQueryInputSchema)
  .output(resourceDetailSchema)
  .handler(async ({ input, context }) => executeQuery(context, ShowResourceQuery.create(input)));

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

export const archiveResourceProcedure = base
  .route({
    method: "POST",
    path: "/resources/{resourceId}/archive",
    successStatus: 200,
  })
  .input(archiveResourceCommandInputSchema)
  .output(archiveResourceResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ArchiveResourceCommand.create(input)),
  );

export const deleteResourceProcedure = base
  .route({
    method: "DELETE",
    path: "/resources/{resourceId}",
    successStatus: 200,
  })
  .input(deleteResourceCommandInputSchema)
  .output(deleteResourceResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, DeleteResourceCommand.create(input)),
  );

export const configureResourceHealthProcedure = base
  .route({
    method: "POST",
    path: "/resources/{resourceId}/health-policy",
    description: apiRouteDescriptions.configureResourceHealth,
    successStatus: 200,
  })
  .input(configureResourceHealthCommandInputSchema)
  .output(configureResourceHealthResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ConfigureResourceHealthCommand.create(input)),
  );

export const configureResourceNetworkProcedure = base
  .route({
    method: "POST",
    path: "/resources/{resourceId}/network-profile",
    description: apiRouteDescriptions.configureResourceNetwork,
    successStatus: 200,
  })
  .input(configureResourceNetworkCommandInputSchema)
  .output(configureResourceNetworkResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ConfigureResourceNetworkCommand.create(input)),
  );

export const configureResourceRuntimeProcedure = base
  .route({
    method: "POST",
    path: "/resources/{resourceId}/runtime-profile",
    description: apiRouteDescriptions.configureResourceRuntime,
    successStatus: 200,
  })
  .input(configureResourceRuntimeCommandInputSchema)
  .output(configureResourceRuntimeResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ConfigureResourceRuntimeCommand.create(input)),
  );

export const configureResourceSourceProcedure = base
  .route({
    method: "POST",
    path: "/resources/{resourceId}/source",
    description: apiRouteDescriptions.configureResourceSource,
    successStatus: 200,
  })
  .input(configureResourceSourceCommandInputSchema)
  .output(configureResourceSourceResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ConfigureResourceSourceCommand.create(input)),
  );

export const setResourceVariableProcedure = base
  .route({
    method: "POST",
    path: "/resources/{resourceId}/variables",
    description: apiRouteDescriptions.setResourceVariable,
    successStatus: 200,
  })
  .input(setResourceVariableCommandInputSchema)
  .output(setResourceVariableResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, SetResourceVariableCommand.create(input)),
  );

export const unsetResourceVariableProcedure = base
  .route({
    method: "DELETE",
    path: "/resources/{resourceId}/variables/{key}",
    description: apiRouteDescriptions.unsetResourceVariable,
    successStatus: 200,
  })
  .input(unsetResourceVariableCommandInputSchema)
  .output(unsetResourceVariableResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, UnsetResourceVariableCommand.create(input)),
  );

export const resourceEffectiveConfigProcedure = base
  .route({
    method: "GET",
    path: "/resources/{resourceId}/effective-config",
    description: apiRouteDescriptions.resourceEffectiveConfig,
    successStatus: 200,
  })
  .input(resourceEffectiveConfigQueryInputSchema)
  .output(resourceEffectiveConfigResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ResourceEffectiveConfigQuery.create(input)),
  );

export const createDomainBindingProcedure = base
  .route({
    method: "POST",
    path: "/domain-bindings",
    description: apiRouteDescriptions.createDomainBinding,
    successStatus: 201,
  })
  .input(createDomainBindingCommandInputSchema)
  .output(createDomainBindingResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, CreateDomainBindingCommand.create(input)),
  );

export const confirmDomainBindingOwnershipProcedure = base
  .route({
    method: "POST",
    path: "/domain-bindings/{domainBindingId}/ownership-confirmations",
    description: apiRouteDescriptions.confirmDomainBindingOwnership,
    successStatus: 200,
  })
  .input(confirmDomainBindingOwnershipCommandInputSchema)
  .output(confirmDomainBindingOwnershipResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ConfirmDomainBindingOwnershipCommand.create(input)),
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

export const issueOrRenewCertificateProcedure = base
  .route({
    method: "POST",
    path: "/certificates/issue-or-renew",
    description: apiRouteDescriptions.issueOrRenewCertificate,
    successStatus: 202,
  })
  .input(issueOrRenewCertificateCommandInputSchema)
  .output(issueOrRenewCertificateResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, IssueOrRenewCertificateCommand.create(input)),
  );

export const importCertificateProcedure = base
  .route({
    method: "POST",
    path: "/certificates/import",
    description: apiRouteDescriptions.importCertificate,
    successStatus: 200,
  })
  .input(importCertificateCommandInputSchema)
  .output(importCertificateResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ImportCertificateCommand.create(input)),
  );

export const listCertificatesProcedure = base
  .route({
    method: "GET",
    path: "/certificates",
    successStatus: 200,
  })
  .input(listCertificatesQueryInputSchema)
  .output(listCertificatesResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ListCertificatesQuery.create(input)),
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

export const archiveEnvironmentProcedure = base
  .route({
    method: "POST",
    path: "/environments/{environmentId}/archive",
    description: apiRouteDescriptions.archiveEnvironment,
    successStatus: 200,
  })
  .input(archiveEnvironmentCommandInputSchema)
  .output(archiveEnvironmentResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, ArchiveEnvironmentCommand.create(input)),
  );

export const setEnvironmentVariableProcedure = base
  .route({
    method: "POST",
    path: "/environments/{environmentId}/variables",
    description: apiRouteDescriptions.setEnvironmentVariable,
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
    description: apiRouteDescriptions.unsetEnvironmentVariable,
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
    description: apiRouteDescriptions.promoteEnvironment,
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
    description: apiRouteDescriptions.diffEnvironments,
    successStatus: 200,
  })
  .input(diffEnvironmentsQueryInputSchema)
  .output(diffEnvironmentResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, DiffEnvironmentsQuery.create(input)),
  );

export const environmentEffectivePrecedenceProcedure = base
  .route({
    method: "GET",
    path: "/environments/{environmentId}/effective-precedence",
    description: apiRouteDescriptions.environmentEffectivePrecedence,
    successStatus: 200,
  })
  .input(environmentEffectivePrecedenceQueryInputSchema)
  .output(environmentEffectivePrecedenceResponseSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, EnvironmentEffectivePrecedenceQuery.create(input)),
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
    summary: "Create deployment",
    description: createDeploymentRouteDescription,
    successStatus: 201,
  })
  .input(createDeploymentCommandInputSchema)
  .output(createDeploymentResponseSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, CreateDeploymentCommand.create(input)),
  );

export const showDeploymentProcedure = base
  .route({
    method: "GET",
    path: "/deployments/{deploymentId}",
    successStatus: 200,
  })
  .input(showDeploymentQueryInputSchema)
  .output(showDeploymentResponseSchema)
  .handler(async ({ input, context }) => executeQuery(context, ShowDeploymentQuery.create(input)));

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
    description: apiRouteDescriptions.deploymentLogs,
    successStatus: 200,
  })
  .input(deploymentLogsQueryInputSchema)
  .output(deploymentLogsResponseSchema)
  .handler(async ({ input, context }) => executeQuery(context, DeploymentLogsQuery.create(input)));

export const deploymentEventReplayProcedure = base
  .route({
    method: "GET",
    path: "/deployments/{deploymentId}/events",
    successStatus: 200,
  })
  .input(streamDeploymentEventsQueryInputSchema)
  .output(deploymentEventStreamResponseSchema)
  .handler(async ({ input, context }) => {
    const result: StreamDeploymentEventsResult = await executeQuery(
      context,
      StreamDeploymentEventsQuery.create({
        ...input,
        follow: false,
      }),
    );

    if (result.mode !== "bounded") {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Deployment event query returned a stream for a bounded request",
        status: 500,
      });
    }

    return {
      deploymentId: result.deploymentId,
      envelopes: result.envelopes,
    };
  });

export const deploymentEventStreamProcedure = base
  .route({
    method: "GET",
    path: "/deployments/{deploymentId}/events/stream",
    successStatus: 200,
  })
  .input(streamDeploymentEventsQueryInputSchema)
  .output(
    eventIterator(deploymentEventStreamEnvelopeSchema, deploymentEventStreamStreamResponseSchema),
  )
  .handler(({ input, context }) => createDeploymentEventStream(context, input));

export const resourceRuntimeLogsProcedure = base
  .route({
    method: "GET",
    path: "/resources/{resourceId}/runtime-logs",
    description: apiRouteDescriptions.resourceRuntimeLogs,
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
    description: apiRouteDescriptions.resourceRuntimeLogs,
    successStatus: 200,
  })
  .input(resourceRuntimeLogsQueryInputSchema)
  .output(eventIterator(resourceRuntimeLogEventSchema, resourceRuntimeLogsStreamResponseSchema))
  .handler(({ input, context }) => createResourceRuntimeLogStream(context, input));

export const resourceDiagnosticSummaryProcedure = base
  .route({
    method: "GET",
    path: "/resources/{resourceId}/diagnostic-summary",
    description: apiRouteDescriptions.resourceDiagnosticSummary,
    successStatus: 200,
  })
  .input(resourceDiagnosticSummaryQueryInputSchema)
  .output(resourceDiagnosticSummarySchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ResourceDiagnosticSummaryQuery.create(input)),
  );

export const resourceHealthProcedure = base
  .route({
    method: "GET",
    path: "/resources/{resourceId}/health",
    description: apiRouteDescriptions.resourceHealth,
    successStatus: 200,
  })
  .input(resourceHealthQueryInputSchema)
  .output(resourceHealthSummarySchema)
  .handler(async ({ input, context }) => executeQuery(context, ResourceHealthQuery.create(input)));

export const resourceProxyConfigurationPreviewProcedure = base
  .route({
    method: "GET",
    path: "/resources/{resourceId}/proxy-configuration",
    description: apiRouteDescriptions.resourceProxyConfigurationPreview,
    successStatus: 200,
  })
  .input(resourceProxyConfigurationPreviewQueryInputSchema)
  .output(proxyConfigurationViewSchema)
  .handler(async ({ input, context }) =>
    executeQuery(context, ResourceProxyConfigurationPreviewQuery.create(input)),
  );

export const openTerminalSessionProcedure = base
  .route({
    method: "POST",
    path: "/terminal-sessions",
    description: apiRouteDescriptions.openTerminalSession,
    successStatus: 201,
  })
  .input(openTerminalSessionCommandInputSchema)
  .output(terminalSessionDescriptorSchema)
  .handler(async ({ input, context }) =>
    executeCommand(context, OpenTerminalSessionCommand.create(input)),
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

export const appaloftOrpcRouter = {
  projects: {
    list: listProjectsProcedure,
    create: createProjectProcedure,
    show: showProjectProcedure,
    rename: renameProjectProcedure,
    archive: archiveProjectProcedure,
  },
  servers: {
    list: listServersProcedure,
    show: showServerProcedure,
    rename: renameServerProcedure,
    configureEdgeProxy: configureServerEdgeProxyProcedure,
    deactivate: deactivateServerProcedure,
    deleteCheck: checkServerDeleteSafetyProcedure,
    delete: deleteServerProcedure,
    create: registerServerProcedure,
    configureCredential: configureServerCredentialProcedure,
    testConnectivity: testServerConnectivityProcedure,
    testDraftConnectivity: testDraftServerConnectivityProcedure,
    bootstrapProxy: bootstrapServerProxyProcedure,
  },
  credentials: {
    ssh: {
      list: listSshCredentialsProcedure,
      show: showSshCredentialProcedure,
      create: createSshCredentialProcedure,
      delete: deleteSshCredentialProcedure,
      rotate: rotateSshCredentialProcedure,
    },
  },
  environments: {
    list: listEnvironmentsProcedure,
    create: createEnvironmentProcedure,
    show: showEnvironmentProcedure,
    archive: archiveEnvironmentProcedure,
    setVariable: setEnvironmentVariableProcedure,
    unsetVariable: unsetEnvironmentVariableProcedure,
    effectivePrecedence: environmentEffectivePrecedenceProcedure,
    promote: promoteEnvironmentProcedure,
    diff: diffEnvironmentsProcedure,
  },
  defaultAccessDomainPolicies: {
    configure: configureDefaultAccessDomainPolicyProcedure,
    list: listDefaultAccessDomainPoliciesProcedure,
    show: showDefaultAccessDomainPolicyProcedure,
  },
  resources: {
    list: listResourcesProcedure,
    show: showResourceProcedure,
    create: createResourceProcedure,
    archive: archiveResourceProcedure,
    delete: deleteResourceProcedure,
    configureHealth: configureResourceHealthProcedure,
    configureNetwork: configureResourceNetworkProcedure,
    configureRuntime: configureResourceRuntimeProcedure,
    configureSource: configureResourceSourceProcedure,
    setVariable: setResourceVariableProcedure,
    unsetVariable: unsetResourceVariableProcedure,
    effectiveConfig: resourceEffectiveConfigProcedure,
    diagnosticSummary: resourceDiagnosticSummaryProcedure,
    health: resourceHealthProcedure,
    proxyConfiguration: resourceProxyConfigurationPreviewProcedure,
    logs: resourceRuntimeLogsProcedure,
    logsStream: resourceRuntimeLogsStreamProcedure,
  },
  terminalSessions: {
    open: openTerminalSessionProcedure,
  },
  domainBindings: {
    list: listDomainBindingsProcedure,
    create: createDomainBindingProcedure,
    confirmOwnership: confirmDomainBindingOwnershipProcedure,
  },
  certificates: {
    import: importCertificateProcedure,
    list: listCertificatesProcedure,
    issueOrRenew: issueOrRenewCertificateProcedure,
  },
  deployments: {
    list: listDeploymentsProcedure,
    create: createDeploymentProcedure,
    show: showDeploymentProcedure,
    createStream: createDeploymentStreamProcedure,
    logs: deploymentLogsProcedure,
    events: deploymentEventReplayProcedure,
    eventsStream: deploymentEventStreamProcedure,
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

export type AppaloftOrpcRouter = typeof appaloftOrpcRouter;

export function createAppaloftOpenApiHandler() {
  return new OpenAPIHandler(appaloftOrpcRouter);
}

export function createAppaloftRpcHandler() {
  return new RPCHandler(appaloftOrpcRouter);
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

export function mountAppaloftOrpcRoutes(
  app: Elysia,
  context: AppaloftOrpcContext & {
    requestContextRunner?: RequestContextRunner;
  },
): Elysia {
  const openApiHandler = createAppaloftOpenApiHandler();
  const rpcHandler = createAppaloftRpcHandler();

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
    "/api/projects/:projectId",
    "/api/projects/:projectId/rename",
    "/api/projects/:projectId/archive",
    "/api/credentials/ssh",
    "/api/credentials/ssh/:credentialId",
    "/api/credentials/ssh/:credentialId/rotate",
    "/api/servers",
    "/api/servers/:serverId",
    "/api/servers/:serverId/rename",
    "/api/servers/:serverId/edge-proxy/configuration",
    "/api/servers/:serverId/deactivate",
    "/api/servers/:serverId/delete-check",
    "/api/servers/connectivity-tests",
    "/api/servers/:serverId/credentials",
    "/api/servers/:serverId/connectivity-tests",
    "/api/servers/:serverId/edge-proxy/bootstrap",
    "/api/environments",
    "/api/default-access-domain-policies",
    "/api/default-access-domain-policies/show",
    "/api/environments/:environmentId",
    "/api/environments/:environmentId/archive",
    "/api/environments/:environmentId/variables",
    "/api/environments/:environmentId/variables/:key",
    "/api/environments/:environmentId/effective-precedence",
    "/api/environments/:environmentId/promote",
    "/api/environments/:environmentId/diff/:otherEnvironmentId",
    "/api/resources",
    "/api/resources/:resourceId",
    "/api/resources/:resourceId/archive",
    "/api/resources/:resourceId/source",
    "/api/resources/:resourceId/health",
    "/api/resources/:resourceId/health-policy",
    "/api/resources/:resourceId/network-profile",
    "/api/resources/:resourceId/runtime-profile",
    "/api/resources/:resourceId/diagnostic-summary",
    "/api/resources/:resourceId/proxy-configuration",
    "/api/resources/:resourceId/runtime-logs",
    "/api/resources/:resourceId/runtime-logs/stream",
    "/api/terminal-sessions",
    "/api/domain-bindings",
    "/api/domain-bindings/:domainBindingId/ownership-confirmations",
    "/api/certificates",
    "/api/certificates/import",
    "/api/certificates/issue-or-renew",
    "/api/deployments",
    "/api/deployments/:deploymentId",
    "/api/deployments/stream",
    "/api/deployments/:deploymentId/logs",
    "/api/deployments/:deploymentId/events",
    "/api/deployments/:deploymentId/events/stream",
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
