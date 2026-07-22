import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  deploymentProofConfigurationFingerprint,
  type DeploymentSummary,
  type ServerRepository,
} from "@appaloft/application";
import {
  CreatedAt,
  DeploymentTargetCredentialKindValue,
  DeploymentTargetId,
  DeploymentTargetName,
  DeploymentTargetUsername,
  HostAddress,
  PortNumber,
  ProviderKey,
  Server,
  SshPrivateKeyText,
  TargetKindValue,
} from "@appaloft/core";
import {
  deploymentProofEvidenceFromDockerInspect,
  readDeploymentProofManagedRouteEvidence,
  runDeploymentProofCommand,
  RuntimeDeploymentProofEvidenceReader,
  writeDeploymentProofSshIdentityFile,
} from "../src";

const variables = [
  { key: "APP_VERSION", value: "v2", kind: "plain-config", exposure: "runtime", scope: "environment", isSecret: false },
  { key: "TOKEN", value: "do-not-return", kind: "secret", exposure: "runtime", scope: "environment", isSecret: true },
] as DeploymentSummary["environmentSnapshot"]["variables"];

const deployment = {
  id: "dep_v2",
  runtimePlan: { execution: { metadata: { previousDeploymentId: "dep_v1" } } },
  environmentSnapshot: { variables },
} as DeploymentSummary;

class StaticServerRepository implements ServerRepository {
  constructor(private readonly server: Server | null) {}

  async findOne(): Promise<Server | null> {
    return this.server;
  }

  async upsert(): Promise<void> {}
}

