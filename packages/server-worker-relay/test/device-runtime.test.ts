import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ok } from "@appaloft/core";

import {
  createServerWorkerRotationHandler,
  FileSystemServerWorkerCredentialStore,
  HttpServerWorkerEnrollmentPort,
  ServerWorkerAtomicUpgrade,
  ServerWorkerDeviceRuntime,
  type ServerWorkerEnrollmentPort,
} from "../src";

describe("Server Worker device runtime", () => {
  test("[SWR-ENROLL-001] issues a one-time token through the authenticated profile when omitted", async () => {
    const root = mkdtempSync(join(tmpdir(), "appaloft-worker-device-issue-"));
    const calls: string[] = [];
    const enrollment = {
      issue: async (input: { serverId: string; name: string }) => {
        calls.push(`issue:${input.serverId}:${input.name}`);
        return ok({ token: "issued-one-time-secret-token", expiresAt: "2026-08-13T00:00:00.000Z" });
      },
      exchange: async (input: { serverId: string; token: string }) => {
        calls.push(`exchange:${input.serverId}:${input.token}`);
        return ok({
          workerId: "worker-1",
          serverId: input.serverId,
          generation: 1,
          relay: { host: "127.0.0.1", port: 9443, serverName: "relay.localhost" },
          capabilities: ["runtime.dev" as const],
          certificatePem: "-----BEGIN CERTIFICATE-----\ndevice\n-----END CERTIFICATE-----",
          caPem: "-----BEGIN CERTIFICATE-----\nca\n-----END CERTIFICATE-----",
          serialNumber: "01",
          expiresAt: "2026-08-13T00:00:00.000Z",
        });
      },
    };
    const runtime = new ServerWorkerDeviceRuntime({
      credentialStore: new FileSystemServerWorkerCredentialStore(join(root, "credential.json")),
      enrollment,
      identityDirectory: join(root, "identity"),
    });

    const enrolled = await runtime.enroll({ serverId: "server-1", name: "my-mac" } as never);

    expect(enrolled.isOk()).toBe(true);
    expect(calls).toEqual([
      "issue:server-1:my-mac",
      "exchange:server-1:issued-one-time-secret-token",
    ]);
  });

  test("[SWR-ENROLL-001] issues enrollment over the authenticated Cloud control plane", async () => {
    let observedUrl = "";
    let observedAuthorization: string | null = null;
    const port = new HttpServerWorkerEnrollmentPort(
      "https://enroll.example",
      (async (request, init) => {
        observedUrl = String(request);
        observedAuthorization = new Headers(init?.headers).get("authorization");
        return Response.json({
          token: "issued-one-time-secret",
          expiresAt: "2026-08-13T00:00:00.000Z",
        });
      }) as typeof fetch,
      async () =>
        ok({
          baseUrl: "https://cloud.example",
          headers: { authorization: "Bearer profile-token" },
        }),
    );

    const issued = await (
      port as unknown as {
        issue(input: { serverId: string; name: string }): Promise<ReturnType<typeof ok>>;
      }
    ).issue({ serverId: "server-1", name: "my-mac" });

    expect(issued.isOk()).toBe(true);
    expect(observedUrl).toBe("https://cloud.example/cloud/server-workers/enrollments");
    expect(String(observedAuthorization)).toBe("Bearer profile-token");
  });

  test("[SWR-ENROLL-001][SWR-ENROLL-002][SWR-STATUS-016] keeps Server identity separate, the token out of the body, and the key owner-only", async () => {
    const root = mkdtempSync(join(tmpdir(), "appaloft-worker-device-"));
    const credentialPath = join(root, "credentials", "worker.json");
    const enrollment: ServerWorkerEnrollmentPort = {
      exchange: async (input) =>
        ok({
          workerId: "worker-1",
          serverId: input.serverId,
          generation: 1,
          relay: { host: "127.0.0.1", port: 9443, serverName: "relay.localhost" },
          capabilities: ["process.exec"],
          certificatePem: "-----BEGIN CERTIFICATE-----\ndevice\n-----END CERTIFICATE-----",
          caPem: "-----BEGIN CERTIFICATE-----\nca\n-----END CERTIFICATE-----",
          serialNumber: "01",
          expiresAt: "2026-08-13T00:00:00.000Z",
        }),
    };
    const runtime = new ServerWorkerDeviceRuntime({
      credentialStore: new FileSystemServerWorkerCredentialStore(credentialPath),
      enrollment,
      identityDirectory: join(root, "identity"),
    });
    const enrolled = await runtime.enroll({
      serverId: "server-1",
      name: "my-mac",
      token: "one-time-secret-token",
    });
    expect(enrolled.isOk()).toBe(true);
    if (enrolled.isOk()) expect(enrolled.value.serverId).toBe("server-1");
    expect(statSync(credentialPath).mode & 0o077).toBe(0);
    const stored = readFileSync(credentialPath, "utf8");
    expect(stored).not.toContain("one-time-secret-token");
    expect(JSON.stringify(await runtime.status())).not.toContain("PRIVATE KEY");
    expect(JSON.stringify(await runtime.status())).not.toContain("CERTIFICATE");
  });

  test("[SWR-ENROLL-001] sends the one-time token only in authorization metadata", async () => {
    let observedHeaders: Headers | undefined;
    let observedBody = "";
    const fetcher = (async (_url: URL | RequestInfo, init?: RequestInit) => {
      observedHeaders = new Headers(init?.headers);
      observedBody = String(init?.body);
      return Response.json({ workerId: "worker-1" });
    }) as typeof fetch;
    const port = new HttpServerWorkerEnrollmentPort("https://cloud.example", fetcher);
    await port.exchange({
      serverId: "server-1",
      name: "device",
      token: "token-never-in-body",
      certificateSigningRequestPem: "csr",
      publicKeyFingerprint: "fingerprint",
    });
    expect(observedHeaders?.get("authorization")).toBe("Enrollment token-never-in-body");
    expect(observedBody).not.toContain("token-never-in-body");
  });

  test("[SWR-REVOKE-013] sends exact revocation through the authenticated control plane", async () => {
    let observedUrl = "";
    let observedAuthorization: string | null = null;
    const port = new HttpServerWorkerEnrollmentPort(
      "https://enroll.example",
      (async (request, init) => {
        observedUrl = String(request);
        observedAuthorization = new Headers(init?.headers).get("authorization");
        return Response.json({ revoked: true });
      }) as typeof fetch,
      async () =>
        ok({
          baseUrl: "https://cloud.example",
          headers: { authorization: "Bearer profile-token" },
        }),
    );
    expect((await port.revoke({ workerId: "worker-1", generation: 2 })).isOk()).toBe(true);
    expect(observedUrl).toBe("https://cloud.example/cloud/server-workers/worker-1/revoke");
    expect(String(observedAuthorization)).toBe("Bearer profile-token");
  });

  test("[SWR-UPGRADE-014] restores the previous executable when health fails", async () => {
    const root = mkdtempSync(join(tmpdir(), "appaloft-worker-upgrade-"));
    const current = join(root, "appaloft-worker");
    const candidate = join(root, "appaloft-worker.next");
    writeFileSync(current, "current");
    writeFileSync(candidate, "candidate");
    const upgraded = await new ServerWorkerAtomicUpgrade().apply({
      currentExecutable: current,
      candidateExecutable: candidate,
      verifySignature: async () => true,
      health: async () => false,
    });
    expect(upgraded).toEqual(ok({ upgraded: false, rolledBack: true }));
    expect(readFileSync(current, "utf8")).toBe("current");
  });

  test("[SWR-ROTATE-012] prepares a device CSR and atomically installs only the matching rotated credential", async () => {
    const root = mkdtempSync(join(tmpdir(), "appaloft-worker-rotation-"));
    const store = new FileSystemServerWorkerCredentialStore(join(root, "credential.json"));
    await store.write({
      schemaVersion: "server-worker-credential/v1",
      workerId: "worker-1",
      serverId: "server-1",
      name: "mac",
      generation: 1,
      relay: { host: "127.0.0.1", port: 9443, serverName: "relay.localhost" },
      capabilities: ["worker.rotate"],
      certificatePem: "-----BEGIN CERTIFICATE-----\nold\n-----END CERTIFICATE-----",
      privateKeyPem: "-----BEGIN PRIVATE KEY-----\nold\n-----END PRIVATE KEY-----",
      caPem: "-----BEGIN CERTIFICATE-----\nca\n-----END CERTIFICATE-----",
      serialNumber: "01",
      expiresAt: "2026-08-13T00:00:00.000Z",
    });
    const handler = createServerWorkerRotationHandler({
      credentialStore: store,
      identityDirectory: join(root, "rotation"),
    });
    const prepared = await handler({
      requestId: "rotate-prepare",
      capability: "worker.rotate",
      payload: { operation: "prepare" },
    });
    if (prepared.isErr() || !prepared.value.data) throw new Error("rotation prepare failed");
    const rotation = JSON.parse(Buffer.from(prepared.value.data, "base64").toString("utf8")) as {
      rotationId: string;
      certificateSigningRequestPem: string;
      publicKeyFingerprint: string;
    };
    expect(rotation.certificateSigningRequestPem).toContain("CERTIFICATE REQUEST");
    expect(rotation.publicKeyFingerprint).toHaveLength(64);
    const installed = await handler({
      requestId: "rotate-install",
      capability: "worker.rotate",
      payload: {
        operation: "install",
        rotationId: rotation.rotationId,
        certificatePem: "-----BEGIN CERTIFICATE-----\nnew\n-----END CERTIFICATE-----",
        caPem: "-----BEGIN CERTIFICATE-----\nca\n-----END CERTIFICATE-----",
        serialNumber: "02",
        expiresAt: "2026-08-14T00:00:00.000Z",
      },
    });
    expect(installed.isOk()).toBe(true);
    const credential = await store.read();
    if (credential.isErr() || !credential.value) throw new Error("rotated credential missing");
    expect(credential.value.serialNumber).toBe("02");
    expect(credential.value.privateKeyPem).not.toContain("\nold\n");
  });
});
