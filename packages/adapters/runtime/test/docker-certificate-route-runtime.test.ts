import { describe, expect, test } from "bun:test";
import { CreatedAt, DeploymentTarget, DeploymentTargetId, DeploymentTargetName, HostAddress, PortNumber, ProviderKey } from "@appaloft/core";

import {
  type CertificateRouteCommandInput,
  type CertificateRouteCommandRunner,
  DockerCliCertificateRouteRuntime,
} from "../src";

const inspectOutput = JSON.stringify([
  {
    Config: {
      Image: "demo:test",
      Env: ["NODE_ENV=production"],
      Cmd: ["node", "server.js"],
      Labels: { "appaloft.deployment-id": "dep_previous", "traefik.http.routers.old.tls.certresolver": "appaloft" },
      WorkingDir: "/app",
      User: "1000:1000",
    },
    HostConfig: {
      NetworkMode: "appaloft-edge",
      RestartPolicy: { Name: "unless-stopped", MaximumRetryCount: 0 },
      PortBindings: { "3000/tcp": [{ HostIp: "127.0.0.1", HostPort: "49152" }] },
      ExtraHosts: ["host.docker.internal:host-gateway"],
      Privileged: false,
      ReadonlyRootfs: false,
    },
    Mounts: [{ Type: "volume", Name: "app-data", Destination: "/data", RW: true }],
  },
]);

class RecordingRunner implements CertificateRouteCommandRunner {
  inputs: CertificateRouteCommandInput[] = [];
  async run(input: CertificateRouteCommandInput) {
    this.inputs.push(input);
    return {
      failed: false,
      stdout: input.command.startsWith("docker inspect ") ? inspectOutput : "",
      stderr: "",
    };
  }
}

class ComposeRecordingRunner extends RecordingRunner {
  override async run(input: CertificateRouteCommandInput) {
    this.inputs.push(input);
    return {
      failed: false,
      stdout: input.command.startsWith("docker ps ")
        ? "appaloft-demo-api-1\n"
        : input.command.startsWith("docker inspect ")
          ? inspectOutput
          : "",
      stderr: "",
    };
  }
}

class SwitchFailingRunner extends RecordingRunner {
  override async run(input: CertificateRouteCommandInput) {
    this.inputs.push(input);
    if (input.command.includes("docker stop 'appaloft-dep_previous'")) {
      return { failed: true, stdout: "", stderr: "candidate failed" };
    }
    return {
      failed: false,
      stdout: input.command.startsWith("docker inspect ") ? inspectOutput : "",
      stderr: "",
    };
  }
}

