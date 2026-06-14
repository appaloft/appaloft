import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ok, type Result } from "@appaloft/core";

import {
  type DurableWorkEventRecord,
  type DurableWorkItemRecord,
  type DurableWorkLedger,
  type DurableWorkListFilter,
} from "../src/durable-work";
import { createExecutionContext, type RepositoryContext } from "../src/execution-context";
import { ListOperatorWorkQuery } from "../src/operations/operator-work/list-operator-work.query";
import { OperatorWorkQueryService } from "../src/operations/operator-work/operator-work.query-service";
import { ShowOperatorWorkQuery } from "../src/operations/operator-work/show-operator-work.query";
import { StreamOperatorWorkEventsQuery } from "../src/operations/operator-work/stream-operator-work-events.query";
import { StreamOperatorWorkEventsQueryService } from "../src/operations/operator-work/stream-operator-work-events.query-service";
import {
  type CertificateReadModel,
  type CertificateSummary,
  type Clock,
  type DeploymentReadModel,
  type DeploymentSummary,
  type DomainBindingReadModel,
  type DomainBindingSummary,
  type ProcessAttemptListFilter,
  type ProcessAttemptReadModel,
  type ProcessAttemptRecord,
  type RemoteStateWorkReadModel,
  type RemoteStateWorkSummary,
  type RouteRealizationWorkReadModel,
  type RouteRealizationWorkSummary,
  type ServerReadModel,
  type ServerSummary,
  type SourceLinkReadModel,
  type SourceLinkRecord,
} from "../src/ports";

const generatedAt = "2026-01-01T00:00:10.000Z";

class FixedClock implements Clock {
  now(): string {
    return generatedAt;
  }
}

class StaticDeploymentReadModel implements DeploymentReadModel {
  async count(): Promise<number> {
    return 0;
  }

  constructor(private readonly deployments: DeploymentSummary[]) {}

  async list(
    _context: RepositoryContext,
    input?: Parameters<DeploymentReadModel["list"]>[1],
  ): Promise<DeploymentSummary[]> {
    return this.deployments.filter(
      (deployment) => !input?.resourceId || deployment.resourceId === input.resourceId,
    );
  }

  async findOne(): Promise<DeploymentSummary | null> {
    return null;
  }

  async findLogs(): Promise<DeploymentSummary["logs"]> {
    return [];
  }
}

class StaticServerReadModel implements ServerReadModel {
  async count(): Promise<number> {
    return 0;
  }

  constructor(private readonly servers: ServerSummary[]) {}

  async list(): Promise<ServerSummary[]> {
    return this.servers;
  }

  async findOne(): Promise<ServerSummary | null> {
    return null;
  }
}

class StaticDomainBindingReadModel implements DomainBindingReadModel {
  constructor(private readonly bindings: DomainBindingSummary[]) {}

  async list(
    _context: RepositoryContext,
    input?: Parameters<DomainBindingReadModel["list"]>[1],
  ): Promise<DomainBindingSummary[]> {
    return this.bindings.filter(
      (binding) => !input?.resourceId || binding.resourceId === input.resourceId,
    );
  }
}

class StaticCertificateReadModel implements CertificateReadModel {
  constructor(private readonly certificates: CertificateSummary[]) {}

  async list(): Promise<CertificateSummary[]> {
    return this.certificates;
  }

  async findOne(
    _context: RepositoryContext,
    input: {
      certificateId: string;
    },
  ): Promise<CertificateSummary | null> {
    return this.certificates.find((certificate) => certificate.id === input.certificateId) ?? null;
  }
}

class StaticProcessAttemptReadModel implements ProcessAttemptReadModel {
  constructor(private readonly attempts: ProcessAttemptRecord[]) {}

  async list(
    _context: RepositoryContext,
    filter?: ProcessAttemptListFilter,
  ): Promise<ProcessAttemptRecord[]> {
    return this.attempts.filter(
      (attempt) =>
        (!filter?.kind || attempt.kind === filter.kind) &&
        (!filter?.status || attempt.status === filter.status) &&
        (!filter?.projectId || attempt.projectId === filter.projectId) &&
        (!filter?.resourceId || attempt.resourceId === filter.resourceId) &&
        (!filter?.serverId || attempt.serverId === filter.serverId) &&
        (!filter?.deploymentId || attempt.deploymentId === filter.deploymentId),
    );
  }

  async findOne(_context: RepositoryContext, id: string): Promise<ProcessAttemptRecord | null> {
    return this.attempts.find((attempt) => attempt.id === id) ?? null;
  }
}

