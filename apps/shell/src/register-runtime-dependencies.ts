import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, createPrivateKey, createPublicKey, X509Certificate } from "node:crypto";
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
  RuntimeResourceHealthProbeRunner,
  RuntimeResourceRuntimeLogReader,
  RuntimeServerConnectivityChecker,
  RuntimeServerEdgeProxyBootstrapper,
  RuntimeTargetCapacityInspectorAdapter,
  RuntimeTerminalSessionGateway,
  SshExecutionBackend,
} from "@appaloft/adapter-runtime";
import {
  type AppLogger,
  type CertificateHttpChallengeToken,
  type CertificateHttpChallengeTokenStore,
  type CertificateMaterialValidator,
  type CertificateProviderIssueInput,
  type CertificateProviderIssueResult,
  type CertificateProviderPort,
  type Clock,
  CommandBus,
  type DefaultAccessDomainPolicyRepository,
  DefaultAccessDomainRuntimePlanResolver,
  type DeploymentProgressReporter,
  type EventBus,
  type EventHandlerContract,
  type ExecutionContext,
  eventHandlerTypesFor,
  type IdGenerator,
  InMemoryEdgeProxyProviderRegistry,
  type IntegrationAuthPort,
  type MutationCoordinator,
  QueryBus,
  RepositoryBackedDeploymentExecutionGuard,
  type ResourceAccessFailureRendererTarget,
  type ServerAppliedRouteDesiredStateRecord,
  type ServerAppliedRouteStateRepository,
  type ServerAppliedRouteStateSelectionSpec,
  type SourceLinkRecord,
  type SourceLinkRepository,
  type SourceLinkSelectionSpec,
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
  PgCertificateSecretStore,
  PgDefaultAccessDomainPolicyRepository,
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
  PgMutationCoordinator,
  PgProcessAttemptJournal,
  PgProjectReadModel,
  PgProjectRepository,
  PgResourceAccessFailureEvidenceProjection,
  PgResourceDeletionBlockerReader,
  PgResourceReadModel,
  PgResourceRepository,
  PgServerDeletionBlockerReader,
  PgServerReadModel,
  PgServerRepository,
  PgSshCredentialReadModel,
  PgSshCredentialRepository,
  PgSshCredentialUsageReader,
} from "@appaloft/persistence-pg";
import { createBuiltinPlugins } from "@appaloft/plugin-builtins";
import { LocalPluginHost } from "@appaloft/plugin-host";
import { aliyunProvider } from "@appaloft/provider-aliyun";
import {
  AcmeCertificateProvider,
  acmeCertificateProvider,
} from "@appaloft/provider-certificate-acme";
import { InMemoryProviderRegistry } from "@appaloft/provider-core";
import { caddyEdgeProxyProvider } from "@appaloft/provider-edge-proxy-caddy";
import { traefikEdgeProxyProvider } from "@appaloft/provider-edge-proxy-traefik";
import { genericSshProvider } from "@appaloft/provider-generic-ssh";
import { localShellProvider } from "@appaloft/provider-local-shell";
import { tencentProvider } from "@appaloft/provider-tencent";
import { customAlphabet } from "nanoid";
import { type DependencyContainer, instanceCachingFactory } from "tsyringe";
import {
  PolicyAwareDefaultAccessDomainProvider,
  ShellDefaultAccessDomainPolicySupport,
} from "./default-access-domain-policy-runtime";
import { ShellDeploymentContextDefaultsPolicy } from "./deployment-context-defaults-policy";
import { type RemotePgliteStateSyncSession } from "./remote-pglite-state-sync";
import { SshMutationCoordinator } from "./ssh-mutation-coordinator";

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

  async revoke(
    context: ExecutionContext,
    input: Parameters<CertificateProviderPort["revoke"]>[1],
  ): ReturnType<CertificateProviderPort["revoke"]> {
    void context;
    return err(
      domainError.certificateProviderUnavailable(
        "Certificate provider is not configured",
        {
          phase: "provider-request",
          providerKey: input.providerKey,
          certificateId: input.certificateId,
          domainBindingId: input.domainBindingId,
        },
        true,
      ),
    );
  }
}

const supportedImportedKeyAlgorithms = new Set(["rsa", "ec", "ed25519", "ed448"]);

function certificatePemBlocks(pem: string): string[] {
  return (
    pem
      .match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)
      ?.map((block) => block.trim()) ?? []
  );
}

function normalizePemBlocks(blocks: string[]): string {
  return blocks.map((block) => block.trim()).join("\n");
}

function normalizePrivateKeyPem(value: string): string {
  return value.trim();
}

function normalizeSecretText(value: string): string {
  return value.trim();
}

