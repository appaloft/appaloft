import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { createServer } from "node:net";
import { expect, test } from "bun:test";
import { type DeploymentSummary } from "@appaloft/application";
import { readDeploymentProofManagedRouteEvidence } from "../src";

const realTraefikTest =
  Bun.env.APPALOFT_DEPLOYMENT_ROUTE_PROOF_TRAEFIK_SMOKE === "1" ? test : test.skip;

function docker(args: string[]): string {
  const result = Bun.spawnSync(["docker", ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) {
    throw new Error(`docker ${args[0]} failed: ${result.stderr.toString()}`);
  }
  return result.stdout.toString().trim();
}

function dockerLogs(name: string): string {
  const result = Bun.spawnSync(["docker", "logs", name], { stdout: "pipe", stderr: "pipe" });
  return `${result.stdout.toString()}${result.stderr.toString()}`.trim();
}

async function reservePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("port unavailable"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)));
    });
    server.on("error", reject);
  });
}

function startFixtureWorkload(input: {
  deploymentId: string;
  name: string;
  network: string;
}): void {
  docker([
    "run",
    "-d",
    "--name",
    input.name,
    "--network",
    input.network,
    "--label",
    "traefik.enable=true",
    "--label",
    `traefik.docker.network=${input.network}`,
    "--label",
    "traefik.http.routers.route-proof.rule=Host(`route-proof.test`)",
    "--label",
    "traefik.http.routers.route-proof.entrypoints=web",
    "--label",
    "traefik.http.routers.route-proof.middlewares=route-proof-identity",
    "--label",
    "traefik.http.routers.route-proof.service=route-proof",
    "--label",
    `traefik.http.middlewares.route-proof-identity.headers.customresponseheaders.X-Appaloft-Deployment-Id=${input.deploymentId}`,
    "--label",
    "traefik.http.services.route-proof.loadbalancer.server.port=80",
    "--label",
    "traefik.http.routers.redirect-proof.rule=Host(`old-route-proof.test`)",
    "--label",
    "traefik.http.routers.redirect-proof.entrypoints=web",
    "--label",
    "traefik.http.routers.redirect-proof.middlewares=redirect-proof",
    "--label",
    "traefik.http.routers.redirect-proof.service=noop@internal",
    "--label",
    "traefik.http.middlewares.redirect-proof.redirectregex.regex=^http://old-route-proof\\.test/(.*)",
    "--label",
    "traefik.http.middlewares.redirect-proof.redirectregex.replacement=http://route-proof.test/${1}",
    "--label",
    "traefik.http.middlewares.redirect-proof.redirectregex.permanent=true",
    "traefik/whoami:v1.11.0",
  ]);
}

