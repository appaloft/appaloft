import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import {
  FileSystemDeploymentConfigReader,
  FileSystemSourceDetector,
} from "@appaloft/adapter-filesystem";
import {
  createDefaultRuntimeTargetBackendRegistry,
  DefaultRuntimePlanResolver,
  InMemoryExecutionBackend,
  LocalExecutionBackend,
  RoutingExecutionBackend,
  RuntimeResourceRuntimeLogReader,
  RuntimeServerConnectivityChecker,
  RuntimeServerEdgeProxyBootstrapper,
  RuntimeTerminalSessionGateway,
  SshExecutionBackend,
} from "@appaloft/adapter-runtime";
import {
  type AppLogger,
  type CertificateHttpChallengeToken,
  type CertificateHttpChallengeTokenStore,
  type CertificateProviderIssueInput,
  type CertificateProviderIssueResult,
  type CertificateProviderPort,
  type CertificateSecretStore,
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
} from "@appaloft/application";
import { type AuthRuntime } from "@appaloft/auth-better";
import { type AppConfig } from "@appaloft/config";
import { type DomainError, domainError, err, ok, type Result } from "@appaloft/core";
import { InMemoryIntegrationRegistry } from "@appaloft/integration-core";
import { createGitHubRepositoryBrowser, githubIntegration } from "@appaloft/integration-github";
import { gitlabIntegration } from "@appaloft/integration-gitlab";
import {
  type DatabaseConnection,
  PgCertificateReadModel,
  PgCertificateRepository,
  PgCertificateRetryCandidateReader,
  PgDeploymentReadModel,
  PgDeploymentRepository,
  PgDestinationRepository,
  PgDiagnostics,
  PgDomainBindingReadModel,
  PgDomainBindingRepository,
  PgDomainRouteBindingReader,
  PgDomainRouteFailureCandidateReader,
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
} from "@appaloft/persistence-pg";
import { createBuiltinPlugins } from "@appaloft/plugin-builtins";
import { LocalPluginHost } from "@appaloft/plugin-host";
import { aliyunProvider } from "@appaloft/provider-aliyun";
import {
  AcmeCertificateProvider,
  acmeCertificateProvider,
} from "@appaloft/provider-certificate-acme";
import { InMemoryProviderRegistry } from "@appaloft/provider-core";
import { SslipDefaultAccessDomainProvider } from "@appaloft/provider-default-access-domain-sslip";
import { caddyEdgeProxyProvider } from "@appaloft/provider-edge-proxy-caddy";
import { traefikEdgeProxyProvider } from "@appaloft/provider-edge-proxy-traefik";
import { genericSshProvider } from "@appaloft/provider-generic-ssh";
import { localShellProvider } from "@appaloft/provider-local-shell";
import { tencentProvider } from "@appaloft/provider-tencent";
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

class UnavailableCertificateProvider implements CertificateProviderPort {
  async issue(
    context: ExecutionContext,
    input: CertificateProviderIssueInput,
  ): Promise<Result<CertificateProviderIssueResult, DomainError>> {
    void context;
    return err(
      domainError.certificateProviderUnavailable(
        "Certificate provider is not configured",
        {
          phase: "provider-request",
          providerKey: input.providerKey,
          certificateId: input.certificateId,
          attemptId: input.attemptId,
          domainBindingId: input.domainBindingId,
        },
        true,
      ),
    );
  }
}

class InMemoryCertificateSecretStore implements CertificateSecretStore {
  async store(
    context: ExecutionContext,
    material: CertificateProviderIssueResult,
  ): Promise<Result<{ secretRef: string }, DomainError>> {
    void context;
    return ok({
      secretRef: `memory://${material.certificateId}/${material.attemptId}`,
    });
  }
}

function readAcmeAccountPrivateKeyPem(config: AppConfig): string | null {
  const configuredPem = config.certificateProvider.acme.accountPrivateKeyPem?.trim();

  if (configuredPem) {
    return configuredPem;
  }

  const configuredPath = config.certificateProvider.acme.accountPrivateKeyPath;

  if (!configuredPath) {
    return null;
  }

  const path = isAbsolute(configuredPath) ? configuredPath : join(config.dataDir, configuredPath);

  if (!existsSync(path)) {
    return null;
  }

  const pem = readFileSync(path, "utf8").trim();
  return pem.length > 0 ? pem : null;
}

class InMemoryCertificateHttpChallengeTokenStore implements CertificateHttpChallengeTokenStore {
  private readonly tokens = new Map<string, CertificateHttpChallengeToken>();

  async publish(
    context: ExecutionContext,
    token: CertificateHttpChallengeToken,
  ): Promise<Result<CertificateHttpChallengeToken, DomainError>> {
    void context;
    const storedToken = {
      ...token,
      domainName: token.domainName.toLowerCase(),
    };
    this.tokens.set(this.tokenKey(storedToken.domainName, storedToken.token), storedToken);
    return ok(storedToken);
  }

