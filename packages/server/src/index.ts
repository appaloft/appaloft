import "reflect-metadata";

import { fileURLToPath } from "node:url";

import {
  type ServerAppliedRouteDesiredStateStore as CliServerAppliedRouteStateStore,
  type CliSourceLinkStore,
  type SshRemoteStateTarget,
} from "@appaloft/adapter-cli";
import { createHttpApp } from "@appaloft/adapter-http-elysia";
import {
  type ActionDeployTokenAuthorizationPort,
  type AppLogger,
  type AutomaticRouteContextLookup,
  type CertificateHttpChallengeTokenStore,
  type CertificateRetryScheduler,
  type Clock,
  type CommandBus,
  createDurableWorkTopology,
  type DependencyResourceBackupPolicyRepository,
  type DeploymentLifecycleService,
  type DeploymentRepository,
  type DeployTokenRepository,
  type DurableWorkHandlerRegistry,
  type DurableWorkQueueAdapter,
  type DurableWorkWorkerHeartbeatStore,
  type EnvironmentReadModel,
  type EventBus,
  type ExecutionBackend,
  type ExecutionContext,
  type ExecutionContextFactory,
  type ExecutionProviderAccessTokens,
  type ExecutionSandboxService,
  ExportGlobalAuditEventsQuery,
  type GitHubPreviewPullRequestWebhookVerifier,
  type GitHubSourceEventWebhookVerifier,
  type IdGenerator,
  type IntegrationAuthPort,
  MarkServerAppliedRouteAppliedSpec,
  MarkServerAppliedRouteFailedSpec,
  type MutationCoordinator,
  type PreviewCleanupRetryScheduler,
  type PreviewExpiryCleanupScheduler,
  type ProcessAttemptDeliveryCandidateReader,
  type ProcessAttemptRecorder,
  type ProcessAttemptRetryCandidateReader,
  type ProcessAttemptRetryGenerator,
  type ProjectReadModel,
  type QueryBus,
  type ResourceAccessFailureEvidenceRecorder,
  type ResourceReadModel,
  type RuntimeMonitoringCollectorService,
  type ScheduledDependencyBackupService,
  type ScheduledHistoryRetentionService,
  type ScheduledRuntimePrunePolicyReadModel,
  type ScheduledRuntimePruneService,
  type ScheduledTaskRunWorker,
  type ScheduledTaskScheduler,
  ServerAppliedRouteStateByRouteSetIdSpec,
  ServerAppliedRouteStateBySourceFingerprintSpec,
  ServerAppliedRouteStateByTargetSpec,
  type ServerAppliedRouteStateRepository,
  type ServerReadModel,
  type SourceEventVerificationPort,
  SourceLinkBySourceFingerprintSpec,
  type SourceLinkRecord,
  type SourceLinkRepository,
  type StorageVolumeBackupAutomationService,
  type TerminalSessionGateway,
  type TunnelSessionService,
  tokens,
  UpsertServerAppliedRouteDesiredStateSpec,
  UpsertSourceLinkSpec,
} from "@appaloft/application";
import {
  type AuthRuntime,
  createBetterAuthRuntime,
  PersistedActionDeployTokenAuthorizationPort,
  StaticActionDeployTokenAuthorizationPort,
} from "@appaloft/auth-better";
import { type AppConfig, resolveConfig } from "@appaloft/config";
import { domainError, err, ok, type Result } from "@appaloft/core";
import {
  type AppaloftTranslate,
  createAppaloftTranslator,
  i18nKeys,
  resolveAppaloftLocaleFromHeaders,
} from "@appaloft/i18n";
import { createGitHubActionSourcePackageConfigReader } from "@appaloft/integration-github";
import {
  bootstrapOpenTelemetry,
  createExecutionContextFactory,
  createLogger,
} from "@appaloft/observability";
import {
  createMigrator,
  type PgliteRuntimeAssets,
  PgServerAppliedRouteStateRepository,
  PgSourceLinkRepository,
} from "@appaloft/persistence-pg";
import { type LocalPluginHost } from "@appaloft/plugin-host";
import {
  type PluginCapability,
  type SystemPluginDefinition,
  type SystemPluginHttpMiddleware,
  type SystemPluginHttpRoute,
  type SystemPluginWebExtension,
  type SystemPluginWebHeadContribution,
} from "@appaloft/plugin-sdk";
import { container, type DependencyContainer } from "tsyringe";
import {
  createCertificateRetrySchedulerRunner,
  createDisabledCertificateRetrySchedulerRunner,
} from "./certificate-retry-scheduler-runner";
import { writeBootstrapDeployTokenOutput } from "./deploy-token-bootstrap";
import { ShellDeploymentProgressReporter } from "./deployment-progress-reporter";
import { createDurableWorkRuntimeRunner } from "./durable-work-runtime-runner";
import { createExecutionSandboxMaintenanceRunner } from "./execution-sandbox-maintenance-runner";
import { writeBootstrapFirstAdminOutput } from "./first-admin-bootstrap";
import { adoptLegacyPgliteState } from "./legacy-pglite-state-adoption";
import {
  ConfigMaintenanceWorkerStatusReader,
  createDurableWorkerHeartbeatSnapshotProvider,
} from "./maintenance-worker-status-reader";
import {
  createDisabledPreviewCleanupRetrySchedulerRunner,
  createPreviewCleanupRetrySchedulerRunner,
} from "./preview-cleanup-retry-scheduler-runner";
import {
  createDisabledPreviewExpiryCleanupSchedulerRunner,
  createPreviewExpiryCleanupSchedulerRunner,
} from "./preview-expiry-cleanup-scheduler-runner";
import { registerApplicationServices } from "./register-application-services";
import { registerRuntimeDependencies } from "./register-runtime-dependencies";
import { createReloadableDatabase, type ReloadableDatabaseConnection } from "./reloadable-database";
import { SshRemoteStateWorkReadModel } from "./remote-state-work-read-model";
import { resourceAccessFailureRendererTargetForStartedServer } from "./resource-access-failure-renderer-target";
import {
  createDisabledRuntimeMonitoringCollectorRunner,
  createRuntimeMonitoringCollectorRunner,
} from "./runtime-monitoring-collector-runner";
import {
  createDisabledScheduledDependencyBackupRunner,
  createScheduledDependencyBackupRunner,
} from "./scheduled-dependency-backup-runner";
import {
  createDisabledScheduledHistoryRetentionRunner,
  createScheduledHistoryRetentionRunner,
} from "./scheduled-history-retention-runner";
import {
  createDisabledScheduledRuntimePruneRunner,
  createScheduledRuntimePruneRunner,
} from "./scheduled-runtime-prune-runner";
import {
  createDisabledScheduledStorageVolumeBackupRunner,
  createScheduledStorageVolumeBackupRunner,
} from "./scheduled-storage-volume-backup-runner";
import {
  createDisabledScheduledTaskRunner,
  createScheduledTaskRunner,
} from "./scheduled-task-runner";
import {
  createDisabledTunnelSessionReconciler,
  createTunnelSessionReconciler,
} from "./tunnel-session-reconciler";

type MaybePromise<T> = T | Promise<T>;

export type AppaloftHttpApp = ReturnType<typeof createHttpApp>;
type AppaloftHttpServerHandle = ReturnType<typeof Bun.serve>;
type AppaloftHttpAppWithListenServer = AppaloftHttpApp & {
  server?: AppaloftHttpServerHandle | null;
};

function startAppaloftHttpServer(input: {
  readonly app: AppaloftHttpApp;
  readonly hostname: string;
  readonly idleTimeoutSeconds?: number;
  readonly port: number;
}): AppaloftHttpServerHandle {
  const app = input.app as AppaloftHttpAppWithListenServer;
  app.listen({
    hostname: input.hostname,
    port: input.port,
    ...(input.idleTimeoutSeconds ? { idleTimeout: input.idleTimeoutSeconds } : {}),
  });

  const server = app.server;
  if (!server) {
    throw new Error("Appaloft HTTP server did not expose a Bun server handle.");
  }

  return server;
}

