import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetName,
  HostAddress,
  PortNumber,
  ProviderKey,
} from "@appaloft/core";

import {
  type CertificateRouteCommandInput,
  type CertificateRouteCommandRunner,
  DockerCliCertificateRouteRuntime,
} from "../src";

class RecordingRunner implements CertificateRouteCommandRunner {
  readonly inputs: CertificateRouteCommandInput[] = [];

  constructor(private readonly previousMaterial = true) {}

  async run(input: CertificateRouteCommandInput) {
    this.inputs.push(input);
    return {
      failed: false,
      stdout: input.stdin ? `previous=${this.previousMaterial ? "1" : "0"}\n` : "",
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
  })
    ._unsafeUnwrap()
    .toState();
}

function activationInput(proxyKind: "traefik" | "caddy") {
  return {
    domainBindingId: "dmb_manual_example",
    proxyKind,
    server: serverState(),
    material: {
      certificateId: "crt_candidate",
      certificateChain: "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----",
      privateKey:
        "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIO9Q2yKOJYJ0cV7kShYQDTLqsCST6VGNAnAtCwqD3QXg\n-----END PRIVATE KEY-----",
    },
    routePlan: {
      providerKey: proxyKind,
      labels: [
        "appaloft.deployment-id=dep_demo",
        ...(proxyKind === "traefik"
          ? ["traefik.http.routers.dep-demo.tls=true"]
          : ["caddy=https://example.com"]),
      ],
    },
    reloadPlan: null,
  };
}

