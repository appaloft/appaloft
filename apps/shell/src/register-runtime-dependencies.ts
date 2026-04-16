import { AsyncLocalStorage } from "node:async_hooks";
import { join } from "node:path";
import {
  FileSystemDeploymentConfigReader,
  FileSystemSourceDetector,
} from "@yundu/adapter-filesystem";
import {
  DefaultRuntimePlanResolver,
  InMemoryExecutionBackend,
  LocalExecutionBackend,
  RoutingExecutionBackend,
  RuntimeResourceRuntimeLogReader,
  RuntimeServerConnectivityChecker,
  RuntimeServerEdgeProxyBootstrapper,
  SshExecutionBackend,
} from "@yundu/adapter-runtime";
import {
  type AppLogger,
  type Clock,
  CommandBus,
  type DefaultAccessDomainGeneration,
  type DefaultAccessDomainProvider,
  DefaultAccessDomainRuntimePlanResolver,
  type DeploymentProgressReporter,
  type EventBus,
  type EventHandlerContract,
  type ExecutionContext,
  eventHandlerTypesFor,
  type IdGenerator,
  InMemoryEdgeProxyProviderRegistry,
  type IntegrationAuthPort,
  QueryBus,
  tokens,
} from "@yundu/application";
import { type AuthRuntime } from "@yundu/auth-better";
import { type AppConfig } from "@yundu/config";
import { type DomainError, ok, type Result } from "@yundu/core";
import { InMemoryIntegrationRegistry } from "@yundu/integration-core";
import { createGitHubRepositoryBrowser, githubIntegration } from "@yundu/integration-github";
import { gitlabIntegration } from "@yundu/integration-gitlab";
import {
  type DatabaseConnection,
  PgDeploymentReadModel,
  PgDeploymentRepository,
  PgDestinationRepository,
  PgDiagnostics,
  PgDomainBindingReadModel,
  PgDomainBindingRepository,
  PgEnvironmentReadModel,
  PgEnvironmentRepository,
  PgProjectReadModel,
  PgProjectRepository,
  PgResourceReadModel,
  PgResourceRepository,
  PgServerReadModel,
  PgServerRepository,
  PgSshCredentialReadModel,
  PgSshCredentialRepository,
} from "@yundu/persistence-pg";
import { createBuiltinPlugins } from "@yundu/plugin-builtins";
import { LocalPluginHost } from "@yundu/plugin-host";
import { aliyunProvider } from "@yundu/provider-aliyun";
import { InMemoryProviderRegistry } from "@yundu/provider-core";
import { SslipDefaultAccessDomainProvider } from "@yundu/provider-default-access-domain-sslip";
import { caddyEdgeProxyProvider } from "@yundu/provider-edge-proxy-caddy";
import { traefikEdgeProxyProvider } from "@yundu/provider-edge-proxy-traefik";
import { genericSshProvider } from "@yundu/provider-generic-ssh";
import { localShellProvider } from "@yundu/provider-local-shell";
import { tencentProvider } from "@yundu/provider-tencent";
import { customAlphabet } from "nanoid";
import { type DependencyContainer, instanceCachingFactory } from "tsyringe";

import { ShellDeploymentContextDefaultsPolicy } from "./deployment-context-defaults-policy";

class SystemClock implements Clock {
  now(): string {
    return new Date().toISOString();
  }
}

const generateIdSuffix = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);

class NanoIdGenerator implements IdGenerator {
  next(prefix: string): string {
    return `${prefix}_${generateIdSuffix()}`;
  }
}

class InMemoryEventBus implements EventBus {
  constructor(
    private readonly container: DependencyContainer,
    private readonly logger: AppLogger,
  ) {}

  async publish(
    context: ExecutionContext,
    events: Parameters<EventBus["publish"]>[1],
  ): Promise<void> {
    if (events.length > 0) {
      this.logger.debug("event_bus.publish", {
        requestId: context.requestId,
        count: events.length,
      });
    }

    for (const event of events) {
      for (const handlerType of eventHandlerTypesFor(event.type)) {
        void Promise.resolve()
          .then(async () => {
            this.logger.debug("event_bus.dispatch", {
              requestId: context.requestId,
              eventType: event.type,
              handler: handlerType.name,
            });
            const handler = this.container.resolve(handlerType as never) as EventHandlerContract;
            const result = await handler.handle(context, event);
            result.match(
              () => {
                this.logger.debug("event_bus.handler_succeeded", {
                  requestId: context.requestId,
                  eventType: event.type,
                  handler: handlerType.name,
                });
              },
              (error) => {
                this.logger.error("event_bus.handler_failed", {
                  requestId: context.requestId,
                  eventType: event.type,
                  handler: handlerType.name,
                  errorCode: error.code,
                  message: error.message,
                });
              },
            );
          })
          .catch((error) => {
            this.logger.error("event_bus.handler_unhandled_error", {
              requestId: context.requestId,
              eventType: event.type,
              handler: handlerType.name,
              message: error instanceof Error ? error.message : String(error),
            });
          });
      }
    }
  }
}