export interface AppaloftServer {
  config: AppConfig;
  logger: AppLogger;
  container: DependencyContainer;
  executionContextFactory: ExecutionContextFactory;
  httpApp: AppaloftHttpApp;
  startServer(): Promise<void>;
  startWorkerRuntime(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface AppaloftRemotePgliteStateSyncSession {
  dataRoot: string;
  localPgliteDataDir: string;
  readOnly?: boolean;
  target: SshRemoteStateTarget;
  releaseForCliRuntime(): Promise<Result<void>>;
  refreshLocalMirror(): Promise<Result<void>>;
}

export type AppaloftServerOrpcRouterContribution = Readonly<Record<string, unknown>>;

export interface AppaloftServerHttpExtension {
  middlewares?: readonly SystemPluginHttpMiddleware[];
  orpcRouterContributions?: readonly AppaloftServerOrpcRouterContribution[];
  routes?: readonly SystemPluginHttpRoute[];
  webHeadContributions?: readonly SystemPluginWebHeadContribution[];
  webExtensions?: readonly SystemPluginWebExtension[];
}

export interface AppaloftServerCompositionContext {
  config: AppConfig;
  database: ReloadableDatabaseConnection;
  logger: AppLogger;
  migrator: ReturnType<typeof createMigrator>;
}

export interface AppaloftServerAuthRuntimeContext extends AppaloftServerCompositionContext {
  authRuntime: AuthRuntime;
}

export interface AppaloftServerHttpContext extends AppaloftServerAuthRuntimeContext {
  http: {
    middlewares: SystemPluginHttpMiddleware[];
    orpcRouterContributions: AppaloftServerOrpcRouterContribution[];
    routes: SystemPluginHttpRoute[];
    systemPlugins: SystemPluginDefinition[];
    webHeadContributions: SystemPluginWebHeadContribution[];
    webExtensions: SystemPluginWebExtension[];
  };
}

export interface AppaloftServerContainerContext extends AppaloftServerHttpContext {
  container: DependencyContainer;
}

export interface AppaloftServerCreatedContext extends AppaloftServerContainerContext {
  server: AppaloftServer;
}

export interface AppaloftServerExtension {
  name: string;
  http?: AppaloftServerHttpExtension;
  systemPlugins?: readonly SystemPluginDefinition[];
  beforeCreateComposition?(context: AppaloftServerCompositionContext): MaybePromise<void>;
  createAuthRuntime?(
    context: AppaloftServerAuthRuntimeContext,
  ): MaybePromise<AuthRuntime | undefined>;
  configureHttp?(context: AppaloftServerHttpContext): MaybePromise<void>;
  configureRuntime?(context: AppaloftServerContainerContext): MaybePromise<void>;
  configureApplication?(context: AppaloftServerContainerContext): MaybePromise<void>;
  afterCreateComposition?(context: AppaloftServerCreatedContext): MaybePromise<void>;
}

export interface AppaloftServerOptions {
  config?: AppConfig;
  flags?: Partial<AppConfig>;
  embeddedWebAssets?: Readonly<Record<string, Blob>>;
  embeddedDocsAssets?: Readonly<Record<string, Blob>>;
  pgliteRuntimeAssets?: PgliteRuntimeAssets;
  remotePgliteStateSyncSession?: AppaloftRemotePgliteStateSyncSession;
  auditLogConsole?: {
    enabled?: boolean;
    routeEnabled?: boolean;
    webExtensionEnabled?: boolean;
  };
  authRuntime?: AuthRuntime;
  extensions?: readonly AppaloftServerExtension[];
  systemPlugins?: readonly SystemPluginDefinition[];
}

interface RequestContextRunnerOptions {
  providerAccessTokens?: ExecutionProviderAccessTokens;
}

interface RequestContextRunner extends IntegrationAuthPort {
  runWithRequest<T>(
    request: Request,
    context: ExecutionContext,
    callback: () => Promise<T>,
    options?: RequestContextRunnerOptions,
  ): Promise<T>;
}

function resolveToken<T>(dependencyContainer: DependencyContainer, token: symbol): T {
  return dependencyContainer.resolve(token as never) as T;
}

function resolveOptionalToken<T>(
  dependencyContainer: DependencyContainer,
  token: symbol,
): T | undefined {
  return dependencyContainer.isRegistered(token as never, true)
    ? (dependencyContainer.resolve(token as never) as T)
    : undefined;
}

function createCliSourceLinkStore(repository: SourceLinkRepository): CliSourceLinkStore {
  return {
    read(sourceFingerprint) {
      return repository.findOne(SourceLinkBySourceFingerprintSpec.create(sourceFingerprint));
    },
    async requireSameTargetOrMissing(sourceFingerprint, target) {
      const existing = await repository.findOne(
        SourceLinkBySourceFingerprintSpec.create(sourceFingerprint),
      );
      if (existing.isErr() || !existing.value) {
        return existing;
      }
      const record = existing.value;
      if (
        record.projectId === target.projectId &&
        record.environmentId === target.environmentId &&
        record.resourceId === target.resourceId &&
        record.serverId === target.serverId &&
        record.destinationId === target.destinationId
      ) {
        return existing;
      }

      return err(
        domainError.validation("Source link points at another deployment context", {
          phase: "source-link-resolution",
          sourceFingerprint,
          projectId: record.projectId,
          environmentId: record.environmentId,
          resourceId: record.resourceId,
        }),
      );
    },
    createIfMissing: async (input) => {
      const existing = await repository.findOne(
        SourceLinkBySourceFingerprintSpec.create(input.sourceFingerprint),
      );
      if (existing.isErr()) {
        return err(existing.error);
      }
      if (existing.value) {
        return ok(existing.value);
      }

      const record: SourceLinkRecord = {
        sourceFingerprint: input.sourceFingerprint,
        projectId: input.target.projectId,
        environmentId: input.target.environmentId,
        resourceId: input.target.resourceId,
        updatedAt: input.updatedAt,
        ...(input.target.serverId ? { serverId: input.target.serverId } : {}),
        ...(input.target.destinationId ? { destinationId: input.target.destinationId } : {}),
      };
      return repository.upsert(record, UpsertSourceLinkSpec.fromRecord(record));
    },
    recordDependencyProvenance: async (input) => {
      const existing = await repository.findOne(
        SourceLinkBySourceFingerprintSpec.create(input.sourceFingerprint),
      );
      if (existing.isErr()) {
        return err(existing.error);
      }
      if (existing.value) {
        const record = existing.value;
        if (
          record.projectId !== input.target.projectId ||
          record.environmentId !== input.target.environmentId ||
          record.resourceId !== input.target.resourceId ||
          record.serverId !== input.target.serverId ||
          record.destinationId !== input.target.destinationId
        ) {
          return err(
            domainError.validation("Source link points at another deployment context", {
              phase: "source-link-resolution",
              sourceFingerprint: input.sourceFingerprint,
              projectId: record.projectId,
              environmentId: record.environmentId,
              resourceId: record.resourceId,
            }),
          );
        }
      }

      const record: SourceLinkRecord = {
        ...(existing.value ?? {}),
        sourceFingerprint: input.sourceFingerprint,
        projectId: input.target.projectId,
        environmentId: input.target.environmentId,
        resourceId: input.target.resourceId,
        updatedAt: input.updatedAt,
        ...(input.target.serverId ? { serverId: input.target.serverId } : {}),
        ...(input.target.destinationId ? { destinationId: input.target.destinationId } : {}),
        dependencyProvenance: input.dependencyProvenance,
        ...(existing.value?.reason ? { reason: existing.value.reason } : {}),
      };
      return repository.upsert(record, UpsertSourceLinkSpec.fromRecord(record));
    },
  };
}

function createCliServerAppliedRouteStore(
  repository: ServerAppliedRouteStateRepository,
): CliServerAppliedRouteStateStore {
  return {
    upsertDesired(input) {
      const record = {
        routeSetId: [
          input.target.projectId,
          input.target.environmentId,
          input.target.resourceId,
          input.target.serverId,
          input.target.destinationId ?? "default",
        ].join(":"),
        projectId: input.target.projectId,
        environmentId: input.target.environmentId,
        resourceId: input.target.resourceId,
        serverId: input.target.serverId,
        ...(input.target.destinationId ? { destinationId: input.target.destinationId } : {}),
        ...(input.sourceFingerprint ? { sourceFingerprint: input.sourceFingerprint } : {}),
        domains: input.domains,
        status: "desired" as const,
        updatedAt: input.updatedAt,
      };
      return repository.upsert(record, UpsertServerAppliedRouteDesiredStateSpec.fromRecord(record));
    },
    read(target) {
      return repository.findOne(ServerAppliedRouteStateByTargetSpec.create(target));
    },
    async markApplied(input) {
      const routeSetId =
        input.routeSetId ??
        [
          input.target.projectId,
          input.target.environmentId,
          input.target.resourceId,
          input.target.serverId,
          input.target.destinationId ?? "default",
        ].join(":");

      return repository.updateOne(
        ServerAppliedRouteStateByRouteSetIdSpec.create(routeSetId),
        MarkServerAppliedRouteAppliedSpec.create({
          deploymentId: input.deploymentId,
          updatedAt: input.updatedAt,
          ...(input.providerKey ? { providerKey: input.providerKey } : {}),
          ...(input.proxyKind ? { proxyKind: input.proxyKind } : {}),
        }),
      );
    },
    async markFailed(input) {
      const routeSetId =
        input.routeSetId ??
        [
          input.target.projectId,
          input.target.environmentId,
          input.target.resourceId,
          input.target.serverId,
          input.target.destinationId ?? "default",
        ].join(":");

      return repository.updateOne(
        ServerAppliedRouteStateByRouteSetIdSpec.create(routeSetId),
        MarkServerAppliedRouteFailedSpec.create({
          deploymentId: input.deploymentId,
          updatedAt: input.updatedAt,
          phase: input.phase,
          errorCode: input.errorCode,
          retryable: input.retryable,
          ...(input.message ? { message: input.message } : {}),
          ...(input.providerKey ? { providerKey: input.providerKey } : {}),
          ...(input.proxyKind ? { proxyKind: input.proxyKind } : {}),
        }),
      );
    },
    deleteDesired(target) {
      return repository.deleteOne(ServerAppliedRouteStateByTargetSpec.create(target));
    },
    deleteDesiredBySourceFingerprint(sourceFingerprint) {
      return repository.deleteMany(
        ServerAppliedRouteStateBySourceFingerprintSpec.create(sourceFingerprint),
      );
    },
  };
}

async function resolveWebStaticDir(
  config: AppConfig,
  options?: AppaloftServerOptions,
): Promise<string | undefined> {
  if (
    config.webStaticDir ||
    options?.embeddedWebAssets ||
    Bun.env.APPALOFT_DEV_DISABLE_LOCAL_WEB_STATIC_DIR === "true"
  ) {
    return config.webStaticDir;
  }

  const localWebBuildDir = new URL("../../../apps/web/build/", import.meta.url);
  const localWebIndex = new URL("index.html", localWebBuildDir);

  return (await Bun.file(localWebIndex).exists()) ? fileURLToPath(localWebBuildDir) : undefined;
}

async function resolveDocsStaticDir(
  config: AppConfig,
  options?: AppaloftServerOptions,
): Promise<string | undefined> {
  if (
    config.docsStaticDir ||
    options?.embeddedDocsAssets ||
    Bun.env.APPALOFT_DEV_DISABLE_LOCAL_DOCS_STATIC_DIR === "true"
  ) {
    return config.docsStaticDir;
  }

  const localDocsBuildDir = new URL("../../../apps/docs/dist/", import.meta.url);
  const localDocsIndex = new URL("index.html", localDocsBuildDir);

  return (await Bun.file(localDocsIndex).exists()) ? fileURLToPath(localDocsBuildDir) : undefined;
}

function createConfiguredHttpExtensionPlugin(
  http: AppaloftServerHttpContext["http"],
): SystemPluginDefinition | null {
  const capabilities: PluginCapability[] = [];
  if (http.routes.length > 0) {
    capabilities.push("http-route");
  }
  if (http.middlewares.length > 0) {
    capabilities.push("http-middleware");
  }
  if (http.webHeadContributions.length > 0) {
    capabilities.push("web-head");
  }
  if (http.webExtensions.length > 0) {
    capabilities.push("web-page");
  }

  if (capabilities.length === 0) {
    return null;
  }

  return {
    manifest: {
      name: "server-configured-extensions",
      displayName: "Server Configured Extensions",
      description: "Runtime HTTP and web extensions registered through server composition.",
      version: "0.0.0",
      kind: "system-extension",
      compatibilityRange: "*",
      capabilities,
      entrypoint: "appaloft-server://configured-extensions",
    },
    ...(http.webHeadContributions.length > 0
      ? { webHeadContributions: http.webHeadContributions }
      : {}),
    ...(http.webExtensions.length > 0 ? { webExtensions: http.webExtensions } : {}),
    ...(http.middlewares.length > 0 || http.routes.length > 0
      ? {
          http: {
            ...(http.middlewares.length > 0 ? { middlewares: http.middlewares } : {}),
            ...(http.routes.length > 0 ? { routes: http.routes } : {}),
          },
        }
      : {}),
  };
}

async function configureServerExtensions(input: {
  context: AppaloftServerAuthRuntimeContext;
  extensions: readonly AppaloftServerExtension[];
  systemPlugins: readonly SystemPluginDefinition[];
}): Promise<AppaloftServerHttpContext["http"]> {
  const http: AppaloftServerHttpContext["http"] = {
    middlewares: [],
    orpcRouterContributions: [],
    routes: [],
    systemPlugins: [...input.systemPlugins],
    webHeadContributions: [],
    webExtensions: [],
  };

  for (const extension of input.extensions) {
    http.systemPlugins.push(...(extension.systemPlugins ?? []));
    http.middlewares.push(...(extension.http?.middlewares ?? []));
    http.orpcRouterContributions.push(...(extension.http?.orpcRouterContributions ?? []));
    http.routes.push(...(extension.http?.routes ?? []));
    http.webHeadContributions.push(...(extension.http?.webHeadContributions ?? []));
    http.webExtensions.push(...(extension.http?.webExtensions ?? []));
    await extension.configureHttp?.({
      ...input.context,
      http,
    });
  }

  const configuredHttpPlugin = createConfiguredHttpExtensionPlugin(http);
  if (configuredHttpPlugin) {
    http.systemPlugins.push(configuredHttpPlugin);
  }

  return http;
}

function configurePublicAuditLogConsoleExtension(input: {
  http: AppaloftServerHttpContext["http"];
  resolveExecutionContextFactory: () => ExecutionContextFactory | undefined;
  resolveQueryBus: () => QueryBus | undefined;
  routeEnabled: boolean;
  webExtensionEnabled: boolean;
}): void {
  if (input.webExtensionEnabled) {
    input.http.webExtensions.push(
      {
        key: "appaloft-audit-log.navigation",
        title: "Audit Log",
        localizations: {
          "zh-CN": {
            title: "审计日志",
            description: "查看 Appaloft 实例保留的审计事件。",
          },
          "en-US": {
            title: "Audit Log",
            description: "View retained audit events for this Appaloft instance.",
          },
        },
        description: "View retained audit events for this Appaloft instance.",
        icon: "shield",
        path: "/audit-log",
        placement: "navigation",
        target: "console-route",
        requiresAuth: true,
        metadata: {
          renderer: "console-page",
          pageEndpoint: "/audit-log/console-page?query={query}",
        },
      },
      {
        key: "appaloft-audit-log.project-route",
        title: "Audit Log",
        localizations: {
          "zh-CN": {
            title: "审计日志",
            description: "查看当前项目或资源相关的审计事件。",
          },
          "en-US": {
            title: "Audit Log",
            description: "View audit events related to the current project or resource.",
          },
        },
        description: "View audit events related to the current project or resource.",
        icon: "shield",
        path: "/projects",
        placement: "route",
        target: "console-route",
        requiresAuth: true,
        metadata: {
          renderer: "console-page",
          pageEndpoint:
            "/audit-log/console-page?projectId={projectId}&aggregateId={resourceId}&basePath={pathname}&query={query}",
        },
      },
      {
        key: "appaloft-audit-log.resource-route",
        title: "Audit Log",
        localizations: {
          "zh-CN": {
            title: "审计日志",
            description: "查看当前资源相关的审计事件。",
          },
          "en-US": {
            title: "Audit Log",
            description: "View audit events related to the current resource.",
          },
        },
        description: "View audit events related to the current resource.",
        icon: "shield",
        path: "/resources",
        placement: "route",
        target: "console-route",
        requiresAuth: true,
        metadata: {
          renderer: "console-page",
          pageEndpoint:
            "/audit-log/console-page?aggregateId={resourceId}&basePath={pathname}&query={query}",
        },
      },
    );
  }

  if (!input.routeEnabled) {
    return;
  }

  input.http.routes.push({
    method: "GET",
    path: "/audit-log/console-page",
    handle: async ({ request, query }) => {
      const sourcePageQuery = stringQuery(query, "query");
      const pageQuery = consolePageQuery(query);
      const locale = resolveAppaloftLocaleFromHeaders(request.headers);
      const t = createAppaloftTranslator({ locale });
      const executionContextFactory = input.resolveExecutionContextFactory();
      const queryBus = input.resolveQueryBus();
      if (!executionContextFactory || !queryBus) {
        return auditLogConsoleErrorPage(t, t(i18nKeys.console.auditLog.runtimeNotReady));
      }

      const range = stringQuery(pageQuery, "range");
      const days = range === "7d" ? 7 : 30;
      const to = new Date();
      const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
      const organizationId = stringQuery(pageQuery, "organizationId");
      const aggregateId = stringQuery(pageQuery, "aggregateId");
      const projectId = stringQuery(pageQuery, "projectId");
      const actions = stringQueries(pageQuery, "action");
      const resourceTypes = stringQueries(pageQuery, "resourceType");
      const actorIds = stringQueries(pageQuery, "actorId");
      const cursor = stringQuery(pageQuery, "cursor");
      const cursorStack = stringQueries(pageQuery, "cursorStack");
      const basePath = stringQuery(pageQuery, "basePath") ?? "/audit-log";
      const baseQuery = auditLogBaseQuery(sourcePageQuery);
      const pageLimit = 10;
      const auditQuery = ExportGlobalAuditEventsQuery.create({
        from: from.toISOString(),
        to: to.toISOString(),
        limit: pageLimit,
        order: "desc",
        ...(cursor ? { cursor } : {}),
        ...(aggregateId ? { aggregateId } : {}),
        ...(projectId && !aggregateId ? { projectId } : {}),
        ...(stringQuery(pageQuery, "eventType")
          ? { eventType: stringQuery(pageQuery, "eventType") }
          : {}),
        ...(organizationId ? { organizationId } : {}),
        ...(actions.length > 0 ? { action: actions } : {}),
        ...(resourceTypes.length > 0 ? { resourceType: resourceTypes } : {}),
        ...(actorIds.length > 0 ? { actorId: actorIds } : {}),
      });

      if (auditQuery.isErr()) {
        return auditLogConsoleErrorPage(t, auditQuery.error.message);
      }

      const requestId = request.headers.get("x-request-id") ?? undefined;
      const context = executionContextFactory.create({
        entrypoint: "http",
        locale,
        ...(requestId ? { requestId } : {}),
      });
      const result = await queryBus
        .execute(context, auditQuery.value)
        .catch((error: unknown) => err(error));

      return result.match(
        (readback) => {
          const events = readback.items;
          const filterState = {
            activeRange: range === "7d" ? "7d" : "30d",
            activeResourceTypes: resourceTypes,
            activeActions: actions,
            activeActorIds: actorIds,
            basePath,
            baseQuery,
          } satisfies AuditLogFilterState;
          const pagination = auditLogPagination({
            ...(cursor ? { cursor } : {}),
            cursorStack,
            filterState,
            limit: pageLimit,
            ...(readback.nextCursor ? { nextCursor: readback.nextCursor } : {}),
            rowCount: events.length,
            t,
          });

          return auditLogConsolePage({
            ...filterState,
            t,
            actionFilters: auditLogActionFilters(events, filterState, t),
            actorFilters: auditLogActorFilters(events, filterState, t),
            ...(pagination ? { pagination } : {}),
            events: events.map((event) => ({
              id: event.auditEventId,
              time: auditTimeCell(event.createdAt),
              actor: auditActorCell(event.payload),
              action: auditActionCell(t, event.eventType, event.payload),
              resource: auditResourceCell(t, event.aggregateId, event.payload),
              result: auditResultCell(
                t,
                auditPayloadString(event.payload, ["result", "outcome", "status"]) ?? "recorded",
              ),
            })),
          });
        },
        (error) => auditLogConsoleErrorPage(t, errorMessage(t, error)),
      );
    },
  });
}

function createPublicAuditLogConsoleServerExtension(input: {
  resolveExecutionContextFactory: () => ExecutionContextFactory | undefined;
  resolveQueryBus: () => QueryBus | undefined;
  routeEnabled: boolean;
  webExtensionEnabled: boolean;
}): AppaloftServerExtension {
  return {
    name: "public-audit-log-console",
    configureHttp({ http }) {
      configurePublicAuditLogConsoleExtension({
        http,
        resolveExecutionContextFactory: input.resolveExecutionContextFactory,
        resolveQueryBus: input.resolveQueryBus,
        routeEnabled: input.routeEnabled,
        webExtensionEnabled: input.webExtensionEnabled,
      });
    },
  };
}

type AuditLogFilterState = {
  activeRange: "7d" | "30d";
  activeResourceTypes: readonly string[];
  activeActions: readonly string[];
  activeActorIds: readonly string[];
  basePath: string;
  baseQuery: string;
};

function auditLogConsolePage(
  input: AuditLogFilterState & {
    actionFilters: ReturnType<typeof auditLogActionFilters>;
    actorFilters: ReturnType<typeof auditLogActorFilters>;
    pagination?: Record<string, unknown>;
    t: AppaloftTranslate;
    events: Array<{
      id: string;
      time: Record<string, unknown>;
      actor: Record<string, unknown>;
      action: Record<string, unknown>;
      resource: string | Record<string, unknown>;
      result: Record<string, unknown>;
    }>;
  },
): Record<string, unknown> {
  const { t } = input;

  return {
    schemaVersion: "appaloft.console.extension-page/v1",
    title: t(i18nKeys.console.auditLog.title),
    description: t(i18nKeys.console.auditLog.description),
    sections: [
      {
        kind: "table",
        height: "tall",
        filters: [
          {
            label: t(i18nKeys.console.auditLog.timeRange),
            items: auditLogRangeFilters(input, t),
          },
          {
            label: t(i18nKeys.console.auditLog.resourceType),
            type: "multi-select",
            items: auditLogResourceTypeFilters(input, t),
          },
          {
            label: t(i18nKeys.console.auditLog.actionFilter),
            type: "multi-select",
            items: input.actionFilters,
          },
          {
            label: t(i18nKeys.console.auditLog.actorFilter),
            type: "multi-select",
            items: input.actorFilters,
          },
        ],
        columns: [
          { key: "time", label: t(i18nKeys.console.auditLog.columnTime) },
          { key: "actor", label: t(i18nKeys.console.auditLog.columnActor) },
          { key: "action", label: t(i18nKeys.console.auditLog.columnAction) },
          { key: "resource", label: t(i18nKeys.console.auditLog.columnResource) },
          { key: "result", label: t(i18nKeys.console.auditLog.columnResult) },
        ],
        rows: input.events.map((event) => ({
          key: event.id,
          cells: {
            time: event.time,
            actor: event.actor,
            action: event.action,
            resource: event.resource,
            result: event.result,
          },
        })),
        ...(input.pagination ? { pagination: input.pagination } : {}),
        emptyLabel: t(i18nKeys.console.auditLog.empty),
      },
    ],
  };
}

function auditLogRangeFilters(filterState: AuditLogFilterState, t: AppaloftTranslate) {
  return [
    {
      label: t(i18nKeys.console.auditLog.last30Days),
      href: auditLogHref({ ...filterState, activeRange: "30d" }),
      active: filterState.activeRange === "30d",
    },
    {
      label: t(i18nKeys.console.auditLog.last7Days),
      href: auditLogHref({ ...filterState, activeRange: "7d" }),
      active: filterState.activeRange === "7d",
    },
  ];
}

function auditLogPagination(input: {
  cursor?: string;
  cursorStack: readonly string[];
  filterState: AuditLogFilterState;
  limit: number;
  nextCursor?: string;
  rowCount: number;
  t: AppaloftTranslate;
}): Record<string, unknown> | undefined {
  const { cursor, cursorStack, filterState, limit, nextCursor, rowCount, t } = input;
  if (!cursor && !nextCursor) {
    return undefined;
  }
  const previousCursor = cursor ? cursorStack.at(-1) : undefined;
  const previousStack = cursor ? cursorStack.slice(0, -1) : [];
  const nextStack = cursor ? [...cursorStack, cursor] : cursorStack;

  return {
    label: t(i18nKeys.console.auditLog.paginationLabel, { count: rowCount, limit }),
    previousLabel: t(i18nKeys.console.auditLog.previousPage),
    nextLabel: t(i18nKeys.console.auditLog.nextPage),
    ...(cursor
      ? {
          previousHref: auditLogHref(
            filterState,
            previousCursor
              ? {
                  cursor: previousCursor,
                  cursorStack: previousStack,
                }
              : {
                  cursorStack: previousStack,
                },
          ),
        }
      : {}),
    ...(nextCursor
      ? {
          nextHref: auditLogHref(filterState, {
            cursor: nextCursor,
            cursorStack: nextStack,
          }),
        }
      : {}),
  };
}

function auditLogResourceTypeFilters(filterState: AuditLogFilterState, t: AppaloftTranslate) {
  const resourceTypes = [
    { value: undefined, label: t(i18nKeys.console.auditLog.allResourceTypes), icon: "layers" },
    {
      value: "project",
      label: t(i18nKeys.console.auditLog.resourceTypes.project),
      icon: "folder-plus",
    },
    { value: "resource", label: t(i18nKeys.console.auditLog.resourceTypes.resource), icon: "box" },
    {
      value: "deployment",
      label: t(i18nKeys.console.auditLog.resourceTypes.deployment),
      icon: "rocket",
    },
    {
      value: "dependency_resource",
      label: t(i18nKeys.console.auditLog.resourceTypes.dependencyResource),
      icon: "database",
    },
    {
      value: "domain_binding",
      label: t(i18nKeys.console.auditLog.resourceTypes.domainBinding),
      icon: "globe",
    },
    { value: "server", label: t(i18nKeys.console.auditLog.resourceTypes.server), icon: "server" },
    {
      value: "static_artifact",
      label: t(i18nKeys.console.auditLog.resourceTypes.staticArtifact),
      icon: "file",
    },
    {
      value: "storage_volume",
      label: t(i18nKeys.console.auditLog.resourceTypes.storageVolume),
      icon: "hard-drive",
    },
  ];

  return resourceTypes.map((item) => ({
    label: item.label,
    icon: item.icon,
    href: auditLogHref({
      ...filterState,
      activeResourceTypes: item.value
        ? toggleFilterValue(filterState.activeResourceTypes, item.value)
        : [],
    }),
    active:
      (item.value ? filterState.activeResourceTypes.includes(item.value) : false) ||
      (filterState.activeResourceTypes.length === 0 && !item.value),
  }));
}

function auditLogActionFilters(
  events: readonly { eventType: string; payload: Record<string, unknown> }[],
  filterState: AuditLogFilterState,
  t: AppaloftTranslate,
) {
  const actions = new Set<string>();
  for (const event of events) {
    const action = auditPayloadString(event.payload, ["action"]) ?? event.eventType;
    if (action) {
      actions.add(action);
    }
  }
  for (const activeAction of filterState.activeActions) {
    actions.add(activeAction);
  }

  return [
    {
      label: t(i18nKeys.console.auditLog.allActions),
      href: auditLogHref({ ...filterState, activeActions: [] }),
      active: filterState.activeActions.length === 0,
    },
    ...Array.from(actions)
      .sort()
      .map((action) => ({
        label: auditActionLabel(t, action),
        href: auditLogHref({
          ...filterState,
          activeActions: toggleFilterValue(filterState.activeActions, action),
        }),
        active: filterState.activeActions.includes(action),
      })),
  ];
}

function auditLogActorFilters(
  events: readonly { payload: Record<string, unknown> }[],
  filterState: AuditLogFilterState,
  t: AppaloftTranslate,
) {
  const actors = new Map<string, string>();
  for (const event of events) {
    const actorId = auditPayloadString(event.payload, ["actorId", "userId"]);
    if (!actorId) {
      continue;
    }
    actors.set(actorId, auditPayloadString(event.payload, ["actorLabel", "actor"]) ?? actorId);
  }
  for (const activeActorId of filterState.activeActorIds) {
    if (!actors.has(activeActorId)) {
      actors.set(activeActorId, activeActorId);
    }
  }

  return [
    {
      label: t(i18nKeys.console.auditLog.allActors),
      href: auditLogHref({ ...filterState, activeActorIds: [] }),
      active: filterState.activeActorIds.length === 0,
    },
    ...Array.from(actors.entries()).map(([actorId, label]) => ({
      label,
      href: auditLogHref({
        ...filterState,
        activeActorIds: toggleFilterValue(filterState.activeActorIds, actorId),
      }),
      active: filterState.activeActorIds.includes(actorId),
    })),
  ];
}

function auditLogHref(
  input: AuditLogFilterState,
  page?: { cursor?: string; cursorStack?: readonly string[] },
): string {
  const query = new URLSearchParams(input.baseQuery);
  if (input.activeRange === "7d") {
    query.set("range", "7d");
  }
  for (const resourceType of input.activeResourceTypes) {
    query.append("resourceType", resourceType);
  }
  for (const action of input.activeActions) {
    query.append("action", action);
  }
  for (const actorId of input.activeActorIds) {
    query.append("actorId", actorId);
  }
  if (page?.cursor) {
    query.set("cursor", page.cursor);
  }
  for (const cursorStackEntry of page?.cursorStack ?? []) {
    query.append("cursorStack", cursorStackEntry);
  }
  const serialized = query.toString();
  const basePath = input.basePath || "/audit-log";
  return serialized ? `${basePath}?${serialized}` : basePath;
}

const auditLogOwnedQueryKeys = new Set([
  "range",
  "resourceType",
  "action",
  "actorId",
  "cursor",
  "cursorStack",
]);

function auditLogBaseQuery(serializedQuery: string | undefined): string {
  const source = new URLSearchParams(serializedQuery ?? "");
  const preserved = new URLSearchParams();
  for (const [key, value] of source.entries()) {
    if (!auditLogOwnedQueryKeys.has(key)) {
      preserved.append(key, value);
    }
  }
  return preserved.toString();
}

function toggleFilterValue(values: readonly string[], value: string): readonly string[] {
  if (values.includes(value)) {
    return values.filter((item) => item !== value);
  }
  return [...values, value].sort();
}

function auditLogConsoleErrorPage(t: AppaloftTranslate, message: string): Record<string, unknown> {
  return {
    schemaVersion: "appaloft.console.extension-page/v1",
    title: t(i18nKeys.console.auditLog.title),
    description: t(i18nKeys.console.auditLog.unavailableDescription),
    badge: t(i18nKeys.console.auditLog.unavailableBadge),
    sections: [
      {
        kind: "callouts",
        items: [
          {
            title: t(i18nKeys.console.auditLog.unavailableTitle),
            description: message,
            tone: "danger",
          },
        ],
      },
    ],
  };
}

function errorMessage(t: AppaloftTranslate, error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return t(i18nKeys.console.auditLog.errorFallback);
}

function auditTimeCell(createdAt: string): Record<string, unknown> {
  return {
    kind: "datetime",
    value: createdAt,
    format: "date-time",
  };
}

function auditActorCell(payload: Record<string, unknown>): Record<string, unknown> {
  const label =
    auditPayloadString(payload, ["actorLabel", "actor", "actorId", "userId"]) ??
    auditPayloadString(payload, ["actorKind"]) ??
    "-";
  const description = auditPayloadString(payload, ["actorKind", "entrypoint"]);
  return {
    kind: "actor",
    label,
    ...(description ? { description } : {}),
    initials: auditInitials(label),
  };
}

function auditActionCell(
  t: AppaloftTranslate,
  eventType: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const actionKey = auditActionKey(t, eventType, payload);
  return {
    kind: "icon-label",
    label: auditActionLabel(t, actionKey),
    icon: auditActionIcon(actionKey),
    tone: auditActionTone(actionKey),
  };
}

function auditActionKey(
  t: AppaloftTranslate,
  eventType: string,
  payload: Record<string, unknown>,
): string {
  const operationKey = auditPayloadString(payload, ["operationKey"]);
  if (operationKey) {
    const operationLabel = auditActionLabel(t, operationKey);
    if (operationLabel !== operationKey) {
      return operationKey;
    }
  }
  const action = auditPayloadString(payload, ["action"]);
  if (action) {
    const actionLabel = auditActionLabel(t, action);
    if (actionLabel !== action) {
      return action;
    }
  }
  return operationKey ?? action ?? eventType;
}

function auditActionLabel(t: AppaloftTranslate, eventType: string): string {
  switch (eventType) {
    case "create":
      return t(i18nKeys.console.auditLog.actionFilters.create);
    case "archive":
      return t(i18nKeys.console.auditLog.actionFilters.archive);
    case "restore":
      return t(i18nKeys.console.auditLog.actionFilters.restore);
    case "delete":
      return t(i18nKeys.console.auditLog.actionFilters.delete);
    case "rename":
      return t(i18nKeys.console.auditLog.actionFilters.rename);
    case "publish":
      return t(i18nKeys.console.auditLog.actionFilters.publish);
    case "retry":
      return t(i18nKeys.console.auditLog.actionFilters.retry);
    case "redeploy":
      return t(i18nKeys.console.auditLog.actionFilters.redeploy);
    case "rollback":
      return t(i18nKeys.console.auditLog.actionFilters.rollback);
    case "cancel":
      return t(i18nKeys.console.auditLog.actionFilters.cancel);
    case "set-variable":
      return t(i18nKeys.console.auditLog.actionFilters.setVariable);
    case "set-description":
      return t(i18nKeys.console.auditLog.actions.projectsSetDescription);
    case "deployment-succeeded":
      return t(i18nKeys.console.auditLog.actionFilters.succeeded);
    case "deployment-failed":
      return t(i18nKeys.console.auditLog.actionFilters.failed);
    case "projects.create":
      return t(i18nKeys.console.auditLog.actions.projectsCreate);
    case "projects.set-description":
      return t(i18nKeys.console.auditLog.actions.projectsSetDescription);
    case "projects.archive":
      return t(i18nKeys.console.auditLog.actions.projectsArchive);
    case "resources.create":
    case "resource-created":
      return t(i18nKeys.console.auditLog.actions.resourceCreated);
    case "deployments.create":
      return t(i18nKeys.console.auditLog.actions.deploymentsCreate);
    case "dependency-resources.create":
    case "dependency-resources.create-backup":
      return t(i18nKeys.console.auditLog.actions.dependencyResourcesCreate);
    case "domain-bindings.create":
      return t(i18nKeys.console.auditLog.actions.domainBindingsCreate);
    case "servers.create":
      return t(i18nKeys.console.auditLog.actions.serversCreate);
    case "static-artifacts.publish":
      return t(i18nKeys.console.auditLog.actions.staticArtifactsPublish);
    case "server-capacity-pruned":
      return t(i18nKeys.console.auditLog.actions.serverCapacityPruned);
    case "storage-volume-runtime-cleaned":
      return t(i18nKeys.console.auditLog.actions.storageVolumeRuntimeCleaned);
    case "terminal-session-opened":
      return t(i18nKeys.console.auditLog.actions.terminalSessionOpened);
    case "terminal-session-closed":
      return t(i18nKeys.console.auditLog.actions.terminalSessionClosed);
    case "resource-variable-set":
      return t(i18nKeys.console.auditLog.actions.resourceVariableSet);
    case "server-renamed":
    case "servers.rename":
      return t(i18nKeys.console.auditLog.actions.serverRenamed);
    default:
      return eventType;
  }
}

function auditActionIcon(eventType: string): string {
  switch (eventType) {
    case "projects.create":
      return "folder-plus";
    case "projects.set-description":
      return "pencil";
    case "resources.create":
    case "resource-created":
      return "box";
    case "deployments.create":
    case "redeploy":
      return "rocket";
    case "dependency-resources.create":
    case "dependency-resources.create-backup":
      return "plug";
    case "domain-bindings.create":
      return "plug";
    case "servers.create":
      return "plus";
    case "static-artifacts.publish":
    case "publish":
      return "upload";
    case "projects.archive":
    case "archive":
      return "archive";
    case "restore":
    case "rollback":
      return "undo";
    case "delete":
      return "trash";
    case "rename":
    case "server-renamed":
    case "servers.rename":
    case "set-description":
      return "pencil";
    case "retry":
      return "refresh";
    case "set-variable":
    case "resource-variable-set":
      return "sliders";
    case "deployment-succeeded":
      return "check";
    case "deployment-failed":
    case "cancel":
      return "x";
    default:
      return eventType.endsWith(".create") || eventType === "create" ? "plus" : "activity";
  }
}

function auditActionTone(eventType: string): "positive" | "warning" | "danger" | "muted" {
  switch (eventType) {
    case "deployment-succeeded":
      return "positive";
    case "deployment-failed":
    case "delete":
    case "cancel":
      return "danger";
    case "archive":
    case "projects.archive":
    case "rollback":
      return "warning";
    default:
      return "muted";
  }
}

function auditResourceCell(
  t: AppaloftTranslate,
  aggregateId: string,
  payload: Record<string, unknown>,
): string | Record<string, unknown> {
  const resourceType = auditPayloadString(payload, ["resourceType"]);
  const resourceId =
    auditPayloadString(payload, ["resourceId"]) ??
    auditPayloadString(payload, ["projectId", "deploymentId", "serverId", "domainBindingId"]) ??
    aggregateId;
  if (!resourceType || !resourceId) {
    return aggregateId;
  }

  const typeLabel = auditResourceTypeLabel(t, resourceType);
  const label = `${typeLabel}:${resourceId}`;
  const href = auditResourceHref(resourceType, resourceId);
  if (!href) {
    return label;
  }

  return {
    kind: "link",
    label,
    href,
  };
}

function auditResourceTypeLabel(t: AppaloftTranslate, resourceType: string): string {
  switch (resourceType) {
    case "project":
      return t(i18nKeys.console.auditLog.resourceTypes.project);
    case "resource":
      return t(i18nKeys.console.auditLog.resourceTypes.resource);
    case "deployment":
      return t(i18nKeys.console.auditLog.resourceTypes.deployment);
    case "dependency_resource":
      return t(i18nKeys.console.auditLog.resourceTypes.dependencyResource);
    case "domain_binding":
      return t(i18nKeys.console.auditLog.resourceTypes.domainBinding);
    case "server":
      return t(i18nKeys.console.auditLog.resourceTypes.server);
    case "static_artifact":
      return t(i18nKeys.console.auditLog.resourceTypes.staticArtifact);
    case "storage_volume":
      return t(i18nKeys.console.auditLog.resourceTypes.storageVolume);
    default:
      return resourceType;
  }
}

function auditResourceHref(resourceType: string, resourceId: string): string | undefined {
  switch (resourceType) {
    case "project":
      return `/projects/${encodeURIComponent(resourceId)}`;
    case "resource":
      return `/resources/${encodeURIComponent(resourceId)}`;
    case "deployment":
      return `/deployments/${encodeURIComponent(resourceId)}`;
    case "dependency_resource":
      return `/dependency-resources/${encodeURIComponent(resourceId)}`;
    case "domain_binding":
      return `/domain-bindings/${encodeURIComponent(resourceId)}`;
    case "server":
      return `/servers/${encodeURIComponent(resourceId)}`;
    default:
      return undefined;
  }
}

function auditResultCell(t: AppaloftTranslate, result: string): Record<string, unknown> {
  return {
    kind: "badge",
    label: auditResultLabel(t, result),
    tone: auditResultTone(result),
  };
}

function auditResultLabel(t: AppaloftTranslate, result: string): string {
  switch (result.toLowerCase()) {
    case "success":
    case "succeeded":
      return t(i18nKeys.console.auditLog.resultSuccess);
    case "failure":
    case "failed":
    case "error":
      return t(i18nKeys.console.auditLog.resultFailure);
    case "skipped":
      return t(i18nKeys.console.auditLog.resultSkipped);
    case "recorded":
      return t(i18nKeys.console.auditLog.resultRecorded);
    default:
      return result;
  }
}

function auditResultTone(result: string): "positive" | "warning" | "danger" | "muted" {
  switch (result.toLowerCase()) {
    case "success":
    case "succeeded":
      return "positive";
    case "failure":
    case "failed":
    case "error":
      return "danger";
    case "skipped":
      return "warning";
    default:
      return "muted";
  }
}

function auditInitials(label: string): string {
  const words = label
    .split(/[\s@._-]+/)
    .map((word) => word.trim())
    .filter(Boolean);
  return (
    words
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() ?? "")
      .join("") || "AP"
  );
}

function auditPayloadString(
  payload: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
  }
  return undefined;
}