describe("DockerCliCertificateRouteRuntime", () => {
  test("[EDGE-PROXY-RELOAD-004A] atomically swaps binding-scoped Traefik material without recreating the workload", async () => {
    const runner = new RecordingRunner();
    const runtime = new DockerCliCertificateRouteRuntime(runner);
    const input = activationInput("traefik");

    const result = await runtime.activate(input);

    expect(result._unsafeUnwrap()).toEqual({
      activationId: "dmb_manual_example",
      previousActivationId: "dmb_manual_example",
    });
    expect(runner.inputs).toHaveLength(3);
    expect(runner.inputs[0]?.command).toContain("docker inspect");
    expect(runner.inputs[0]?.command).toContain('tls.certresolver":"appaloft');
    expect(runner.inputs[1]?.command).toContain(
      "alpine@sha256:4b7ce07002c69e8f3d704a9c5d6fd3053be500b7f1c69fc0d80990c2ad8dd412",
    );
    expect(runner.inputs[1]?.command).toContain(
      "/target/certificates/dmb_manual_example",
    );
    expect(runner.inputs[1]?.command).toContain("certificate.pem");
    expect(runner.inputs[1]?.command).toContain(
      "/target/certificate-dmb_manual_example.yml",
    );
    expect(runner.inputs[1]?.command).toContain("mv");
    const installCommand = runner.inputs[1]?.command ?? "";
    expect(installCommand.indexOf("trap")).toBeLessThan(
      installCommand.indexOf(".appaloft-certificate-previous"),
    );
    expect(runner.inputs[1]?.command).not.toMatch(/docker (inspect|create|stop|rename)/);
    expect(String(runner.inputs[1]?.stdin)).toContain(input.material.certificateChain);
    expect(runner.inputs[1]?.command).not.toContain(input.material.certificateChain);
    expect(runner.inputs[1]?.command).not.toContain("BEGIN PRIVATE KEY");
  });

  test("[EDGE-PROXY-RELOAD-004C] restores the previous material on rollback and retires only its backup after durable proof", async () => {
    const runner = new RecordingRunner();
    const runtime = new DockerCliCertificateRouteRuntime(runner);
    const transition = {
      server: serverState(),
      domainBindingId: "dmb_manual_example",
      proxyKind: "traefik" as const,
      activationId: "dmb_manual_example",
      previousActivationId: "dmb_manual_example",
    };

    expect((await runtime.rollback(transition)).isOk()).toBe(true);
    expect(runner.inputs[0]?.command).toContain("/target/.appaloft-certificate-previous/dmb_manual_example");
    expect(runner.inputs[0]?.command).not.toContain("rm -rf '/target/certificates/dmb_manual_example'");

    expect((await runtime.finalize(transition)).isOk()).toBe(true);
    expect(runner.inputs[2]?.command).toContain(
      "/target/.appaloft-certificate-previous/dmb_manual_example",
    );
  });

  test("[EDGE-PROXY-RELOAD-004A] uses the same stable binding identity for Caddy material", async () => {
    const runner = new RecordingRunner(false);
    const runtime = new DockerCliCertificateRouteRuntime(runner);

    const result = await runtime.activate(activationInput("caddy"));

    expect(result._unsafeUnwrap()).toEqual({ activationId: "dmb_manual_example" });
    expect(runner.inputs[1]?.command).toContain(
      "/target/appaloft/certificates/dmb_manual_example",
    );
    expect(runner.inputs[1]?.command).toContain("certificate.pem");
  });

  test("[EDGE-PROXY-RELOAD-004B] fails before material mutation when the Caddy workload lacks the authoritative labels", async () => {
    const runner: CertificateRouteCommandRunner = {
      async run() {
        return { failed: true, stdout: "", stderr: "route labels not found" };
      },
    };
    const runtime = new DockerCliCertificateRouteRuntime(runner);

    const result = await runtime.activate({
      ...activationInput("caddy"),
      routePlan: {
        providerKey: "caddy",
        labels: [
          "caddy.tls=/data/appaloft/certificates/dmb_manual_example/certificate.pem /data/appaloft/certificates/dmb_manual_example/private-key.pem",
        ],
      },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.message).toContain("must be redeployed");
  });

  test("[EDGE-PROXY-RELOAD-004B] fails before material mutation when the Traefik workload still owns ACME lifecycle", async () => {
    const inputs: CertificateRouteCommandInput[] = [];
    const runner: CertificateRouteCommandRunner = {
      async run(input) {
        inputs.push(input);
        return { failed: true, stdout: "", stderr: "certresolver is still active" };
      },
    };
    const runtime = new DockerCliCertificateRouteRuntime(runner);

    const result = await runtime.activate(activationInput("traefik"));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.message).toContain("must be redeployed");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.stdin).toBeUndefined();
  });

  test("[EDGE-PROXY-RELOAD-004A] executes explicit provider reload steps after the atomic material swap", async () => {
    const runner = new RecordingRunner();
    const runtime = new DockerCliCertificateRouteRuntime(runner);

    const result = await runtime.activate({
      ...activationInput("caddy"),
      reloadPlan: {
        providerKey: "caddy",
        proxyKind: "caddy",
        displayName: "Caddy",
        required: true,
        steps: [
          {
            name: "reload-caddy",
            mode: "command",
            command: "docker restart appaloft-caddy",
            successMessage: "Caddy reloaded",
          },
        ],
      },
    });

    expect(result.isOk()).toBe(true);
    expect(runner.inputs[2]?.command).toBe("docker restart appaloft-caddy");
  });

  test("[EDGE-PROXY-RELOAD-004C] surfaces rollback failure when reload and restore both fail", async () => {
    let call = 0;
    const runner: CertificateRouteCommandRunner = {
      async run(input) {
        call += 1;
        return {
          failed: call >= 3,
          stdout: input.stdin ? "previous=1\n" : "",
          stderr: call === 3 ? "reload failed" : call === 4 ? "restore failed" : "",
        };
      },
    };
    const runtime = new DockerCliCertificateRouteRuntime(runner);

    const result = await runtime.activate({
      ...activationInput("caddy"),
      reloadPlan: {
        providerKey: "caddy",
        proxyKind: "caddy",
        displayName: "Caddy",
        required: true,
        steps: [
          {
            name: "reload-caddy",
            mode: "command",
            command: "docker restart appaloft-caddy",
            successMessage: "Caddy reloaded",
          },
        ],
      },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("could not be restored");
    }
    expect(call).toBe(4);
  });
});