class RequestScopedIntegrationAuthPort implements IntegrationAuthPort {
  private readonly storage = new AsyncLocalStorage<{
    context: ExecutionContext;
    request: Request;
  }>();

  constructor(
    private readonly authRuntime: AuthRuntime,
    private readonly logger: AppLogger,
  ) {}

  runWithRequest<T>(
    request: Request,
    context: ExecutionContext,
    callback: () => Promise<T>,
  ): Promise<T> {
    return this.storage.run({ request, context }, callback);
  }

  async getProviderAccessToken(
    context: ExecutionContext,
    providerKey: "github",
  ): Promise<string | null> {
    const scope = this.storage.getStore();

    if (!scope) {
      return null;
    }

    try {
      return await this.authRuntime.getProviderAccessToken(scope.request, providerKey);
    } catch (error) {
      this.logger.warn("integration_auth_port.get_provider_access_token_failed", {
        requestId: context.requestId,
        providerKey,
        message: error instanceof Error ? error.message : "Unknown auth runtime error",
      });
      return null;
    }
  }
}

class DisabledDefaultAccessDomainProvider implements DefaultAccessDomainProvider {
  constructor(
    private readonly reason: string,
    private readonly providerKey?: string,
  ) {}

  async generate(): Promise<Result<DefaultAccessDomainGeneration, DomainError>> {
    return ok({
      kind: "disabled",
      reason: this.reason,
      ...(this.providerKey ? { providerKey: this.providerKey } : {}),
    });
  }
}

export interface RegisterRuntimeDependenciesInput {
  config: AppConfig;
  logger: AppLogger;
  database: DatabaseConnection;
  migrator: ConstructorParameters<typeof PgDiagnostics>[1];
  authRuntime: AuthRuntime;
  deploymentProgressReporter: DeploymentProgressReporter;
}