function parseDnsNames(certificate: X509Certificate): string[] {
  const names = new Set<string>();
  const subjectAltName = certificate.subjectAltName;
  if (subjectAltName) {
    for (const entry of subjectAltName.split(",")) {
      const normalized = entry.trim();
      if (normalized.startsWith("DNS:")) {
        names.add(normalized.slice(4).trim().toLowerCase());
      }
    }
  }

  if (names.size > 0) {
    return [...names];
  }

  const commonNameMatch = certificate.subject.match(/(?:^|\n|\s)CN\s*=\s*([^\n,]+)/);
  if (commonNameMatch?.[1]) {
    names.add(commonNameMatch[1].trim().toLowerCase());
  }

  return [...names];
}

function matchesDomain(pattern: string, domainName: string): boolean {
  if (pattern === domainName) {
    return true;
  }

  if (!pattern.startsWith("*.")) {
    return false;
  }

  const suffix = pattern.slice(2);
  if (!domainName.endsWith(`.${suffix}`)) {
    return false;
  }

  const prefix = domainName.slice(0, domainName.length - suffix.length - 1);
  return prefix.length > 0 && !prefix.includes(".");
}

class NodeCryptoCertificateMaterialValidator implements CertificateMaterialValidator {
  async validateImported(
    context: ExecutionContext,
    input: Parameters<CertificateMaterialValidator["validateImported"]>[1],
  ) {
    void context;

    const certificateBlocks = certificatePemBlocks(input.certificateChain);
    if (certificateBlocks.length === 0) {
      return err(
        domainError.certificateImportMalformedChain(
          "Certificate chain is missing a leaf certificate",
          {
            phase: "certificate-import-validation",
            domainName: input.domainName,
          },
        ),
      );
    }

    try {
      const normalizedCertificateChain = normalizePemBlocks(certificateBlocks);
      const normalizedPrivateKey = normalizePrivateKeyPem(input.privateKey);
      const normalizedPassphrase = input.passphrase
        ? normalizeSecretText(input.passphrase)
        : undefined;
      const leafCertificate = certificateBlocks[0];
      if (!leafCertificate) {
        return err(
          domainError.certificateImportMalformedChain(
            "Certificate chain is missing a leaf certificate",
            {
              phase: "certificate-import-validation",
              domainName: input.domainName,
            },
          ),
        );
      }

      const leaf = new X509Certificate(leafCertificate);
      for (const block of certificateBlocks.slice(1)) {
        new X509Certificate(block);
      }

      const subjectAlternativeNames = parseDnsNames(leaf);
      const normalizedDomainName = input.domainName.trim().toLowerCase();
      if (
        subjectAlternativeNames.length === 0 ||
        !subjectAlternativeNames.some((pattern) => matchesDomain(pattern, normalizedDomainName))
      ) {
        return err(
          domainError.certificateImportDomainMismatch(
            "Imported certificate does not cover the bound hostname",
            {
              phase: "certificate-import-validation",
              domainName: input.domainName,
            },
          ),
        );
      }

      const importedAtMs = Date.parse(input.importedAt);
      const notBefore = new Date(leaf.validFrom).toISOString();
      const expiresAt = new Date(leaf.validTo).toISOString();
      const notBeforeMs = Date.parse(notBefore);
      const expiresAtMs = Date.parse(expiresAt);

      if (!Number.isFinite(notBeforeMs) || !Number.isFinite(expiresAtMs)) {
        return err(
          domainError.certificateImportMalformedChain(
            "Imported certificate validity timestamps could not be parsed",
            {
              phase: "certificate-import-validation",
              domainName: input.domainName,
            },
          ),
        );
      }

      if (Number.isFinite(importedAtMs) && notBeforeMs > importedAtMs) {
        return err(
          domainError.certificateImportNotYetValid("Imported certificate is not valid yet", {
            phase: "certificate-import-validation",
            domainName: input.domainName,
            notBefore,
          }),
        );
      }

      if (Number.isFinite(importedAtMs) && expiresAtMs <= importedAtMs) {
        return err(
          domainError.certificateImportExpired("Imported certificate is already expired", {
            phase: "certificate-import-validation",
            domainName: input.domainName,
            expiresAt,
          }),
        );
      }

      const privateKey = createPrivateKey({
        key: normalizedPrivateKey,
        format: "pem",
        ...(normalizedPassphrase ? { passphrase: normalizedPassphrase } : {}),
      });
      const certificatePublicKey = leaf.publicKey.export({
        type: "spki",
        format: "der",
      });
      const privateKeyPublicKey = createPublicKey(privateKey).export({
        type: "spki",
        format: "der",
      });

      if (!Buffer.from(certificatePublicKey).equals(Buffer.from(privateKeyPublicKey))) {
        return err(
          domainError.certificateImportKeyMismatch(
            "Imported private key does not match the leaf certificate",
            {
              phase: "certificate-import-validation",
              domainName: input.domainName,
            },
          ),
        );
      }

      const keyAlgorithm = leaf.publicKey.asymmetricKeyType;
      if (!keyAlgorithm || !supportedImportedKeyAlgorithms.has(keyAlgorithm)) {
        return err(
          domainError.certificateImportUnsupportedAlgorithm(
            "Imported certificate key algorithm is not supported",
            {
              phase: "certificate-import-validation",
              domainName: input.domainName,
              ...(keyAlgorithm ? { keyAlgorithm } : {}),
            },
          ),
        );
      }

      const materialHash = createHash("sha256")
        .update(normalizedCertificateChain)
        .update("\n--\n")
        .update(normalizedPrivateKey)
        .update("\n--\n")
        .update(normalizedPassphrase ?? "")
        .digest("hex");

      return ok({
        normalizedCertificateChain,
        normalizedPrivateKey,
        ...(normalizedPassphrase ? { normalizedPassphrase } : {}),
        normalizedMaterialFingerprint: `sha256:${materialHash}`,
        notBefore,
        expiresAt,
        subjectAlternativeNames,
        keyAlgorithm,
        issuer: leaf.issuer.replace(/\n+/g, ", ").trim(),
        fingerprint: leaf.fingerprint256,
      });
    } catch {
      return err(
        domainError.certificateImportMalformedChain(
          "Certificate chain, private key, or passphrase could not be parsed",
          {
            phase: "certificate-import-validation",
            domainName: input.domainName,
          },
        ),
      );
    }
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

class UnavailableSourceLinkRepository implements SourceLinkRepository {
  private unavailable() {
    return err(
      domainError.validation("Source link state is not configured for this runtime", {
        phase: "source-link-resolution",
        reason: "source_link_repository_unavailable",
      }),
    );
  }

  async findOne(
    _spec: SourceLinkSelectionSpec,
  ): Promise<Result<SourceLinkRecord | null, DomainError>> {
    return this.unavailable();
  }

  async upsert(): Promise<Result<SourceLinkRecord, DomainError>> {
    return this.unavailable();
  }

  async deleteOne(): Promise<Result<boolean, DomainError>> {
    return this.unavailable();
  }
}

class NoopServerAppliedRouteStateRepository implements ServerAppliedRouteStateRepository {
  async upsert(): Promise<Result<ServerAppliedRouteDesiredStateRecord>> {
    return err(
      domainError.validation("Server-applied route state is not configured for this runtime", {
        phase: "config-domain-resolution",
        reason: "server_applied_route_repository_missing",
      }),
    );
  }

  async findOne(
    _spec: ServerAppliedRouteStateSelectionSpec,
  ): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    return ok(null);
  }

  async updateOne(): Promise<Result<ServerAppliedRouteDesiredStateRecord | null>> {
    return ok(null);
  }

  async deleteOne(): Promise<Result<boolean>> {
    return ok(false);
  }

  async deleteMany(): Promise<Result<number>> {
    return ok(0);
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

export interface RegisterRuntimeDependenciesInput {
  config: AppConfig;
  logger: AppLogger;
  database: DatabaseConnection;
  migrator: ConstructorParameters<typeof PgDiagnostics>[1];
  authRuntime: AuthRuntime;
  deploymentProgressReporter: DeploymentProgressReporter;
  remotePgliteStateSyncSession?: RemotePgliteStateSyncSession;
  refreshRemotePgliteState?: () => Promise<Result<void>>;
  sourceLinkRepository?: SourceLinkRepository;
  defaultAccessDomainPolicyRepository?: DefaultAccessDomainPolicyRepository;
  serverAppliedRouteStateRepository?: ServerAppliedRouteStateRepository;
  resourceAccessFailureRenderer?: () => ResourceAccessFailureRendererTarget | undefined;
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
  container.registerInstance(
    tokens.sourceLinkRepository,
    input.sourceLinkRepository ?? new UnavailableSourceLinkRepository(),
  );
  container.registerInstance(
    tokens.defaultAccessDomainPolicyRepository,
    input.defaultAccessDomainPolicyRepository ??
      new PgDefaultAccessDomainPolicyRepository(input.database.db),
  );
  container.registerInstance(
    tokens.serverAppliedRouteStateRepository,
    input.serverAppliedRouteStateRepository ?? new NoopServerAppliedRouteStateRepository(),
  );
  container.register(tokens.defaultAccessDomainPolicySupport, {
    useFactory: instanceCachingFactory(
      () => new ShellDefaultAccessDomainPolicySupport(input.config.defaultAccessDomain),
    ),
  });
  container.register(tokens.serverConnectivityChecker, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new RuntimeServerConnectivityChecker(
          dependencyContainer.resolve(tokens.edgeProxyProviderRegistry),
        ),
    ),
  });
  container.register(tokens.runtimeTargetCapacityInspector, {
    useFactory: instanceCachingFactory(
      () =>
        new RuntimeTargetCapacityInspectorAdapter(
          join(input.config.dataDir, "runtime"),
          input.config.remoteRuntimeRoot,
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
  container.register(tokens.serverDeletionBlockerReader, {
    useFactory: instanceCachingFactory(() => new PgServerDeletionBlockerReader(input.database.db)),
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
  container.register(tokens.resourceDeletionBlockerReader, {
    useFactory: instanceCachingFactory(
      () => new PgResourceDeletionBlockerReader(input.database.db),
    ),
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
  container.register(tokens.certificateMaterialValidator, {
    useFactory: instanceCachingFactory(() => new NodeCryptoCertificateMaterialValidator()),
  });
  container.register(tokens.certificateSecretStore, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new PgCertificateSecretStore(
          input.database.db,
          dependencyContainer.resolve<Clock>(tokens.clock),
        ),
    ),
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
  container.register(tokens.sshCredentialUsageReader, {
    useFactory: instanceCachingFactory(() => new PgSshCredentialUsageReader(input.database.db)),
  });
  container.register(tokens.environmentReadModel, {
    useFactory: instanceCachingFactory(
      () => new PgEnvironmentReadModel(input.database.db, input.config.secretMask),
    ),
  });
  container.register(tokens.resourceReadModel, {
    useFactory: instanceCachingFactory(() => new PgResourceReadModel(input.database.db)),
  });
  container.register(tokens.resourceAccessFailureEvidenceRecorder, {
    useFactory: instanceCachingFactory(
      () => new PgResourceAccessFailureEvidenceProjection(input.database.db),
    ),
  });
  container.register(tokens.resourceAccessFailureEvidenceReadModel, {
    useFactory: instanceCachingFactory(
      () => new PgResourceAccessFailureEvidenceProjection(input.database.db),
    ),
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
  container.register(tokens.processAttemptRecorder, {
    useFactory: instanceCachingFactory(() => new PgProcessAttemptJournal(input.database.db)),
  });
  container.register(tokens.processAttemptReadModel, {
    useFactory: instanceCachingFactory(() => new PgProcessAttemptJournal(input.database.db)),
  });

  container.register(tokens.sourceDetector, {
    useFactory: instanceCachingFactory(() => new FileSystemSourceDetector()),
  });
  container.register(tokens.deploymentConfigReader, {
    useFactory: instanceCachingFactory(() => new FileSystemDeploymentConfigReader()),
  });
  container.register(tokens.defaultAccessDomainProvider, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new PolicyAwareDefaultAccessDomainProvider(
          dependencyContainer.resolve(tokens.defaultAccessDomainPolicyRepository),
          input.config.defaultAccessDomain,
          input.logger,
        ),
    ),
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
  container.register(tokens.deploymentExecutionGuard, {
    useClass: RepositoryBackedDeploymentExecutionGuard,
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
          input.resourceAccessFailureRenderer,
          dependencyContainer.resolve(tokens.deploymentExecutionGuard),
        ),
        sshBackend: new SshExecutionBackend(
          join(input.config.dataDir, "runtime"),
          dependencyContainer.resolve(tokens.logger),
          dependencyContainer.resolve(tokens.deploymentProgressReporter),
          dependencyContainer.resolve(tokens.integrationAuthPort),
          dependencyContainer.resolve(tokens.serverRepository),
          dependencyContainer.resolve(tokens.edgeProxyProviderRegistry),
          input.config.remoteRuntimeRoot,
          input.resourceAccessFailureRenderer,
          dependencyContainer.resolve(tokens.deploymentExecutionGuard),
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
  container.register(tokens.resourceHealthProbeRunner, {
    useFactory: instanceCachingFactory(() => new RuntimeResourceHealthProbeRunner()),
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
      () =>
        new LocalPluginHost(
          createBuiltinPlugins({
            appVersion: input.config.appVersion,
          }),
          input.config.appVersion,
        ),
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
  container.register(tokens.mutationCoordinator, {
    useFactory: instanceCachingFactory((dependencyContainer) => {
      const clock = dependencyContainer.resolve<Clock>(tokens.clock);

      if (input.remotePgliteStateSyncSession) {
        return new SshMutationCoordinator({
          target: input.remotePgliteStateSyncSession.target,
          dataRoot: input.remotePgliteStateSyncSession.dataRoot,
          clock,
          ...(input.refreshRemotePgliteState
            ? { refreshLocalState: input.refreshRemotePgliteState }
            : {}),
        }) satisfies MutationCoordinator;
      }

      return new PgMutationCoordinator(input.database.db, clock) satisfies MutationCoordinator;
    }),
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