class StaticSourceLinkReadModel implements SourceLinkReadModel {
  constructor(private readonly sourceLinks: SourceLinkRecord[]) {}

  async list(
    _context: RepositoryContext,
    input?: Parameters<SourceLinkReadModel["list"]>[1],
  ): Promise<SourceLinkRecord[]> {
    return this.sourceLinks.filter(
      (sourceLink) =>
        (!input?.projectId || sourceLink.projectId === input.projectId) &&
        (!input?.resourceId || sourceLink.resourceId === input.resourceId) &&
        (!input?.serverId || sourceLink.serverId === input.serverId),
    );
  }
}

class StaticRouteRealizationWorkReadModel implements RouteRealizationWorkReadModel {
  constructor(private readonly routes: RouteRealizationWorkSummary[]) {}

  async list(
    _context: RepositoryContext,
    input?: Parameters<RouteRealizationWorkReadModel["list"]>[1],
  ): Promise<RouteRealizationWorkSummary[]> {
    return this.routes.filter(
      (route) =>
        (!input?.resourceId || route.resourceId === input.resourceId) &&
        (!input?.serverId || route.serverId === input.serverId) &&
        (!input?.deploymentId || route.deploymentId === input.deploymentId),
    );
  }
}

class StaticRemoteStateWorkReadModel implements RemoteStateWorkReadModel {
  constructor(private readonly rows: RemoteStateWorkSummary[]) {}

  async list(
    _context: RepositoryContext,
    input?: Parameters<RemoteStateWorkReadModel["list"]>[1],
  ): Promise<RemoteStateWorkSummary[]> {
    return this.rows.filter((row) => !input?.serverId || row.serverId === input.serverId);
  }
}

class StaticDurableWorkLedger implements DurableWorkLedger {
  constructor(
    private readonly items: DurableWorkItemRecord[],
    private readonly events: DurableWorkEventRecord[] = [],
  ) {}

  async recordItem(): Promise<Result<DurableWorkItemRecord>> {
    throw new Error("recordItem is not used by operator work query tests");
  }

  async appendEvent(): Promise<Result<DurableWorkEventRecord>> {
    throw new Error("appendEvent is not used by operator work query tests");
  }

  async findItem(
    _context: RepositoryContext,
    id: string,
  ): Promise<Result<DurableWorkItemRecord | null>> {
    return ok(this.items.find((item) => item.id === id) ?? null);
  }

  async listItems(
    _context: RepositoryContext,
    filter?: DurableWorkListFilter,
  ): Promise<Result<DurableWorkItemRecord[]>> {
    return ok(
      this.items.filter(
        (item) =>
          (!filter?.kind || item.kind === filter.kind) &&
          (!filter?.status || item.status === filter.status) &&
          (!filter?.projectId || item.projectId === filter.projectId) &&
          (!filter?.resourceId || item.resourceId === filter.resourceId) &&
          (!filter?.serverId || item.serverId === filter.serverId) &&
          (!filter?.deploymentId || item.deploymentId === filter.deploymentId),
      ),
    );
  }

  async listEvents(
    _context: RepositoryContext,
    workItemId: string,
  ): Promise<Result<DurableWorkEventRecord[]>> {
    return ok(this.events.filter((event) => event.workItemId === workItemId));
  }
}

function deploymentSummary(overrides: Partial<DeploymentSummary> = {}): DeploymentSummary {
  return {
    id: "dep_failed",
    projectId: "prj_demo",
    environmentId: "env_prod",
    resourceId: "res_web",
    serverId: "srv_primary",
    destinationId: "dst_primary",
    status: "failed",
    runtimePlan: {
      id: "rplan_demo",
      source: {
        kind: "git-public",
        locator: "https://github.com/acme/web.git",
        displayName: "acme/web",
      },
      buildStrategy: "workspace-commands",
      packagingMode: "host-process-runtime",
      execution: {
        kind: "host-process",
        port: 3000,
      },
      target: {
        kind: "single-server",
        providerKey: "local-shell",
        serverIds: ["srv_primary"],
      },
      detectSummary: "detected workspace",
      generatedAt: "2026-01-01T00:00:00.000Z",
      steps: ["detect", "plan", "deploy", "verify"],
    },
    environmentSnapshot: {
      id: "snap_demo",
      environmentId: "env_prod",
      createdAt: "2026-01-01T00:00:00.000Z",
      precedence: ["defaults", "environment", "deployment"],
      variables: [],
    },
    logs: [
      {
        timestamp: "2026-01-01T00:00:08.000Z",
        source: "appaloft",
        phase: "verify",
        level: "error",
        message: "health check failed with SECRET_TOKEN=raw-value",
      },
    ],
    createdAt: "2026-01-01T00:00:01.000Z",
    startedAt: "2026-01-01T00:00:02.000Z",
    finishedAt: "2026-01-01T00:00:09.000Z",
    logCount: 1,
    ...overrides,
    target: {
      kind: "server-backed",
      serverId: overrides.serverId ?? "srv_primary",
      destinationId: overrides.destinationId ?? "dst_primary",
    },
  };
}