export function registerRuntimeDependencies(
  container: DependencyContainer,
  input: RegisterRuntimeDependenciesInput,
): void {
  container.register(tokens.clock, {
    useFactory: instanceCachingFactory(() => new SystemClock()),
  });
  container.register(tokens.idGenerator, {
    useFactory: instanceCachingFactory(() => new NanoIdGenerator()),
  });
  container.registerInstance(tokens.logger, input.logger);
  container.register(tokens.eventBus, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new InMemoryEventBus(dependencyContainer, dependencyContainer.resolve(tokens.logger)),
    ),
  });
  container.registerInstance(tokens.deploymentProgressReporter, input.deploymentProgressReporter);
  container.register(tokens.serverConnectivityChecker, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new RuntimeServerConnectivityChecker(
          dependencyContainer.resolve(tokens.edgeProxyProviderRegistry),
        ),
    ),
  });
  container.register(tokens.serverEdgeProxyBootstrapper, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new RuntimeServerEdgeProxyBootstrapper(
          dependencyContainer.resolve(tokens.edgeProxyProviderRegistry),
        ),
    ),
  });
  container.register(tokens.projectRepository, {
    useFactory: instanceCachingFactory(() => new PgProjectRepository(input.database.db)),
  });
  container.register(tokens.serverRepository, {
    useFactory: instanceCachingFactory(() => new PgServerRepository(input.database.db)),
  });
  container.register(tokens.sshCredentialRepository, {
    useFactory: instanceCachingFactory(() => new PgSshCredentialRepository(input.database.db)),
  });
  container.register(tokens.destinationRepository, {
    useFactory: instanceCachingFactory(() => new PgDestinationRepository(input.database.db)),
  });
  container.register(tokens.environmentRepository, {
    useFactory: instanceCachingFactory(() => new PgEnvironmentRepository(input.database.db)),
  });
  container.register(tokens.resourceRepository, {
    useFactory: instanceCachingFactory(() => new PgResourceRepository(input.database.db)),
  });
  container.register(tokens.deploymentRepository, {
    useFactory: instanceCachingFactory(() => new PgDeploymentRepository(input.database.db)),
  });
  container.register(tokens.domainBindingRepository, {
    useFactory: instanceCachingFactory(() => new PgDomainBindingRepository(input.database.db)),
  });
  container.register(tokens.deploymentContextDefaultsPolicy, {
    useFactory: instanceCachingFactory(
      () => new ShellDeploymentContextDefaultsPolicy(input.config),
    ),
  });

  container.register(tokens.projectReadModel, {
    useFactory: instanceCachingFactory(() => new PgProjectReadModel(input.database.db)),
  });
  container.register(tokens.serverReadModel, {
    useFactory: instanceCachingFactory(() => new PgServerReadModel(input.database.db)),
  });
  container.register(tokens.sshCredentialReadModel, {
    useFactory: instanceCachingFactory(() => new PgSshCredentialReadModel(input.database.db)),
  });
  container.register(tokens.environmentReadModel, {
    useFactory: instanceCachingFactory(
      () => new PgEnvironmentReadModel(input.database.db, input.config.secretMask),
    ),
  });
  container.register(tokens.resourceReadModel, {
    useFactory: instanceCachingFactory(() => new PgResourceReadModel(input.database.db)),
  });
  container.register(tokens.deploymentReadModel, {
    useFactory: instanceCachingFactory(() => new PgDeploymentReadModel(input.database.db)),
  });
  container.register(tokens.domainBindingReadModel, {
    useFactory: instanceCachingFactory(() => new PgDomainBindingReadModel(input.database.db)),
  });

  container.register(tokens.sourceDetector, {
    useFactory: instanceCachingFactory(() => new FileSystemSourceDetector()),
  });
  container.register(tokens.deploymentConfigReader, {
    useFactory: instanceCachingFactory(() => new FileSystemDeploymentConfigReader()),
  });
  container.register(tokens.defaultAccessDomainProvider, {
    useFactory: instanceCachingFactory(() => {
      const config = input.config.defaultAccessDomain;
      if (config.mode === "disabled") {
        return new DisabledDefaultAccessDomainProvider("policy-disabled", config.providerKey);
      }

      if (config.providerKey === "sslip") {
        return new SslipDefaultAccessDomainProvider({
          providerKey: config.providerKey,
          zone: config.zone,
          scheme: config.scheme,
        });
      }

      input.logger.warn("default_access_domain_provider_unknown", {
        providerKey: config.providerKey,
      });
      return new DisabledDefaultAccessDomainProvider("unknown-provider", config.providerKey);
    }),
  });
  container.register(tokens.runtimePlanResolver, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new DefaultAccessDomainRuntimePlanResolver(
          new DefaultRuntimePlanResolver(),
          dependencyContainer.resolve(tokens.defaultAccessDomainProvider),
        ),
    ),
  });
  container.register(tokens.executionBackend, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new RoutingExecutionBackend(
          new LocalExecutionBackend(
            join(input.config.dataDir, "runtime"),
            dependencyContainer.resolve(tokens.logger),
            dependencyContainer.resolve(tokens.deploymentProgressReporter),
            dependencyContainer.resolve(tokens.integrationAuthPort),
            dependencyContainer.resolve(tokens.edgeProxyProviderRegistry),
          ),
          new SshExecutionBackend(
            join(input.config.dataDir, "runtime"),
            dependencyContainer.resolve(tokens.logger),
            dependencyContainer.resolve(tokens.deploymentProgressReporter),
            dependencyContainer.resolve(tokens.integrationAuthPort),
            dependencyContainer.resolve(tokens.serverRepository),
            dependencyContainer.resolve(tokens.edgeProxyProviderRegistry),
          ),
          new InMemoryExecutionBackend(
            dependencyContainer.resolve(tokens.deploymentProgressReporter),
          ),
        ),
    ),
  });
  container.register(tokens.resourceRuntimeLogReader, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new RuntimeResourceRuntimeLogReader(dependencyContainer.resolve(tokens.serverRepository)),
    ),
  });
  container.register(tokens.edgeProxyProviderRegistry, {
    useFactory: instanceCachingFactory(
      () =>
        new InMemoryEdgeProxyProviderRegistry([traefikEdgeProxyProvider, caddyEdgeProxyProvider]),
    ),
  });

  container.register(tokens.providerRegistry, {
    useFactory: instanceCachingFactory(
      () =>
        new InMemoryProviderRegistry([
          localShellProvider,
          genericSshProvider,
          aliyunProvider,
          tencentProvider,
        ]),
    ),
  });
  container.register(tokens.integrationRegistry, {
    useFactory: instanceCachingFactory(
      () => new InMemoryIntegrationRegistry([githubIntegration, gitlabIntegration]),
    ),
  });
  container.register(tokens.pluginRegistry, {
    useFactory: instanceCachingFactory(
      () => new LocalPluginHost(createBuiltinPlugins(), input.config.appVersion),
    ),
  });

  container.register(tokens.integrationAuthPort, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new RequestScopedIntegrationAuthPort(
          input.authRuntime,
          dependencyContainer.resolve(tokens.logger),
        ),
    ),
  });
  container.register(tokens.githubRepositoryBrowser, {
    useFactory: instanceCachingFactory(() => createGitHubRepositoryBrowser()),
  });
  container.register(tokens.diagnostics, {
    useFactory: instanceCachingFactory(
      () => new PgDiagnostics(input.database.db, input.migrator, input.database.descriptor),
    ),
  });

  container.register(tokens.commandBus, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new CommandBus(dependencyContainer, dependencyContainer.resolve(tokens.logger)),
    ),
  });
  container.register(tokens.queryBus, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new QueryBus(dependencyContainer, dependencyContainer.resolve(tokens.logger)),
    ),
  });
}
