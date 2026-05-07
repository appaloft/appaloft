import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createExecutionContext,
  type DiagnosticsPort,
  type EdgeProxyDiagnosticsInput,
  type EdgeProxyEnsureInput,
  type EdgeProxyExecutionContext,
  type EdgeProxyProvider,
  type EdgeProxyProviderCapabilities,
  type EdgeProxyProviderRegistry,
  type EdgeProxyProviderSelectionInput,
  ListResourcesQueryService,
  MarkServerAppliedRouteAppliedSpec,
  MarkServerAppliedRouteFailedSpec,
  type ProxyConfigurationViewInput,
  type ProxyReloadInput,
  type ProxyRouteRealizationInput,
  type RepositoryContext,
  ResourceDiagnosticSummaryQuery,
  ResourceDiagnosticSummaryQueryService,
  ResourceHealthQuery,
  ResourceHealthQueryService,
  ResourceProxyConfigurationPreviewQuery,
  ResourceProxyConfigurationPreviewQueryService,
  ResourceRuntimeLogsQueryService,
  ServerAppliedRouteStateByRouteSetIdSpec,
  ServerAppliedRouteStateBySourceFingerprintSpec,
  ServerAppliedRouteStateByTargetSpec,
  SourceLinkBySourceFingerprintSpec,
  type SourceLinkRecord,
  toRepositoryContext,
  UpsertServerAppliedRouteDesiredStateSpec,
  UpsertSourceLinkSpec,
} from "@appaloft/application";
import {
  BuildStrategyKindValue,
  ConfigKey,
  ConfigScopeValue,
  ConfigValueText,
  CreatedAt,
  Deployment,
  DeploymentId,
  DeploymentLogEntry,
  DeploymentPhaseValue,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DeploymentTargetName,
  Destination,
  DestinationId,
  DestinationKindValue,
  DestinationName,
  DetectSummary,
  DisplayNameText,
  type DomainError,
  domainError,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  EnvironmentProfile,
  EnvironmentSnapshotId,
  ExecutionResult,
  ExecutionStatusValue,
  ExecutionStrategyKindValue,
  ExitCode,
  err,
  FinishedAt,
  GeneratedAt,
  HostAddress,
  ImageReference,
  LogLevelValue,
  MessageText,
  OccurredAt,
  ok,
  PackagingModeValue,
  PlanStepText,
  PortNumber,
  Project,
  ProjectId,
  ProjectName,
  ProviderKey,
  Resource,
  ResourceByIdSpec,
  ResourceExposureModeValue,
  ResourceGeneratedAccessModeValue,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  ResourceNetworkProtocolValue,
  type Result,
  RoutePathPrefix,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  Server,
  ServerByIdSpec,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  StartedAt,
  TargetKindValue,
  UpdatedAt,
  UpsertDeploymentSpec,
  UpsertDestinationSpec,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceSpec,
  UpsertServerSpec,
  VariableExposureValue,
  VariableKindValue,
} from "@appaloft/core";
import { type Kysely, sql } from "kysely";
import { type Database } from "../src/schema";

function createRouteSetId(target: {
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId?: string;
}): string {
  return [
    target.projectId,
    target.environmentId,
    target.resourceId,
    target.serverId,
    target.destinationId ?? "default",
  ].join(":");
}

function sameSourceLinkTarget(
  record: {
    projectId: string;
    environmentId: string;
    resourceId: string;
    serverId?: string;
    destinationId?: string;
  },
  target: {
    projectId: string;
    environmentId: string;
    resourceId: string;
    serverId?: string;
    destinationId?: string;
  },
): boolean {
  return (
    record.projectId === target.projectId &&
    record.environmentId === target.environmentId &&
    record.resourceId === target.resourceId &&
    record.serverId === target.serverId &&
    record.destinationId === target.destinationId
  );
}

function sourceLinkConflict(
  expectedCurrentResourceId: string,
  actualResourceId: string,
): DomainError {
  return {
    code: "source_link_conflict",
    category: "user",
    message: "Source link current resource guard did not match",
    retryable: false,
    details: {
      phase: "source-link-resolution",
      expectedCurrentResourceId,
      actualResourceId,
    },
  };
}

function routeStateConflict(expectedRouteSetId: string, actualRouteSetId: string): DomainError {
  return {
    code: "server_applied_route_state_conflict",
    category: "user",
    message: "Server-applied route state did not match expected route set",
    retryable: false,
    details: {
      phase: "proxy-route-realization",
      expectedRouteSetId,
      actualRouteSetId,
    },
  };
}

function createTestExecutionContext() {
  return createExecutionContext({
    entrypoint: "system",
    requestId: "req_pglite_test",
    tracer: {
      startActiveSpan(_name, _options, callback) {
        return Promise.resolve(
          callback({
            addEvent() {},
            recordError() {},
            setAttribute() {},
            setAttributes() {},
            setStatus() {},
          }),
        );
      },
    },
  });
}

function createRepositoryContext(): RepositoryContext {
  return toRepositoryContext(createTestExecutionContext());
}