function stringQuery(query: URLSearchParams, name: string): string | undefined {
  const value = query.get(name)?.trim();
  return value ? value : undefined;
}

function stringQueries(query: URLSearchParams, name: string): readonly string[] {
  return Array.from(
    new Set(
      query
        .getAll(name)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function consolePageQuery(query: URLSearchParams): URLSearchParams {
  const nested = stringQuery(query, "query");
  if (!nested) {
    return query;
  }
  const merged = new URLSearchParams(nested);
  for (const [key, value] of query.entries()) {
    if (key !== "query" && !merged.has(key)) {
      merged.append(key, value);
    }
  }
  return merged;
}

export async function createAppaloftServer(
  options: AppaloftServerOptions = {},
): Promise<AppaloftServer> {
  const config = options.config ?? resolveConfig(options.flags ? { flags: options.flags } : {});
  const logger = createLogger(config);
  const telemetry = await bootstrapOpenTelemetry(config);
  const database = await createReloadableDatabase({
    driver: config.databaseDriver,
    pgliteDataDir: config.pgliteDataDir,
    ...(config.databasePoolMax ? { databasePoolMax: config.databasePoolMax } : {}),
    ...(options?.pgliteRuntimeAssets ? { pgliteRuntimeAssets: options.pgliteRuntimeAssets } : {}),
    ...(config.databaseUrl ? { databaseUrl: config.databaseUrl } : {}),
  });
  const migrator = createMigrator(database.db);
  const deploymentProgressReporter = new ShellDeploymentProgressReporter();
  const remotePgliteStateSyncSession = options?.remotePgliteStateSyncSession;

  if (
    (config.databaseDriver === "pglite" || config.autoMigrate) &&
    remotePgliteStateSyncSession?.readOnly !== true
  ) {
    const migration = await migrator.migrateToLatest();
    if (migration.error) {
      await database.close();
      throw migration.error;
    }
  }

  let auditLogConsoleExecutionContextFactory: ExecutionContextFactory | undefined;
  let auditLogConsoleQueryBus: QueryBus | undefined;
  const auditLogConsoleExtensions =
    options.auditLogConsole?.enabled === false
      ? []
      : [
          createPublicAuditLogConsoleServerExtension({
            resolveExecutionContextFactory: () => auditLogConsoleExecutionContextFactory,
            resolveQueryBus: () => auditLogConsoleQueryBus,
            routeEnabled: options.auditLogConsole?.routeEnabled !== false,
            webExtensionEnabled: options.auditLogConsole?.webExtensionEnabled !== false,
          }),
        ];
  const extensions = [...auditLogConsoleExtensions, ...(options.extensions ?? [])];
  const compositionContext: AppaloftServerCompositionContext = {
    config,
    database,
    logger,
    migrator,
  };

  for (const extension of extensions) {
    await extension.beforeCreateComposition?.(compositionContext);
  }

  const sourceLinkRepository = new PgSourceLinkRepository(database.db);
  const serverAppliedRouteRepository = new PgServerAppliedRouteStateRepository(database.db);
  const sourceLinkStore = createCliSourceLinkStore(sourceLinkRepository);
  const serverAppliedRouteStore = createCliServerAppliedRouteStore(serverAppliedRouteRepository);
  if (config.databaseDriver === "pglite" && remotePgliteStateSyncSession?.readOnly !== true) {
    await adoptLegacyPgliteState({
      pgliteDataDir: config.pgliteDataDir,
      sourceLinkStore,
      serverAppliedRouteStore,
      logger,
    });
  }
  let resourceAccessFailureRendererTarget: ReturnType<
    typeof resourceAccessFailureRendererTargetForStartedServer
  >;

  const authTrustedOrigins = Array.from(
    new Set([config.webOrigin, ...(config.betterAuthTrustedOrigins ?? [])]),
  );

  let authRuntime =
    options.authRuntime ??
    createBetterAuthRuntime({
      enabled: config.authProvider === "better-auth",
      baseURL: config.betterAuthBaseUrl,
      secret: config.betterAuthSecret,
      database: {
        db: database.db,
        type: "postgres",
      },
      ...(config.betterAuthCookieDomain ? { cookieDomain: config.betterAuthCookieDomain } : {}),
      ...(config.betterAuthCookiePrefix ? { cookiePrefix: config.betterAuthCookiePrefix } : {}),
      ...(config.betterAuthMinPasswordLength
        ? { minPasswordLength: config.betterAuthMinPasswordLength }
        : {}),
      ...(config.betterAuthTrustedProxyHeaders !== undefined
        ? { trustedProxyHeaders: config.betterAuthTrustedProxyHeaders }
        : {}),
      ...(config.githubClientId ? { githubClientId: config.githubClientId } : {}),
      ...(config.githubClientSecret ? { githubClientSecret: config.githubClientSecret } : {}),
      ...(config.githubRedirectUri ? { githubRedirectUri: config.githubRedirectUri } : {}),
      ...(config.googleClientId ? { googleClientId: config.googleClientId } : {}),
      ...(config.googleClientSecret ? { googleClientSecret: config.googleClientSecret } : {}),
      ...(config.googleRedirectUri ? { googleRedirectUri: config.googleRedirectUri } : {}),
      ...(config.oidcClientId ? { oidcClientId: config.oidcClientId } : {}),
      ...(config.oidcClientSecret ? { oidcClientSecret: config.oidcClientSecret } : {}),
      ...(config.oidcDiscoveryUrl ? { oidcDiscoveryUrl: config.oidcDiscoveryUrl } : {}),
      ...(config.oidcIssuer ? { oidcIssuer: config.oidcIssuer } : {}),
      ...(config.oidcRedirectUri ? { oidcRedirectUri: config.oidcRedirectUri } : {}),
      logger,
      trustedOrigins: authTrustedOrigins,
    });

  let authRuntimeContext: AppaloftServerAuthRuntimeContext = {
    ...compositionContext,
    authRuntime,
  };
  for (const extension of extensions) {
    const extensionAuthRuntime = await extension.createAuthRuntime?.(authRuntimeContext);
    if (extensionAuthRuntime) {
      authRuntime = extensionAuthRuntime;
      authRuntimeContext = {
        ...compositionContext,
        authRuntime,
      };
    }
  }

  const httpExtensions = await configureServerExtensions({
    context: authRuntimeContext,
    extensions,
    systemPlugins: options.systemPlugins ?? [],
  });
  const httpContext: AppaloftServerHttpContext = {
    ...authRuntimeContext,
    http: httpExtensions,
  };
  const childContainer = container.createChildContainer();

  registerRuntimeDependencies(childContainer, {
    config,
    logger,
    database,
    migrator,
    authRuntime,
    deploymentProgressReporter,
    ...(remotePgliteStateSyncSession ? { remotePgliteStateSyncSession } : {}),
    ...(remotePgliteStateSyncSession
      ? {
          refreshRemotePgliteState: async () => {
            const refreshed = await remotePgliteStateSyncSession.refreshLocalMirror();
            if (refreshed.isErr()) {
              return refreshed;
            }

            await database.reload();
            return ok(undefined);
          },
        }
      : {}),
    sourceLinkRepository,
    serverAppliedRouteStateRepository: serverAppliedRouteRepository,
    systemPlugins: httpExtensions.systemPlugins,
    ...(remotePgliteStateSyncSession
      ? {
          remoteStateWorkReadModel: new SshRemoteStateWorkReadModel({
            target: remotePgliteStateSyncSession.target,
            dataRoot: remotePgliteStateSyncSession.dataRoot,
          }),
        }
      : {}),
    resourceAccessFailureRenderer: () => resourceAccessFailureRendererTarget,
  });

  const containerContext: AppaloftServerContainerContext = {
    ...httpContext,
    container: childContainer,
  };
  for (const extension of extensions) {
    await extension.configureRuntime?.(containerContext);
  }

  const idGenerator = resolveToken<IdGenerator>(childContainer, tokens.idGenerator);
  const executionContextFactory = createExecutionContextFactory({
    idGenerator,
    tracer: telemetry.tracer,
  });
  auditLogConsoleExecutionContextFactory = executionContextFactory;
  const durableWorkHeartbeatStore = resolveToken<DurableWorkWorkerHeartbeatStore>(
    childContainer,
    tokens.durableWorkWorkerHeartbeatStore,
  );
  childContainer.registerInstance(
    tokens.maintenanceWorkerStatusReader,
    new ConfigMaintenanceWorkerStatusReader(
      config,
      createDurableWorkerHeartbeatSnapshotProvider({
        heartbeatStore: durableWorkHeartbeatStore,
        executionContextFactory,
      }),
    ),
  );

  registerApplicationServices(childContainer, { dataDir: config.dataDir });
  for (const extension of extensions) {
    await extension.configureApplication?.(containerContext);
  }

  const commandBus = resolveToken<CommandBus>(childContainer, tokens.commandBus);
  const queryBus = resolveToken<QueryBus>(childContainer, tokens.queryBus);
  auditLogConsoleQueryBus = queryBus;
  const sourceEventVerificationPort = resolveToken<SourceEventVerificationPort>(
    childContainer,
    tokens.sourceEventVerificationPort,
  );
  const githubSourceEventWebhookVerifier = resolveToken<GitHubSourceEventWebhookVerifier>(
    childContainer,
    tokens.githubSourceEventWebhookVerifier,
  );
  const githubPreviewPullRequestWebhookVerifier =
    resolveToken<GitHubPreviewPullRequestWebhookVerifier>(
      childContainer,
      tokens.githubPreviewPullRequestWebhookVerifier,
    );
  const deployTokenRepository = resolveToken<DeployTokenRepository>(
    childContainer,
    tokens.deployTokenRepository,
  );
  const clock = resolveToken<Clock>(childContainer, tokens.clock);
  const actionDeployTokenAuthorizationPort: ActionDeployTokenAuthorizationPort | undefined =
    config.actionDeployToken
      ? new StaticActionDeployTokenAuthorizationPort({
          ...(config.actionDeployTokenScope ? { scope: config.actionDeployTokenScope } : {}),
          token: config.actionDeployToken,
        })
      : new PersistedActionDeployTokenAuthorizationPort({
          clock,
          repository: deployTokenRepository,
        });
  if (config.bootstrapDeployTokenOutputFile) {
    const bootstrapDeployTokenOutput = await writeBootstrapDeployTokenOutput({
      config,
      commandBus,
      queryBus,
      executionContextFactory,
    });
    if (bootstrapDeployTokenOutput.isErr()) {
      throw new Error(bootstrapDeployTokenOutput.error.message);
    }
  }
  const pluginRuntime = resolveToken<LocalPluginHost>(childContainer, tokens.pluginRegistry);
  const requestContextRunner = resolveToken<RequestContextRunner>(
    childContainer,
    tokens.integrationAuthPort,
  );
  const terminalSessionGateway = resolveToken<TerminalSessionGateway>(
    childContainer,
    tokens.terminalSessionGateway,
  );
  const certificateHttpChallengeTokenStore = resolveToken<CertificateHttpChallengeTokenStore>(
    childContainer,
    tokens.certificateHttpChallengeTokenStore,
  );
  const resourceAccessFailureEvidenceRecorder = resolveToken<ResourceAccessFailureEvidenceRecorder>(
    childContainer,
    tokens.resourceAccessFailureEvidenceRecorder,
  );
  const resourceAccessRouteContextLookup = resolveToken<AutomaticRouteContextLookup>(
    childContainer,
    tokens.automaticRouteContextLookupService,
  );
  const certificateRetrySchedulerRunner = config.certificateRetryScheduler.enabled
    ? createCertificateRetrySchedulerRunner({
        config: config.certificateRetryScheduler,
        scheduler: resolveToken<CertificateRetryScheduler>(
          childContainer,
          tokens.certificateRetryScheduler,
        ),
        executionContextFactory,
        logger,
      })
    : createDisabledCertificateRetrySchedulerRunner();
  const previewCleanupRetrySchedulerRunner = config.previewCleanupRetryScheduler.enabled
    ? createPreviewCleanupRetrySchedulerRunner({
        config: config.previewCleanupRetryScheduler,
        scheduler: resolveToken<PreviewCleanupRetryScheduler>(
          childContainer,
          tokens.previewCleanupRetryScheduler,
        ),
        mutationCoordinator: resolveToken<MutationCoordinator>(
          childContainer,
          tokens.mutationCoordinator,
        ),
        executionContextFactory,
        logger,
      })
    : createDisabledPreviewCleanupRetrySchedulerRunner();
  const previewExpiryCleanupSchedulerRunner = config.previewExpiryCleanupScheduler.enabled
    ? createPreviewExpiryCleanupSchedulerRunner({
        config: config.previewExpiryCleanupScheduler,
        scheduler: resolveToken<PreviewExpiryCleanupScheduler>(
          childContainer,
          tokens.previewExpiryCleanupScheduler,
        ),
        mutationCoordinator: resolveToken<MutationCoordinator>(
          childContainer,
          tokens.mutationCoordinator,
        ),
        executionContextFactory,
        logger,
      })
    : createDisabledPreviewExpiryCleanupSchedulerRunner();
  const scheduledTaskRunner = config.scheduledTaskRunner.enabled
    ? createScheduledTaskRunner({
        config: config.scheduledTaskRunner,
        scheduler: resolveToken<ScheduledTaskScheduler>(
          childContainer,
          tokens.scheduledTaskScheduler,
        ),
        worker: resolveToken<ScheduledTaskRunWorker>(childContainer, tokens.scheduledTaskRunWorker),
        processAttemptDeliveryCandidateReader: resolveToken<ProcessAttemptDeliveryCandidateReader>(
          childContainer,
          tokens.processAttemptDeliveryCandidateReader,
        ),
        processAttemptRetryCandidateReader: resolveToken<ProcessAttemptRetryCandidateReader>(
          childContainer,
          tokens.processAttemptRetryCandidateReader,
        ),
        processAttemptRetryGenerator: resolveToken<ProcessAttemptRetryGenerator>(
          childContainer,
          tokens.processAttemptRetryGenerator,
        ),
        executionContextFactory,
        logger,
      })
    : createDisabledScheduledTaskRunner();
  const scheduledRuntimePruneRunner = config.scheduledRuntimePruneRunner.enabled
    ? createScheduledRuntimePruneRunner({
        config: config.scheduledRuntimePruneRunner,
        policyReadModel: resolveToken<ScheduledRuntimePrunePolicyReadModel>(
          childContainer,
          tokens.scheduledRuntimePrunePolicyReadModel,
        ),
        service: resolveToken<ScheduledRuntimePruneService>(
          childContainer,
          tokens.scheduledRuntimePruneService,
        ),
        executionContextFactory,
        logger,
      })
    : createDisabledScheduledRuntimePruneRunner();
  const scheduledDependencyBackupRunner = config.scheduledDependencyBackupRunner.enabled
    ? createScheduledDependencyBackupRunner({
        config: config.scheduledDependencyBackupRunner,
        policyRepository: resolveToken<DependencyResourceBackupPolicyRepository>(
          childContainer,
          tokens.dependencyResourceBackupPolicyRepository,
        ),
        service: resolveToken<ScheduledDependencyBackupService>(
          childContainer,
          tokens.scheduledDependencyBackupService,
        ),
        executionContextFactory,
        logger,
      })
    : createDisabledScheduledDependencyBackupRunner();
  const scheduledStorageVolumeBackupRunner = config.scheduledStorageVolumeBackupRunner.enabled
    ? createScheduledStorageVolumeBackupRunner({
        config: config.scheduledStorageVolumeBackupRunner,
        service: resolveToken<StorageVolumeBackupAutomationService>(
          childContainer,
          tokens.storageVolumeBackupAutomationService,
        ),
        executionContextFactory,
        logger,
      })
    : createDisabledScheduledStorageVolumeBackupRunner();
  const tunnelSessionReconciler = config.tunnelSessions.reconcilerEnabled
    ? createTunnelSessionReconciler({
        config: config.tunnelSessions,
        service: resolveToken<TunnelSessionService>(childContainer, tokens.tunnelSessionService),
        executionContextFactory,
        logger,
      })
    : createDisabledTunnelSessionReconciler();
  const scheduledHistoryRetentionRunner = config.scheduledHistoryRetentionRunner.enabled
    ? createScheduledHistoryRetentionRunner({
        config: config.scheduledHistoryRetentionRunner,
        service: resolveToken<ScheduledHistoryRetentionService>(
          childContainer,
          tokens.scheduledHistoryRetentionService,
        ),
        executionContextFactory,
        logger,
      })
    : createDisabledScheduledHistoryRetentionRunner();
  const runtimeMonitoringCollectorRunner = config.runtimeMonitoringCollectorRunner.enabled
    ? createRuntimeMonitoringCollectorRunner({
        config: config.runtimeMonitoringCollectorRunner,
        serverReadModel: resolveToken<ServerReadModel>(childContainer, tokens.serverReadModel),
        projectReadModel: resolveToken<ProjectReadModel>(childContainer, tokens.projectReadModel),
        environmentReadModel: resolveToken<EnvironmentReadModel>(
          childContainer,
          tokens.environmentReadModel,
        ),
        resourceReadModel: resolveToken<ResourceReadModel>(
          childContainer,
          tokens.resourceReadModel,
        ),
        service: resolveToken<RuntimeMonitoringCollectorService>(
          childContainer,
          tokens.runtimeMonitoringCollectorService,
        ),
        executionContextFactory,
        logger,
      })
    : createDisabledRuntimeMonitoringCollectorRunner();
  const durableWorkTopology = createDurableWorkTopology(config.workerRuntime);
  if (durableWorkTopology.isErr()) {
    throw new Error(durableWorkTopology.error.message);
  }
  const durableWorkHandlerRegistry = resolveOptionalToken<DurableWorkHandlerRegistry>(
    childContainer,
    tokens.durableWorkHandlerRegistry,
  );
  const durableWorkRuntimeRunner = createDurableWorkRuntimeRunner({
    topology: durableWorkTopology.value,
    adapter: resolveToken<DurableWorkQueueAdapter>(childContainer, tokens.durableWorkQueueAdapter),
    heartbeatStore: durableWorkHeartbeatStore,
    deploymentRepository: resolveToken<DeploymentRepository>(
      childContainer,
      tokens.deploymentRepository,
    ),
    deploymentLifecycleService: resolveToken<DeploymentLifecycleService>(
      childContainer,
      tokens.deploymentLifecycleService,
    ),
    executionBackend: resolveToken<ExecutionBackend>(childContainer, tokens.executionBackend),
    eventBus: resolveToken<EventBus>(childContainer, tokens.eventBus),
    processAttemptRecorder: resolveToken<ProcessAttemptRecorder>(
      childContainer,
      tokens.processAttemptRecorder,
    ),
    scheduledTaskRunWorker: resolveToken<ScheduledTaskRunWorker>(
      childContainer,
      tokens.scheduledTaskRunWorker,
    ),
    executionContextFactory,
    logger,
    ...(durableWorkHandlerRegistry ? { handlerRegistry: durableWorkHandlerRegistry } : {}),
  });
  const executionSandboxMaintenanceRunner = createExecutionSandboxMaintenanceRunner({
    service: resolveToken<ExecutionSandboxService>(childContainer, tokens.executionSandboxService),
    executionContextFactory,
    logger,
  });
  const webStaticDir = await resolveWebStaticDir(config, options);
  const docsStaticDir = await resolveDocsStaticDir(config, options);

  const httpApp = createHttpApp({
    config: {
      ...config,
      ...(webStaticDir ? { webStaticDir } : {}),
      ...(docsStaticDir ? { docsStaticDir } : {}),
    },
    commandBus,
    queryBus,
    logger,
    executionContextFactory,
    deploymentProgressObserver: deploymentProgressReporter,
    ...(httpExtensions.orpcRouterContributions.length > 0
      ? { orpcRouterContributions: httpExtensions.orpcRouterContributions }
      : {}),
    terminalSessionGateway,
    certificateHttpChallengeTokenStore,
    resourceAccessFailureEvidenceRecorder,
    resourceAccessRouteContextLookup,
    sourceEventVerificationPort,
    githubSourceEventWebhookVerifier,
    githubPreviewPullRequestWebhookVerifier,
    ...(actionDeployTokenAuthorizationPort ? { actionDeployTokenAuthorizationPort } : {}),
    actionSourcePackageConfigReader: createGitHubActionSourcePackageConfigReader(),
    pluginRuntime,
    authRuntime,
    requestContextRunner,
    ...(options?.embeddedWebAssets ? { embeddedWebAssets: options.embeddedWebAssets } : {}),
    ...(options?.embeddedDocsAssets ? { embeddedDocsAssets: options.embeddedDocsAssets } : {}),
  });

  let started = false;
  let firstAdminBootstrapChecked = false;
  let workerRuntimeStarted = false;
  let serverHandle: AppaloftHttpServerHandle | null = null;

  const bootstrapFirstAdminForHttpServer = async (): Promise<void> => {
    if (firstAdminBootstrapChecked) {
      return;
    }

    firstAdminBootstrapChecked = true;
    const bootstrapFirstAdminOutput = await writeBootstrapFirstAdminOutput({
      config,
      commandBus,
      queryBus,
      executionContextFactory,
    });
    if (bootstrapFirstAdminOutput.isErr()) {
      throw new Error(bootstrapFirstAdminOutput.error.message);
    }
  };

  const startWorkerRuntime = async (): Promise<void> => {
    if (workerRuntimeStarted) {
      return;
    }

    workerRuntimeStarted = true;
    logger.info("durable_worker_runtime.started", {
      mode: config.workerRuntime.mode,
      queueBackend: config.workerRuntime.queueBackend,
      workerCount: durableWorkTopology.value.expectedWorkerCount,
      workerGroup: config.workerRuntime.workerGroup,
      workerIds: durableWorkTopology.value.workers.map((worker) => worker.workerId),
      coordinationRole: durableWorkTopology.value.coordinationRole,
      ...(config.workerRuntime.externalBackendKind
        ? { externalBackendKind: config.workerRuntime.externalBackendKind }
        : {}),
    });

    await durableWorkRuntimeRunner.start();
    certificateRetrySchedulerRunner.start();
    previewExpiryCleanupSchedulerRunner.start();
    previewCleanupRetrySchedulerRunner.start();
    scheduledTaskRunner.start();
    scheduledRuntimePruneRunner.start();
    scheduledDependencyBackupRunner.start();
    scheduledStorageVolumeBackupRunner.start();
    tunnelSessionReconciler.start();
    scheduledHistoryRetentionRunner.start();
    runtimeMonitoringCollectorRunner.start();
    executionSandboxMaintenanceRunner.start();
  };

  const startServer = async (): Promise<void> => {
    if (started) {
      return;
    }

    await bootstrapFirstAdminForHttpServer();

    serverHandle = startAppaloftHttpServer({
      hostname: config.httpHost,
      ...(config.httpIdleTimeoutSeconds
        ? { idleTimeoutSeconds: config.httpIdleTimeoutSeconds }
        : {}),
      port: config.httpPort,
      app: httpApp,
    });
    started = true;
    resourceAccessFailureRendererTarget = resourceAccessFailureRendererTargetForStartedServer({
      config,
      ...(serverHandle.port ? { actualPort: serverHandle.port } : {}),
    });

    logger.info("http_server.started", {
      host: config.httpHost,
      port: serverHandle.port,
      webOrigin: config.webOrigin,
    });

    await startWorkerRuntime();
  };

  const server: AppaloftServer = {
    config,
    logger,
    container: childContainer,
    executionContextFactory,
    httpApp,
    startServer,
    startWorkerRuntime,
    async shutdown(): Promise<void> {
      certificateRetrySchedulerRunner.stop();
      previewExpiryCleanupSchedulerRunner.stop();
      previewCleanupRetrySchedulerRunner.stop();
      scheduledTaskRunner.stop();
      scheduledRuntimePruneRunner.stop();
      scheduledDependencyBackupRunner.stop();
      scheduledStorageVolumeBackupRunner.stop();
      tunnelSessionReconciler.stop();
      scheduledHistoryRetentionRunner.stop();
      runtimeMonitoringCollectorRunner.stop();
      executionSandboxMaintenanceRunner.stop();
      await durableWorkRuntimeRunner.stop();
      serverHandle?.stop?.();
      await telemetry.shutdown();
      await database.close();
    },
  };

  for (const extension of extensions) {
    await extension.afterCreateComposition?.({
      ...containerContext,
      server,
    });
  }

  return server;
}

export async function createAppComposition(
  flags?: Partial<AppConfig>,
  options?: Omit<AppaloftServerOptions, "config" | "flags">,
): Promise<AppaloftServer> {
  return createAppaloftServer({
    ...options,
    ...(flags ? { flags } : {}),
  });
}
