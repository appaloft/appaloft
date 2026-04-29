import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import { createExecutionContext, type RepositoryContext } from "../src/execution-context";
import { ListOperatorWorkQuery } from "../src/operations/operator-work/list-operator-work.query";
import { OperatorWorkQueryService } from "../src/operations/operator-work/operator-work.query-service";
import { ShowOperatorWorkQuery } from "../src/operations/operator-work/show-operator-work.query";
import {
  type CertificateReadModel,
  type CertificateSummary,
  type Clock,
  type DeploymentReadModel,
  type DeploymentSummary,
  type DomainBindingReadModel,
  type DomainBindingSummary,
  type ServerReadModel,
  type ServerSummary,
} from "../src/ports";

const generatedAt = "2026-01-01T00:00:10.000Z";

class FixedClock implements Clock {
  now(): string {
    return generatedAt;
  }
}

class StaticDeploymentReadModel implements DeploymentReadModel {
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
  };
}

function serverSummary(overrides: Partial<ServerSummary> = {}): ServerSummary {
  return {
    id: "srv_primary",
    name: "Primary",
    host: "203.0.113.10",
    port: 22,
    providerKey: "local-shell",
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
}): OperatorWorkQueryService {
  return new OperatorWorkQueryService(
    new StaticDeploymentReadModel(input?.deployments ?? [deploymentSummary()]),
    new StaticServerReadModel(input?.servers ?? [serverSummary()]),
    new StaticCertificateReadModel(input?.certificates ?? [certificateSummary()]),
    new StaticDomainBindingReadModel(input?.bindings ?? [domainBindingSummary()]),
    new FixedClock(),
  );
}

function context() {
  return createExecutionContext({
    requestId: "req_operator_work_test",
    entrypoint: "cli",
  });
}

describe("operator work query service", () => {
  test("[OP-WORK-QRY-001] lists deployment attempts with safe failure visibility", async () => {
    const service = createService();
    const result = await service.list(
      context(),
      new ListOperatorWorkQuery("deployment", "failed", undefined, undefined, undefined, 10),
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

  test("[OP-WORK-QRY-002] lists proxy bootstrap attempts from server read state", async () => {
    const service = createService();
    const result = await service.list(
      context(),
      new ListOperatorWorkQuery(
        "proxy-bootstrap",
        "failed",
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
      new ListOperatorWorkQuery("certificate", "failed", "res_web", undefined, undefined, 10),
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
      new ListOperatorWorkQuery("deployment", undefined, undefined, undefined, "dep_new", 1),
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
});
