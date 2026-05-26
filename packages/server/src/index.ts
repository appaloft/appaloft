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
  type DependencyResourceBackupPolicyRepository,
  type DeployTokenRepository,
  type EnvironmentReadModel,
  type ExecutionContext,
  type ExecutionContextFactory,
  type ExecutionProviderAccessTokens,
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
import { writeBootstrapFirstAdminOutput } from "./first-admin-bootstrap";
import { adoptLegacyPgliteState } from "./legacy-pglite-state-adoption";
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

export interface AppaloftServer {
  config: AppConfig;
  logger: AppLogger;
  container: DependencyContainer;
  executionContextFactory: ExecutionContextFactory;
  httpApp: AppaloftHttpApp;
  startServer(): Promise<void>;
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

export async function createAppaloftServer(
  options: AppaloftServerOptions = {},
): Promise<AppaloftServer> {
  const config = options.config ?? resolveConfig(options.flags ? { flags: options.flags } : {});
  const logger = createLogger(config);
  const telemetry = await bootstrapOpenTelemetry(config);
  const database = await createReloadableDatabase({
    driver: config.databaseDriver,
    pgliteDataDir: config.pgliteDataDir,
    ...(options?.pgliteRuntimeAssets ? { pgliteRuntimeAssets: options.pgliteRuntimeAssets } : {}),
    ...(config.databaseUrl ? { databaseUrl: config.databaseUrl } : {}),
  });
  const migrator = createMigrator(database.db);
  const deploymentProgressReporter = new ShellDeploymentProgressReporter();

  if (config.databaseDriver === "pglite" || config.autoMigrate) {
    await migrator.migrateToLatest();
  }

  const extensions = options.extensions ?? [];
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
      ...(config.betterAuthCookieDomain
        ? { cookieDomain: config.betterAuthCookieDomain }
        : {}),
      ...(config.betterAuthCookiePrefix
        ? { cookiePrefix: config.betterAuthCookiePrefix }
        : {}),
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
      trustedOrigins: [config.webOrigin],
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

  registerApplicationServices(childContainer, { dataDir: config.dataDir });
  for (const extension of extensions) {
    await extension.configureApplication?.(containerContext);
  }

  const idGenerator = resolveToken<IdGenerator>(childContainer, tokens.idGenerator);
  const commandBus = resolveToken<CommandBus>(childContainer, tokens.commandBus);
  const queryBus = resolveToken<QueryBus>(childContainer, tokens.queryBus);
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
  const executionContextFactory = createExecutionContextFactory({
    idGenerator,
    tracer: telemetry.tracer,
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
  const bootstrapFirstAdminOutput = await writeBootstrapFirstAdminOutput({
    config,
    commandBus,
    queryBus,
    executionContextFactory,
  });
  if (bootstrapFirstAdminOutput.isErr()) {
    throw new Error(bootstrapFirstAdminOutput.error.message);
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
  let serverHandle: ReturnType<typeof httpApp.listen> | null = null;

  const startServer = async (): Promise<void> => {
    if (started) {
      return;
    }

    serverHandle = httpApp.listen({
      hostname: config.httpHost,
      port: config.httpPort,
    });
    started = true;
    resourceAccessFailureRendererTarget = resourceAccessFailureRendererTargetForStartedServer({
      config,
      ...(httpApp.server?.port ? { actualPort: httpApp.server.port } : {}),
    });

    logger.info("http_server.started", {
      host: config.httpHost,
      port: config.httpPort,
      webOrigin: config.webOrigin,
    });

    certificateRetrySchedulerRunner.start();
    previewExpiryCleanupSchedulerRunner.start();
    previewCleanupRetrySchedulerRunner.start();
    scheduledTaskRunner.start();
    scheduledRuntimePruneRunner.start();
    scheduledDependencyBackupRunner.start();
    scheduledHistoryRetentionRunner.start();
    runtimeMonitoringCollectorRunner.start();
  };

  const server: AppaloftServer = {
    config,
    logger,
    container: childContainer,
    executionContextFactory,
    httpApp,
    startServer,
    async shutdown(): Promise<void> {
      certificateRetrySchedulerRunner.stop();
      previewExpiryCleanupSchedulerRunner.stop();
      previewCleanupRetrySchedulerRunner.stop();
      scheduledTaskRunner.stop();
      scheduledRuntimePruneRunner.stop();
      scheduledDependencyBackupRunner.stop();
      scheduledHistoryRetentionRunner.stop();
      runtimeMonitoringCollectorRunner.stop();
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
