import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTargetId,
  DeploymentTargetName,
  EdgeProxyKindValue,
  EdgeProxyStatusValue,
  HostAddress,
  PortNumber,
  ProviderKey,
  TargetKindValue,
  type DeploymentTargetState,
} from "@appaloft/core";

import { RuntimeServerRuntimePreparer } from "../src/server-runtime-preparer";

function createSshServer(): DeploymentTargetState {
  return {
    id: DeploymentTargetId.rehydrate("srv_prepare"),
    name: DeploymentTargetName.rehydrate("prepare"),
    host: HostAddress.rehydrate("root@example.internal"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    targetKind: TargetKindValue.rehydrate("single-server"),
    edgeProxy: {
      kind: EdgeProxyKindValue.rehydrate("traefik"),
      status: EdgeProxyStatusValue.rehydrate("pending"),
    },
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  };
}

describe("RuntimeServerRuntimePreparer", () => {
  test("runs an idempotent Docker preparation command over SSH", async () => {
    const calls: { command: string; args: string[]; timeoutMs: number }[] = [];
    const preparer = new RuntimeServerRuntimePreparer(async (command, args, timeoutMs) => {
      calls.push({ command, args, timeoutMs });
      return {
        status: 0,
        stdout: "APPALOFT_DOCKER_READY already-installed\n",
        stderr: "",
      };
    });

    const result = await preparer.prepare(
      {
        requestId: "req_prepare_runtime",
        entrypoint: "system",
        locale: "en",
        t: ((key: string) => key) as never,
      },
      {
        server: createSshServer(),
        mode: "prepare",
      },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().steps).toEqual([
      expect.objectContaining({
        phase: "docker",
        status: "succeeded",
        message: "Docker is already available",
      }),
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe("ssh");
    expect(calls[0]?.timeoutMs).toBe(900_000);
    expect(calls[0]?.args.join(" ")).toContain("docker version");
    expect(calls[0]?.args.join(" ")).toContain("docker compose version");
    expect(calls[0]?.args.join(" ")).toContain("APPALOFT_DOCKER_PREPARE docker-compose-plugin");
    expect(calls[0]?.args.join(" ")).toContain("install -y docker-compose-plugin");
    expect(calls[0]?.args.join(" ")).toContain("APPALOFT_DOCKER_PREPARE docker-repository-reset");
    expect(calls[0]?.args.join(" ")).toContain("rm -f /etc/apt/sources.list.d/docker.list");
    expect(calls[0]?.args.join(" ")).toContain("APPALOFT_DOCKER_PREPARE apt-bootstrap");
    expect(calls[0]?.args.join(" ")).toContain("install -y docker-ce");
    expect(calls[0]?.args.join(" ")).toContain('CODENAME="${VERSION_CODENAME:-}"');
    expect(calls[0]?.args.join(" ")).not.toContain("\\${VERSION_CODENAME:-}");
  });

  test("marks unsupported providers as failed instead of pretending readiness", async () => {
    const server = {
      ...createSshServer(),
      providerKey: ProviderKey.rehydrate("unknown-provider"),
    };
    const preparer = new RuntimeServerRuntimePreparer();

    const result = await preparer.prepare(
      {
        requestId: "req_prepare_runtime",
        entrypoint: "system",
        locale: "en",
        t: ((key: string) => key) as never,
      },
      {
        server,
        mode: "prepare",
      },
    );

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().steps).toEqual([
      expect.objectContaining({
        phase: "docker",
        status: "failed",
        message: "No runtime preparer is registered for unknown-provider",
      }),
    ]);
  });
});