function sshServer(): Server {
  return Server.rehydrate({
    id: DeploymentTargetId.rehydrate("srv_ssh"),
    name: DeploymentTargetName.rehydrate("SSH server"),
    host: HostAddress.rehydrate("203.0.113.10"),
    port: PortNumber.rehydrate(2222),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    credential: {
      kind: DeploymentTargetCredentialKindValue.rehydrate("ssh-private-key"),
      username: DeploymentTargetUsername.rehydrate("deployer"),
      privateKey: SshPrivateKeyText.rehydrate(
        "-----BEGIN TEST KEY-----\nsecret\n-----END TEST KEY-----",
      ),
    },
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

describe("deployment proof runtime evidence", () => {
  test("[DEP-PROOF-ADAPTER-002] bounds runtime readback commands", async () => {
    const startedAt = Date.now();
    const result = await runDeploymentProofCommand(["sleep", "1"], 20);

    expect(result.ok).toBe(false);
    expect(Date.now() - startedAt).toBeLessThan(500);
  });

  test("[DEP-PROOF-ADAPTER-002] removes partial SSH identity material when writing fails", async () => {
    const removed: string[] = [];
    let failure: unknown;
    try {
      await writeDeploymentProofSshIdentityFile("private-key", {
        async mkdtemp() {
          return "/tmp/appaloft-proof-test";
        },
        async writeFile() {
          throw new Error("disk full");
        },
        async chmod() {},
        async rm(path) {
          removed.push(path);
        },
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe("disk full");
    expect(removed).toEqual(["/tmp/appaloft-proof-test"]);
  });

  test("[DEP-PROOF-ADAPTER-001][CPS-PROOF-010] verifies environment keys without returning values", () => {
    const configurationFingerprint = deploymentProofConfigurationFingerprint(variables);
    const evidence = deploymentProofEvidenceFromDockerInspect(deployment, {
      Id: "container-v2",
      Image: "sha256:image-v2",
      State: { Running: true, StartedAt: "2026-07-12T09:59:11.000Z", Health: { Status: "healthy" } },
      Config: {
        Image: "appaloft/web:v2",
        Env: ["APP_VERSION=v2", "TOKEN=runtime-marker", "IMAGE_DEFAULT=present"],
        Labels: {
          "appaloft.deployment-id": "dep_v2",
          "appaloft.configuration-fingerprint": configurationFingerprint,
        },
      },
    });

    expect(evidence).toMatchObject({
      available: true,
      artifact: { resolvedIdentity: "sha256:image-v2" },
      workload: { identity: "container-v2", generation: "dep_v2" },
      configuration: {
        fingerprint: configurationFingerprint,
        matchesPlanned: true,
        matchesPlannedKeySet: true,
        keyCount: 2,
        plannedKeyCount: 2,
      },
      health: { status: "passed" },
      access: { status: "unavailable", reasonCode: "public_route_identity_unobserved" },
      recovery: { previousRuntimeRetained: true, rollbackCandidateDeploymentId: "dep_v1" },
    });
    expect(JSON.stringify(evidence)).not.toContain("do-not-return");
    expect(JSON.stringify(evidence)).not.toContain("runtime-marker");
  });

  test("[CPS-PROOF-010] a missing planned environment key cannot match", () => {
    const configurationFingerprint = deploymentProofConfigurationFingerprint(variables);
    const evidence = deploymentProofEvidenceFromDockerInspect(deployment, {
      Id: "container-v2",
      Config: {
        Env: ["APP_VERSION=v2"],
        Labels: {
          "appaloft.deployment-id": "dep_v2",
          "appaloft.configuration-fingerprint": configurationFingerprint,
        },
      },
    });

    expect(evidence.configuration).toMatchObject({
      available: true,
      matchesPlanned: false,
      matchesPlannedKeySet: false,
      keyCount: 1,
      plannedKeyCount: 2,
    });
  });

  test("[DEP-PROOF-ADAPTER-002] reports stale workload and configuration instead of trusting health", () => {
    const evidence = deploymentProofEvidenceFromDockerInspect(deployment, {
      Id: "container-v1",
      Image: "sha256:image-v1",
      State: { Running: true, Health: { Status: "healthy" } },
      Config: {
        Labels: {
          "appaloft.deployment-id": "dep_v1",
          "appaloft.configuration-fingerprint": "sha256:old-config",
        },
      },
    });

    expect(evidence.health.status).toBe("passed");
    expect(evidence.workload.generation).toBe("dep_v1");
    expect(evidence.configuration.matchesPlanned).toBe(false);
    expect(evidence.access.status).toBe("unavailable");
  });

  test("[DEP-PROOF-ADAPTER-003] reads matching deployment identity from a managed route response", async () => {
    let attempts = 0;
    const evidence = await readDeploymentProofManagedRouteEvidence(
      {
        ...deployment,
        runtimePlan: {
          ...deployment.runtimePlan,
          execution: {
            ...deployment.runtimePlan.execution,
            healthCheckPath: "/health",
            accessRoutes: [
              {
                proxyKind: "traefik",
                domains: ["app.example.test"],
                pathPrefix: "/",
                tlsMode: "auto",
              },
            ],
          },
        },
      } as DeploymentSummary,
      async () => {
        attempts += 1;
        return attempts === 1
          ? new Response("unavailable", { status: 503 })
          : new Response("ok", {
              status: 200,
              headers: { "X-Appaloft-Deployment-Id": "dep_v2" },
            });
      },
    );

    expect(evidence).toMatchObject({
      status: "passed",
      routeTargetsWorkload: true,
      summary: "Managed public route evidence matched deployment dep_v2",
      routes: [{ routeBehavior: "serve", expectedDeploymentId: "dep_v2", observedDeploymentId: "dep_v2", matched: true }],
    });
    expect(attempts).toBe(2);
  });

  test("[DEP-PROOF-ADAPTER-003] probes one canonical route per domain when a compose stack has path routing", async () => {
    const requested: string[] = [];
    const evidence = await readDeploymentProofManagedRouteEvidence(
      {
        ...deployment,
        runtimePlan: {
          ...deployment.runtimePlan,
          execution: {
            ...deployment.runtimePlan.execution,
            healthCheckPath: "/login",
            accessRoutes: [
              {
                proxyKind: "traefik",
                domains: ["app.example.test"],
                pathPrefix: "/v1",
                tlsMode: "auto",
              },
              {
                proxyKind: "traefik",
                domains: ["app.example.test"],
                pathPrefix: "/api",
                tlsMode: "auto",
              },
              {
                proxyKind: "traefik",
                domains: ["app.example.test"],
                pathPrefix: "/",
                tlsMode: "auto",
              },
            ],
          },
        },
      } as DeploymentSummary,
      async (url) => {
        requested.push(url);
        return new Response("ok", {
          status: 200,
          headers: { "X-Appaloft-Deployment-Id": "dep_v2" },
        });
      },
    );

    expect(evidence.status).toBe("passed");
    expect(requested).toEqual(["https://app.example.test/login"]);
  });

  test("[DEP-PROOF-ADAPTER-004] probes a current ready managed route that was absent from the deployment snapshot", async () => {
    const requested: string[] = [];
    const evidence = await readDeploymentProofManagedRouteEvidence(
      {
        ...deployment,
        runtimePlan: {
          ...deployment.runtimePlan,
          execution: {
            ...deployment.runtimePlan.execution,
            healthCheckPath: "/login",
            accessRoutes: [],
          },
        },
      } as DeploymentSummary,
      async (url) => {
        requested.push(url);
        return new Response("ok", {
          status: 200,
          headers: { "X-Appaloft-Deployment-Id": "dep_v1" },
        });
      },
      [
        {
          domainName: "app.example.test",
          pathPrefix: "/",
          proxyKind: "traefik",
          tlsMode: "auto",
          routeBehavior: "serve",
        },
      ],
    );

    expect(requested).toHaveLength(6);
    expect(new Set(requested)).toEqual(new Set(["https://app.example.test/"]));
    expect(evidence).toMatchObject({
      status: "failed",
      routeTargetsWorkload: false,
      reasonCode: "public_route_deployment_identity_mismatch",
    });
  });

  test("[DEP-PROOF-ADAPTER-004] separately probes a current route absent from a more general planned route", async () => {
    const requested: string[] = [];
    const evidence = await readDeploymentProofManagedRouteEvidence(
      {
        ...deployment,
        runtimePlan: {
          ...deployment.runtimePlan,
          execution: {
            ...deployment.runtimePlan.execution,
            healthCheckPath: "/health",
            accessRoutes: [
              {
                proxyKind: "traefik",
                domains: ["app.example.test"],
                pathPrefix: "/",
                tlsMode: "auto",
              },
            ],
          },
        },
      } as DeploymentSummary,
      async (url, init) => {
        requested.push(url);
        expect(init?.redirect).toBe(url.endsWith("/api") ? "manual" : "follow");
        return new Response(url.endsWith("/api") ? "not found" : "ok", {
          status: url.endsWith("/api") ? 404 : 200,
          headers: {
            "X-Appaloft-Deployment-Id": url.endsWith("/api") ? "dep_v1" : "dep_v2",
          },
        });
      },
      [
        {
          domainName: "app.example.test",
          pathPrefix: "/api",
          proxyKind: "traefik",
          tlsMode: "auto",
          routeBehavior: "serve",
        },
      ],
    );

    expect(requested[0]).toBe("https://app.example.test/health");
    expect(requested.filter((url) => url === "https://app.example.test/api")).toHaveLength(6);
    expect(evidence).toMatchObject({
      status: "failed",
      routeTargetsWorkload: false,
      reasonCode: "public_route_deployment_identity_mismatch",
    });
  });

  test("[DEP-PROOF-REDIRECT-002] proves the exact current redirect without following it", async () => {
    const requested: Array<{ url: string; redirect: RequestRedirect | undefined }> = [];
    const access = await readDeploymentProofManagedRouteEvidence(
      {
        ...deployment,
        runtimePlan: {
          ...deployment.runtimePlan,
          execution: {
            ...deployment.runtimePlan.execution,
            accessRoutes: [
              {
                proxyKind: "traefik",
                domains: ["old.example.test"],
                pathPrefix: "/docs",
                tlsMode: "auto",
                routeBehavior: "serve",
              },
            ],
          },
        },
      } as DeploymentSummary,
      async (url, init) => {
        requested.push({ url, redirect: init?.redirect });
        return new Response(null, {
          status: 301,
          headers: { Location: "https://app.example.test/docs?appaloft-proof=redirect" },
        });
      },
      [
        {
          domainName: "old.example.test",
          pathPrefix: "/docs",
          proxyKind: "traefik",
          tlsMode: "auto",
          routeBehavior: "redirect",
          redirectTo: "app.example.test",
          redirectStatus: 301,
        },
      ],
    );

    expect(requested).toEqual([
      {
        url: "https://old.example.test/docs?appaloft-proof=redirect",
        redirect: "manual",
      },
    ]);
    expect(access).toMatchObject({
      status: "passed",
      routes: [
        {
          url: "https://old.example.test/docs?appaloft-proof=redirect",
          routeBehavior: "redirect",
          expectedRedirectStatus: 301,
          expectedRedirectTo: "https://app.example.test/docs?appaloft-proof=redirect",
          observedStatus: 301,
          observedRedirectTo: "https://app.example.test/docs?appaloft-proof=redirect",
          matched: true,
        },
      ],
    });
  });

  test("[DEP-PROOF-REDIRECT-003] rejects wrong redirect status and destination with stable reasons", async () => {
    const redirectRoute = [
      {
        domainName: "old.example.test",
        pathPrefix: "/docs",
        proxyKind: "traefik" as const,
        tlsMode: "auto" as const,
        routeBehavior: "redirect" as const,
        redirectTo: "app.example.test",
        redirectStatus: 301 as const,
      },
    ];
    const wrongStatus = await readDeploymentProofManagedRouteEvidence(
      deployment,
      async () =>
        new Response(null, {
          status: 308,
          headers: { Location: "https://app.example.test/docs?appaloft-proof=redirect" },
        }),
      redirectRoute,
    );
    const wrongDestination = await readDeploymentProofManagedRouteEvidence(
      deployment,
      async () => new Response(null, { status: 301, headers: { Location: "https://wrong.example.test/docs" } }),
      redirectRoute,
    );

    expect(wrongStatus).toMatchObject({
      status: "failed",
      reasonCode: "public_route_redirect_status_mismatch",
      routes: [{ matched: false, expectedRedirectStatus: 301, observedStatus: 308 }],
    });
    expect(wrongDestination).toMatchObject({
      status: "failed",
      reasonCode: "public_route_redirect_destination_mismatch",
      routes: [
        {
          matched: false,
          expectedRedirectTo: "https://app.example.test/docs?appaloft-proof=redirect",
          observedRedirectTo: "https://wrong.example.test/docs",
        },
      ],
    });
  });

  test("[DEP-PROOF-ADAPTER-003] rejects healthy managed routes with stale or missing identity", async () => {
    const managedDeployment = {
      ...deployment,
      runtimePlan: {
        ...deployment.runtimePlan,
        execution: {
          ...deployment.runtimePlan.execution,
          accessRoutes: [
            {
              proxyKind: "caddy",
              domains: ["app.example.test"],
              pathPrefix: "/",
              tlsMode: "disabled",
            },
          ],
        },
      },
    } as DeploymentSummary;

    const stale = await readDeploymentProofManagedRouteEvidence(
      managedDeployment,
      async () =>
        new Response("ok", {
          status: 200,
          headers: { "X-Appaloft-Deployment-Id": "dep_v1" },
        }),
    );
    const missing = await readDeploymentProofManagedRouteEvidence(
      managedDeployment,
      async () => new Response("ok", { status: 200 }),
    );

    expect(stale).toMatchObject({
      status: "failed",
      routeTargetsWorkload: false,
      reasonCode: "public_route_deployment_identity_mismatch",
    });
    expect(missing).toMatchObject({
      status: "failed",
      routeTargetsWorkload: false,
      reasonCode: "public_route_deployment_identity_missing",
    });

    const unreachable = await readDeploymentProofManagedRouteEvidence(
      managedDeployment,
      async () => {
        throw new Error("connection refused");
      },
    );
    const unavailable = await readDeploymentProofManagedRouteEvidence(
      managedDeployment,
      async () => new Response("unavailable", { status: 503 }),
    );

    expect(unreachable).toMatchObject({
      status: "failed",
      reasonCode: "public_route_probe_failed",
    });
    expect(unavailable).toMatchObject({
      status: "failed",
      reasonCode: "public_route_http_failed",
    });
  });

  test("[DEP-PROOF-ADAPTER-002] generic SSH reads the current labeled workload without exposing environment values", async () => {
    const calls: string[][] = [];
    const configurationFingerprint = deploymentProofConfigurationFingerprint(variables);
    const reader = new RuntimeDeploymentProofEvidenceReader(
      new StaticServerRepository(sshServer()),
      async (args) => {
        calls.push(args);
        return {
          ok: true,
          stdout: JSON.stringify({
            Id: "container-v2",
            Image: "sha256:image-v2",
            State: { Running: true, Health: { Status: "healthy" } },
            Config: {
              Image: "stocktruth-platform:production",
              Env: ["APP_VERSION=v2", "TOKEN=runtime-marker"],
              Labels: {
                "appaloft.deployment-id": "dep_v2",
                "appaloft.configuration-fingerprint": configurationFingerprint,
              },
            },
          }),
        };
      },
    );
    const result = await reader.read({} as never, {
      ...deployment,
      runtimePlan: {
        ...deployment.runtimePlan,
        execution: {
          ...deployment.runtimePlan.execution,
          metadata: { targetServiceName: "web" },
        },
        target: { kind: "single-server", providerKey: "generic-ssh", serverIds: ["srv_ssh"] },
      },
    } as DeploymentSummary);

    expect(result._unsafeUnwrap()).toMatchObject({
      available: true,
      workload: { available: true, generation: "dep_v2" },
      configuration: { matchesPlanned: true, matchesPlannedKeySet: true },
      health: { status: "passed" },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("ssh");
    expect(calls[0]?.at(-1)).toContain("label=appaloft.deployment-id=dep_v2");
    expect(calls[0]?.at(-1)).toContain("label=com.docker.compose.service=web");
    expect(JSON.stringify(result._unsafeUnwrap())).not.toContain("runtime-marker");
  });

  test("[DEP-PROOF-ADAPTER-002] generic SSH fails closed without a governed private key", async () => {
    let commandInvoked = false;
    const serverWithoutCredential = Server.rehydrate({
      ...sshServer().toState(),
      credential: undefined,
    });
    const reader = new RuntimeDeploymentProofEvidenceReader(
      new StaticServerRepository(serverWithoutCredential),
      async () => {
        commandInvoked = true;
        return { ok: true, stdout: "{}" };
      },
    );

    const result = await reader.read({} as never, {
      ...deployment,
      runtimePlan: {
        ...deployment.runtimePlan,
        target: { kind: "single-server", providerKey: "generic-ssh", serverIds: ["srv_ssh"] },
      },
    } as DeploymentSummary);

    expect(commandInvoked).toBe(false);
    expect(result._unsafeUnwrap()).toMatchObject({
      available: false,
      reasonCode: "generic_ssh_governed_credential_unavailable",
    });
  });

  test("[DEP-PROOF-ADAPTER-002] unsupported static publisher reports an explicit gap", async () => {
    const reader = new RuntimeDeploymentProofEvidenceReader();
    const result = await reader.read({} as never, {
      ...deployment,
      runtimePlan: {
        ...deployment.runtimePlan,
        execution: { kind: "static-publication" },
        target: { kind: "static-publisher", providerKey: "external-static", serverIds: [] },
      },
    } as unknown as DeploymentSummary);

    expect(result._unsafeUnwrap()).toMatchObject({
      available: false,
      reasonCode: "runtime_target_readback_unsupported",
      artifact: { available: false },
    });
  });
});
