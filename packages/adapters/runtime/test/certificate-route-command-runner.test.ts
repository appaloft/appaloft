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
  type CertificateRouteProcessExecutor,
  LocalSshCertificateRouteCommandRunner,
} from "../src";

function server(providerKey: "local-shell" | "generic-ssh") {
  return DeploymentTarget.register({
    id: DeploymentTargetId.rehydrate(`srv_${providerKey}`),
    name: DeploymentTargetName.rehydrate(providerKey),
    host: HostAddress.rehydrate(providerKey === "local-shell" ? "127.0.0.1" : "203.0.113.45"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate(providerKey),
    createdAt: CreatedAt.rehydrate("2026-08-02T00:00:00.000Z"),
  })._unsafeUnwrap().toState();
}

describe("LocalSshCertificateRouteCommandRunner", () => {
  test("[EDGE-PROXY-RELOAD-004A] forwards certificate material only through process stdin", async () => {
    const calls: Parameters<CertificateRouteProcessExecutor>[0][] = [];
    const runner = new LocalSshCertificateRouteCommandRunner(async (input) => {
      calls.push(input);
      return { exitCode: 0, stdout: "ok", stderr: "", failed: false, timedOut: false };
    });

    const result = await runner.run({
      server: server("local-shell"),
      command: "docker run --rm -i helper",
      stdin: "private-material",
      redactions: ["private-material"],
    });

    expect(result.failed).toBe(false);
    expect(calls[0]).toMatchObject({
      command: ["sh", "-lc", "docker run --rm -i helper"],
      stdin: "private-material",
      redactions: ["private-material"],
    });
    expect(calls[0]?.command.join(" ")).not.toContain("private-material");
  });

  test("[EDGE-PROXY-RELOAD-004A] executes the same stdin protocol over generic SSH", async () => {
    const calls: Parameters<CertificateRouteProcessExecutor>[0][] = [];
    const runner = new LocalSshCertificateRouteCommandRunner(async (input) => {
      calls.push(input);
      return { exitCode: 0, stdout: "ok", stderr: "", failed: false, timedOut: false };
    });

    await runner.run({
      server: server("generic-ssh"),
      command: "docker inspect appaloft",
      stdin: "certificate-stdin",
    });

    expect(calls[0]?.command[0]).toBe("ssh");
    expect(calls[0]?.command.at(-2)).toBe("203.0.113.45");
    expect(calls[0]?.command.at(-1)).toBe("docker inspect appaloft");
    expect(calls[0]?.stdin).toBe("certificate-stdin");
    expect(calls[0]?.command.join(" ")).not.toContain("certificate-stdin");
  });
});
