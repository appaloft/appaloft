import "reflect-metadata";

import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createCliProgram,
  FileSystemServerAppliedRouteDesiredStateStore,
  FileSystemSourceLinkStore,
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
  type QueryBus,
  type TerminalSessionGateway,
  tokens,
} from "@appaloft/application";
import { createBetterAuthRuntime } from "@appaloft/auth-better";
import { type AppConfig, resolveConfig } from "@appaloft/config";
import { err, ok } from "@appaloft/core";
import {
  bootstrapOpenTelemetry,
  createExecutionContextFactory,
  createLogger,
} from "@appaloft/observability";
import { createDatabase, createMigrator, type PgliteRuntimeAssets } from "@appaloft/persistence-pg";
import { type LocalPluginHost } from "@appaloft/plugin-host";
import { container, type DependencyContainer } from "tsyringe";
import { createCertificateRetrySchedulerRunner } from "./certificate-retry-scheduler-runner";
import { ShellDeploymentProgressReporter } from "./deployment-progress-reporter";
import { registerApplicationServices } from "./register-application-services";
import { registerRuntimeDependencies } from "./register-runtime-dependencies";
import { type RemotePgliteStateSyncSession } from "./remote-pglite-state-sync";

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
  const localPgliteStateRoot =
    options?.remotePgliteStateSyncSession?.localDataRoot ?? dirname(config.pgliteDataDir);
  const sourceLinkStore =
    config.databaseDriver === "pglite"
      ? new FileSystemSourceLinkStore(localPgliteStateRoot)
      : undefined;
  const serverAppliedRouteStore =
    config.databaseDriver === "pglite"
      ? new FileSystemServerAppliedRouteDesiredStateStore(localPgliteStateRoot)
      : undefined;

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
    ...(sourceLinkStore ? { sourceLinkStore } : {}),
    ...(serverAppliedRouteStore
      ? { serverAppliedRouteDesiredStateReader: serverAppliedRouteStore }
      : {}),
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
    ...(serverAppliedRouteStore ? { serverAppliedRouteStore } : {}),
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