function serverSummary(overrides: Partial<ServerSummary> = {}): ServerSummary {
  return {
    id: "srv_primary",
    name: "Primary",
    host: "203.0.113.10",
    port: 22,
    providerKey: "local-shell",
    targetKind: "single-server",
    lifecycleStatus: "active",
    edgeProxy: {
      kind: "caddy",
      status: "failed",
      lastAttemptAt: "2026-01-01T00:00:07.000Z",
      lastErrorCode: "edge_proxy_start_failed",
      lastErrorMessage: "provider output included PRIVATE_KEY=raw-value",
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function domainBindingSummary(overrides: Partial<DomainBindingSummary> = {}): DomainBindingSummary {
  return {
    id: "dom_web",
    projectId: "prj_demo",
    environmentId: "env_prod",
    resourceId: "res_web",
    serverId: "srv_primary",
    destinationId: "dst_primary",
    domainName: "web.example.com",
    pathPrefix: "/",
    proxyKind: "caddy",
    tlsMode: "auto",
    certificatePolicy: "auto",
    status: "failed",
    verificationAttemptCount: 1,
    createdAt: "2026-01-01T00:00:03.000Z",
    ...overrides,
  };
}

function certificateSummary(overrides: Partial<CertificateSummary> = {}): CertificateSummary {
  return {
    id: "cert_web",
    domainBindingId: "dom_web",
    domainName: "web.example.com",
    status: "failed",
    source: "managed",
    providerKey: "acme-staging",
    challengeType: "http-01",
    latestAttempt: {
      id: "cert_attempt_failed",
      status: "failed",
      reason: "issue",
      providerKey: "acme-staging",
      challengeType: "http-01",
      requestedAt: "2026-01-01T00:00:04.000Z",
      failedAt: "2026-01-01T00:00:06.000Z",
      errorCode: "certificate_http_challenge_failed",
      failurePhase: "http-challenge",
      failureMessage: "challenge body included raw-env-secret",
      retriable: true,
    },
    createdAt: "2026-01-01T00:00:04.000Z",
    ...overrides,
  };
}

function createService(input?: {
  deployments?: DeploymentSummary[];
  servers?: ServerSummary[];
  bindings?: DomainBindingSummary[];
  certificates?: CertificateSummary[];
  processAttempts?: ProcessAttemptRecord[];
  durableWorkItems?: DurableWorkItemRecord[];
  durableWorkEvents?: DurableWorkEventRecord[];
  remoteStates?: RemoteStateWorkSummary[];
  sourceLinks?: SourceLinkRecord[];
  routeRealizations?: RouteRealizationWorkSummary[];
}): OperatorWorkQueryService {
  return new OperatorWorkQueryService(
    new StaticDeploymentReadModel(input?.deployments ?? [deploymentSummary()]),
    new StaticServerReadModel(input?.servers ?? [serverSummary()]),
    new StaticCertificateReadModel(input?.certificates ?? [certificateSummary()]),
    new StaticDomainBindingReadModel(input?.bindings ?? [domainBindingSummary()]),
    new FixedClock(),
    new StaticProcessAttemptReadModel(input?.processAttempts ?? []),
    new StaticRemoteStateWorkReadModel(input?.remoteStates ?? []),
    new StaticSourceLinkReadModel(input?.sourceLinks ?? []),
    new StaticRouteRealizationWorkReadModel(input?.routeRealizations ?? []),
    new StaticDurableWorkLedger(input?.durableWorkItems ?? [], input?.durableWorkEvents ?? []),
  );
}

function context() {
  return createExecutionContext({
    requestId: "req_operator_work_test",
    entrypoint: "cli",
  });
}

function durableWorkItem(overrides: Partial<DurableWorkItemRecord> = {}): DurableWorkItemRecord {
  return {
    id: "wrk_blueprint_install",
    kind: "blueprint-install",
    status: "running",
    operationKey: "blueprints.install",
    queueBackend: "database",
    projectId: "prj_demo",
    resourceId: "res_web",
    phase: "install",
    step: "deploy-components",
    priority: 0,
    attemptCount: 2,
    maxAttempts: 3,
    availableAt: "2026-01-01T00:00:00.000Z",
    leaseOwner: "worker_secret",
    leaseExpiresAt: "2026-01-01T00:05:00.000Z",
    startedAt: "2026-01-01T00:00:01.000Z",
    updatedAt: "2026-01-01T00:00:04.000Z",
    safeDetails: {
      componentCount: 3,
      workerId: "worker_secret",
      commandLine: "TOKEN=raw appaloft internal",
    },
    ...overrides,
  };
}

function durableWorkEvent(overrides: Partial<DurableWorkEventRecord> = {}): DurableWorkEventRecord {
  return {
    id: "evt_1",
    workItemId: "wrk_blueprint_install",
    sequence: 1,
    kind: "accepted",
    status: "pending",
    phase: "accepted",
    step: "queued",
    message: "Work was accepted.",
    workerId: "worker_secret",
    workerGroup: "worker_group_secret",
    occurredAt: "2026-01-01T00:00:00.000Z",
    safeDetails: {
      componentCount: 3,
      privateKey: "raw-secret",
    },
    ...overrides,
  };
}

describe("operator work query service", () => {
  test("[OP-WORK-QRY-001] lists deployment attempts with safe failure visibility", async () => {
    const service = createService();
    const result = await service.list(
      context(),
      new ListOperatorWorkQuery(
        "deployment",
        "failed",
        undefined,
        undefined,
        undefined,
        undefined,
        10,
      ),
    );

    expect(result).toMatchObject({
      schemaVersion: "operator-work.list/v1",
      generatedAt,
      items: [
        {
          id: "dep_failed",
          kind: "deployment",
          status: "failed",
          operationKey: "deployments.create",
          phase: "verify",
          resourceId: "res_web",
          serverId: "srv_primary",
          nextActions: ["diagnostic", "manual-review"],
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain("SECRET_TOKEN");
  });

  test("[PROC-DELIVERY-WORKER-024] lists durable work by deployment id for post-restart monitoring", async () => {
    const service = createService({
      deployments: [],
      servers: [],
      certificates: [],
      durableWorkItems: [
        {
          id: "dw_deployment_dep_async",
          kind: "deployment",
          status: "pending",
          operationKey: "deployments.create",
          queueBackend: "database",
          projectId: "prj_demo",
          environmentId: "env_prod",
          resourceId: "res_web",
          deploymentId: "dep_async",
          serverId: "srv_primary",
          phase: "command-accepted",
          step: "queued",
          priority: 0,
          attemptCount: 0,
          maxAttempts: 3,
          availableAt: "2026-01-01T00:00:01.000Z",
          updatedAt: "2026-01-01T00:00:01.000Z",
          safeDetails: {
            workerCount: 2,
            privateKey: "SECRET_KEY=raw",
          },
        },
        {
          id: "dw_deployment_other_project",
          kind: "deployment",
          status: "pending",
          operationKey: "deployments.create",
          queueBackend: "database",
          projectId: "prj_other",
          resourceId: "res_web",
          deploymentId: "dep_async",
          serverId: "srv_primary",
          priority: 0,
          attemptCount: 0,
          maxAttempts: 3,
          availableAt: "2026-01-01T00:00:01.000Z",
          updatedAt: "2026-01-01T00:00:02.000Z",
        },
      ],
    });

    const result = await service.list(
      context(),
      new ListOperatorWorkQuery(
        "deployment",
        "pending",
        "prj_demo",
        "res_web",
        "srv_primary",
        "dep_async",
        10,
      ),
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        id: "dw_deployment_dep_async",
        kind: "deployment",
        status: "pending",
        operationKey: "deployments.create",
        phase: "command-accepted",
        step: "queued",
        projectId: "prj_demo",
        resourceId: "res_web",
        deploymentId: "dep_async",
        serverId: "srv_primary",
        nextActions: ["no-action"],
        safeDetails: {
          workerCount: 2,
        },
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("SECRET_KEY");
  });

  test("[PROC-DELIVERY-WORKER-025] shows durable work events as safe progress logs", async () => {
    const service = createService({
      deployments: [],
      servers: [],
      certificates: [],
      durableWorkItems: [
        {
          id: "dw_blueprint_install_cia_1",
          kind: "blueprint-install",
          status: "running",
          operationKey: "blueprints.install",
          queueBackend: "database",
          projectId: "prj_demo",
          resourceId: "res_web",
          deploymentId: "dep_component",
          serverId: "srv_primary",
          subjectKind: "blueprint-installation",
          subjectId: "cia_1",
          phase: "component-deployment",
          step: "deploying",
          priority: 0,
          attemptCount: 1,
          maxAttempts: 3,
          availableAt: "2026-01-01T00:00:01.000Z",
          startedAt: "2026-01-01T00:00:02.000Z",
          updatedAt: "2026-01-01T00:00:03.000Z",
        },
      ],
      durableWorkEvents: [
        {
          id: "dwe_blueprint_install_cia_1_accepted",
          workItemId: "dw_blueprint_install_cia_1",
          sequence: 1,
          kind: "accepted",
          status: "pending",
          phase: "install-accepted",
          step: "queued",
          message: "Blueprint install accepted",
          occurredAt: "2026-01-01T00:00:01.000Z",
          safeDetails: {
            applicationId: "cia_1",
            token: "SECRET_TOKEN=raw",
          },
        },
        {
          id: "dwe_blueprint_install_cia_1_claimed",
          workItemId: "dw_blueprint_install_cia_1",
          sequence: 2,
          kind: "claimed",
          status: "running",
          phase: "worker-claim",
          step: "claimed",
          workerId: "worker-a",
          workerGroup: "cloud",
          occurredAt: "2026-01-01T00:00:02.000Z",
        },
      ],
    });

    const result = await service.show(
      context(),
      new ShowOperatorWorkQuery("dw_blueprint_install_cia_1"),
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toMatchObject({
      schemaVersion: "operator-work.show/v1",
      item: {
        id: "dw_blueprint_install_cia_1",
        kind: "blueprint-install",
        status: "running",
        operationKey: "blueprints.install",
        deploymentId: "dep_component",
      },
      events: [
        {
          sequence: 1,
          kind: "accepted",
          status: "pending",
          message: "Blueprint install accepted",
          safeDetails: {
            applicationId: "cia_1",
          },
        },
        {
          sequence: 2,
          kind: "claimed",
          status: "running",
          workerId: "worker-a",
          workerGroup: "cloud",
        },
      ],
      generatedAt,
    });
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("SECRET_TOKEN");
  });

  test("[OP-WORK-QRY-002] lists proxy bootstrap attempts from server read state", async () => {
    const service = createService();
    const result = await service.list(
      context(),
      new ListOperatorWorkQuery(
        "proxy-bootstrap",
        "failed",
        undefined,
        undefined,
        "srv_primary",
        undefined,
        10,
      ),
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        id: "proxy-bootstrap:srv_primary",
        kind: "proxy-bootstrap",
        status: "failed",
        operationKey: "servers.bootstrap-proxy",
        serverId: "srv_primary",
        errorCode: "edge_proxy_start_failed",
        retriable: true,
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("PRIVATE_KEY");
  });

  test("[OP-WORK-QRY-003] lists certificate attempts with related domain binding ids", async () => {
    const service = createService();
    const result = await service.list(
      context(),
      new ListOperatorWorkQuery(
        "certificate",
        "failed",
        undefined,
        "res_web",
        undefined,
        undefined,
        10,
      ),
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        id: "cert_attempt_failed",
        kind: "certificate",
        status: "failed",
        operationKey: "certificates.issue-or-renew",
        resourceId: "res_web",
        serverId: "srv_primary",
        domainBindingId: "dom_web",
        certificateId: "cert_web",
        errorCode: "certificate_http_challenge_failed",
        retriable: true,
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("raw-env-secret");
  });

  test("[OP-WORK-QRY-004] filters by deployment and limits newest results", async () => {
    const service = createService({
      deployments: [
        deploymentSummary({ id: "dep_old", finishedAt: "2026-01-01T00:00:05.000Z" }),
        deploymentSummary({ id: "dep_new", finishedAt: "2026-01-01T00:00:09.000Z" }),
      ],
      servers: [],
      certificates: [],
    });
    const result = await service.list(
      context(),
      new ListOperatorWorkQuery(
        "deployment",
        undefined,
        undefined,
        undefined,
        undefined,
        "dep_new",
        1,
      ),
    );

    expect(result.items.map((item) => item.id)).toEqual(["dep_new"]);
  });

  test("[OP-WORK-QRY-005] shows a single work item or returns not_found", async () => {
    const service = createService();
    const shown = await service.show(context(), new ShowOperatorWorkQuery("cert_attempt_failed"));
    const missing = await service.show(context(), new ShowOperatorWorkQuery("missing"));

    expect(shown.isOk()).toBe(true);
    expect(shown._unsafeUnwrap()).toMatchObject({
      schemaVersion: "operator-work.show/v1",
      item: {
        id: "cert_attempt_failed",
        kind: "certificate",
      },
    });
    expect(missing.isErr()).toBe(true);
    expect(missing._unsafeUnwrapErr()).toMatchObject({
      code: "not_found",
    });
  });

  test("[OP-WORK-QRY-006] durable process attempts are read first and win during merge", async () => {
    const service = createService({
      deployments: [],
      servers: [serverSummary()],
      certificates: [],
      processAttempts: [
        {
          id: "pxy_attempt_1",
          kind: "proxy-bootstrap",
          status: "retry-scheduled",
          operationKey: "servers.bootstrap-proxy",
          dedupeKey: "proxy-bootstrap:srv_primary:pxy_attempt_1",
          correlationId: "req_attempt",
          requestId: "req_attempt",
          phase: "proxy-container",
          step: "retry_scheduled",
          serverId: "srv_primary",
          startedAt: "2026-01-01T00:00:07.000Z",
          updatedAt: "2026-01-01T00:00:11.000Z",
          errorCode: "edge_proxy_start_failed",
          errorCategory: "async-processing",
          retriable: true,
          nextEligibleAt: "2026-01-01T00:05:11.000Z",
          nextActions: ["diagnostic", "manual-review"],
          safeDetails: {
            providerKey: "caddy",
            proxyKind: "caddy",
            commandLine: "PRIVATE_KEY=raw-value caddy run",
          },
        },
      ],
    });

    const result = await service.list(
      context(),
      new ListOperatorWorkQuery(
        "proxy-bootstrap",
        undefined,
        undefined,
        undefined,
        "srv_primary",
        undefined,
        10,
      ),
    );
    const shown = await service.show(context(), new ShowOperatorWorkQuery("pxy_attempt_1"));

    expect(result.items.map((item) => item.id)).toEqual(["pxy_attempt_1"]);
    expect(result.items[0]).toMatchObject({
      id: "pxy_attempt_1",
      kind: "proxy-bootstrap",
      status: "retry-scheduled",
      phase: "proxy-container",
      serverId: "srv_primary",
      errorCode: "edge_proxy_start_failed",
      retriable: true,
    });
    expect(shown._unsafeUnwrap().item.id).toBe("pxy_attempt_1");
    expect(JSON.stringify(result)).not.toContain("PRIVATE_KEY");
  });

  test("[OP-WORK-QRY-007] lists source links without credential-bearing locators", async () => {
    const service = createService({
      deployments: [],
      servers: [],
      certificates: [],
      sourceLinks: [
        {
          sourceFingerprint: "source-fingerprint:v1:sha256-safe",
          projectId: "prj_demo",
          environmentId: "env_prod",
          resourceId: "res_web",
          serverId: "srv_primary",
          destinationId: "dst_primary",
          updatedAt: "2026-01-01T00:00:12.000Z",
          reason: "action-deploy",
        },
      ],
    });

    const result = await service.list(
      context(),
      new ListOperatorWorkQuery(
        "system",
        "succeeded",
        undefined,
        "res_web",
        "srv_primary",
        undefined,
        10,
      ),
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        id: "source-link:source-fingerprint:v1:sha256-safe",
        kind: "system",
        status: "succeeded",
        operationKey: "source-links.relink",
        resourceId: "res_web",
        serverId: "srv_primary",
        nextActions: ["no-action"],
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("https://user:token@");
  });

  test("[OP-WORK-QRY-008] lists route realization attempts with safe failure metadata", async () => {
    const service = createService({
      deployments: [],
      servers: [],
      certificates: [],
      routeRealizations: [
        {
          id: "prj_demo:env_prod:res_web:srv_primary:dst_primary",
          status: "failed",
          operationKey: "deployments.create",
          phase: "proxy-route-apply",
          step: "failed",
          projectId: "prj_demo",
          resourceId: "res_web",
          deploymentId: "dep_failed",
          serverId: "srv_primary",
          updatedAt: "2026-01-01T00:00:12.000Z",
          finishedAt: "2026-01-01T00:00:12.000Z",
          errorCode: "edge_proxy_host_port_conflict",
          errorCategory: "async-processing",
          retriable: true,
          nextActions: ["diagnostic", "manual-review"],
          safeDetails: {
            routeSetId: "prj_demo:env_prod:res_web:srv_primary:dst_primary",
            proxyKind: "caddy",
            providerPayload: "SECRET_TOKEN=raw-value",
          },
        },
      ],
    });

    const result = await service.list(
      context(),
      new ListOperatorWorkQuery(
        "route-realization",
        "failed",
        "prj_demo",
        "res_web",
        "srv_primary",
        "dep_failed",
        10,
      ),
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        id: "route-realization:prj_demo:env_prod:res_web:srv_primary:dst_primary",
        kind: "route-realization",
        status: "failed",
        operationKey: "deployments.create",
        deploymentId: "dep_failed",
        errorCode: "edge_proxy_host_port_conflict",
        retriable: true,
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("SECRET_TOKEN");
  });

  test("[OP-WORK-QRY-009] lists worker and job status from durable process attempts", async () => {
    const service = createService({
      deployments: [],
      servers: [],
      certificates: [],
      processAttempts: [
        {
          id: "task-worker-run-1",
          kind: "runtime-maintenance",
          status: "running",
          operationKey: "scheduled-tasks.run-now",
          phase: "worker-execution",
          step: "running",
          resourceId: "res_web",
          serverId: "srv_primary",
          startedAt: "2026-01-01T00:00:11.000Z",
          updatedAt: "2026-01-01T00:00:12.000Z",
          nextActions: ["no-action"],
          safeDetails: {
            workerKind: "scheduled-task-runner",
            commandLine: "PASSWORD=raw-value bun run task",
          },
        },
      ],
    });

    const result = await service.list(
      context(),
      new ListOperatorWorkQuery(
        "runtime-maintenance",
        "running",
        undefined,
        "res_web",
        "srv_primary",
        undefined,
        10,
      ),
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        id: "task-worker-run-1",
        kind: "runtime-maintenance",
        status: "running",
        operationKey: "scheduled-tasks.run-now",
        phase: "worker-execution",
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain("PASSWORD");
  });

  test("[OP-WORK-QRY-010] lists remote SSH state locks, migrations, backups, and recovery markers safely", async () => {
    const service = createService({
      deployments: [],
      servers: [],
      certificates: [],
      remoteStates: [
        {
          id: "srv_primary:lock",
          status: "failed",
          operationKey: "operator-work.list",
          phase: "remote-state-lock",
          step: "stale",
          serverId: "srv_primary",
          updatedAt: "2026-01-01T00:00:15.000Z",
          errorCode: "remote_state_lock_stale",
          errorCategory: "infra",
          retriable: true,
          nextActions: ["diagnostic", "manual-review"],
          safeDetails: {
            stateBackend: "ssh-pglite",
            dataRoot: "/var/lib/appaloft/runtime/state",
            owner: "workflow-123",
            correlationId: "corr-123",
            stale: true,
            identityFile: "/Users/me/.ssh/id_ed25519",
          },
        },
        {
          id: "srv_primary:migration:1-to-2",
          status: "succeeded",
          operationKey: "operator-work.list",
          phase: "remote-state-migration",
          step: "schema-upgrade",
          serverId: "srv_primary",
          updatedAt: "2026-01-01T00:00:14.000Z",
          finishedAt: "2026-01-01T00:00:14.000Z",
          nextActions: ["no-action"],
          safeDetails: {
            stateBackend: "ssh-pglite",
            fromVersion: 1,
            toVersion: 2,
          },
        },
        {
          id: "srv_primary:backup:sync",
          status: "succeeded",
          operationKey: "operator-work.list",
          phase: "remote-state-backup",
          step: "sync-upload",
          serverId: "srv_primary",
          updatedAt: "2026-01-01T00:00:13.000Z",
          nextActions: ["no-action"],
          safeDetails: {
            stateBackend: "ssh-pglite",
            backupKind: "sync-upload",
          },
        },
        {
          id: "srv_primary:recovery:marker",
          status: "failed",
          operationKey: "operator-work.list",
          phase: "remote-state-recovery",
          step: "schema-marker-integrity",
          serverId: "srv_primary",
          updatedAt: "2026-01-01T00:00:12.000Z",
          errorCode: "remote_state_schema_marker_invalid",
          errorCategory: "infra",
          retriable: true,
          nextActions: ["diagnostic", "manual-review"],
          safeDetails: {
            stateBackend: "ssh-pglite",
            marker: "recovery.json",
          },
        },
      ],
    });

    const result = await service.list(
      context(),
      new ListOperatorWorkQuery(
        "remote-state",
        undefined,
        undefined,
        undefined,
        "srv_primary",
        undefined,
        10,
      ),
    );

    expect(result.items.map((item) => item.phase)).toEqual([
      "remote-state-lock",
      "remote-state-migration",
      "remote-state-backup",
      "remote-state-recovery",
    ]);
    expect(result.items[0]).toMatchObject({
      id: "remote-state:srv_primary:lock",
      kind: "remote-state",
      status: "failed",
      operationKey: "operator-work.list",
      phase: "remote-state-lock",
      serverId: "srv_primary",
      errorCode: "remote_state_lock_stale",
      retriable: true,
      nextActions: ["diagnostic", "manual-review"],
      safeDetails: {
        stateBackend: "ssh-pglite",
        dataRoot: "/var/lib/appaloft/runtime/state",
        owner: "workflow-123",
        correlationId: "corr-123",
        stale: true,
      },
    });
    expect(JSON.stringify(result)).not.toContain("id_ed25519");
  });

  test("[OP-WORK-STREAM-001][OP-WORK-STREAM-002] replays durable work parent status envelopes without worker details", async () => {
    const ledger = new StaticDurableWorkLedger(
      [
        durableWorkItem({
          status: "succeeded",
          updatedAt: "2026-01-01T00:00:05.000Z",
          finishedAt: "2026-01-01T00:00:05.000Z",
        }),
      ],
      [
        durableWorkEvent({
          message: "commandLine TOKEN=raw appaloft internal",
        }),
        durableWorkEvent({
          id: "evt_2",
          sequence: 2,
          kind: "progress",
          status: "running",
          phase: "install",
          step: "deploy-components",
          message: "Deploying components.",
          occurredAt: "2026-01-01T00:00:03.000Z",
          safeDetails: {
            completedComponents: 1,
            workerGroup: "worker_group_secret",
          },
        }),
      ],
    );
    const service = new StreamOperatorWorkEventsQueryService(new FixedClock(), ledger);
    const result = await service.execute(
      context(),
      StreamOperatorWorkEventsQuery.create({
        workId: "wrk_blueprint_install",
        follow: false,
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) throw new Error(result.error.message);
    expect(result.value.mode).toBe("bounded");
    if (result.value.mode !== "bounded") throw new Error("Expected bounded result");
    expect(result.value.envelopes.map((envelope) => envelope.kind)).toEqual([
      "accepted",
      "progress",
      "succeeded",
    ]);
    expect(result.value.envelopes[0]).toMatchObject({
      schemaVersion: "operator-work.stream-events/v1",
      kind: "accepted",
      event: {
        workId: "wrk_blueprint_install",
        operationKey: "blueprints.install",
        workKind: "blueprint-install",
        status: "pending",
      },
    });
    const serialized = JSON.stringify(result.value.envelopes);
    expect(serialized).not.toContain("worker_secret");
    expect(serialized).not.toContain("worker_group_secret");
    expect(serialized).not.toContain("commandLine");
    expect(serialized).not.toContain("attemptCount");
    expect(serialized).not.toContain("leaseOwner");
    expect(serialized).not.toContain("raw-secret");
    expect(serialized).not.toContain("TOKEN=raw");
  });

  test("[OP-WORK-STREAM-003] follow mode emits replay and closes after terminal durable work", async () => {
    const ledger = new StaticDurableWorkLedger(
      [
        durableWorkItem({
          status: "failed",
          updatedAt: "2026-01-01T00:00:05.000Z",
          finishedAt: "2026-01-01T00:00:05.000Z",
          errorCode: "component_deploy_failed",
          errorCategory: "async-processing",
          retriable: true,
        }),
      ],
      [durableWorkEvent()],
    );
    const service = new StreamOperatorWorkEventsQueryService(new FixedClock(), ledger);
    const result = await service.execute(
      context(),
      StreamOperatorWorkEventsQuery.create({
        workId: "wrk_blueprint_install",
        follow: true,
        pollIntervalMs: 50,
      })._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) throw new Error(result.error.message);
    expect(result.value.mode).toBe("stream");
    if (result.value.mode !== "stream") throw new Error("Expected stream result");

    const envelopes = [];
    for await (const envelope of result.value.stream) {
      envelopes.push(envelope);
      if (envelope.kind === "closed") {
        break;
      }
    }
    await result.value.stream.close();

    expect(envelopes.map((envelope) => envelope.kind)).toEqual(["accepted", "failed", "closed"]);
    expect(envelopes.at(-1)).toMatchObject({
      schemaVersion: "operator-work.stream-events/v1",
      kind: "closed",
      reason: "completed",
    });
  });
});
