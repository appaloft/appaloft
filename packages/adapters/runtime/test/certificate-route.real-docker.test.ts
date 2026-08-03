import { describe, expect, test } from "bun:test";
import { X509Certificate } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetName,
  HostAddress,
  PortNumber,
  ProviderKey,
} from "@appaloft/core";
import { TraefikEdgeProxyProvider } from "@appaloft/provider-edge-proxy-traefik";
import { CaddyEdgeProxyProvider } from "@appaloft/provider-edge-proxy-caddy";

import {
  DockerCliCertificateRouteRuntime,
  LocalSshCertificateRouteCommandRunner,
  probeDirectOriginTls,
} from "../src";
import { runBufferedProcess } from "../src/buffered-process";

const dockerSmokeTest =
  Bun.env.APPALOFT_CERTIFICATE_ROUTE_DOCKER_SMOKE === "1" ? test : test.skip;

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a local TLS port"));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

async function command(args: string[]): Promise<string> {
  const result = await runBufferedProcess({ command: args, timeoutMs: 120_000 });
  if (result.failed) throw new Error(result.stderr || `Command failed: ${args[0]}`);
  return result.stdout.trim();
}

async function certificate(directory: string, name: string, hostname: string) {
  const keyPath = join(directory, `${name}.key.pem`);
  const certificatePath = join(directory, `${name}.certificate.pem`);
  await command([
    "openssl",
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    keyPath,
    "-out",
    certificatePath,
    "-days",
    "2",
    "-subj",
    `/CN=${hostname}`,
    "-addext",
    `subjectAltName=DNS:${hostname}`,
  ]);
  const certificateChain = readFileSync(certificatePath, "utf8");
  return {
    certificateChain,
    privateKey: readFileSync(keyPath, "utf8"),
    fingerprint: new X509Certificate(certificateChain).fingerprint256,
  };
}

async function observedFingerprint(input: {
  hostname: string;
  port: number;
  expected: string;
}): Promise<string> {
  let last = "unavailable";
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const observed = await probeDirectOriginTls({
      host: "127.0.0.1",
      port: input.port,
      serverName: input.hostname,
      timeoutMs: 2_000,
    });
    if (observed.isOk()) {
      last = observed.value.fingerprint;
      if (last === input.expected) return last;
    }
    await Bun.sleep(250);
  }
  return last;
}