function createSourceLinkStore(
  repository: import("@appaloft/persistence-pg").PgSourceLinkRepository,
) {
  return {
    async createIfMissing(input: {
      sourceFingerprint: string;
      target: {
        projectId: string;
        environmentId: string;
        resourceId: string;
        serverId?: string;
        destinationId?: string;
      };
      updatedAt: string;
    }): Promise<Result<SourceLinkRecord>> {
      const existing = await repository.findOne(
        SourceLinkBySourceFingerprintSpec.create(input.sourceFingerprint),
      );
      if (existing.isErr()) {
        return err(existing.error);
      }

      if (existing.value) {
        return ok(existing.value);
      }

      const record = {
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
    read(sourceFingerprint: string): Promise<Result<SourceLinkRecord | null>> {
      return repository.findOne(SourceLinkBySourceFingerprintSpec.create(sourceFingerprint));
    },
    async relink(input: {
      sourceFingerprint: string;
      target: {
        projectId: string;
        environmentId: string;
        resourceId: string;
        serverId?: string;
        destinationId?: string;
      };
      updatedAt: string;
      expectedCurrentResourceId?: string;
      reason?: string;
    }): Promise<Result<SourceLinkRecord>> {
      const existing = await repository.findOne(
        SourceLinkBySourceFingerprintSpec.create(input.sourceFingerprint),
      );
      if (existing.isErr()) {
        return err(existing.error);
      }

      if (existing.value) {
        if (
          input.expectedCurrentResourceId &&
          existing.value.resourceId !== input.expectedCurrentResourceId
        ) {
          return err(
            sourceLinkConflict(input.expectedCurrentResourceId, existing.value.resourceId),
          );
        }

        if (sameSourceLinkTarget(existing.value, input.target)) {
          return ok(existing.value);
        }
      }

      const record = {
        sourceFingerprint: input.sourceFingerprint,
        projectId: input.target.projectId,
        environmentId: input.target.environmentId,
        resourceId: input.target.resourceId,
        updatedAt: input.updatedAt,
        ...(input.target.serverId ? { serverId: input.target.serverId } : {}),
        ...(input.target.destinationId ? { destinationId: input.target.destinationId } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
      };
      return repository.upsert(record, UpsertSourceLinkSpec.fromRecord(record));
    },
    unlink(sourceFingerprint: string): Promise<Result<boolean>> {
      return repository.deleteOne(SourceLinkBySourceFingerprintSpec.create(sourceFingerprint));
    },
  };
}

function createServerAppliedRouteStateStore(
  repository: import("@appaloft/persistence-pg").PgServerAppliedRouteStateRepository,
) {
  return {
    upsertDesired(input: {
      target: {
        projectId: string;
        environmentId: string;
        resourceId: string;
        serverId: string;
        destinationId?: string;
      };
      domains: Array<{
        host: string;
        pathPrefix: string;
        tlsMode: "auto" | "disabled";
        redirectTo?: string;
        redirectStatus?: 301 | 302 | 307 | 308;
      }>;
      sourceFingerprint?: string;
      updatedAt: string;
    }) {
      const record = {
        routeSetId: createRouteSetId(input.target),
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
    async read(target: {
      projectId: string;
      environmentId: string;
      resourceId: string;
      serverId: string;
      destinationId?: string;
    }) {
      const exact = await repository.findOne(ServerAppliedRouteStateByTargetSpec.create(target));
      if (exact.isErr() || exact.value || !target.destinationId) {
        return exact;
      }

      return repository.findOne(
        ServerAppliedRouteStateByTargetSpec.create({
          projectId: target.projectId,
          environmentId: target.environmentId,
          resourceId: target.resourceId,
          serverId: target.serverId,
        }),
      );
    },
    async markApplied(input: {
      target: {
        projectId: string;
        environmentId: string;
        resourceId: string;
        serverId: string;
        destinationId?: string;
      };
      deploymentId: string;
      updatedAt: string;
      routeSetId?: string;
      providerKey?: string;
      proxyKind?: "traefik" | "caddy";
    }) {
      const existing = await repository.findOne(
        ServerAppliedRouteStateByTargetSpec.create(input.target),
      );
      if (existing.isErr()) {
        return existing;
      }

      const routeSetId = input.routeSetId ?? createRouteSetId(input.target);
      if (existing.value && existing.value.routeSetId !== routeSetId) {
        return err(routeStateConflict(routeSetId, existing.value.routeSetId));
      }

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
    async markFailed(input: {
      target: {
        projectId: string;
        environmentId: string;
        resourceId: string;
        serverId: string;
        destinationId?: string;
      };
      deploymentId: string;
      updatedAt: string;
      phase: string;
      errorCode: string;
      message?: string;
      retryable: boolean;
      routeSetId?: string;
      providerKey?: string;
      proxyKind?: "traefik" | "caddy";
    }) {
      const existing = await repository.findOne(
        ServerAppliedRouteStateByTargetSpec.create(input.target),
      );
      if (existing.isErr()) {
        return existing;
      }

      const routeSetId = input.routeSetId ?? createRouteSetId(input.target);
      if (existing.value && existing.value.routeSetId !== routeSetId) {
        return err(routeStateConflict(routeSetId, existing.value.routeSetId));
      }

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
    deleteDesired(target: {
      projectId: string;
      environmentId: string;
      resourceId: string;
      serverId: string;
      destinationId?: string;
    }) {
      return repository.deleteOne(ServerAppliedRouteStateByTargetSpec.create(target));
    },
    deleteDesiredBySourceFingerprint(sourceFingerprint: string) {
      return repository.deleteMany(
        ServerAppliedRouteStateBySourceFingerprintSpec.create(sourceFingerprint),
      );
    },
  };
}

class FixedClock {
  now(): string {
    return "2026-01-01T00:10:00.000Z";
  }
}

class EmptyDestinationRepository {
  async findOne(): Promise<null> {
    return null;
  }

  async upsert(): Promise<void> {}
}

class EmptyServerRepository {
  async findOne(): Promise<null> {
    return null;
  }

  async upsert(): Promise<void> {}
}

class DisabledDefaultAccessDomainProvider {
  async generate() {
    return ok({
      kind: "disabled" as const,
      reason: "test-disabled",
    });
  }
}

class EmptyResourceRepository {
  async findOne(): Promise<null> {
    return null;
  }

  async upsert(): Promise<void> {}
}

class StaticResourceHealthProbeRunner {
  async probe(
    _context: unknown,
    request: { name: string; target: "runtime" | "public-access"; expectedStatusCode: number },
  ) {
    return ok({
      name: request.name,
      target: request.target,
      status: "passed" as const,
      observedAt: "2026-01-01T00:10:01.000Z",
      durationMs: 12,
      statusCode: request.expectedStatusCode,
    });
  }
}

class EmptyRuntimeLogStream {
  async close(): Promise<void> {}

  async *[Symbol.asyncIterator](): AsyncIterator<never> {}
}

class EmptyRuntimeLogReader {
  async open() {
    return ok(new EmptyRuntimeLogStream());
  }
}

class StaticDiagnosticsPort implements DiagnosticsPort {
  async readiness() {
    return {
      status: "ready" as const,
      checks: {
        database: true,
        migrations: true,
      },
      details: {
        databaseDriver: "pglite",
        databaseMode: "embedded",
        databaseLocation: "/Users/example/private/db",
      },
    };
  }

  async migrationStatus() {
    return {
      pending: [],
      executed: [],
    };
  }

  async migrate() {
    return {
      executed: [],
    };
  }
}

class FakeEdgeProxyProvider implements EdgeProxyProvider {
  readonly key = "traefik";
  readonly displayName = "Traefik";
  readonly capabilities: EdgeProxyProviderCapabilities = {
    ensureProxy: true,
    dockerLabels: true,
    reloadProxy: true,
    configurationView: true,
    runtimeLogs: false,
    diagnostics: false,
  };

  async ensureProxy(_context: EdgeProxyExecutionContext, _input: EdgeProxyEnsureInput) {
    return err(domainError.provider("not used"));
  }

  async diagnoseProxy(_context: EdgeProxyExecutionContext, _input: EdgeProxyDiagnosticsInput) {
    return err(domainError.provider("not used"));
  }

  async realizeRoutes(_context: EdgeProxyExecutionContext, input: ProxyRouteRealizationInput) {
    return ok({
      providerKey: this.key,
      networkName: "appaloft-edge",
      labels: [
        `traefik.http.services.${input.deploymentId}.loadbalancer.server.port=${input.port}`,
      ],
    });
  }

  async reloadProxy(_context: EdgeProxyExecutionContext, input: ProxyReloadInput) {
    return ok({
      providerKey: this.key,
      proxyKind: input.proxyKind,
      displayName: this.displayName,
      required: false,
      steps: [],
    });
  }

  async renderConfigurationView(
    _context: EdgeProxyExecutionContext,
    input: ProxyConfigurationViewInput,
  ) {
    const routes = input.accessRoutes.flatMap((route) =>
      route.domains.map((hostname) => ({
        hostname,
        scheme: route.tlsMode === "auto" ? ("https" as const) : ("http" as const),
        url: `${route.tlsMode === "auto" ? "https" : "http"}://${hostname}`,
        pathPrefix: route.pathPrefix,
        tlsMode: route.tlsMode,
        ...(route.targetPort === undefined ? {} : { targetPort: route.targetPort }),
        source:
          route.source ??
          (input.routeScope === "planned" ? "generated-default" : "deployment-snapshot"),
        ...(route.routeBehavior ? { routeBehavior: route.routeBehavior } : {}),
        ...(route.redirectTo ? { redirectTo: route.redirectTo } : {}),
        ...(route.redirectStatus ? { redirectStatus: route.redirectStatus } : {}),
      })),
    );

    return ok({
      resourceId: input.resourceId,
      ...(input.deploymentId ? { deploymentId: input.deploymentId } : {}),
      providerKey: this.key,
      routeScope: input.routeScope,
      status: input.status,
      generatedAt: input.generatedAt,
      stale: input.stale,
      routes,
      sections: [],
      warnings: [],
    });
  }
}

class StaticEdgeProxyProviderRegistry implements EdgeProxyProviderRegistry {
  constructor(private readonly provider: EdgeProxyProvider | null) {}

  resolve(_key: string) {
    return this.provider
      ? ok(this.provider)
      : err(domainError.proxyProviderUnavailable("missing provider"));
  }

  defaultFor(input: EdgeProxyProviderSelectionInput) {
    if (!input.proxyKind || input.proxyKind === "none") {
      return ok(null);
    }

    return this.resolve(this.provider?.key ?? "missing");
  }
}

async function seedSourceLinkContext(
  db: Kysely<Database>,
  suffix: string,
  input?: {
    lifecycleStatus?: string;
    archivedAt?: string;
  },
): Promise<{
  projectId: string;
  environmentId: string;
  resourceId: string;
  serverId: string;
  destinationId: string;
}> {
  const projectId = `prj_source_${suffix}`;
  const serverId = `srv_source_${suffix}`;
  const destinationId = `dst_source_${suffix}`;
  const environmentId = `env_source_${suffix}`;
  const resourceId = `res_source_${suffix}`;
  const createdAt = "2026-01-01T00:00:00.000Z";

  await db
    .insertInto("projects")
    .values({
      id: projectId,
      name: `Source ${suffix}`,
      slug: `source-${suffix}`,
      description: null,
      created_at: createdAt,
    })
    .execute();

  await db
    .insertInto("servers")
    .values({
      id: serverId,
      name: `source-${suffix}`,
      host: "127.0.0.1",
      port: 22,
      provider_key: "generic-ssh",
      edge_proxy_kind: null,
      edge_proxy_status: null,
      edge_proxy_last_attempt_at: null,
      edge_proxy_last_succeeded_at: null,
      edge_proxy_last_error_code: null,
      edge_proxy_last_error_message: null,
      credential_id: null,
      credential_kind: null,
      credential_username: null,
      credential_public_key: null,
      credential_private_key: null,
      created_at: createdAt,
    })
    .execute();

  await db
    .insertInto("destinations")
    .values({
      id: destinationId,
      server_id: serverId,
      name: "default",
      kind: "generic",
      created_at: createdAt,
    })
    .execute();

  await db
    .insertInto("environments")
    .values({
      id: environmentId,
      project_id: projectId,
      name: "production",
      kind: "production",
      parent_environment_id: null,
      created_at: createdAt,
    })
    .execute();

  await db
    .insertInto("resources")
    .values({
      id: resourceId,
      project_id: projectId,
      environment_id: environmentId,
      destination_id: destinationId,
      name: "web",
      slug: `web-${suffix}`,
      kind: "application",
      description: null,
      services: [],
      source_binding: null,
      runtime_profile: null,
      network_profile: null,
      lifecycle_status: input?.lifecycleStatus ?? "active",
      archived_at: input?.archivedAt ?? null,
      archive_reason: null,
      deleted_at: null,
      created_at: createdAt,
    })
    .execute();

  return {
    projectId,
    environmentId,
    resourceId,
    serverId,
    destinationId,
  };
}

async function enableReverseProxyResource(
  db: Kysely<Database>,
  resourceId: string,
  input?: {
    internalPort?: number;
    targetServiceName?: string;
  },
): Promise<void> {
  await db
    .updateTable("resources")
    .set({
      services: [
        {
          name: "web",
          kind: "web",
        },
      ],
      network_profile: {
        internalPort: input?.internalPort ?? 3000,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
        ...(input?.targetServiceName ? { targetServiceName: input.targetServiceName } : {}),
      },
    })
    .where("id", "=", resourceId)
    .execute();
}

async function insertDeploymentSnapshot(
  db: Kysely<Database>,
  target: Awaited<ReturnType<typeof seedSourceLinkContext>>,
  input: {
    id: string;
    status?: string;
    createdAt: string;
    routeSource: "generated-default" | "server-applied-config-domain" | "durable-domain-binding";
    hostname: string;
    pathPrefix?: string;
    tlsMode?: "auto" | "disabled";
    proxyKind?: "traefik" | "caddy";
    targetPort?: number;
  },
): Promise<void> {
  await db
    .insertInto("deployments")
    .values({
      id: input.id,
      project_id: target.projectId,
      environment_id: target.environmentId,
      resource_id: target.resourceId,
      server_id: target.serverId,
      destination_id: target.destinationId,
      status: input.status ?? "succeeded",
      runtime_plan: {
        id: `plan_${input.id}`,
        source: {
          kind: "local-folder",
          locator: ".",
          displayName: "workspace",
        },
        buildStrategy: "workspace-commands",
        packagingMode: "host-process-runtime",
        execution: {
          kind: "host-process",
          port: input.targetPort ?? 3000,
          accessRoutes: [
            {
              proxyKind: input.proxyKind ?? "traefik",
              domains: [input.hostname],
              pathPrefix: input.pathPrefix ?? "/",
              tlsMode: input.tlsMode ?? "disabled",
              targetPort: input.targetPort ?? 3000,
            },
          ],
          metadata: {
            "access.routeSource": input.routeSource,
            "access.hostname": input.hostname,
            "access.scheme": (input.tlsMode ?? "disabled") === "auto" ? "https" : "http",
          },
        },
        target: {
          kind: "single-server",
          providerKey: "generic-ssh",
          serverIds: [target.serverId],
        },
        detectSummary: "pglite access summary test",
        generatedAt: input.createdAt,
        steps: ["deploy", "verify"],
      },
      environment_snapshot: {
        id: `snap_${input.id}`,
        environmentId: target.environmentId,
        createdAt: input.createdAt,
        precedence: ["defaults", "environment", "deployment"],
        variables: [],
      },
      logs: [],
      created_at: input.createdAt,
      started_at: input.createdAt,
      finished_at: input.createdAt,
      rollback_of_deployment_id: null,
    })
    .execute();
}

async function insertDomainBinding(
  db: Kysely<Database>,
  target: Awaited<ReturnType<typeof seedSourceLinkContext>>,
  input: {
    id: string;
    domainName: string;
    status: string;
    createdAt: string;
    tlsMode?: "auto" | "disabled";
    proxyKind?: "traefik" | "caddy";
    pathPrefix?: string;
    redirectTo?: string;
    redirectStatus?: 301 | 302 | 307 | 308;
  },
): Promise<void> {
  await db
    .insertInto("domain_bindings")
    .values({
      id: input.id,
      project_id: target.projectId,
      environment_id: target.environmentId,
      resource_id: target.resourceId,
      server_id: target.serverId,
      destination_id: target.destinationId,
      domain_name: input.domainName,
      path_prefix: input.pathPrefix ?? "/",
      proxy_kind: input.proxyKind ?? "traefik",
      tls_mode: input.tlsMode ?? "disabled",
      redirect_to: input.redirectTo ?? null,
      redirect_status: input.redirectStatus ?? null,
      certificate_policy: "auto",
      status: input.status,
      verification_attempts: [],
      dns_observation: null,
      route_failure: null,
      idempotency_key: null,
      created_at: input.createdAt,
    })
    .execute();
}

describe("pglite persistence integration", () => {
  test("[SWARM-TARGET-REG-001] persists and reads deployment target kind", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-target-kind-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    const context = createRepositoryContext();

    try {
      const { createDatabase, createMigrator, PgServerReadModel, PgServerRepository } =
        await import("../src/index");
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      const migrator = createMigrator(database.db);
      await migrator.migrateToLatest();

      const serverRepository = new PgServerRepository(database.db);
      const serverReadModel = new PgServerReadModel(database.db);
      const server = Server.register({
        id: DeploymentTargetId.rehydrate("srv_swarm_manager"),
        name: DeploymentTargetName.rehydrate("Swarm manager"),
        host: HostAddress.rehydrate("swarm-manager.internal"),
        port: PortNumber.rehydrate(2377),
        providerKey: ProviderKey.rehydrate("docker-swarm"),
        targetKind: TargetKindValue.rehydrate("orchestrator-cluster"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();

      await serverRepository.upsert(context, server, UpsertServerSpec.fromServer(server));

      const persisted = await serverRepository.findOne(
        context,
        ServerByIdSpec.create(DeploymentTargetId.rehydrate("srv_swarm_manager")),
      );
      expect(persisted?.toState().targetKind.value).toBe("orchestrator-cluster");

      const readModel = await serverReadModel.findOne(
        context,
        ServerByIdSpec.create(DeploymentTargetId.rehydrate("srv_swarm_manager")),
      );
      expect(readModel?.targetKind).toBe("orchestrator-cluster");

      await database.close();
    } finally {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("persists environments and deployments to a file-backed embedded store", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    const context = createRepositoryContext();

    try {
      const suffix = crypto.randomUUID().slice(0, 8);
      const {
        createDatabase,
        createMigrator,
        PgDeploymentReadModel,
        PgDeploymentRepository,
        PgDestinationRepository,
        PgEnvironmentReadModel,
        PgEnvironmentRepository,
        PgProjectRepository,
        PgResourceReadModel,
        PgResourceRepository,
        PgServerRepository,
      } = await import("../src/index");
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      const migrator = createMigrator(database.db);
      await migrator.migrateToLatest();

      const projectRepository = new PgProjectRepository(database.db);
      const serverRepository = new PgServerRepository(database.db);
      const destinationRepository = new PgDestinationRepository(database.db);
      const environmentRepository = new PgEnvironmentRepository(database.db);
      const resourceRepository = new PgResourceRepository(database.db);
      const deploymentRepository = new PgDeploymentRepository(database.db);

      const project = Project.create({
        id: ProjectId.rehydrate(`prj_${suffix}`),
        name: ProjectName.rehydrate(`Embedded ${suffix}`),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();
      const server = Server.register({
        id: DeploymentTargetId.rehydrate(`srv_${suffix}`),
        name: DeploymentTargetName.rehydrate(`embedded-${suffix}`),
        host: HostAddress.rehydrate("127.0.0.1"),
        port: PortNumber.rehydrate(22),
        providerKey: ProviderKey.rehydrate("generic-ssh"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();
      const destination = Destination.register({
        id: DestinationId.rehydrate(`dst_${suffix}`),
        serverId: DeploymentTargetId.rehydrate(`srv_${suffix}`),
        name: DestinationName.rehydrate("default"),
        kind: DestinationKindValue.rehydrate("generic"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();
      const environment = EnvironmentProfile.create({
        id: EnvironmentId.rehydrate(`env_${suffix}`),
        projectId: ProjectId.rehydrate(`prj_${suffix}`),
        name: EnvironmentName.rehydrate("local"),
        kind: EnvironmentKindValue.rehydrate("local"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();
      const resource = Resource.create({
        id: ResourceId.rehydrate(`res_${suffix}`),
        projectId: ProjectId.rehydrate(`prj_${suffix}`),
        environmentId: EnvironmentId.rehydrate(`env_${suffix}`),
        destinationId: DestinationId.rehydrate(`dst_${suffix}`),
        name: ResourceName.rehydrate("web"),
        kind: ResourceKindValue.rehydrate("application"),
        networkProfile: {
          internalPort: PortNumber.rehydrate(3000),
          upstreamProtocol: ResourceNetworkProtocolValue.rehydrate("http"),
          exposureMode: ResourceExposureModeValue.rehydrate("reverse-proxy"),
        },
        accessProfile: {
          generatedAccessMode: ResourceGeneratedAccessModeValue.rehydrate("disabled"),
          pathPrefix: RoutePathPrefix.rehydrate("/internal"),
        },
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();

      environment.setVariable({
        key: ConfigKey.rehydrate("PUBLIC_SITE_NAME"),
        value: ConfigValueText.rehydrate("embedded-appaloft"),
        kind: VariableKindValue.rehydrate("plain-config"),
        exposure: VariableExposureValue.rehydrate("build-time"),
        scope: ConfigScopeValue.rehydrate("environment"),
        isSecret: false,
        updatedAt: UpdatedAt.rehydrate("2026-01-01T00:01:00.000Z"),
      });

      await projectRepository.upsert(context, project, UpsertProjectSpec.fromProject(project));
      await serverRepository.upsert(context, server, UpsertServerSpec.fromServer(server));
      await destinationRepository.upsert(
        context,
        destination,
        UpsertDestinationSpec.fromDestination(destination),
      );
      await environmentRepository.upsert(
        context,
        environment,
        UpsertEnvironmentSpec.fromEnvironment(environment),
      );
      await resourceRepository.upsert(context, resource, UpsertResourceSpec.fromResource(resource));

      const deployment = Deployment.create({
        id: DeploymentId.rehydrate(`dep_${suffix}`),
        projectId: ProjectId.rehydrate(`prj_${suffix}`),
        serverId: DeploymentTargetId.rehydrate(`srv_${suffix}`),
        destinationId: DestinationId.rehydrate(`dst_${suffix}`),
        environmentId: EnvironmentId.rehydrate(`env_${suffix}`),
        resourceId: ResourceId.rehydrate(`res_${suffix}`),
        runtimePlan: RuntimePlan.rehydrate({
          id: RuntimePlanId.rehydrate(`plan_${suffix}`),
          source: SourceDescriptor.rehydrate({
            kind: SourceKindValue.rehydrate("local-folder"),
            locator: SourceLocator.rehydrate("."),
            displayName: DisplayNameText.rehydrate("workspace"),
          }),
          buildStrategy: BuildStrategyKindValue.rehydrate("dockerfile"),
          packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
          execution: RuntimeExecutionPlan.rehydrate({
            kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
            image: ImageReference.rehydrate("demo:test"),
            port: PortNumber.rehydrate(3000),
          }),
          target: DeploymentTargetDescriptor.rehydrate({
            kind: TargetKindValue.rehydrate("single-server"),
            providerKey: ProviderKey.rehydrate("generic-ssh"),
            serverIds: [DeploymentTargetId.rehydrate(`srv_${suffix}`)],
          }),
          detectSummary: DetectSummary.rehydrate("pglite integration test"),
          steps: [
            PlanStepText.rehydrate("package"),
            PlanStepText.rehydrate("deploy"),
            PlanStepText.rehydrate("verify"),
          ],
          generatedAt: GeneratedAt.rehydrate("2026-01-01T00:02:00.000Z"),
        }),
        environmentSnapshot: environment.materializeSnapshot({
          snapshotId: EnvironmentSnapshotId.rehydrate(`snap_${suffix}`),
          createdAt: GeneratedAt.rehydrate("2026-01-01T00:02:00.000Z"),
        }),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:02:00.000Z"),
      })._unsafeUnwrap();

      deployment.markPlanning(StartedAt.rehydrate("2026-01-01T00:02:00.000Z"))._unsafeUnwrap();
      deployment.markPlanned(StartedAt.rehydrate("2026-01-01T00:02:01.000Z"))._unsafeUnwrap();
      deployment.start(StartedAt.rehydrate("2026-01-01T00:02:02.000Z"))._unsafeUnwrap();
      deployment.applyExecutionResult(
        FinishedAt.rehydrate("2026-01-01T00:02:03.000Z"),
        ExecutionResult.rehydrate({
          exitCode: ExitCode.rehydrate(0),
          status: ExecutionStatusValue.rehydrate("succeeded"),
          retryable: false,
          logs: [
            DeploymentLogEntry.rehydrate({
              timestamp: OccurredAt.rehydrate("2026-01-01T00:02:03.000Z"),
              phase: DeploymentPhaseValue.rehydrate("verify"),
              level: LogLevelValue.rehydrate("info"),
              message: MessageText.rehydrate("embedded deployment persisted"),
            }),
          ],
          metadata: {
            "source.commitSha": "57ea0764b8f0a491fd1d30bedc5cbe281744b36c",
          },
        }),
      );

      (
        await deploymentRepository.insertOne(
          context,
          deployment,
          UpsertDeploymentSpec.fromDeployment(deployment),
        )
      )._unsafeUnwrap();
      (
        await deploymentRepository.updateOne(
          context,
          deployment,
          UpsertDeploymentSpec.fromDeployment(deployment),
        )
      )._unsafeUnwrap();
      await database.close();

      const reopened = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      const reopenedMigrator = createMigrator(reopened.db);
      const migrationStatus = await reopenedMigrator.getMigrations();
      const reopenedResourceRepository = new PgResourceRepository(reopened.db);
      const environmentReadModel = new PgEnvironmentReadModel(reopened.db, "****");
      const deploymentReadModel = new PgDeploymentReadModel(reopened.db);
      const resourceReadModel = new PgResourceReadModel(reopened.db);

      const environments = await environmentReadModel.list(context, `prj_${suffix}`);
      const deployments = await deploymentReadModel.list(context, { projectId: `prj_${suffix}` });
      const persistedResource = await reopenedResourceRepository.findOne(
        context,
        ResourceByIdSpec.create(ResourceId.rehydrate(`res_${suffix}`)),
      );
      const resourceSummary = await resourceReadModel.findOne(
        context,
        ResourceByIdSpec.create(ResourceId.rehydrate(`res_${suffix}`)),
      );

      expect(migrationStatus.every((migration) => migration.executedAt !== undefined)).toBe(true);
      expect(persistedResource?.toState().accessProfile?.generatedAccessMode.value).toBe(
        "disabled",
      );
      expect(persistedResource?.toState().accessProfile?.pathPrefix.value).toBe("/internal");
      expect(resourceSummary?.accessProfile).toEqual({
        generatedAccessMode: "disabled",
        pathPrefix: "/internal",
      });
      expect(environments[0]?.maskedVariables).toEqual([
        expect.objectContaining({
          key: "PUBLIC_SITE_NAME",
          value: "embedded-appaloft",
          isSecret: false,
        }),
      ]);
      expect(deployments[0]?.environmentSnapshot.id).toBe(`snap_${suffix}`);
      expect(deployments[0]?.sourceCommitSha).toBe("57ea0764b8f0a491fd1d30bedc5cbe281744b36c");
      expect(deployments[0]?.logCount).toBe(1);

      await reopened.close();
    } finally {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[RES-PROFILE-DELETE-006] reads audit-retention deletion blockers", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-delete-blockers-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    const context = createRepositoryContext();
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const { createDatabase, createMigrator, PgResourceDeletionBlockerReader } = await import(
        "../src/index"
      );
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      await database.db
        .insertInto("audit_logs")
        .values({
          id: "audit_res_web",
          aggregate_id: "res_web",
          event_type: "resource-archived",
          payload: {
            resourceId: "res_web",
          },
          created_at: "2026-01-01T00:00:00.000Z",
        })
        .execute();

      const reader = new PgResourceDeletionBlockerReader(database.db);
      const result = await reader.findBlockers(context, {
        resourceId: "res_web",
      });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toContainEqual({
        kind: "audit-retention",
        relatedEntityId: "audit_res_web",
        relatedEntityType: "audit-log",
        count: 1,
      });
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[SOURCE-LINK-STATE-015] pg source link store persists and reads mappings", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-source-links-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const { createDatabase, createMigrator, PgSourceLinkRepository } = await import(
        "../src/index"
      );
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const target = await seedSourceLinkContext(database.db, "persist");
      const store = createSourceLinkStore(new PgSourceLinkRepository(database.db));
      const sourceFingerprint = "source-fingerprint:v1:branch%3Apersist";

      const created = await store.createIfMissing({
        sourceFingerprint,
        target,
        updatedAt: "2026-01-01T00:01:00.000Z",
      });
      expect(created.isOk()).toBe(true);
      expect(created._unsafeUnwrap()).toEqual({
        sourceFingerprint,
        ...target,
        updatedAt: "2026-01-01T00:01:00.000Z",
      });

      const row = await database.db
        .selectFrom("source_links")
        .selectAll()
        .where("source_fingerprint", "=", sourceFingerprint)
        .executeTakeFirstOrThrow();
      expect(row.metadata).toEqual({});

      const read = await store.read(sourceFingerprint);
      expect(read.isOk()).toBe(true);
      expect(read._unsafeUnwrap()).toEqual(created._unsafeUnwrap());
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[SOURCE-LINK-STATE-016] pg source link relink is idempotent and guarded", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-source-link-guard-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const { createDatabase, createMigrator, PgSourceLinkRepository } = await import(
        "../src/index"
      );
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const target = await seedSourceLinkContext(database.db, "guard");
      const store = createSourceLinkStore(new PgSourceLinkRepository(database.db));
      const sourceFingerprint = "source-fingerprint:v1:branch%3Aguard";
      const initial = await store.createIfMissing({
        sourceFingerprint,
        target,
        updatedAt: "2026-01-01T00:01:00.000Z",
      });
      expect(initial.isOk()).toBe(true);

      const sameTarget = await store.relink({
        sourceFingerprint,
        target,
        updatedAt: "2026-01-01T00:02:00.000Z",
        expectedCurrentResourceId: target.resourceId,
        reason: "same target",
      });
      expect(sameTarget.isOk()).toBe(true);
      expect(sameTarget._unsafeUnwrap().updatedAt).toBe("2026-01-01T00:01:00.000Z");

      const conflict = await store.relink({
        sourceFingerprint,
        target,
        updatedAt: "2026-01-01T00:03:00.000Z",
        expectedCurrentResourceId: "res_expected_elsewhere",
      });
      expect(conflict.isErr()).toBe(true);
      if (conflict.isOk()) {
        throw new Error("Expected source link conflict");
      }
      expect(conflict.error.code).toBe("source_link_conflict");
      expect(conflict.error.details).toMatchObject({
        phase: "source-link-resolution",
        expectedCurrentResourceId: "res_expected_elsewhere",
        actualResourceId: target.resourceId,
      });

      const rows = await database.db
        .selectFrom("source_links")
        .selectAll()
        .where("source_fingerprint", "=", sourceFingerprint)
        .execute();
      expect(rows).toHaveLength(1);
      expect(rows[0]?.resource_id).toBe(target.resourceId);
      expect(new Date(rows[0]?.updated_at ?? "").toISOString()).toBe("2026-01-01T00:01:00.000Z");
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[SOURCE-LINK-STATE-017] resource delete sees pg source link blocker", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-source-link-blocker-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    const context = createRepositoryContext();
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const {
        createDatabase,
        createMigrator,
        PgResourceDeletionBlockerReader,
        PgSourceLinkRepository,
      } = await import("../src/index");
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const target = await seedSourceLinkContext(database.db, "blocker", {
        lifecycleStatus: "archived",
        archivedAt: "2026-01-01T00:02:00.000Z",
      });
      const sourceFingerprint = "source-fingerprint:v1:branch%3Ablocker";
      const store = createSourceLinkStore(new PgSourceLinkRepository(database.db));
      const created = await store.createIfMissing({
        sourceFingerprint,
        target,
        updatedAt: "2026-01-01T00:03:00.000Z",
      });
      expect(created.isOk()).toBe(true);

      const reader = new PgResourceDeletionBlockerReader(database.db);
      const result = await reader.findBlockers(context, {
        resourceId: target.resourceId,
      });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toContainEqual({
        kind: "source-link",
        relatedEntityId: sourceFingerprint,
        relatedEntityType: "source-link",
        count: 1,
      });
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[CERT-SECRET-STORE-001] pg certificate secret store persists managed certificate bundles durably", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-certificate-secret-managed-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const { createDatabase, createMigrator, PgCertificateSecretStore } = await import(
        "../src/index"
      );
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const target = await seedSourceLinkContext(database.db, "cert-secret-managed");
      await insertDomainBinding(database.db, target, {
        id: "dmb_cert_secret_managed",
        domainName: "managed.example.test",
        status: "bound",
        tlsMode: "auto",
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      const store = new PgCertificateSecretStore(database.db, new FixedClock());
      const result = await store.store(createTestExecutionContext(), {
        certificateId: "crt_managed",
        domainBindingId: "dmb_cert_secret_managed",
        domainName: "managed.example.test",
        attemptId: "cat_managed",
        providerKey: "acme",
        issuedAt: "2026-01-01T00:00:01.000Z",
        expiresAt: "2026-02-01T00:00:01.000Z",
        certificatePem: "  leaf-cert  ",
        privateKeyPem: "  private-key  ",
        certificateChainPem: "  issuer-chain  ",
      });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual({
        secretRef: "appaloft+pg://certificate/crt_managed/cat_managed/managed-bundle",
      });

      const row = await database.db
        .selectFrom("certificate_secrets")
        .selectAll()
        .where("ref", "=", "appaloft+pg://certificate/crt_managed/cat_managed/managed-bundle")
        .executeTakeFirstOrThrow();

      expect(row.source).toBe("managed");
      expect(row.kind).toBe("managed-bundle");
      expect(row.payload).toEqual({
        certificatePem: "leaf-cert",
        privateKeyPem: "private-key",
        certificateChainPem: "issuer-chain",
      });
      expect(row.metadata).toEqual({
        providerKey: "acme",
        domainName: "managed.example.test",
        issuedAt: "2026-01-01T00:00:01.000Z",
        expiresAt: "2026-02-01T00:00:01.000Z",
      });

      const deactivated = await store.deactivate(createTestExecutionContext(), {
        certificateId: "crt_managed",
        domainBindingId: "dmb_cert_secret_managed",
        reason: "revoked",
        deactivatedAt: "2026-01-01T00:10:00.000Z",
      });
      expect(deactivated.isOk()).toBe(true);

      const deactivatedRow = await database.db
        .selectFrom("certificate_secrets")
        .selectAll()
        .where("ref", "=", "appaloft+pg://certificate/crt_managed/cat_managed/managed-bundle")
        .executeTakeFirstOrThrow();

      expect(deactivatedRow.metadata).toEqual({
        providerKey: "acme",
        domainName: "managed.example.test",
        issuedAt: "2026-01-01T00:00:01.000Z",
        expiresAt: "2026-02-01T00:00:01.000Z",
        deactivatedAt: "2026-01-01T00:10:00.000Z",
        deactivationReason: "revoked",
      });
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[CERT-SECRET-STORE-002] pg certificate secret store persists imported material with stable refs", async () => {
    const workspaceDir = mkdtempSync(
      join(tmpdir(), "appaloft-pglite-certificate-secret-imported-"),
    );
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const { createDatabase, createMigrator, PgCertificateSecretStore } = await import(
        "../src/index"
      );
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const target = await seedSourceLinkContext(database.db, "cert-secret-imported");
      await insertDomainBinding(database.db, target, {
        id: "dmb_cert_secret_imported",
        domainName: "manual.example.test",
        status: "bound",
        tlsMode: "auto",
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      const store = new PgCertificateSecretStore(database.db, new FixedClock());
      const importedInput = {
        certificateId: "crt_imported",
        domainBindingId: "dmb_cert_secret_imported",
        domainName: "manual.example.test",
        attemptId: "cat_imported",
        certificateChain: "  chain-pem  ",
        privateKey: "  private-key  ",
        passphrase: "  passphrase  ",
      };

      const first = await store.storeImported(createTestExecutionContext(), importedInput);
      const second = await store.storeImported(createTestExecutionContext(), importedInput);

      expect(first.isOk()).toBe(true);
      expect(second.isOk()).toBe(true);
      expect(first._unsafeUnwrap()).toEqual({
        certificateChainRef:
          "appaloft+pg://certificate/crt_imported/cat_imported/certificate-chain",
        privateKeyRef: "appaloft+pg://certificate/crt_imported/cat_imported/private-key",
        passphraseRef: "appaloft+pg://certificate/crt_imported/cat_imported/passphrase",
      });
      expect(second._unsafeUnwrap()).toEqual(first._unsafeUnwrap());

      const rows = await database.db
        .selectFrom("certificate_secrets")
        .selectAll()
        .where("certificate_id", "=", "crt_imported")
        .orderBy("kind")
        .execute();

      expect(rows).toHaveLength(3);
      expect(rows.map((row) => row.ref)).toEqual([
        "appaloft+pg://certificate/crt_imported/cat_imported/certificate-chain",
        "appaloft+pg://certificate/crt_imported/cat_imported/passphrase",
        "appaloft+pg://certificate/crt_imported/cat_imported/private-key",
      ]);
      expect(rows.map((row) => row.payload)).toEqual([
        { value: "chain-pem" },
        { value: "passphrase" },
        { value: "private-key" },
      ]);
      expect(rows.every((row) => row.source === "imported")).toBe(true);
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[ROUTE-TLS-READMODEL-013][ROUTE-TLS-READMODEL-014] pg certificate read model shows safe lifecycle metadata", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-certificate-read-model-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const { createDatabase, createMigrator, PgCertificateReadModel } = await import(
        "../src/index"
      );
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const target = await seedSourceLinkContext(database.db, "cert-read-model");
      await insertDomainBinding(database.db, target, {
        id: "dmb_cert_read_model",
        domainName: "read.example.test",
        status: "bound",
        tlsMode: "auto",
        createdAt: "2026-01-01T00:00:00.000Z",
      });

      await database.db
        .insertInto("certificates")
        .values({
          id: "crt_read_model",
          domain_binding_id: "dmb_cert_read_model",
          domain_name: "read.example.test",
          status: "revoked",
          source: "managed",
          provider_key: "acme",
          challenge_type: "http-01",
          issued_at: "2026-01-01T00:01:00.000Z",
          expires_at: "2026-04-01T00:01:00.000Z",
          fingerprint: "sha256:read-model",
          secret_ref: "appaloft+pg://certificate/crt_read_model/cat_read_model/managed-bundle",
          safe_metadata: {},
          secret_refs: {},
          attempts: [
            {
              id: "cat_read_model",
              status: "issued",
              reason: "issue",
              providerKey: "acme",
              challengeType: "http-01",
              requestedAt: "2026-01-01T00:00:00.000Z",
              issuedAt: "2026-01-01T00:01:00.000Z",
              expiresAt: "2026-04-01T00:01:00.000Z",
            },
          ],
          created_at: "2026-01-01T00:00:00.000Z",
        })
        .execute();

      const readModel = new PgCertificateReadModel(database.db);
      const shown = await readModel.findOne(toRepositoryContext(createTestExecutionContext()), {
        certificateId: "crt_read_model",
      });

      expect(shown).toEqual(
        expect.objectContaining({
          id: "crt_read_model",
          domainBindingId: "dmb_cert_read_model",
          status: "revoked",
          fingerprint: "sha256:read-model",
          latestAttempt: expect.objectContaining({
            id: "cat_read_model",
            status: "issued",
          }),
          attempts: [
            expect.objectContaining({
              id: "cat_read_model",
              status: "issued",
            }),
          ],
        }),
      );
      expect(JSON.stringify(shown)).not.toContain("managed-bundle");
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[SOURCE-LINK-STATE-018] pg source link migration blocks unsafe cascades", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-source-link-migration-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const { createDatabase, createMigrator, PgSourceLinkRepository } = await import(
        "../src/index"
      );
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const indexes = await sql<{ indexname: string }>`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'source_links'
      `.execute(database.db);
      expect(indexes.rows.map((row) => row.indexname)).toContain("source_links_resource_id_idx");

      const target = await seedSourceLinkContext(database.db, "migration");
      const sourceFingerprint = "source-fingerprint:v1:branch%3Amigration";
      const store = createSourceLinkStore(new PgSourceLinkRepository(database.db));
      const created = await store.createIfMissing({
        sourceFingerprint,
        target,
        updatedAt: "2026-01-01T00:01:00.000Z",
      });
      expect(created.isOk()).toBe(true);

      await database.db
        .updateTable("resources")
        .set({
          lifecycle_status: "deleted",
          deleted_at: "2026-01-01T00:02:00.000Z",
        })
        .where("id", "=", target.resourceId)
        .execute();

      const retainedAfterTombstone = await database.db
        .selectFrom("source_links")
        .select("source_fingerprint")
        .where("source_fingerprint", "=", sourceFingerprint)
        .executeTakeFirst();
      expect(retainedAfterTombstone?.source_fingerprint).toBe(sourceFingerprint);

      let physicalDeleteBlocked = false;
      try {
        await database.db.deleteFrom("resources").where("id", "=", target.resourceId).execute();
      } catch {
        physicalDeleteBlocked = true;
      }
      expect(physicalDeleteBlocked).toBe(true);

      const retainedAfterDeleteAttempt = await database.db
        .selectFrom("source_links")
        .select("source_fingerprint")
        .where("source_fingerprint", "=", sourceFingerprint)
        .executeTakeFirst();
      expect(retainedAfterDeleteAttempt?.source_fingerprint).toBe(sourceFingerprint);
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[SOURCE-LINK-STATE-019] pg source link store can unlink preview state", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-source-link-unlink-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const { createDatabase, createMigrator, PgSourceLinkRepository } = await import(
        "../src/index"
      );
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const target = await seedSourceLinkContext(database.db, "unlink");
      const store = createSourceLinkStore(new PgSourceLinkRepository(database.db));
      const sourceFingerprint = "source-fingerprint:v1:preview%3Apr%3A14";
      const created = await store.createIfMissing({
        sourceFingerprint,
        target,
        updatedAt: "2026-01-01T00:01:00.000Z",
      });
      expect(created.isOk()).toBe(true);

      const deleted = await store.unlink(sourceFingerprint);
      const readBack = await store.read(sourceFingerprint);
      const deletedAgain = await store.unlink(sourceFingerprint);

      expect(deleted.isOk()).toBe(true);
      expect(readBack.isOk()).toBe(true);
      expect(deletedAgain.isOk()).toBe(true);
      expect(deleted._unsafeUnwrap()).toBe(true);
      expect(readBack._unsafeUnwrap()).toBeNull();
      expect(deletedAgain._unsafeUnwrap()).toBe(false);
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[SERVER-APPLIED-ROUTE-STATE-001] pg route store upserts and reads desired state", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-route-state-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const { createDatabase, createMigrator, PgServerAppliedRouteStateRepository } = await import(
        "../src/index"
      );
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const target = await seedSourceLinkContext(database.db, "route_persist");
      const store = createServerAppliedRouteStateStore(
        new PgServerAppliedRouteStateRepository(database.db),
      );

      const desired = await store.upsertDesired({
        target,
        sourceFingerprint: "source-fingerprint:v1:branch%3Aroute-persist",
        updatedAt: "2026-01-01T00:04:00.000Z",
        domains: [
          {
            host: "example.test",
            pathPrefix: "/",
            tlsMode: "auto",
          },
          {
            host: "www.example.test",
            pathPrefix: "/",
            tlsMode: "auto",
            redirectTo: "example.test",
            redirectStatus: 308,
          },
        ],
      });

      expect(desired.isOk()).toBe(true);
      expect(desired._unsafeUnwrap()).toMatchObject({
        routeSetId: `${target.projectId}:${target.environmentId}:${target.resourceId}:${target.serverId}:${target.destinationId}`,
        ...target,
        sourceFingerprint: "source-fingerprint:v1:branch%3Aroute-persist",
        status: "desired",
        updatedAt: "2026-01-01T00:04:00.000Z",
      });

      const read = await store.read(target);
      expect(read.isOk()).toBe(true);
      expect(read._unsafeUnwrap()).toEqual(desired._unsafeUnwrap());

      const row = await database.db
        .selectFrom("server_applied_route_states")
        .selectAll()
        .where("route_set_id", "=", desired._unsafeUnwrap().routeSetId)
        .executeTakeFirstOrThrow();
      expect(row.metadata).toEqual({});
      expect(row.domains).toEqual([
        {
          host: "example.test",
          pathPrefix: "/",
          tlsMode: "auto",
        },
        {
          host: "www.example.test",
          pathPrefix: "/",
          tlsMode: "auto",
          redirectTo: "example.test",
          redirectStatus: 308,
        },
      ]);
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[SERVER-APPLIED-ROUTE-STATE-002] pg route store prefers exact destination over fallback", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-route-fallback-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const { createDatabase, createMigrator, PgServerAppliedRouteStateRepository } = await import(
        "../src/index"
      );
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const target = await seedSourceLinkContext(database.db, "route_fallback");
      const store = createServerAppliedRouteStateStore(
        new PgServerAppliedRouteStateRepository(database.db),
      );
      const defaultTarget = {
        projectId: target.projectId,
        environmentId: target.environmentId,
        resourceId: target.resourceId,
        serverId: target.serverId,
      };

      const fallback = await store.upsertDesired({
        target: defaultTarget,
        updatedAt: "2026-01-01T00:04:00.000Z",
        domains: [
          {
            host: "fallback.example.test",
            pathPrefix: "/",
            tlsMode: "disabled",
          },
        ],
      });
      expect(fallback.isOk()).toBe(true);

      const fallbackRead = await store.read({
        ...target,
        destinationId: "dst_missing_exact",
      });
      expect(fallbackRead.isOk()).toBe(true);
      expect(fallbackRead._unsafeUnwrap()?.domains[0]?.host).toBe("fallback.example.test");

      const exact = await store.upsertDesired({
        target,
        updatedAt: "2026-01-01T00:05:00.000Z",
        domains: [
          {
            host: "exact.example.test",
            pathPrefix: "/",
            tlsMode: "auto",
          },
        ],
      });
      expect(exact.isOk()).toBe(true);

      const exactRead = await store.read(target);
      expect(exactRead.isOk()).toBe(true);
      expect(exactRead._unsafeUnwrap()?.domains[0]?.host).toBe("exact.example.test");
      expect(exactRead._unsafeUnwrap()?.routeSetId).toBe(
        `${target.projectId}:${target.environmentId}:${target.resourceId}:${target.serverId}:${target.destinationId}`,
      );
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[SERVER-APPLIED-ROUTE-STATE-003] pg route store persists status writeback and conflicts", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-route-status-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const { createDatabase, createMigrator, PgServerAppliedRouteStateRepository } = await import(
        "../src/index"
      );
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const target = await seedSourceLinkContext(database.db, "route_status");
      const store = createServerAppliedRouteStateStore(
        new PgServerAppliedRouteStateRepository(database.db),
      );
      const desired = await store.upsertDesired({
        target,
        updatedAt: "2026-01-01T00:04:00.000Z",
        domains: [
          {
            host: "status.example.test",
            pathPrefix: "/",
            tlsMode: "auto",
          },
        ],
      });
      expect(desired.isOk()).toBe(true);

      const applied = await store.markApplied({
        target,
        deploymentId: "dep_route_status",
        updatedAt: "2026-01-01T00:05:00.000Z",
        routeSetId: desired._unsafeUnwrap().routeSetId,
        providerKey: "traefik",
        proxyKind: "traefik",
      });
      expect(applied.isOk()).toBe(true);
      expect(applied._unsafeUnwrap()).toMatchObject({
        status: "applied",
        lastApplied: {
          deploymentId: "dep_route_status",
          appliedAt: "2026-01-01T00:05:00.000Z",
          providerKey: "traefik",
          proxyKind: "traefik",
        },
      });

      const failed = await store.markFailed({
        target,
        deploymentId: "dep_route_status",
        updatedAt: "2026-01-01T00:06:00.000Z",
        phase: "proxy-route-realization",
        errorCode: "proxy_configuration_render_failed",
        message: "provider rejected route",
        retryable: true,
        routeSetId: desired._unsafeUnwrap().routeSetId,
        providerKey: "traefik",
        proxyKind: "traefik",
      });
      expect(failed.isOk()).toBe(true);
      expect(failed._unsafeUnwrap()).toMatchObject({
        status: "failed",
        lastApplied: {
          deploymentId: "dep_route_status",
        },
        lastFailure: {
          deploymentId: "dep_route_status",
          failedAt: "2026-01-01T00:06:00.000Z",
          phase: "proxy-route-realization",
          errorCode: "proxy_configuration_render_failed",
          message: "provider rejected route",
          retryable: true,
          providerKey: "traefik",
          proxyKind: "traefik",
        },
      });

      const conflict = await store.markApplied({
        target,
        deploymentId: "dep_route_status",
        updatedAt: "2026-01-01T00:07:00.000Z",
        routeSetId: "wrong_route_set",
      });
      expect(conflict.isErr()).toBe(true);
      if (conflict.isOk()) {
        throw new Error("Expected server-applied route state conflict");
      }
      expect(conflict.error.code).toBe("server_applied_route_state_conflict");
      expect(conflict.error.details).toMatchObject({
        phase: "proxy-route-realization",
        expectedRouteSetId: "wrong_route_set",
        actualRouteSetId: desired._unsafeUnwrap().routeSetId,
      });
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[SERVER-APPLIED-ROUTE-STATE-004] resource delete sees pg route-state blocker", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-route-blocker-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    const context = createRepositoryContext();
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const {
        createDatabase,
        createMigrator,
        PgResourceDeletionBlockerReader,
        PgServerAppliedRouteStateRepository,
      } = await import("../src/index");
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const target = await seedSourceLinkContext(database.db, "route_blocker", {
        lifecycleStatus: "archived",
        archivedAt: "2026-01-01T00:02:00.000Z",
      });
      const store = createServerAppliedRouteStateStore(
        new PgServerAppliedRouteStateRepository(database.db),
      );
      const desired = await store.upsertDesired({
        target,
        updatedAt: "2026-01-01T00:04:00.000Z",
        domains: [
          {
            host: "blocker.example.test",
            pathPrefix: "/",
            tlsMode: "auto",
          },
        ],
      });
      expect(desired.isOk()).toBe(true);

      const reader = new PgResourceDeletionBlockerReader(database.db);
      const result = await reader.findBlockers(context, {
        resourceId: target.resourceId,
      });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toContainEqual({
        kind: "server-applied-route",
        relatedEntityId: desired._unsafeUnwrap().routeSetId,
        relatedEntityType: "server-applied-route",
        count: 1,
      });
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[SERVER-APPLIED-ROUTE-STATE-005] pg route-state migration blocks unsafe cascades", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-route-migration-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const { createDatabase, createMigrator, PgServerAppliedRouteStateRepository } = await import(
        "../src/index"
      );
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const indexes = await sql<{ indexname: string }>`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'server_applied_route_states'
      `.execute(database.db);
      expect(indexes.rows.map((row) => row.indexname)).toEqual(
        expect.arrayContaining([
          "server_applied_route_states_target_idx",
          "server_applied_route_states_default_target_idx",
          "server_applied_route_states_resource_id_idx",
          "server_applied_route_states_server_id_idx",
        ]),
      );

      const target = await seedSourceLinkContext(database.db, "route_migration");
      const store = createServerAppliedRouteStateStore(
        new PgServerAppliedRouteStateRepository(database.db),
      );
      const desired = await store.upsertDesired({
        target,
        updatedAt: "2026-01-01T00:04:00.000Z",
        domains: [
          {
            host: "migration.example.test",
            pathPrefix: "/",
            tlsMode: "auto",
          },
        ],
      });
      expect(desired.isOk()).toBe(true);

      await database.db
        .updateTable("resources")
        .set({
          lifecycle_status: "deleted",
          deleted_at: "2026-01-01T00:05:00.000Z",
        })
        .where("id", "=", target.resourceId)
        .execute();

      const retainedAfterTombstone = await database.db
        .selectFrom("server_applied_route_states")
        .select("route_set_id")
        .where("route_set_id", "=", desired._unsafeUnwrap().routeSetId)
        .executeTakeFirst();
      expect(retainedAfterTombstone?.route_set_id).toBe(desired._unsafeUnwrap().routeSetId);

      let physicalDeleteBlocked = false;
      try {
        await database.db.deleteFrom("resources").where("id", "=", target.resourceId).execute();
      } catch {
        physicalDeleteBlocked = true;
      }
      expect(physicalDeleteBlocked).toBe(true);

      const retainedAfterDeleteAttempt = await database.db
        .selectFrom("server_applied_route_states")
        .select("route_set_id")
        .where("route_set_id", "=", desired._unsafeUnwrap().routeSetId)
        .executeTakeFirst();
      expect(retainedAfterDeleteAttempt?.route_set_id).toBe(desired._unsafeUnwrap().routeSetId);
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[SERVER-APPLIED-ROUTE-STATE-006] pg route store can delete preview route state", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-route-delete-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const { createDatabase, createMigrator, PgServerAppliedRouteStateRepository } = await import(
        "../src/index"
      );
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const target = await seedSourceLinkContext(database.db, "route_delete");
      const store = createServerAppliedRouteStateStore(
        new PgServerAppliedRouteStateRepository(database.db),
      );
      const desired = await store.upsertDesired({
        target,
        updatedAt: "2026-01-01T00:04:00.000Z",
        domains: [
          {
            host: "delete.example.test",
            pathPrefix: "/",
            tlsMode: "auto",
          },
        ],
      });
      expect(desired.isOk()).toBe(true);

      const deleted = await store.deleteDesired(target);
      const readBack = await store.read(target);
      const deletedAgain = await store.deleteDesired(target);

      expect(deleted.isOk()).toBe(true);
      expect(readBack.isOk()).toBe(true);
      expect(deletedAgain.isOk()).toBe(true);
      expect(deleted._unsafeUnwrap()).toBe(true);
      expect(readBack._unsafeUnwrap()).toBeNull();
      expect(deletedAgain._unsafeUnwrap()).toBe(false);
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[SERVER-APPLIED-ROUTE-STATE-007] pg route store can sweep preview route state by source fingerprint", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-route-sweep-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const { createDatabase, createMigrator, PgServerAppliedRouteStateRepository } = await import(
        "../src/index"
      );
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const sourceFingerprint = "source-fingerprint:v1:preview%3Apr%3A14";
      const store = createServerAppliedRouteStateStore(
        new PgServerAppliedRouteStateRepository(database.db),
      );
      const firstTarget = await seedSourceLinkContext(database.db, "route_sweep_one");
      const secondTarget = await seedSourceLinkContext(database.db, "route_sweep_two");
      const retainedTarget = await seedSourceLinkContext(database.db, "route_sweep_retained");

      await store.upsertDesired({
        target: firstTarget,
        sourceFingerprint,
        updatedAt: "2026-01-01T00:04:00.000Z",
        domains: [
          {
            host: "one.preview.example.test",
            pathPrefix: "/",
            tlsMode: "auto",
          },
        ],
      });
      await store.upsertDesired({
        target: secondTarget,
        sourceFingerprint,
        updatedAt: "2026-01-01T00:04:00.000Z",
        domains: [
          {
            host: "two.preview.example.test",
            pathPrefix: "/",
            tlsMode: "auto",
          },
        ],
      });
      await store.upsertDesired({
        target: retainedTarget,
        sourceFingerprint: "source-fingerprint:v1:preview%3Apr%3A15",
        updatedAt: "2026-01-01T00:04:00.000Z",
        domains: [
          {
            host: "retained.preview.example.test",
            pathPrefix: "/",
            tlsMode: "auto",
          },
        ],
      });

      const deleted = await store.deleteDesiredBySourceFingerprint(sourceFingerprint);
      const retained = await store.read(retainedTarget);

      expect(deleted.isOk()).toBe(true);
      expect(retained.isOk()).toBe(true);
      expect(deleted._unsafeUnwrap()).toBe(2);
      expect(retained._unsafeUnwrap()?.resourceId).toBe(retainedTarget.resourceId);
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[DEF-ACCESS-QRY-002][RES-HEALTH-QRY-014][RES-DIAG-QRY-017][EDGE-PROXY-QRY-002] pglite keeps durable precedence over newer server-applied and generated routes", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-route-precedence-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const {
        createDatabase,
        createMigrator,
        PgDeploymentReadModel,
        PgDomainBindingReadModel,
        PgResourceReadModel,
        PgServerAppliedRouteStateRepository,
      } = await import("../src/index");
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const target = await seedSourceLinkContext(database.db, "route_precedence");
      await enableReverseProxyResource(database.db, target.resourceId);
      await insertDeploymentSnapshot(database.db, target, {
        id: "dep_generated",
        createdAt: "2026-01-01T00:03:00.000Z",
        routeSource: "generated-default",
        hostname: "generated.example.test",
      });
      await insertDeploymentSnapshot(database.db, target, {
        id: "dep_durable",
        createdAt: "2026-01-01T00:04:00.000Z",
        routeSource: "durable-domain-binding",
        hostname: "durable.example.test",
      });
      await insertDeploymentSnapshot(database.db, target, {
        id: "dep_server_applied",
        createdAt: "2026-01-01T00:05:00.000Z",
        routeSource: "server-applied-config-domain",
        hostname: "server-applied.example.test",
      });
      await insertDomainBinding(database.db, target, {
        id: "dmb_ready",
        domainName: "durable.example.test",
        status: "ready",
        createdAt: "2026-01-01T00:04:30.000Z",
      });

      const routeStore = createServerAppliedRouteStateStore(
        new PgServerAppliedRouteStateRepository(database.db),
      );
      const desired = await routeStore.upsertDesired({
        target,
        updatedAt: "2026-01-01T00:04:45.000Z",
        domains: [
          {
            host: "server-applied.example.test",
            pathPrefix: "/",
            tlsMode: "disabled",
          },
        ],
      });
      expect(desired.isOk()).toBe(true);
      const applied = await routeStore.markApplied({
        target,
        deploymentId: "dep_server_applied",
        updatedAt: "2026-01-01T00:05:00.000Z",
        routeSetId: desired._unsafeUnwrap().routeSetId,
        providerKey: "traefik",
        proxyKind: "traefik",
      });
      expect(applied.isOk()).toBe(true);

      const context = createTestExecutionContext();
      const resourceReadModel = new PgResourceReadModel(database.db);
      const deploymentReadModel = new PgDeploymentReadModel(database.db);
      const domainBindingReadModel = new PgDomainBindingReadModel(database.db);
      const listResourcesQueryService = new ListResourcesQueryService(
        resourceReadModel,
        new EmptyDestinationRepository(),
        new EmptyServerRepository(),
        new DisabledDefaultAccessDomainProvider(),
      );
      const proxyConfigurationQueryService = new ResourceProxyConfigurationPreviewQueryService(
        listResourcesQueryService,
        deploymentReadModel,
        new StaticEdgeProxyProviderRegistry(new FakeEdgeProxyProvider()),
        new FixedClock(),
      );
      const healthQueryService = new ResourceHealthQueryService(
        listResourcesQueryService,
        domainBindingReadModel,
        new EmptyResourceRepository(),
        deploymentReadModel,
        new StaticResourceHealthProbeRunner(),
        new FixedClock(),
      );
      const runtimeLogsQueryService = new ResourceRuntimeLogsQueryService(
        resourceReadModel,
        deploymentReadModel,
        new EmptyRuntimeLogReader(),
      );
      const diagnosticQueryService = new ResourceDiagnosticSummaryQueryService(
        listResourcesQueryService,
        domainBindingReadModel,
        deploymentReadModel,
        runtimeLogsQueryService,
        proxyConfigurationQueryService,
        new StaticDiagnosticsPort(),
        new FixedClock(),
      );

      const listed = await listResourcesQueryService.execute(context, {
        projectId: target.projectId,
      });
      const resource = listed.items.find((item) => item.id === target.resourceId);
      expect(resource?.accessSummary).toMatchObject({
        latestGeneratedAccessRoute: {
          hostname: "generated.example.test",
          deploymentId: "dep_generated",
        },
        latestDurableDomainRoute: {
          hostname: "durable.example.test",
          deploymentId: "dep_durable",
        },
        latestServerAppliedDomainRoute: {
          hostname: "server-applied.example.test",
          deploymentId: "dep_server_applied",
        },
        lastRouteRealizationDeploymentId: "dep_durable",
      });

      const proxyQuery = ResourceProxyConfigurationPreviewQuery.create({
        resourceId: target.resourceId,
        routeScope: "latest",
      })._unsafeUnwrap();
      const proxyResult = await proxyConfigurationQueryService.execute(context, proxyQuery);
      expect(proxyResult.isOk()).toBe(true);
      expect(proxyResult._unsafeUnwrap().routes).toEqual([
        expect.objectContaining({
          hostname: "durable.example.test",
          source: "domain-binding",
        }),
      ]);

      const healthQuery = ResourceHealthQuery.create({
        resourceId: target.resourceId,
      })._unsafeUnwrap();
      const healthResult = await healthQueryService.execute(context, healthQuery);
      expect(healthResult.isOk()).toBe(true);
      expect(healthResult._unsafeUnwrap().publicAccess).toMatchObject({
        status: "ready",
        url: "http://durable.example.test",
        kind: "durable-domain",
      });

      const diagnosticQuery = ResourceDiagnosticSummaryQuery.create({
        resourceId: target.resourceId,
        includeDeploymentLogTail: false,
        includeRuntimeLogTail: false,
        includeProxyConfiguration: false,
        tailLines: 10,
      })._unsafeUnwrap();
      const diagnosticResult = await diagnosticQueryService.execute(context, diagnosticQuery);
      expect(diagnosticResult.isOk()).toBe(true);
      expect(diagnosticResult._unsafeUnwrap()).toMatchObject({
        access: {
          status: "available",
          generatedUrl: "http://generated.example.test",
          durableUrl: "http://durable.example.test",
          serverAppliedUrl: "http://server-applied.example.test",
        },
        proxy: {
          providerKey: "traefik",
        },
      });
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("[RES-HEALTH-QRY-015][RES-DIAG-QRY-018] pglite exposes non-ready durable domain state before generated fallback", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-pending-domain-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");
    let closeDatabase: (() => Promise<void>) | undefined;

    try {
      const {
        createDatabase,
        createMigrator,
        PgDeploymentReadModel,
        PgDomainBindingReadModel,
        PgResourceReadModel,
      } = await import("../src/index");
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      closeDatabase = () => database.close();
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const target = await seedSourceLinkContext(database.db, "pending_domain");
      await enableReverseProxyResource(database.db, target.resourceId);
      await insertDeploymentSnapshot(database.db, target, {
        id: "dep_generated_pending",
        createdAt: "2026-01-01T00:03:00.000Z",
        routeSource: "generated-default",
        hostname: "generated.example.test",
      });
      await insertDomainBinding(database.db, target, {
        id: "dmb_pending",
        domainName: "pending.example.test",
        status: "pending_verification",
        createdAt: "2026-01-01T00:04:00.000Z",
        tlsMode: "auto",
      });

      const context = createTestExecutionContext();
      const resourceReadModel = new PgResourceReadModel(database.db);
      const deploymentReadModel = new PgDeploymentReadModel(database.db);
      const domainBindingReadModel = new PgDomainBindingReadModel(database.db);
      const listResourcesQueryService = new ListResourcesQueryService(
        resourceReadModel,
        new EmptyDestinationRepository(),
        new EmptyServerRepository(),
        new DisabledDefaultAccessDomainProvider(),
      );
      const proxyConfigurationQueryService = new ResourceProxyConfigurationPreviewQueryService(
        listResourcesQueryService,
        deploymentReadModel,
        new StaticEdgeProxyProviderRegistry(new FakeEdgeProxyProvider()),
        new FixedClock(),
      );
      const healthQueryService = new ResourceHealthQueryService(
        listResourcesQueryService,
        domainBindingReadModel,
        new EmptyResourceRepository(),
        deploymentReadModel,
        new StaticResourceHealthProbeRunner(),
        new FixedClock(),
      );
      const runtimeLogsQueryService = new ResourceRuntimeLogsQueryService(
        resourceReadModel,
        deploymentReadModel,
        new EmptyRuntimeLogReader(),
      );
      const diagnosticQueryService = new ResourceDiagnosticSummaryQueryService(
        listResourcesQueryService,
        domainBindingReadModel,
        deploymentReadModel,
        runtimeLogsQueryService,
        proxyConfigurationQueryService,
        new StaticDiagnosticsPort(),
        new FixedClock(),
      );

      const healthQuery = ResourceHealthQuery.create({
        resourceId: target.resourceId,
      })._unsafeUnwrap();
      const healthResult = await healthQueryService.execute(context, healthQuery);
      expect(healthResult.isOk()).toBe(true);
      expect(healthResult._unsafeUnwrap()).toMatchObject({
        overall: "degraded",
        publicAccess: {
          status: "not-ready",
          url: "https://pending.example.test",
          kind: "durable-domain",
          reasonCode: "resource_domain_binding_not_ready",
        },
      });
      expect(healthResult._unsafeUnwrap().sourceErrors).toContainEqual(
        expect.objectContaining({
          source: "domain-binding",
          code: "resource_domain_binding_not_ready",
          relatedEntityId: "dmb_pending",
          relatedState: "pending_verification",
        }),
      );

      const diagnosticQuery = ResourceDiagnosticSummaryQuery.create({
        resourceId: target.resourceId,
        includeDeploymentLogTail: false,
        includeRuntimeLogTail: false,
        includeProxyConfiguration: false,
        tailLines: 10,
      })._unsafeUnwrap();
      const diagnosticResult = await diagnosticQueryService.execute(context, diagnosticQuery);
      expect(diagnosticResult.isOk()).toBe(true);
      expect(diagnosticResult._unsafeUnwrap()).toMatchObject({
        access: {
          status: "unavailable",
          generatedUrl: "http://generated.example.test",
          reasonCode: "resource_domain_binding_not_ready",
        },
      });
      expect(diagnosticResult._unsafeUnwrap().sourceErrors).toContainEqual(
        expect.objectContaining({
          source: "access",
          code: "resource_domain_binding_not_ready",
          relatedEntityId: "dmb_pending",
          relatedState: "pending_verification",
        }),
      );
    } finally {
      await closeDatabase?.();
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("backfills legacy server edge proxy intent during migration", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-migration-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");

    try {
      const { createDatabase, createMigrator } = await import("../src/index");
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      const migrator = createMigrator(database.db);
      const legacyMigrationResult = await migrator.migrateTo("010_resource_network_profile");
      expect(legacyMigrationResult.error).toBeUndefined();

      await database.db
        .insertInto("servers")
        .values({
          id: "srv_legacy_proxy",
          name: "legacy-proxy",
          host: "127.0.0.1",
          port: 22,
          provider_key: "generic-ssh",
          created_at: "2026-01-01T00:00:00.000Z",
        })
        .execute();

      const latestMigrationResult = await migrator.migrateToLatest();
      expect(latestMigrationResult.error).toBeUndefined();

      const server = await database.db
        .selectFrom("servers")
        .select(["edge_proxy_kind", "edge_proxy_status"])
        .where("id", "=", "srv_legacy_proxy")
        .executeTakeFirstOrThrow();

      expect(server.edge_proxy_kind).toBe("traefik");
      expect(server.edge_proxy_status).toBe("pending");

      await database.close();
    } finally {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);

  test("PgMutationCoordinator executes work and releases the coordination row", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-mutation-coordination-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");

    try {
      const { createDatabase, createMigrator, PgMutationCoordinator } = await import(
        "../src/index"
      );
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const coordinator = new PgMutationCoordinator(database.db, new FixedClock());
      const context = createTestExecutionContext();
      const result = await coordinator.runExclusive({
        context,
        policy: {
          operationKey: "deployments.cleanup-preview",
          scopeKind: "preview-lifecycle",
          mode: "serialize-with-bounded-wait",
          waitTimeoutMs: 20,
          retryIntervalMs: 5,
          leaseTtlMs: 50,
          heartbeatIntervalMs: 1,
        },
        scope: {
          kind: "preview-lifecycle",
          key: "source-fingerprint:v1:branch%3Amain",
        },
        owner: {
          ownerId: "req_pglite_test",
          label: "test-owner",
        },
        work: async () => ok("released"),
      });

      expect(result).toEqual(ok("released"));

      const rows = await database.db
        .selectFrom("mutation_coordinations")
        .select("coordination_scope_key")
        .execute();
      expect(rows).toHaveLength(0);

      await database.close();
    } finally {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 30000);

  test("PgMutationCoordinator returns coordination_timeout when the scope stays occupied", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-pglite-mutation-timeout-"));
    const pgliteDataDir = join(workspaceDir, ".appaloft", "data", "pglite");

    try {
      const { createDatabase, createMigrator, PgMutationCoordinator } = await import(
        "../src/index"
      );
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      const migrator = createMigrator(database.db);
      const migrationResult = await migrator.migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      await database.db
        .insertInto("mutation_coordinations")
        .values({
          coordination_scope_kind: "preview-lifecycle",
          coordination_scope_key: "source-fingerprint:v1:branch%3Amain",
          operation_key: "deployments.cleanup-preview",
          coordination_mode: "serialize-with-bounded-wait",
          owner_id: "req_existing",
          owner_label: "existing-owner",
          acquired_at: "2026-01-01T00:10:00.000Z",
          heartbeat_at: "2026-01-01T00:10:00.000Z",
          lease_expires_at: "2026-01-01T00:20:00.000Z",
          metadata: {},
        })
        .execute();

      const coordinator = new PgMutationCoordinator(database.db, new FixedClock());
      const context = createTestExecutionContext();
      const result = await coordinator.runExclusive({
        context,
        policy: {
          operationKey: "deployments.cleanup-preview",
          scopeKind: "preview-lifecycle",
          mode: "serialize-with-bounded-wait",
          waitTimeoutMs: 20,
          retryIntervalMs: 5,
          leaseTtlMs: 50,
          heartbeatIntervalMs: 1,
        },
        scope: {
          kind: "preview-lifecycle",
          key: "source-fingerprint:v1:branch%3Amain",
        },
        owner: {
          ownerId: "req_timeout",
          label: "timeout-owner",
        },
        work: async () => ok("unexpected"),
      });

      expect(result.isErr()).toBe(true);
      if (result.isOk()) {
        throw new Error("Expected coordination timeout");
      }
      expect(result.error).toMatchObject({
        code: "coordination_timeout",
        category: "timeout",
        details: {
          phase: "operation-coordination",
          coordinationScopeKind: "preview-lifecycle",
          coordinationScope: "source-fingerprint:v1:branch%3Amain",
        },
      });

      const rows = await database.db
        .selectFrom("mutation_coordinations")
        .select(["owner_id", "coordination_scope_key"])
        .execute();
      expect(rows).toEqual([
        {
          owner_id: "req_existing",
          coordination_scope_key: "source-fingerprint:v1:branch%3Amain",
        },
      ]);

      await database.close();
    } finally {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 30000);
});