function serverState() {
  return DeploymentTarget.register({
    id: DeploymentTargetId.rehydrate("srv_demo"),
    name: DeploymentTargetName.rehydrate("Demo"),
    host: HostAddress.rehydrate("127.0.0.1"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("local-shell"),
    createdAt: CreatedAt.rehydrate("2026-08-02T00:00:00.000Z"),
  })._unsafeUnwrap().toState();
}

describe("DockerCliCertificateRouteRuntime", () => {
  test("[EDGE-PROXY-RELOAD-004A] installs material over stdin and switches a prepared candidate container", async () => {
    const runner = new RecordingRunner();
    const runtime = new DockerCliCertificateRouteRuntime(runner);
    const chain = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";
    const key = "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIO9Q2yKOJYJ0cV7kShYQDTLqsCST6VGNAnAtCwqD3QXg\n-----END PRIVATE KEY-----";

    const result = await runtime.activate({
      correlationId: "req_runtime_activation",
      certificateId: "crt_candidate",
      deploymentId: "dep_previous",
      containerName: "appaloft-dep_previous",
      proxyKind: "traefik",
      server: serverState(),
      material: { certificateId: "crt_candidate", certificateChain: chain, privateKey: key },
      accessRoutes: [{
        proxyKind: "traefik",
        domains: ["manual.example.test"],
        pathPrefix: "/",
        tlsMode: "auto",
        source: "domain-binding",
        certificate: { source: "appaloft-imported", certificateId: "crt_candidate" },
        targetPort: 3000,
      }],
      routePlan: {
        providerKey: "traefik",
        networkName: "appaloft-edge",
        labels: [
          "traefik.enable=true",
          "traefik.http.routers.dep.tls=true",
        ],
      },
      reloadPlan: null,
    });

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      activationId: "appaloft-dep_previous",
      previousActivationId: "appaloft-dep_previous-previous-dep_previous-crt_candidate",
    });
    expect(runner.inputs[0]?.stdin).toBeDefined();
    expect(String(runner.inputs[0]?.stdin)).toContain(chain);
    expect(runner.inputs.every((input) => !input.command.includes(chain) && !input.command.includes("BEGIN PRIVATE KEY"))).toBe(true);
    expect(runner.inputs[2]?.command).toContain("docker create");
    expect(runner.inputs[2]?.command).toContain("traefik.http.routers.dep.tls=true");
    expect(runner.inputs[2]?.command).not.toContain("tls.certresolver");
    expect(runner.inputs[2]?.command).toContain("docker rename 'appaloft-dep_previous' 'appaloft-dep_previous-previous-dep_previous-crt_candidate'");
  });

  test("[EDGE-PROXY-RELOAD-004C] restores the previous container or retires it only after proof", async () => {
    const runner = new RecordingRunner();
    const runtime = new DockerCliCertificateRouteRuntime(runner);
    const transition = {
      correlationId: "req_runtime_rollback",
      server: serverState(),
      certificateId: "crt_candidate",
      proxyKind: "traefik" as const,
      activationId: "appaloft-dep_previous",
      previousActivationId: "appaloft-dep_previous-previous",
    };

    expect((await runtime.rollback(transition)).isOk()).toBe(true);
    expect(runner.inputs[0]?.command).toContain(
      "docker rename 'appaloft-dep_previous-previous' 'appaloft-dep_previous'",
    );
    expect(runner.inputs[0]?.command).toContain("docker start 'appaloft-dep_previous'");

    expect(runner.inputs[1]?.command).toContain("certificate-crt_candidate.yml");

    expect((await runtime.finalize(transition)).isOk()).toBe(true);
    expect(runner.inputs[2]?.command).toBe(
      "docker rm -f 'appaloft-dep_previous-previous' >/dev/null",
    );
  });

  test("[EDGE-PROXY-RELOAD-004B] resolves one Compose service container by authoritative labels", async () => {
    const runner = new ComposeRecordingRunner();
    const runtime = new DockerCliCertificateRouteRuntime(runner);
    const result = await runtime.activate({
      correlationId: "req_compose_activation",
      certificateId: "crt_candidate",
      deploymentId: "dep_compose",
      containerName: "unused-fallback",
      containerSelector: {
        composeProjectName: "appaloft-dep_compose",
        serviceName: "api",
      },
      proxyKind: "traefik",
      server: serverState(),
      material: {
        certificateId: "crt_candidate",
        certificateChain: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
        privateKey: "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIO9Q2yKOJYJ0cV7kShYQDTLqsCST6VGNAnAtCwqD3QXg\n-----END PRIVATE KEY-----",
      },
      accessRoutes: [],
      routePlan: { providerKey: "traefik", networkName: "appaloft-edge", labels: [] },
      reloadPlan: null,
    });

    expect(result.isOk()).toBe(true);
    expect(runner.inputs[0]?.command).toContain(
      "label=com.docker.compose.project=appaloft-dep_compose",
    );
    expect(runner.inputs[0]?.command).toContain("label=com.docker.compose.service=api");
    expect(runner.inputs[2]?.command).toBe("docker inspect 'appaloft-demo-api-1'");
    expect(result._unsafeUnwrap().activationId).toBe("appaloft-demo-api-1");
  });

  test("[EDGE-PROXY-RELOAD-004A] materializes Caddy certificates at the provider label path", async () => {
    const runner = new RecordingRunner();
    const runtime = new DockerCliCertificateRouteRuntime(runner);
    const result = await runtime.activate({
      correlationId: "req_caddy_material",
      certificateId: "crt_candidate",
      deploymentId: "dep_caddy",
      containerName: "appaloft-caddy-demo",
      proxyKind: "caddy",
      server: serverState(),
      material: {
        certificateId: "crt_candidate",
        certificateChain: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
        privateKey: "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIO9Q2yKOJYJ0cV7kShYQDTLqsCST6VGNAnAtCwqD3QXg\n-----END PRIVATE KEY-----",
      },
      accessRoutes: [],
      routePlan: { providerKey: "caddy", networkName: "appaloft-edge", labels: [] },
      reloadPlan: null,
    });

    expect(result.isOk()).toBe(true);
    expect(runner.inputs[0]?.command).toContain(
      "/target/appaloft/certificates/crt_candidate/certificate.pem",
    );
  });

  test("[EDGE-PROXY-RELOAD-004C] candidate switch includes inline restoration before failing", async () => {
    const runner = new SwitchFailingRunner();
    const runtime = new DockerCliCertificateRouteRuntime(runner);
    const result = await runtime.activate({
      correlationId: "req_failed_switch",
      certificateId: "crt_candidate",
      deploymentId: "dep_previous",
      containerName: "appaloft-dep_previous",
      proxyKind: "traefik",
      server: serverState(),
      material: {
        certificateId: "crt_candidate",
        certificateChain: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
        privateKey: "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIO9Q2yKOJYJ0cV7kShYQDTLqsCST6VGNAnAtCwqD3QXg\n-----END PRIVATE KEY-----",
      },
      accessRoutes: [],
      routePlan: { providerKey: "traefik", networkName: "appaloft-edge", labels: [] },
      reloadPlan: null,
    });

    expect(result.isErr()).toBe(true);
    const switchCommand = runner.inputs.at(-1)?.command ?? "";
    expect(switchCommand).toContain(
      "docker rename 'appaloft-dep_previous-previous-dep_previous-crt_candidate' 'appaloft-dep_previous'",
    );
    expect(switchCommand).toContain("docker start 'appaloft-dep_previous'");
  });
});
