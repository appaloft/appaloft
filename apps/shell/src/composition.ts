import "reflect-metadata";

import { fileURLToPath } from "node:url";

import {
  type ServerAppliedRouteDesiredStateStore as CliServerAppliedRouteStateStore,
  type CliSourceLinkStore,
  createCliProgram,
  SshRemoteStateLifecycle,
  sshRemoteStateTargetFromDecision,
} from "@appaloft/adapter-cli";
import { createHttpApp } from "@appaloft/adapter-http-elysia";
import {
  type AppLogger,
  type CertificateHttpChallengeTokenStore,
  type CertificateRetryScheduler,
  type CommandBus,
  type ExecutionContext,
  type IdGenerator,
  type IntegrationAuthPort,
  MarkServerAppliedRouteAppliedSpec,
  MarkServerAppliedRouteFailedSpec,
  type QueryBus,
  ServerAppliedRouteStateByRouteSetIdSpec,
  ServerAppliedRouteStateByTargetSpec,
  type ServerAppliedRouteStateRepository,
  SourceLinkBySourceFingerprintSpec,
  type SourceLinkRecord,
  type SourceLinkRepository,
  type TerminalSessionGateway,
  tokens,
  UpsertServerAppliedRouteDesiredStateSpec,
  UpsertSourceLinkSpec,
} from "@appaloft/application";
import { createBetterAuthRuntime } from "@appaloft/auth-better";
import { type AppConfig, resolveConfig } from "@appaloft/config";
import { domainError, err, ok } from "@appaloft/core";
import {
  bootstrapOpenTelemetry,
  createExecutionContextFactory,
  createLogger,
} from "@appaloft/observability";
import {
  createDatabase,
  createMigrator,
  type PgliteRuntimeAssets,
  PgServerAppliedRouteStateRepository,
  PgSourceLinkRepository,
} from "@appaloft/persistence-pg";
import { type LocalPluginHost } from "@appaloft/plugin-host";
import { container, type DependencyContainer } from "tsyringe";
import { createCertificateRetrySchedulerRunner } from "./certificate-retry-scheduler-runner";
import { ShellDeploymentProgressReporter } from "./deployment-progress-reporter";
import { registerApplicationServices } from "./register-application-services";
import { registerRuntimeDependencies } from "./register-runtime-dependencies";
import { type RemotePgliteStateSyncSession } from "./remote-pglite-state-sync";
import { resourceAccessFailureRendererTargetForStartedServer } from "./resource-access-failure-renderer-target";

