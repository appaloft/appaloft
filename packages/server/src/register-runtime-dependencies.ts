import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, createPrivateKey, createPublicKey, X509Certificate } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { type SshRemoteStateTarget } from "@appaloft/adapter-cli";
import {
  FileSystemDeploymentConfigReader,
  FileSystemSourceDetector,
} from "@appaloft/adapter-filesystem";
import {
  createDefaultRuntimeTargetBackendRegistry,
  DefaultRuntimePlanResolver,
  DockerSwarmExecutionBackend,
  DockerSwarmShellCommandRunner,
  InMemoryExecutionBackend,
  LocalExecutionBackend,
  RoutingExecutionBackend,
  RuntimeControlShellCommandExecutor,
  RuntimeResourceHealthProbeRunner,
  RuntimeResourceRuntimeControlTarget,
  RuntimeResourceRuntimeLogReader,
  RuntimeServerConnectivityChecker,
  RuntimeServerEdgeProxyBootstrapper,
  RuntimeTargetCapacityInspectorAdapter,
  RuntimeTargetCapacityPrunerAdapter,
  RuntimeTargetScheduledTaskRuntimePort,
  RuntimeTerminalSessionGateway,
  RuntimeUsageCapacityInspectorAdapter,
  SshExecutionBackend,
  StorageRuntimeCleanerAdapter,
} from "@appaloft/adapter-runtime";
import {
  AllowAllOperationGuardPort,
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
  type DependencyResourceBackupPolicyRepository,
  type DeploymentProgressReporter,
  type DomainEventStreamRecorder,
  EmptyRemoteStateWorkReadModel,
  type EventBus,
  type EventHandlerContract,
  type ExecutionContext,
  eventHandlerTypesFor,
  type FirstAdminPasswordIssuer,
  type IdGenerator,
  InMemoryEdgeProxyProviderRegistry,
  type IntegrationAuthPort,
  type MutationCoordinator,
  type OperationGuardPort,
  type PreviewFeedbackWriter,
  type PreviewFeedbackWriterInput,
  type PreviewFeedbackWriterResult,
  type ProcessAttemptClaimer,
  type ProcessAttemptCompleter,
  type ProcessAttemptDeliveryCandidateReader,
  type ProcessAttemptRecoveryRecorder,
  type ProcessAttemptRetryCandidateReader,
  type ProcessAttemptRetryGenerator,
  QueryBus,
  type RemoteStateWorkReadModel,
  RepositoryBackedDeploymentExecutionGuard,
  type ResourceAccessFailureRendererTarget,
  type RetentionDefaultRepository,
  type RouteRealizationWorkReadModel,
  type RuntimeTargetCapacityInspector,
  type ScheduledRuntimePrunePolicyReadModel,
  type ScheduledRuntimePrunePolicyRepository,
  type ServerAppliedRouteDesiredStateRecord,
  type ServerAppliedRouteStateRepository,
  type ServerAppliedRouteStateSelectionSpec,
  type ServerRepository,
  type SourceLinkReadModel,
  type SourceLinkRecord,
  type SourceLinkRepository,
  type SourceLinkSelectionSpec,
  type StorageRuntimeCleaner,
  type StorageVolumeBackupSafetyReader,
  tokens,
  toRepositoryContext,
} from "@appaloft/application";
import { type AuthRuntime, BetterAuthDeployTokenMaterialIssuer } from "@appaloft/auth-better";
import { type AppConfig } from "@appaloft/config";
import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  type DomainError,
  domainError,
  err,
  ok,
  type Result,
} from "@appaloft/core";
import { InMemoryIntegrationRegistry } from "@appaloft/integration-core";
import {
  createGitHubPreviewFeedbackWriter,
  createGitHubPreviewPullRequestWebhookVerifier,
  createGitHubRepositoryBrowser,
  createGitHubSourceEventWebhookVerifier,
  githubIntegration,
} from "@appaloft/integration-github";
import { gitlabIntegration } from "@appaloft/integration-gitlab";
import {
  type DatabaseConnection,
  PgAuditEventArchiveStore,
  PgAuditEventLegalHoldStore,
  PgAuditEventReadModel,
  PgAuthBootstrapStatusReader,
  PgCertificateReadModel,
  PgCertificateRepository,
  PgCertificateRetryCandidateReader,
  PgCertificateSecretStore,
  PgDefaultAccessDomainPolicyRepository,
  PgDependencyBindingSecretStore,
  PgDependencyResourceBackupPolicyRepository,
  PgDependencyResourceBackupReadModel,
  PgDependencyResourceBackupRepository,
  PgDependencyResourceDeleteSafetyReader,
  PgDependencyResourceReadModel,
  PgDependencyResourceRepository,
  PgDependencyResourceSecretStore,
  PgDeploymentLogRetentionStore,
  PgDeploymentReadModel,
  PgDeploymentRepository,
  PgDeployTokenReadModel,
  PgDeployTokenRepository,
  PgDestinationRepository,
  PgDiagnostics,
  PgDomainBindingReadModel,
  PgDomainBindingRepository,
  PgDomainEventStreamRetentionStore,
  PgDomainRouteBindingReader,
  PgDomainRouteFailureCandidateReader,
  PgEnvironmentReadModel,
  PgEnvironmentRepository,
  PgMutationCoordinator,
  PgPreviewCleanupAttemptRecorder,
  PgPreviewCleanupRetryCandidateReader,
  PgPreviewEnvironmentReadModel,
  PgPreviewEnvironmentRepository,
  PgPreviewExpiredEnvironmentCandidateReader,
  PgPreviewFeedbackRecorder,
  PgPreviewPolicyDecisionProjection,
  PgPreviewPolicyRepository,
  PgProcessAttemptJournal,
  PgProjectReadModel,
  PgProjectRepository,
  PgProviderJobLogRetentionStore,
  PgResourceAccessFailureEvidenceProjection,
  PgResourceDeletionBlockerReader,
  PgResourceDependencyBindingReadModel,
  PgResourceDependencyBindingRepository,
  PgResourceReadModel,
  PgResourceRepository,
  PgResourceRuntimeControlAttemptRecorder,
  PgResourceRuntimeLogArchiveStore,
  PgRetentionDefaultRepository,
  PgRuntimeMonitoringMarkerReadModel,
  PgRuntimeMonitoringSampleReadModel,
  PgRuntimeMonitoringSampleRetentionStore,
  PgRuntimeMonitoringSampleWriteStore,
  PgRuntimeMonitoringThresholdPolicyRepository,
  PgScheduledRuntimePrunePolicyReadModel,
  PgScheduledTaskDefinitionRepository,
  PgScheduledTaskDueCandidateReader,
  PgScheduledTaskReadModel,
  PgScheduledTaskRunAttemptRepository,
  PgScheduledTaskRunLogReadModel,
  PgScheduledTaskRunLogRecorder,
  PgScheduledTaskRunReadModel,
  PgServerAppliedRouteRealizationWorkReadModel,
  PgServerDeletionBlockerReader,
  PgServerReadModel,
  PgServerRepository,
  PgSourceEventRepository,
  PgSourceLinkReadModel,
  PgSshCredentialReadModel,
  PgSshCredentialRepository,
  PgSshCredentialUsageReader,
  PgStorageVolumeReadModel,
  PgStorageVolumeRepository,
} from "@appaloft/persistence-pg";
import { createBuiltinPlugins } from "@appaloft/plugin-builtins";
import { LocalPluginHost } from "@appaloft/plugin-host";
import { type SystemPluginDefinition } from "@appaloft/plugin-sdk";
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
import { ConfigMaintenanceWorkerStatusReader } from "./maintenance-worker-status-reader";
import { SelfHostedInstanceUpgradePort } from "./self-hosted-instance-upgrade";
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

