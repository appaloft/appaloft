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
  type TerminalSessionGateway,
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
} from "@appaloft/plugin-sdk";
import { container, type DependencyContainer } from "tsyringe";
import {
  createCertificateRetrySchedulerRunner,
  createDisabledCertificateRetrySchedulerRunner,
} from "./certificate-retry-scheduler-runner";
import { writeBootstrapDeployTokenOutput } from "./deploy-token-bootstrap";
import { ShellDeploymentProgressReporter } from "./deployment-progress-reporter";
import { createDurableWorkRuntimeRunner } from "./durable-work-runtime-runner";
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
  createDisabledScheduledTaskRunner,
  createScheduledTaskRunner,
} from "./scheduled-task-runner";

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
  target: SshRemoteStateTarget;
  releaseForCliRuntime(): Promise<Result<void>>;
  refreshLocalMirror(): Promise<Result<void>>;
}

export type AppaloftServerOrpcRouterContribution = Readonly<Record<string, unknown>>;

export interface AppaloftServerHttpExtension {
  middlewares?: readonly SystemPluginHttpMiddleware[];
  orpcRouterContributions?: readonly AppaloftServerOrpcRouterContribution[];
  routes?: readonly SystemPluginHttpRoute[];
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
    webExtensions: [],
  };

  for (const extension of input.extensions) {
    http.systemPlugins.push(...(extension.systemPlugins ?? []));
    http.middlewares.push(...(extension.http?.middlewares ?? []));
    http.orpcRouterContributions.push(...(extension.http?.orpcRouterContributions ?? []));
    http.routes.push(...(extension.http?.routes ?? []));
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
    input.http.webExtensions.push({
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
    });
  }

  if (!input.routeEnabled) {
    return;
  }

  input.http.routes.push({
    method: "GET",
    path: "/audit-log/console-page",
    handle: async ({ request, query }) => {
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
      const action = stringQuery(pageQuery, "action");
      const resourceType = stringQuery(pageQuery, "resourceType");
      const actorId = stringQuery(pageQuery, "actorId");
      const auditQuery = ExportGlobalAuditEventsQuery.create({
        from: from.toISOString(),
        to: to.toISOString(),
        limit: 100,
        ...(stringQuery(pageQuery, "aggregateId")
          ? { aggregateId: stringQuery(pageQuery, "aggregateId") }
          : {}),
        ...(stringQuery(pageQuery, "eventType")
          ? { eventType: stringQuery(pageQuery, "eventType") }
          : {}),
        ...(organizationId ? { organizationId } : {}),
        ...(action ? { action } : {}),
        ...(resourceType ? { resourceType } : {}),
        ...(actorId ? { actorId } : {}),
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
        (readback) =>
          auditLogConsolePage({
            activeRange: range === "7d" ? "7d" : "30d",
            ...(resourceType ? { activeResourceType: resourceType } : {}),
            t,
            events: readback.items
              .toSorted((left, right) => right.createdAt.localeCompare(left.createdAt))
              .map((event) => ({
                id: event.auditEventId,
                time: event.createdAt,
                actor:
                  auditPayloadString(event.payload, ["actorLabel", "actor", "actorId", "userId"]) ??
                  "-",
                action: auditActionLabel(
                  t,
                  auditPayloadString(event.payload, ["operationKey", "action"]) ?? event.eventType,
                ),
                resource:
                  auditResourceLabel(event.payload) ??
                  auditPayloadString(event.payload, ["resourceId"]) ??
                  event.aggregateId,
                result: auditResultLabel(
                  t,
                  auditPayloadString(event.payload, ["result", "outcome", "status"]) ?? "recorded",
                ),
              })),
          }),
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

function auditLogConsolePage(input: {
  activeRange: "7d" | "30d";
  activeResourceType?: string;
  t: AppaloftTranslate;
  events: Array<{
    id: string;
    time: string;
    actor: string;
    action: string;
    resource: string;
    result: string;
  }>;
}): Record<string, unknown> {
  const { t } = input;

  return {
    schemaVersion: "appaloft.console.extension-page/v1",
    title: t(i18nKeys.console.auditLog.title),
    description: t(i18nKeys.console.auditLog.description),
    sections: [
      {
        kind: "table",
        title: t(i18nKeys.console.auditLog.eventsTitle),
        description: t(i18nKeys.console.auditLog.eventsDescription),
        height: "tall",
        filters: [
          {
            label: t(i18nKeys.console.auditLog.timeRange),
            items: [
              {
                label: t(i18nKeys.console.auditLog.last30Days),
                href: "/audit-log",
                active: input.activeRange === "30d",
              },
              {
                label: t(i18nKeys.console.auditLog.last7Days),
                href: "/audit-log?range=7d",
                active: input.activeRange === "7d",
              },
            ],
          },
          {
            label: t(i18nKeys.console.auditLog.resourceType),
            items: auditLogResourceTypeFilters(input.activeRange, input.activeResourceType, t),
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
        emptyLabel: t(i18nKeys.console.auditLog.empty),
      },
    ],
  };
}

function auditLogResourceTypeFilters(
  activeRange: "7d" | "30d",
  activeResourceType: string | undefined,
  t: AppaloftTranslate,
) {
  const resourceTypes = [
    { value: undefined, label: t(i18nKeys.console.auditLog.allResourceTypes) },
    { value: "project", label: "Project" },
    { value: "resource", label: "Resource" },
    { value: "deployment", label: "Deployment" },
    { value: "dependency_resource", label: "Dependency resource" },
    { value: "domain_binding", label: "Domain binding" },
    { value: "server", label: "Server" },
    { value: "static_artifact", label: "Static artifact" },
    { value: "storage_volume", label: "Storage volume" },
  ];

  return resourceTypes.map((item) => ({
    label: item.label,
    href: auditLogHref({
      range: activeRange,
      ...(item.value ? { resourceType: item.value } : {}),
    }),
    active: activeResourceType === item.value || (!activeResourceType && !item.value),
  }));
}

function auditLogHref(input: { range: "7d" | "30d"; resourceType?: string }): string {
  const query = new URLSearchParams();
  if (input.range === "7d") {
    query.set("range", "7d");
  }
  if (input.resourceType) {
    query.set("resourceType", input.resourceType);
  }
  const serialized = query.toString();
  return serialized ? `/audit-log?${serialized}` : "/audit-log";
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

function auditActionLabel(t: AppaloftTranslate, eventType: string): string {
  switch (eventType) {
    case "projects.create":
      return t(i18nKeys.console.auditLog.actions.projectsCreate);
    case "projects.archive":
      return t(i18nKeys.console.auditLog.actions.projectsArchive);
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
    case "resource-created":
      return t(i18nKeys.console.auditLog.actions.resourceCreated);
    case "server-renamed":
      return t(i18nKeys.console.auditLog.actions.serverRenamed);
    default:
      return eventType;
  }
}

function auditResourceLabel(payload: Record<string, unknown>): string | undefined {
  const resourceType = auditPayloadString(payload, ["resourceType"]);
  const resourceId = auditPayloadString(payload, ["resourceId"]);
  if (!resourceType || !resourceId) {
    return undefined;
  }
  return `${resourceType}:${resourceId}`;
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

function consolePageQuery(query: URLSearchParams): URLSearchParams {
  const nested = stringQuery(query, "query");
  if (!nested) {
    return query;
  }
  const merged = new URLSearchParams(nested);
  for (const [key, value] of query.entries()) {
    if (key !== "query" && !merged.has(key)) {
      merged.set(key, value);
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

  if (config.databaseDriver === "pglite" || config.autoMigrate) {
    await migrator.migrateToLatest();
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
  const remotePgliteStateSyncSession = options?.remotePgliteStateSyncSession;

  if (config.databaseDriver === "pglite") {
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
    executionContextFactory,
    logger,
    ...(durableWorkHandlerRegistry ? { handlerRegistry: durableWorkHandlerRegistry } : {}),
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
    scheduledHistoryRetentionRunner.start();
    runtimeMonitoringCollectorRunner.start();
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
      scheduledHistoryRetentionRunner.stop();
      runtimeMonitoringCollectorRunner.stop();
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