describe("certificate route real Docker smoke", () => {
  dockerSmokeTest(
    "[EDGE-PROXY-RELOAD-004D] Traefik serves the candidate SNI fingerprint and rollback restores the previous certificate",
    async () => {
      const suffix = `cert-smoke-${process.pid}-${Date.now().toString(36)}`;
      const network = `${suffix}-network`;
      const dynamicVolume = `${suffix}-dynamic`;
      const acmeVolume = `${suffix}-acme`;
      const proxy = `${suffix}-traefik`;
      const application = `${suffix}-app`;
      const domainBindingId = `dmb_${suffix}`;
      const hostname = "certificate-transition.example.test";
      const tlsPort = await freePort();
      const certificateDirectory = mkdtempSync(join(tmpdir(), `${suffix}-`));
      const oldCertificate = await certificate(certificateDirectory, "old", hostname);
      const candidateCertificate = await certificate(
        certificateDirectory,
        "candidate",
        hostname,
      );
      const server = DeploymentTarget.register({
        id: DeploymentTargetId.rehydrate(`srv_${suffix}`),
        name: DeploymentTargetName.rehydrate("Certificate smoke"),
        host: HostAddress.rehydrate("127.0.0.1"),
        port: PortNumber.rehydrate(22),
        providerKey: ProviderKey.rehydrate("local-shell"),
        createdAt: CreatedAt.rehydrate("2026-08-02T00:00:00.000Z"),
      })._unsafeUnwrap().toState();
      const provider = new TraefikEdgeProxyProvider();
      const runner = new LocalSshCertificateRouteCommandRunner();
      const runtime = new DockerCliCertificateRouteRuntime(runner, {
        traefikDynamicVolumeName: dynamicVolume,
        traefikContainerName: proxy,
      });
      const cleanupNames = [application, proxy];

      try {
        await command(["docker", "network", "create", network]);
        await command(["docker", "volume", "create", dynamicVolume]);
        await command(["docker", "volume", "create", acmeVolume]);
        await command([
          "docker",
          "run",
          "-d",
          "--name",
          proxy,
          "--network",
          network,
          "-p",
          `127.0.0.1:${tlsPort}:443`,
          "-v",
          "/var/run/docker.sock:/var/run/docker.sock:ro",
          "-v",
          `${dynamicVolume}:/etc/traefik/dynamic`,
          "-v",
          `${acmeVolume}:/letsencrypt`,
          "traefik:v3.7.9",
          "--providers.docker=true",
          "--providers.docker.exposedbydefault=false",
          `--providers.docker.network=${network}`,
          "--providers.file.directory=/etc/traefik/dynamic",
          "--providers.file.watch=true",
          "--entrypoints.websecure.address=:443",
        ]);

        const accessRoute = {
          proxyKind: "traefik" as const,
          domains: [hostname],
          pathPrefix: "/",
          tlsMode: "auto" as const,
          source: "domain-binding" as const,
          domainBindingId,
          certificate: {
            source: "appaloft-imported" as const,
            certificateId: "crt_old",
            domainBindingId,
          },
          targetPort: 80,
        };
        const oldPlanResult = await provider.realizeRoutes(
          { correlationId: "req_old_route" },
          { deploymentId: "dep_smoke", port: 80, accessRoutes: [accessRoute] },
        );
        expect(oldPlanResult.isOk()).toBe(true);
        const oldPlan = oldPlanResult._unsafeUnwrap();
        oldPlan.labels = oldPlan.labels.map((label) => label.replace("appaloft-edge", network));
        oldPlan.networkName = network;
        await command([
          "docker",
          "run",
          "-d",
          "--name",
          application,
          "--network",
          network,
          ...oldPlan.labels.flatMap((label) => ["--label", label]),
          "nginx:1.29.5-alpine",
        ]);

        const oldActivation = await runtime.activate({
          domainBindingId,
          proxyKind: "traefik",
          server,
          material: { certificateId: "crt_old", ...oldCertificate },
          routePlan: oldPlan,
          reloadPlan: null,
        });
        expect(oldActivation.isOk()).toBe(true);
        expect(
          await observedFingerprint({ hostname, port: tlsPort, expected: oldCertificate.fingerprint }),
        ).toBe(oldCertificate.fingerprint);
        expect(
          (await runtime.finalize({
            server,
            domainBindingId,
            proxyKind: "traefik",
            ...oldActivation._unsafeUnwrap(),
          })).isOk(),
        ).toBe(true);

        const candidateRoute = {
          ...accessRoute,
          certificate: {
            source: "appaloft-imported" as const,
            certificateId: "crt_old",
            domainBindingId,
          },
        };
        const candidatePlanResult = await provider.realizeRoutes(
          { correlationId: "req_candidate_route" },
          { deploymentId: "dep_smoke", port: 80, accessRoutes: [candidateRoute] },
        );
        expect(candidatePlanResult.isOk()).toBe(true);
        const candidatePlan = candidatePlanResult._unsafeUnwrap();
        candidatePlan.labels = candidatePlan.labels.map((label) =>
          label.replace("appaloft-edge", network),
        );
        candidatePlan.networkName = network;
        const candidateActivation = await runtime.activate({
          domainBindingId,
          proxyKind: "traefik",
          server,
          material: { certificateId: "crt_old", ...candidateCertificate },
          routePlan: candidatePlan,
          reloadPlan: null,
        });
        expect(candidateActivation.isOk()).toBe(true);
        const retriedCandidateActivation = await runtime.activate({
          domainBindingId,
          proxyKind: "traefik",
          server,
          material: { certificateId: "crt_old", ...candidateCertificate },
          routePlan: candidatePlan,
          reloadPlan: null,
        });
        expect(retriedCandidateActivation.isOk()).toBe(true);
        expect(
          await observedFingerprint({
            hostname,
            port: tlsPort,
            expected: candidateCertificate.fingerprint,
          }),
        ).toBe(candidateCertificate.fingerprint);

        expect(
          (await runtime.rollback({
            server,
            domainBindingId,
            proxyKind: "traefik",
            ...retriedCandidateActivation._unsafeUnwrap(),
          })).isOk(),
        ).toBe(true);
        expect(
          await observedFingerprint({ hostname, port: tlsPort, expected: oldCertificate.fingerprint }),
        ).toBe(oldCertificate.fingerprint);
      } finally {
        await command(["docker", "rm", "-f", ...cleanupNames]).catch(() => undefined);
        await command(["docker", "volume", "rm", "-f", dynamicVolume, acmeVolume]).catch(
          () => undefined,
        );
        await command(["docker", "network", "rm", network]).catch(() => undefined);
        rmSync(certificateDirectory, { recursive: true, force: true });
      }
    },
    180_000,
  );

  dockerSmokeTest(
    "[EDGE-PROXY-RELOAD-004D] Caddy serves the candidate SNI fingerprint and rollback restores the previous certificate",
    async () => {
      const suffix = `cert-caddy-smoke-${process.pid}-${Date.now().toString(36)}`;
      const network = `${suffix}-network`;
      const dataVolume = `${suffix}-data`;
      const configVolume = `${suffix}-config`;
      const proxy = `${suffix}-proxy`;
      const application = `${suffix}-app`;
      const domainBindingId = `dmb_${suffix}`;
      const hostname = "certificate-transition-caddy.example.test";
      const tlsPort = await freePort();
      const certificateDirectory = mkdtempSync(join(tmpdir(), `${suffix}-`));
      const oldCertificate = await certificate(certificateDirectory, "old", hostname);
      const candidateCertificate = await certificate(
        certificateDirectory,
        "candidate",
        hostname,
      );
      const server = DeploymentTarget.register({
        id: DeploymentTargetId.rehydrate(`srv_${suffix}`),
        name: DeploymentTargetName.rehydrate("Caddy certificate smoke"),
        host: HostAddress.rehydrate("127.0.0.1"),
        port: PortNumber.rehydrate(22),
        providerKey: ProviderKey.rehydrate("local-shell"),
        createdAt: CreatedAt.rehydrate("2026-08-02T00:00:00.000Z"),
      })._unsafeUnwrap().toState();
      const provider = new CaddyEdgeProxyProvider();
      const runtime = new DockerCliCertificateRouteRuntime(
        new LocalSshCertificateRouteCommandRunner(),
        { caddyDataVolumeName: dataVolume, caddyContainerName: proxy },
      );
      const deploymentId = "dep_caddy_smoke";
      const cleanupNames = [application, proxy];

      try {
        await command(["docker", "network", "create", network]);
        await command(["docker", "volume", "create", dataVolume]);
        await command(["docker", "volume", "create", configVolume]);
        await command([
          "docker",
          "run",
          "-d",
          "--name",
          proxy,
          "--network",
          network,
          "-p",
          `127.0.0.1:${tlsPort}:443`,
          "-v",
          "/var/run/docker.sock:/var/run/docker.sock",
          "-v",
          `${dataVolume}:/data`,
          "-v",
          `${configVolume}:/config`,
          "-e",
          `CADDY_INGRESS_NETWORKS=${network}`,
          "lucaslorentz/caddy-docker-proxy:2.9-alpine",
        ]);

        const accessRoute = {
          proxyKind: "caddy" as const,
          domains: [hostname],
          pathPrefix: "/",
          tlsMode: "auto" as const,
          source: "domain-binding" as const,
          domainBindingId,
          certificate: {
            source: "appaloft-imported" as const,
            certificateId: "crt_old",
            domainBindingId,
          },
          targetPort: 80,
        };
        const oldPlanResult = await provider.realizeRoutes(
          { correlationId: "req_caddy_old_route" },
          { deploymentId, port: 80, accessRoutes: [accessRoute] },
        );
        expect(oldPlanResult.isOk()).toBe(true);
        const oldPlan = oldPlanResult._unsafeUnwrap();
        oldPlan.networkName = network;
        await command([
          "docker",
          "run",
          "-d",
          "--name",
          application,
          "--network",
          network,
          ...oldPlan.labels.flatMap((label) => ["--label", label]),
          "nginx:1.29.5-alpine",
        ]);

        const oldActivation = await runtime.activate({
          domainBindingId,
          proxyKind: "caddy",
          server,
          material: { certificateId: "crt_old", ...oldCertificate },
          routePlan: oldPlan,
          reloadPlan: {
            providerKey: "caddy",
            proxyKind: "caddy",
            displayName: "Caddy",
            required: true,
            steps: [{ name: "reload", mode: "command", command: `docker restart ${proxy}` }],
            metadata: {},
          },
        });
        expect(oldActivation.isOk()).toBe(true);
        expect(
          await observedFingerprint({ hostname, port: tlsPort, expected: oldCertificate.fingerprint }),
        ).toBe(oldCertificate.fingerprint);
        expect(
          (await runtime.finalize({
            server,
            domainBindingId,
            proxyKind: "caddy",
            ...oldActivation._unsafeUnwrap(),
          })).isOk(),
        ).toBe(true);

        const candidateRoute = {
          ...accessRoute,
          certificate: {
            source: "appaloft-imported" as const,
            certificateId: "crt_old",
            domainBindingId,
          },
        };
        const candidatePlanResult = await provider.realizeRoutes(
          { correlationId: "req_caddy_candidate_route" },
          { deploymentId, port: 80, accessRoutes: [candidateRoute] },
        );
        expect(candidatePlanResult.isOk()).toBe(true);
        const candidatePlan = candidatePlanResult._unsafeUnwrap();
        candidatePlan.networkName = network;
        const candidateActivation = await runtime.activate({
          domainBindingId,
          proxyKind: "caddy",
          server,
          material: { certificateId: "crt_old", ...candidateCertificate },
          routePlan: candidatePlan,
          reloadPlan: {
            providerKey: "caddy",
            proxyKind: "caddy",
            displayName: "Caddy",
            required: true,
            steps: [{ name: "reload", mode: "command", command: `docker restart ${proxy}` }],
            metadata: {},
          },
        });
        expect(candidateActivation.isOk()).toBe(true);
        const retriedCandidateActivation = await runtime.activate({
          domainBindingId,
          proxyKind: "caddy",
          server,
          material: { certificateId: "crt_old", ...candidateCertificate },
          routePlan: candidatePlan,
          reloadPlan: {
            providerKey: "caddy",
            proxyKind: "caddy",
            displayName: "Caddy",
            required: true,
            steps: [{ name: "reload", mode: "command", command: `docker restart ${proxy}` }],
            metadata: {},
          },
        });
        expect(retriedCandidateActivation.isOk()).toBe(true);
        expect(
          await observedFingerprint({
            hostname,
            port: tlsPort,
            expected: candidateCertificate.fingerprint,
          }),
        ).toBe(candidateCertificate.fingerprint);
        expect(
          (await runtime.rollback({
            server,
            domainBindingId,
            proxyKind: "caddy",
            ...retriedCandidateActivation._unsafeUnwrap(),
          })).isOk(),
        ).toBe(true);
        expect(
          await observedFingerprint({ hostname, port: tlsPort, expected: oldCertificate.fingerprint }),
        ).toBe(oldCertificate.fingerprint);
      } finally {
        await command(["docker", "rm", "-f", ...cleanupNames]).catch(() => undefined);
        await command(["docker", "volume", "rm", "-f", dataVolume, configVolume]).catch(
          () => undefined,
        );
        await command(["docker", "network", "rm", network]).catch(() => undefined);
        rmSync(certificateDirectory, { recursive: true, force: true });
      }
    },
    180_000,
  );
});