realTraefikTest(
  "[DEP-PROOF-SMOKE-003] real Traefik response identity rejects a stale public route",
  async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const network = `appaloft-route-proof-${suffix}`;
    const workload = `${network}-workload`;
    const proxy = `${network}-proxy`;
    const port = await reservePort();

    try {
      docker(["network", "create", network]);
      startFixtureWorkload({ deploymentId: "dep_v1", name: workload, network });
      docker([
        "run",
        "-d",
        "--name",
        proxy,
        "--network",
        network,
        "-p",
        `127.0.0.1:${port}:80`,
        "-v",
        "/var/run/docker.sock:/var/run/docker.sock:ro",
        "traefik:v3.6.2",
        "--providers.docker=true",
        "--providers.docker.exposedbydefault=false",
        `--providers.docker.network=${network}`,
        "--entrypoints.web.address=:80",
        "--log.level=DEBUG",
      ]);

      const routeFetch = async (input: string, init?: RequestInit): Promise<Response> => {
        const requested = new URL(input);
        return await fetch(
          `http://127.0.0.1:${port}${requested.pathname}${requested.search}`,
          {
            ...init,
            headers: { Host: requested.host },
          },
        );
      };
      let routedResponse: Response | undefined;
      for (let attempt = 0; attempt < 80; attempt += 1) {
        try {
          routedResponse = await routeFetch("http://route-proof.test/");
          if (routedResponse.ok) break;
        } catch {
          // Traefik may still be discovering Docker labels.
        }
        await Bun.sleep(250);
      }
      if (!routedResponse?.ok) {
        throw new Error(
          `Traefik route did not become ready (status ${routedResponse?.status ?? "unavailable"}): ${dockerLogs(proxy)}`,
        );
      }
      expect(routedResponse?.headers.get("X-Appaloft-Deployment-Id")).toBe("dep_v1");

      const evidence = await readDeploymentProofManagedRouteEvidence(
        {
          id: "dep_v2",
          runtimePlan: {
            execution: {
              accessRoutes: [
                {
                  proxyKind: "traefik",
                  domains: ["route-proof.test"],
                  pathPrefix: "/",
                  tlsMode: "disabled",
                },
              ],
            },
          },
        } as DeploymentSummary,
        routeFetch,
      );

      expect(evidence).toMatchObject({
        status: "failed",
        routeTargetsWorkload: false,
        reasonCode: "public_route_deployment_identity_mismatch",
      });

      docker(["rm", "-f", workload]);
      startFixtureWorkload({ deploymentId: "dep_v2", name: workload, network });
      let currentEvidence: Awaited<ReturnType<typeof readDeploymentProofManagedRouteEvidence>>;
      for (let attempt = 0; ; attempt += 1) {
        currentEvidence = await readDeploymentProofManagedRouteEvidence(
          {
            id: "dep_v2",
            runtimePlan: {
              execution: {
                accessRoutes: [
                  {
                    proxyKind: "traefik",
                    domains: ["route-proof.test"],
                    pathPrefix: "/",
                    tlsMode: "disabled",
                  },
                ],
              },
            },
          } as DeploymentSummary,
          routeFetch,
        );
        if (currentEvidence.status === "passed" || attempt >= 20) break;
        await Bun.sleep(250);
      }
      expect(currentEvidence).toMatchObject({
        status: "passed",
        routeTargetsWorkload: true,
        routes: [
          {
            routeBehavior: "serve",
            expectedDeploymentId: "dep_v2",
            observedDeploymentId: "dep_v2",
            matched: true,
          },
        ],
      });

      let redirectResponse: Response | undefined;
      for (let attempt = 0; attempt < 80; attempt += 1) {
        redirectResponse = await routeFetch("http://old-route-proof.test/docs", {
          redirect: "manual",
        });
        if (redirectResponse.status === 301) break;
        await Bun.sleep(250);
      }
      expect(redirectResponse?.status).toBe(301);
      expect(redirectResponse?.headers.get("location")).toBe("http://route-proof.test/docs");

      const redirectEvidence = await readDeploymentProofManagedRouteEvidence(
        {
          id: "dep_v2",
          runtimePlan: { execution: { accessRoutes: [] } },
        } as unknown as DeploymentSummary,
        routeFetch,
        [
          {
            domainName: "old-route-proof.test",
            pathPrefix: "/docs",
            proxyKind: "traefik",
            tlsMode: "disabled",
            routeBehavior: "redirect",
            redirectTo: "route-proof.test",
            redirectStatus: 301,
          },
        ],
      );

      expect(redirectEvidence).toMatchObject({
        status: "passed",
        routes: [
          {
            routeBehavior: "redirect",
            expectedRedirectStatus: 301,
            expectedRedirectTo: "http://route-proof.test/docs?appaloft-proof=redirect",
            observedStatus: 301,
            observedRedirectTo: "http://route-proof.test/docs?appaloft-proof=redirect",
            matched: true,
          },
        ],
      });
    } finally {
      Bun.spawnSync(["docker", "rm", "-f", proxy, workload]);
      Bun.spawnSync(["docker", "network", "rm", network]);
    }
  },
  60_000,
);