export interface AppComposition {
  config: AppConfig;
  logger: AppLogger;
  container: DependencyContainer;
  httpApp: ReturnType<typeof createHttpApp>;
  cliProgram: ReturnType<typeof createCliProgram>;
  startServer(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface ShellRuntimeOptions {
  embeddedWebAssets?: Readonly<Record<string, Blob>>;
  pgliteRuntimeAssets?: PgliteRuntimeAssets;
  remotePgliteStateSyncSession?: RemotePgliteStateSyncSession;
}

interface RequestContextRunner extends IntegrationAuthPort {
  runWithRequest<T>(
    request: Request,
    context: ExecutionContext,
    callback: () => Promise<T>,
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
        return existing;
      }
      if (existing.value) {
        return existing;
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
  };
}

async function resolveWebStaticDir(
  config: AppConfig,
  options?: ShellRuntimeOptions,
): Promise<string | undefined> {
  if (
    config.webStaticDir ||
    options?.embeddedWebAssets ||
    Bun.env.APPALOFT_DEV_DISABLE_LOCAL_WEB_STATIC_DIR === "true"
  ) {
    return config.webStaticDir;
  }

  const localWebBuildDir = new URL("../../web/build/", import.meta.url);
  const localWebIndex = new URL("index.html", localWebBuildDir);

  return (await Bun.file(localWebIndex).exists()) ? fileURLToPath(localWebBuildDir) : undefined;
}

export async function createAppComposition(
  flags?: Partial<AppConfig>,
  options?: ShellRuntimeOptions,
): Promise<AppComposition> {
  const config = resolveConfig(flags ? { flags } : {});
  const logger = createLogger(config);
  const telemetry = await bootstrapOpenTelemetry(config);
  const database = await createDatabase({
    driver: config.databaseDriver,
    pgliteDataDir: config.pgliteDataDir,
    ...(options?.pgliteRuntimeAssets ? { pgliteRuntimeAssets: options.pgliteRuntimeAssets } : {}),
    ...(config.databaseUrl ? { databaseUrl: config.databaseUrl } : {}),
  });
  const migrator = createMigrator(database.db);
  const deploymentProgressReporter = new ShellDeploymentProgressReporter();

  if (config.databaseDriver === "pglite") {
    await migrator.migrateToLatest();
  }
  const sourceLinkRepository = new PgSourceLinkRepository(database.db);
  const serverAppliedRouteRepository = new PgServerAppliedRouteStateRepository(database.db);
  const sourceLinkStore = createCliSourceLinkStore(sourceLinkRepository);
  const serverAppliedRouteStore = createCliServerAppliedRouteStore(serverAppliedRouteRepository);
  let resourceAccessFailureRendererTarget: ReturnType<
    typeof resourceAccessFailureRendererTargetForStartedServer
  >;

  const authRuntime = createBetterAuthRuntime({
    enabled: config.authProvider === "better-auth",
    baseURL: config.betterAuthBaseUrl,
    secret: config.betterAuthSecret,
    database: {
      db: database.db,
      type: "postgres",
    },
    ...(config.githubClientId ? { githubClientId: config.githubClientId } : {}),
    ...(config.githubClientSecret ? { githubClientSecret: config.githubClientSecret } : {}),
  });
  const childContainer = container.createChildContainer();

  registerRuntimeDependencies(childContainer, {
    config,
    logger,
    database,
    migrator,
    authRuntime,
    deploymentProgressReporter,
    sourceLinkRepository,
    serverAppliedRouteStateRepository: serverAppliedRouteRepository,
    resourceAccessFailureRenderer: () => resourceAccessFailureRendererTarget,
  });
  registerApplicationServices(childContainer);
  const idGenerator = resolveToken<IdGenerator>(childContainer, tokens.idGenerator);
  const commandBus = resolveToken<CommandBus>(childContainer, tokens.commandBus);
  const queryBus = resolveToken<QueryBus>(childContainer, tokens.queryBus);
  const executionContextFactory = createExecutionContextFactory({
    idGenerator,
    tracer: telemetry.tracer,
  });
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
  const certificateRetryScheduler = resolveToken<CertificateRetryScheduler>(
    childContainer,
    tokens.certificateRetryScheduler,
  );
  const certificateRetrySchedulerRunner = createCertificateRetrySchedulerRunner({
    config: config.certificateRetryScheduler,
    scheduler: certificateRetryScheduler,
    executionContextFactory,
    logger,
  });
  const webStaticDir = await resolveWebStaticDir(config, options);

  const httpApp = createHttpApp({
    config: webStaticDir ? { ...config, webStaticDir } : config,
    commandBus,
    queryBus,
    logger,
    executionContextFactory,
    deploymentProgressObserver: deploymentProgressReporter,
    terminalSessionGateway,
    certificateHttpChallengeTokenStore,
    pluginRuntime,
    authRuntime,
    requestContextRunner,
    ...(options?.embeddedWebAssets ? { embeddedStaticAssets: options.embeddedWebAssets } : {}),
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
  };

  const cliProgram = createCliProgram({
    version: config.appVersion,
    startServer,
    commandBus,
    queryBus,
    executionContextFactory,
    deploymentProgressObserver: deploymentProgressReporter,
    ...(sourceLinkStore ? { sourceLinkStore } : {}),
    serverAppliedRouteStore,
    prepareDeploymentStateBackend: async (decision) => {
      if (options?.remotePgliteStateSyncSession && decision.kind === "ssh-pglite") {
        return ok({
          dataRoot: options.remotePgliteStateSyncSession.dataRoot,
          schemaVersion: 1,
          release: options.remotePgliteStateSyncSession.releaseForCliRuntime,
        });
      }

      if (!decision.requiresRemoteStateLifecycle) {
        return ok({
          dataRoot: "",
          schemaVersion: 0,
          release: async () => ok(undefined),
        });
      }

      const target = sshRemoteStateTargetFromDecision(decision);
      if (target.isErr()) {
        return err(target.error);
      }

      return await new SshRemoteStateLifecycle({
        target: target.value,
        dataRoot: `${config.remoteRuntimeRoot.replace(/\/+$/, "")}/state`,
        owner: "appaloft-cli",
        correlationId: idGenerator.next("remote_state"),
      }).prepare();
    },
  });

  return {
    config,
    logger,
    container: childContainer,
    httpApp,
    cliProgram,
    startServer,
    async shutdown(): Promise<void> {
      certificateRetrySchedulerRunner.stop();
      serverHandle?.stop?.();
      await telemetry.shutdown();
      await database.close();
    },
  };
}