class NanoIdFirstAdminPasswordIssuer implements FirstAdminPasswordIssuer {
  async issue(_context: ExecutionContext) {
    return ok({
      password: `aplt-admin-${generateIdSuffix()}-${generateIdSuffix()}`,
    });
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
    private readonly streamRecorder?: DomainEventStreamRecorder,
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
      const recordResult = await this.streamRecorder?.record(toRepositoryContext(context), {
        event,
        requestId: context.requestId,
      });
      if (recordResult?.isErr()) {
        this.logger.warn("domain_event_stream.record_failed", {
          requestId: context.requestId,
          eventType: event.type,
          errorCode: recordResult.error.code,
        });
      }

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

class EmptyStorageVolumeBackupSafetyReader implements StorageVolumeBackupSafetyReader {
  async findSafetyEvidence() {
    return ok({
      backupRetentionRequired: false,
      backupRestoreInFlightCount: 0,
    });
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

export class ShellGitHubPreviewFeedbackWriter implements PreviewFeedbackWriter {
  constructor(
    private readonly integrationAuthPort: IntegrationAuthPort,
    private readonly workerAccessToken?: string,
    private readonly writerFactory: (accessToken: string) => PreviewFeedbackWriter = (
      accessToken,
    ) => createGitHubPreviewFeedbackWriter(accessToken),
  ) {}

  async publish(
    context: ExecutionContext,
    input: PreviewFeedbackWriterInput,
  ): Promise<Result<PreviewFeedbackWriterResult>> {
    const requestAccessToken = await this.integrationAuthPort.getProviderAccessToken(
      context,
      "github",
    );
    const accessToken = requestAccessToken?.trim()
      ? requestAccessToken
      : this.workerAccessToken?.trim()
        ? this.workerAccessToken
        : undefined;
    if (!accessToken) {
      return err(
        domainError.validation(
          "GitHub account or preview feedback worker token is not configured",
          {
            phase: "preview-feedback",
            provider: "github",
          },
        ),
      );
    }

    return this.writerFactory(accessToken).publish(context, input);
  }
}

export interface RegisterRuntimeDependenciesInput {
  config: AppConfig;
  logger: AppLogger;
  database: DatabaseConnection;
  migrator: ConstructorParameters<typeof PgDiagnostics>[1];
  authRuntime: AuthRuntime;
  deploymentProgressReporter: DeploymentProgressReporter;
  remotePgliteStateSyncSession?: {
    dataRoot: string;
    target: SshRemoteStateTarget;
  };
  refreshRemotePgliteState?: () => Promise<Result<void>>;
  sourceLinkRepository?: SourceLinkRepository;
  sourceLinkReadModel?: SourceLinkReadModel;
  defaultAccessDomainPolicyRepository?: DefaultAccessDomainPolicyRepository;
  serverAppliedRouteStateRepository?: ServerAppliedRouteStateRepository;
  remoteStateWorkReadModel?: RemoteStateWorkReadModel;
  routeRealizationWorkReadModel?: RouteRealizationWorkReadModel;
  processAttemptRetryCandidateReader?: ProcessAttemptRetryCandidateReader;
  processAttemptDeliveryCandidateReader?: ProcessAttemptDeliveryCandidateReader;
  processAttemptRetryGenerator?: ProcessAttemptRetryGenerator;
  processAttemptRecoveryRecorder?: ProcessAttemptRecoveryRecorder;
  processAttemptClaimer?: ProcessAttemptClaimer;
  processAttemptCompleter?: ProcessAttemptCompleter;
  retentionDefaultRepository?: RetentionDefaultRepository;
  scheduledRuntimePrunePolicyRepository?: ScheduledRuntimePrunePolicyRepository;
  scheduledRuntimePrunePolicyReadModel?: ScheduledRuntimePrunePolicyReadModel;
  dependencyResourceBackupPolicyRepository?: DependencyResourceBackupPolicyRepository;
  resourceAccessFailureRenderer?: () => ResourceAccessFailureRendererTarget | undefined;
  systemPlugins?: readonly SystemPluginDefinition[];
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
        new InMemoryEventBus(
          dependencyContainer,
          dependencyContainer.resolve(tokens.logger),
          dependencyContainer.resolve(tokens.domainEventStreamRecorder),
        ),
    ),
  });
  container.registerInstance(tokens.deploymentProgressReporter, input.deploymentProgressReporter);
  container.registerInstance(
    tokens.maintenanceWorkerStatusReader,
    new ConfigMaintenanceWorkerStatusReader(input.config),
  );
  container.registerInstance(
    tokens.sourceLinkRepository,
    input.sourceLinkRepository ?? new UnavailableSourceLinkRepository(),
  );
  container.registerInstance(
    tokens.sourceLinkReadModel,
    input.sourceLinkReadModel ?? new PgSourceLinkReadModel(input.database.db),
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
  container.registerInstance(
    tokens.remoteStateWorkReadModel,
    input.remoteStateWorkReadModel ?? new EmptyRemoteStateWorkReadModel(),
  );
  container.registerInstance(
    tokens.routeRealizationWorkReadModel,
    input.routeRealizationWorkReadModel ??
      new PgServerAppliedRouteRealizationWorkReadModel(input.database.db),
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
  container.register(tokens.runtimeUsageInspector, {
    useFactory: instanceCachingFactory((dependencyContainer) => {
      const serverRepository = dependencyContainer.resolve(
        tokens.serverRepository,
      ) as ServerRepository;
      const capacityInspector = dependencyContainer.resolve(
        tokens.runtimeTargetCapacityInspector,
      ) as RuntimeTargetCapacityInspector;

      return new RuntimeUsageCapacityInspectorAdapter(async (context, serverId) => {
        const serverIdResult = DeploymentTargetId.create(serverId);
        if (serverIdResult.isErr()) {
          return err(serverIdResult.error);
        }

        const server = await serverRepository.findOne(
          toRepositoryContext(context),
          DeploymentTargetByIdSpec.create(serverIdResult.value),
        );

        if (!server) {
          return err(domainError.notFound("server", serverId));
        }

        return ok(server.toState());
      }, capacityInspector);
    }),
  });
  container.register(tokens.runtimeMonitoringSampleReadModel, {
    useFactory: instanceCachingFactory(
      () => new PgRuntimeMonitoringSampleReadModel(input.database.db),
    ),
  });
  container.register(tokens.runtimeMonitoringSampleWriteStore, {
    useFactory: instanceCachingFactory(
      () => new PgRuntimeMonitoringSampleWriteStore(input.database.db),
    ),
  });
  container.register(tokens.runtimeMonitoringMarkerReadModel, {
    useFactory: instanceCachingFactory(
      () => new PgRuntimeMonitoringMarkerReadModel(input.database.db),
    ),
  });
  container.register(tokens.runtimeMonitoringSampleRetentionStore, {
    useFactory: instanceCachingFactory(
      () => new PgRuntimeMonitoringSampleRetentionStore(input.database.db),
    ),
  });
  container.register(tokens.runtimeMonitoringThresholdPolicyRepository, {
    useFactory: instanceCachingFactory(
      () => new PgRuntimeMonitoringThresholdPolicyRepository(input.database.db),
    ),
  });
  container.register(tokens.runtimeTargetCapacityPruner, {
    useFactory: instanceCachingFactory(
      () =>
        new RuntimeTargetCapacityPrunerAdapter(
          join(input.config.dataDir, "runtime"),
          input.config.remoteRuntimeRoot,
        ),
    ),
  });
  container.register(tokens.storageRuntimeCleaner, {
    useFactory: instanceCachingFactory(
      () =>
        new StorageRuntimeCleanerAdapter(
          join(input.config.dataDir, "runtime"),
          input.config.remoteRuntimeRoot,
        ) as StorageRuntimeCleaner,
    ),
  });
  container.register(tokens.storageVolumeBackupSafetyReader, {
    useFactory: instanceCachingFactory(() => new EmptyStorageVolumeBackupSafetyReader()),
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
  container.register(tokens.previewEnvironmentRepository, {
    useFactory: instanceCachingFactory(() => new PgPreviewEnvironmentRepository(input.database.db)),
  });
  container.register(tokens.previewEnvironmentReadModel, {
    useFactory: instanceCachingFactory(() => new PgPreviewEnvironmentReadModel(input.database.db)),
  });
  container.register(tokens.previewPolicyRepository, {
    useFactory: instanceCachingFactory(() => new PgPreviewPolicyRepository(input.database.db)),
  });
  container.register(tokens.previewPolicyDecisionRecorder, {
    useFactory: instanceCachingFactory(
      () => new PgPreviewPolicyDecisionProjection(input.database.db),
    ),
  });
  container.register(tokens.previewFeedbackRecorder, {
    useFactory: instanceCachingFactory(() => new PgPreviewFeedbackRecorder(input.database.db)),
  });
  container.register(tokens.previewFeedbackWriter, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new ShellGitHubPreviewFeedbackWriter(
          dependencyContainer.resolve(tokens.integrationAuthPort),
          input.config.githubPreviewFeedbackToken,
        ),
    ),
  });
  container.register(tokens.previewCleanupAttemptRecorder, {
    useFactory: instanceCachingFactory(
      () => new PgPreviewCleanupAttemptRecorder(input.database.db),
    ),
  });
  container.register(tokens.previewCleanupRetryCandidateReader, {
    useFactory: instanceCachingFactory(
      () => new PgPreviewCleanupRetryCandidateReader(input.database.db),
    ),
  });
  container.register(tokens.previewExpiredEnvironmentCandidateReader, {
    useFactory: instanceCachingFactory(
      () => new PgPreviewExpiredEnvironmentCandidateReader(input.database.db),
    ),
  });
  container.register(tokens.scheduledTaskDefinitionRepository, {
    useFactory: instanceCachingFactory(
      () => new PgScheduledTaskDefinitionRepository(input.database.db),
    ),
  });
  container.register(tokens.scheduledTaskRunAttemptRepository, {
    useFactory: instanceCachingFactory(
      () => new PgScheduledTaskRunAttemptRepository(input.database.db),
    ),
  });
  container.register(tokens.scheduledTaskRunLogRecorder, {
    useFactory: instanceCachingFactory(() => new PgScheduledTaskRunLogRecorder(input.database.db)),
  });
  container.register(tokens.scheduledTaskDueCandidateReader, {
    useFactory: instanceCachingFactory(
      () => new PgScheduledTaskDueCandidateReader(input.database.db),
    ),
  });
  container.register(tokens.dependencyResourceRepository, {
    useFactory: instanceCachingFactory(() => new PgDependencyResourceRepository(input.database.db)),
  });
  container.register(tokens.dependencyResourceBackupRepository, {
    useFactory: instanceCachingFactory(
      () => new PgDependencyResourceBackupRepository(input.database.db),
    ),
  });
  container.register(tokens.resourceDependencyBindingRepository, {
    useFactory: instanceCachingFactory(
      () => new PgResourceDependencyBindingRepository(input.database.db),
    ),
  });
  container.register(tokens.deployTokenRepository, {
    useFactory: instanceCachingFactory(() => new PgDeployTokenRepository(input.database.db)),
  });
  container.register(tokens.deployTokenMaterialIssuer, {
    useFactory: instanceCachingFactory(() => new BetterAuthDeployTokenMaterialIssuer()),
  });
  container.register(tokens.deployTokenReadModel, {
    useFactory: instanceCachingFactory(() => new PgDeployTokenReadModel(input.database.db)),
  });
  container.register(tokens.authBootstrapStatusReader, {
    useFactory: instanceCachingFactory(
      () =>
        new PgAuthBootstrapStatusReader(input.database.db, {
          githubConfigured: Boolean(
            input.config.githubClientId &&
              input.config.githubClientSecret &&
              input.config.githubRedirectUri &&
              input.config.webOrigin,
          ),
          googleConfigured: Boolean(
            input.config.googleClientId &&
              input.config.googleClientSecret &&
              input.config.googleRedirectUri &&
              input.config.webOrigin,
          ),
          oidcConfigured: Boolean(
            input.config.oidcClientId &&
              input.config.oidcClientSecret &&
              input.config.oidcDiscoveryUrl &&
              input.config.oidcRedirectUri &&
              input.config.webOrigin,
          ),
          loginUrl: `${input.config.webOrigin.replace(/\/+$/g, "")}/login`,
        }),
    ),
  });
  container.registerInstance(tokens.firstAdminBootstrapper, input.authRuntime);
  container.registerInstance(tokens.organizationTeamManagementPort, input.authRuntime);
  container.register(tokens.firstAdminPasswordIssuer, {
    useFactory: instanceCachingFactory(() => new NanoIdFirstAdminPasswordIssuer()),
  });
  container.register(tokens.dependencyResourceDeleteSafetyReader, {
    useFactory: instanceCachingFactory(
      () => new PgDependencyResourceDeleteSafetyReader(input.database.db),
    ),
  });
  container.register(tokens.storageVolumeRepository, {
    useFactory: instanceCachingFactory(() => new PgStorageVolumeRepository(input.database.db)),
  });
  container.register(tokens.resourceDeletionBlockerReader, {
    useFactory: instanceCachingFactory(
      () => new PgResourceDeletionBlockerReader(input.database.db),
    ),
  });
  container.register(tokens.sourceEventReadModel, {
    useFactory: instanceCachingFactory(() => new PgSourceEventRepository(input.database.db)),
  });
  container.register(tokens.auditEventRecorder, {
    useFactory: instanceCachingFactory(() => new PgAuditEventReadModel(input.database.db)),
  });
  container.register(tokens.auditEventReadModel, {
    useFactory: instanceCachingFactory(() => new PgAuditEventReadModel(input.database.db)),
  });
  container.register(tokens.auditEventRetentionStore, {
    useFactory: instanceCachingFactory(() => new PgAuditEventReadModel(input.database.db)),
  });
  container.register(tokens.auditEventLegalHoldStore, {
    useFactory: instanceCachingFactory(() => new PgAuditEventLegalHoldStore(input.database.db)),
  });
  container.register(tokens.auditEventArchiveStore, {
    useFactory: instanceCachingFactory(() => new PgAuditEventArchiveStore(input.database.db)),
  });
  container.register(tokens.providerJobLogRetentionStore, {
    useFactory: instanceCachingFactory(() => new PgProviderJobLogRetentionStore(input.database.db)),
  });
  container.register(tokens.domainEventStreamRetentionStore, {
    useFactory: instanceCachingFactory(
      () => new PgDomainEventStreamRetentionStore(input.database.db),
    ),
  });
  container.register(tokens.domainEventStreamObservationReader, {
    useFactory: instanceCachingFactory(
      () => new PgDomainEventStreamRetentionStore(input.database.db),
    ),
  });
  container.register(tokens.domainEventStreamRecorder, {
    useFactory: instanceCachingFactory(
      () => new PgDomainEventStreamRetentionStore(input.database.db),
    ),
  });
  container.register(tokens.deploymentLogRetentionStore, {
    useFactory: instanceCachingFactory(() => new PgDeploymentLogRetentionStore(input.database.db)),
  });
  container.register(tokens.resourceRuntimeLogArchiveStore, {
    useFactory: instanceCachingFactory(
      () => new PgResourceRuntimeLogArchiveStore(input.database.db),
    ),
  });
  container.register(tokens.retentionDefaultRepository, {
    useFactory: instanceCachingFactory(
      () => input.retentionDefaultRepository ?? new PgRetentionDefaultRepository(input.database.db),
    ),
  });
  container.register(tokens.scheduledRuntimePrunePolicyReadModel, {
    useFactory: instanceCachingFactory(
      () =>
        input.scheduledRuntimePrunePolicyReadModel ??
        new PgScheduledRuntimePrunePolicyReadModel(input.database.db),
    ),
  });
  container.register(tokens.scheduledRuntimePrunePolicyRepository, {
    useFactory: instanceCachingFactory(
      () =>
        input.scheduledRuntimePrunePolicyRepository ??
        new PgScheduledRuntimePrunePolicyReadModel(input.database.db),
    ),
  });
  container.register(tokens.dependencyResourceBackupPolicyReadModel, {
    useFactory: instanceCachingFactory(
      () =>
        input.dependencyResourceBackupPolicyRepository ??
        new PgDependencyResourceBackupPolicyRepository(input.database.db),
    ),
  });
  container.register(tokens.dependencyResourceBackupPolicyRepository, {
    useFactory: instanceCachingFactory(
      () =>
        input.dependencyResourceBackupPolicyRepository ??
        new PgDependencyResourceBackupPolicyRepository(input.database.db),
    ),
  });
  container.register(tokens.sourceEventRecorder, {
    useFactory: instanceCachingFactory(() => new PgSourceEventRepository(input.database.db)),
  });
  container.register(tokens.sourceEventPolicyReader, {
    useFactory: instanceCachingFactory(() => new PgSourceEventRepository(input.database.db)),
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
  container.register(tokens.dependencyBindingSecretStore, {
    useFactory: instanceCachingFactory(() => new PgDependencyBindingSecretStore(input.database.db)),
  });
  container.register(tokens.dependencyResourceSecretStore, {
    useFactory: instanceCachingFactory(
      () => new PgDependencyResourceSecretStore(input.database.db),
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
  container.register(tokens.projectOwnershipReadModel, {
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
  container.register(tokens.previewPolicyReadModel, {
    useFactory: instanceCachingFactory(() => new PgPreviewPolicyRepository(input.database.db)),
  });
  container.register(tokens.previewPolicyDecisionReadModel, {
    useFactory: instanceCachingFactory(
      () => new PgPreviewPolicyDecisionProjection(input.database.db),
    ),
  });
  container.register(tokens.scheduledTaskReadModel, {
    useFactory: instanceCachingFactory(() => new PgScheduledTaskReadModel(input.database.db)),
  });
  container.register(tokens.scheduledTaskRunReadModel, {
    useFactory: instanceCachingFactory(() => new PgScheduledTaskRunReadModel(input.database.db)),
  });
  container.register(tokens.scheduledTaskRunLogReadModel, {
    useFactory: instanceCachingFactory(() => new PgScheduledTaskRunLogReadModel(input.database.db)),
  });
  container.register(tokens.dependencyResourceReadModel, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new PgDependencyResourceReadModel(
          input.database.db,
          dependencyContainer.resolve(tokens.dependencyResourceDeleteSafetyReader),
        ),
    ),
  });
  container.register(tokens.dependencyResourceBackupReadModel, {
    useFactory: instanceCachingFactory(
      () => new PgDependencyResourceBackupReadModel(input.database.db),
    ),
  });
  container.register(tokens.resourceDependencyBindingReadModel, {
    useFactory: instanceCachingFactory(
      () => new PgResourceDependencyBindingReadModel(input.database.db),
    ),
  });
  container.register(tokens.storageVolumeReadModel, {
    useFactory: instanceCachingFactory(() => new PgStorageVolumeReadModel(input.database.db)),
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
  container.register(tokens.processAttemptRecoveryRecorder, {
    useFactory: instanceCachingFactory(
      () => input.processAttemptRecoveryRecorder ?? new PgProcessAttemptJournal(input.database.db),
    ),
  });
  container.register(tokens.processAttemptReadModel, {
    useFactory: instanceCachingFactory(() => new PgProcessAttemptJournal(input.database.db)),
  });
  container.register(tokens.processAttemptRetryCandidateReader, {
    useFactory: instanceCachingFactory(
      () =>
        input.processAttemptRetryCandidateReader ?? new PgProcessAttemptJournal(input.database.db),
    ),
  });
  container.register(tokens.processAttemptDeliveryCandidateReader, {
    useFactory: instanceCachingFactory(
      () =>
        input.processAttemptDeliveryCandidateReader ??
        new PgProcessAttemptJournal(input.database.db),
    ),
  });
  container.register(tokens.processAttemptRetryGenerator, {
    useFactory: instanceCachingFactory(
      () => input.processAttemptRetryGenerator ?? new PgProcessAttemptJournal(input.database.db),
    ),
  });
  container.register(tokens.processAttemptClaimer, {
    useFactory: instanceCachingFactory(
      () => input.processAttemptClaimer ?? new PgProcessAttemptJournal(input.database.db),
    ),
  });
  container.register(tokens.processAttemptCompleter, {
    useFactory: instanceCachingFactory(
      () => input.processAttemptCompleter ?? new PgProcessAttemptJournal(input.database.db),
    ),
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
          dependencyContainer.resolve(tokens.dependencyResourceSecretStore),
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
          dependencyContainer.resolve(tokens.dependencyResourceSecretStore),
        ),
        ...(input.config.dockerSwarmExecution.enabled
          ? {
              swarmBackend: new DockerSwarmExecutionBackend(
                new DockerSwarmShellCommandRunner({
                  timeoutMs: input.config.dockerSwarmExecution.commandTimeoutMs,
                }),
                undefined,
                {
                  ...(input.config.dockerSwarmExecution.edgeNetworkName
                    ? { edgeNetworkName: input.config.dockerSwarmExecution.edgeNetworkName }
                    : {}),
                },
                dependencyContainer.resolve(tokens.dependencyResourceSecretStore),
              ),
            }
          : {}),
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
  container.register(tokens.resourceRuntimeControlTargetPort, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new RuntimeResourceRuntimeControlTarget(
          new RuntimeControlShellCommandExecutor({
            serverRepository: dependencyContainer.resolve(tokens.serverRepository),
          }),
        ),
    ),
  });
  container.register(tokens.scheduledTaskRuntimePort, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new RuntimeTargetScheduledTaskRuntimePort({
          deploymentReadModel: dependencyContainer.resolve(tokens.deploymentReadModel),
          serverRepository: dependencyContainer.resolve(tokens.serverRepository),
        }),
    ),
  });
  container.register(tokens.resourceRuntimeControlAttemptRecorder, {
    useFactory: instanceCachingFactory(
      () => new PgResourceRuntimeControlAttemptRecorder(input.database.db),
    ),
  });
  container.register(tokens.resourceHealthProbeRunner, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new RuntimeResourceHealthProbeRunner(
          undefined,
          dependencyContainer.resolve(tokens.serverRepository),
        ),
    ),
  });
  container.register(tokens.terminalSessionGateway, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new RuntimeTerminalSessionGateway({
          allowTerminalSessions: input.config.runtimeMode === "self-hosted",
          auditEventRecorder: dependencyContainer.resolve(tokens.auditEventRecorder),
          activeSessionTtlMs: input.config.terminalSessions.activeTtlSeconds * 1000,
          outputRetentionBytes: input.config.terminalSessions.outputRetentionBytes,
          clock: dependencyContainer.resolve(tokens.clock),
          idGenerator: dependencyContainer.resolve(tokens.idGenerator),
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
          [
            ...createBuiltinPlugins({
              appVersion: input.config.appVersion,
            }),
            ...(input.systemPlugins ?? []),
          ],
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
  container.register(tokens.githubSourceEventWebhookVerifier, {
    useFactory: instanceCachingFactory(() => createGitHubSourceEventWebhookVerifier()),
  });
  container.register(tokens.githubPreviewPullRequestWebhookVerifier, {
    useFactory: instanceCachingFactory(() => createGitHubPreviewPullRequestWebhookVerifier()),
  });
  container.register(tokens.diagnostics, {
    useFactory: instanceCachingFactory(
      () => new PgDiagnostics(input.database.db, input.migrator, input.database.descriptor),
    ),
  });
  container.register(tokens.instanceUpgrade, {
    useFactory: instanceCachingFactory(() => new SelfHostedInstanceUpgradePort(input.config)),
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

  container.register(tokens.operationGuardPort, {
    useFactory: instanceCachingFactory(() => new AllowAllOperationGuardPort()),
  });

  container.register(tokens.commandBus, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new CommandBus(
          dependencyContainer,
          dependencyContainer.resolve(tokens.logger),
          dependencyContainer.resolve<OperationGuardPort>(tokens.operationGuardPort),
        ),
    ),
  });
  container.register(tokens.queryBus, {
    useFactory: instanceCachingFactory(
      (dependencyContainer) =>
        new QueryBus(
          dependencyContainer,
          dependencyContainer.resolve(tokens.logger),
          dependencyContainer.resolve<OperationGuardPort>(tokens.operationGuardPort),
        ),
    ),
  });
}