  async find(
    context: ExecutionContext,
    input: { token: string; domainName: string },
  ): Promise<Result<CertificateHttpChallengeToken | null, DomainError>> {
    void context;
    const key = this.tokenKey(input.domainName.toLowerCase(), input.token);
    const token = this.tokens.get(key);

    if (!token) {
      return ok(null);
    }

    if (token.expiresAt && Date.parse(token.expiresAt) <= Date.now()) {
      this.tokens.delete(key);
      return ok(null);
    }

    return ok(token);
  }

  async remove(
    context: ExecutionContext,
    input: { token: string; domainName: string },
  ): Promise<Result<void, DomainError>> {
    void context;
    this.tokens.delete(this.tokenKey(input.domainName.toLowerCase(), input.token));
    return ok(undefined);
  }

  private tokenKey(domainName: string, token: string): string {
    return `${domainName}:${token}`;
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
      const dispatches = eventHandlerTypesFor(event.type).map(async (handlerType) => {
        try {
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
        } catch (error) {
          this.logger.error("event_bus.handler_unhandled_error", {
            requestId: context.requestId,
            eventType: event.type,
            handler: handlerType.name,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      });

      await Promise.all(dispatches);
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
  container.register(tokens.domainRouteFailureCandidateReader, {
    useFactory: instanceCachingFactory(
      () => new PgDomainRouteFailureCandidateReader(input.database.db),
    ),
  });
  container.register(tokens.domainRouteBindingReader, {
    useFactory: instanceCachingFactory(() => new PgDomainRouteBindingReader(input.database.db)),
  });
  container.register(tokens.certificateRepository, {
    useFactory: instanceCachingFactory(() => new PgCertificateRepository(input.database.db)),
  });
  container.register(tokens.certificateRetryCandidateReader, {
    useFactory: instanceCachingFactory(
      () => new PgCertificateRetryCandidateReader(input.database.db),
    ),
  });
  container.register(tokens.certificateSecretStore, {
    useFactory: instanceCachingFactory(() => new InMemoryCertificateSecretStore()),
  });
  container.register(tokens.certificateHttpChallengeTokenStore, {
    useFactory: instanceCachingFactory(() => new InMemoryCertificateHttpChallengeTokenStore()),
  });
  container.register(tokens.certificateProvider, {
    useFactory: instanceCachingFactory((dependencyContainer) => {
      if (input.config.certificateProvider.mode !== "acme") {
        return new UnavailableCertificateProvider();
      }

      const accountPrivateKeyPem = readAcmeAccountPrivateKeyPem(input.config);
      const acmeConfig = input.config.certificateProvider.acme;

      if (!accountPrivateKeyPem || !acmeConfig.email || !acmeConfig.termsOfServiceAgreed) {
        return new UnavailableCertificateProvider();
      }

      const clock = dependencyContainer.resolve<Clock>(tokens.clock);
      return new AcmeCertificateProvider({
        directoryUrl: acmeConfig.directoryUrl,
        accountPrivateKeyPem,
        email: acmeConfig.email,
        termsOfServiceAgreed: acmeConfig.termsOfServiceAgreed,
        skipChallengeVerification: acmeConfig.skipChallengeVerification,
        challengeStore: dependencyContainer.resolve(tokens.certificateHttpChallengeTokenStore),
        challengeTokenTtlMs: acmeConfig.challengeTokenTtlSeconds * 1000,
        now: () => clock.now(),
      });
    }),
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
  container.register(tokens.certificateReadModel, {
    useFactory: instanceCachingFactory(() => new PgCertificateReadModel(input.database.db)),
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
  container.register(tokens.runtimeTargetBackendRegistry, {
    useFactory: instanceCachingFactory((dependencyContainer) =>
      createDefaultRuntimeTargetBackendRegistry({
        localBackend: new LocalExecutionBackend(
          join(input.config.dataDir, "runtime"),
          dependencyContainer.resolve(tokens.logger),
          dependencyContainer.resolve(tokens.deploymentProgressReporter),
          dependencyContainer.resolve(tokens.integrationAuthPort),
          dependencyContainer.resolve(tokens.edgeProxyProviderRegistry),
        ),
        sshBackend: new SshExecutionBackend(
          join(input.config.dataDir, "runtime"),
          dependencyContainer.resolve(tokens.logger),
          dependencyContainer.resolve(tokens.deploymentProgressReporter),
          dependencyContainer.resolve(tokens.integrationAuthPort),
          dependencyContainer.resolve(tokens.serverRepository),
          dependencyContainer.resolve(tokens.edgeProxyProviderRegistry),
          input.config.remoteRuntimeRoot,
        ),
      }),
    ),
  });
  container.register(tokens.executionBackend, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new RoutingExecutionBackend(
          dependencyContainer.resolve(tokens.runtimeTargetBackendRegistry),
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
  container.register(tokens.terminalSessionGateway, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new RuntimeTerminalSessionGateway({
          allowTerminalSessions: input.config.runtimeMode === "self-hosted",
          logger: dependencyContainer.resolve(tokens.logger),
          serverRepository: dependencyContainer.resolve(tokens.serverRepository),
        }),
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
          acmeCertificateProvider,
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
