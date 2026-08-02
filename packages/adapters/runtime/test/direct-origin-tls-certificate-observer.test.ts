import { describe, expect, test } from "bun:test";
import { createExecutionContext, type RepositoryContext, type ServerRepository } from "@appaloft/application";
import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetName,
  HostAddress,
  ok,
  PortNumber,
  ProviderKey,
  type Server,
} from "@appaloft/core";

import { DirectOriginTlsCertificateObserver, type DirectOriginTlsProbeInput } from "../src";

class StaticServerRepository implements ServerRepository {
  constructor(private readonly server: Server) {}

  async findOne(): Promise<Server> {
    return this.server;
  }

  async upsert(_context: RepositoryContext): Promise<void> {}
}

describe("DirectOriginTlsCertificateObserver", () => {
  test("[EDGE-PROXY-RELOAD-004D] verifies the server origin by hostname/SNI instead of public DNS", async () => {
    const server = DeploymentTarget.register({
      id: DeploymentTargetId.rehydrate("srv_origin"),
      name: DeploymentTargetName.rehydrate("Origin"),
      host: HostAddress.rehydrate("203.0.113.45"),
      port: PortNumber.rehydrate(22),
      providerKey: ProviderKey.rehydrate("generic-ssh"),
      createdAt: CreatedAt.rehydrate("2026-08-02T00:00:00.000Z"),
    })._unsafeUnwrap();
    let probeInput: DirectOriginTlsProbeInput | undefined;
    const observer = new DirectOriginTlsCertificateObserver(
      new StaticServerRepository(server),
      async (input) => {
        probeInput = input;
        return ok({
          fingerprint: "AA:BB",
          subjectAlternativeNames: ["app.example.test"],
          notBefore: "2026-08-01T00:00:00.000Z",
          expiresAt: "2027-08-01T00:00:00.000Z",
        });
      },
      { httpsPort: 8443, timeoutMs: 4_000 },
    );

    const result = await observer.observe(createExecutionContext({ requestId: "req_tls_origin" }), {
      activationId: "act_1",
      expectedFingerprint: "AA:BB",
      proxyKind: "traefik",
      serverId: "srv_origin",
      serverName: "app.example.test",
    });

    expect(result.isOk()).toBe(true);
    expect(probeInput).toEqual({
      host: "203.0.113.45",
      port: 8443,
      serverName: "app.example.test",
      timeoutMs: 4_000,
    });
  });

  test("[EDGE-PROXY-RELOAD-004D] polls until the expected served fingerprint converges", async () => {
    const server = DeploymentTarget.register({
      id: DeploymentTargetId.rehydrate("srv_origin"),
      name: DeploymentTargetName.rehydrate("Origin"),
      host: HostAddress.rehydrate("203.0.113.45"),
      port: PortNumber.rehydrate(22),
      providerKey: ProviderKey.rehydrate("generic-ssh"),
      createdAt: CreatedAt.rehydrate("2026-08-02T00:00:00.000Z"),
    })._unsafeUnwrap();
    let attempts = 0;
    const observer = new DirectOriginTlsCertificateObserver(
      new StaticServerRepository(server),
      async () => {
        attempts += 1;
        return ok({
          fingerprint: attempts === 1 ? "OLD" : "AA:BB",
          subjectAlternativeNames: ["app.example.test"],
          notBefore: "2026-08-01T00:00:00.000Z",
          expiresAt: "2027-08-01T00:00:00.000Z",
        });
      },
      { maxAttempts: 2, retryIntervalMs: 0 },
    );

    const result = await observer.observe(createExecutionContext({ requestId: "req_tls_poll" }), {
      activationId: "act_1",
      expectedFingerprint: "AA:BB",
      proxyKind: "traefik",
      serverId: "srv_origin",
      serverName: "app.example.test",
    });

    expect(result.isOk()).toBe(true);
    expect(attempts).toBe(2);
  });
});
