import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer as createTcpServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { err, ok } from "@appaloft/core";

import {
  createServerWorkerNetworkForwardHandler,
  createServerWorkerPtyHandler,
  InMemoryServerWorkerLeaseRegistry,
  ServerWorkerDispatcher,
  ServerWorkerRelayClient,
  ServerWorkerRelayServer,
} from "../src";

function openssl(args: string[]): void {
  const result = Bun.spawnSync(["openssl", ...args], { stdout: "ignore", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

function createCertificates() {
  const root = mkdtempSync(join(tmpdir(), "appaloft-worker-mtls-"));
  const caKey = join(root, "ca.key");
  const caCert = join(root, "ca.crt");
  const serverKey = join(root, "server.key");
  const serverCsr = join(root, "server.csr");
  const serverCert = join(root, "server.crt");
  const workerKey = join(root, "worker.key");
  const workerCsr = join(root, "worker.csr");
  const workerCert = join(root, "worker.crt");
  const badKey = join(root, "bad.key");
  const badCsr = join(root, "bad.csr");
  const badCert = join(root, "bad.crt");
  const serverExtensions = join(root, "server.ext");
  openssl([
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    caKey,
    "-out",
    caCert,
    "-days",
    "1",
    "-subj",
    "/CN=Appaloft Local Test CA",
  ]);
  openssl([
    "req",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    serverKey,
    "-out",
    serverCsr,
    "-subj",
    "/CN=relay.localhost",
  ]);
  writeFileSync(serverExtensions, "subjectAltName=DNS:relay.localhost\n");
  openssl([
    "x509",
    "-req",
    "-in",
    serverCsr,
    "-CA",
    caCert,
    "-CAkey",
    caKey,
    "-CAcreateserial",
    "-out",
    serverCert,
    "-days",
    "1",
    "-sha256",
    "-extfile",
    serverExtensions,
  ]);
  openssl([
    "req",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    workerKey,
    "-out",
    workerCsr,
    "-subj",
    "/CN=worker-1",
  ]);
  openssl([
    "x509",
    "-req",
    "-in",
    workerCsr,
    "-CA",
    caCert,
    "-CAkey",
    caKey,
    "-CAcreateserial",
    "-out",
    workerCert,
    "-days",
    "1",
    "-sha256",
  ]);
  openssl([
    "req",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    badKey,
    "-out",
    badCsr,
    "-subj",
    "/CN=worker-bad",
  ]);
  openssl([
    "x509",
    "-req",
    "-in",
    badCsr,
    "-CA",
    caCert,
    "-CAkey",
    caKey,
    "-CAcreateserial",
    "-out",
    badCert,
    "-days",
    "1",
    "-sha256",
  ]);
  return {
    root,
    ca: readFileSync(caCert),
    server: { key: readFileSync(serverKey), cert: readFileSync(serverCert) },
    worker: { key: readFileSync(workerKey), cert: readFileSync(workerCert) },
    bad: { key: readFileSync(badKey), cert: readFileSync(badCert) },
  };
}

const closers: Array<() => void | Promise<void>> = [];
const realLoopbackTestTimeoutMs = 15_000;
afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close();
});

describe("real loopback mTLS relay", () => {
  test(
    "[SWR-MTLS-003][SWR-EXEC-006][SWR-LOCAL-018] authenticates and dispatches",
    async () => {
      const certificates = createCertificates();
      const leases = new InMemoryServerWorkerLeaseRegistry({ leaseMs: 30_000 });
      const lifecycle: string[] = [];
      const relay = new ServerWorkerRelayServer({
        tls: { ...certificates.server, ca: certificates.ca },
        leaseRegistry: leases,
        requiredCapabilities: ["process.exec"],
        authorizePeer: ({ workerId, subject }) => {
          lifecycle.push("authorized");
          return workerId === "worker-1" && subject.CN === "worker-1"
            ? ok(undefined)
            : err({
                code: "server_worker_certificate_rejected",
                category: "user",
                message: "binding mismatch",
                retryable: false,
                details: { phase: "server-worker-mtls" },
              });
        },
        onConnect: () => {
          lifecycle.push("connected");
          return ok(undefined);
        },
      });
      closers.push(() => relay.close());
      await relay.listen();
      const client = new ServerWorkerRelayClient({
        relay: { host: "127.0.0.1", port: relay.port, serverName: "relay.localhost" },
        tls: { ...certificates.worker, ca: certificates.ca },
        workerId: "worker-1",
        generation: 1,
        capabilities: ["process.exec"],
        dispatcher: new ServerWorkerDispatcher({
          roots: [certificates.root],
          allowHostShell: true,
        }),
      });
      closers.push(() => client.close());
      expect((await client.connect()).isOk()).toBe(true);
      expect(lifecycle).toEqual(["authorized", "connected"]);
      const response = await relay.request({
        workerId: "worker-1",
        generation: 1,
        requestId: "req-1",
        capability: "process.exec",
        payload: { argv: ["printf", "relay-ok"], cwd: certificates.root },
      });
      expect(response.isOk()).toBe(true);
      if (response.isErr()) return;
      expect(response.value.stdout).toBe("relay-ok");
    },
    realLoopbackTestTimeoutMs,
  );

  test(
    "[SWR-MTLS-003][SWR-STATUS-016][SWR-ERROR-017] fails the handshake closed when post-registration admission fails",
    async () => {
      const certificates = createCertificates();
      const relay = new ServerWorkerRelayServer({
        tls: { ...certificates.server, ca: certificates.ca },
        leaseRegistry: new InMemoryServerWorkerLeaseRegistry({ leaseMs: 30_000 }),
        authorizePeer: () => ok(undefined),
        onConnect: () =>
          err({
            code: "server_worker_connection_rejected",
            category: "user",
            message: "hosted attachment was not ready",
            retryable: false,
            details: { phase: "server-worker-mtls" },
          }),
      });
      closers.push(() => relay.close());
      await relay.listen();
      const client = new ServerWorkerRelayClient({
        relay: { host: "127.0.0.1", port: relay.port, serverName: "relay.localhost" },
        tls: { ...certificates.worker, ca: certificates.ca },
        workerId: "worker-1",
        generation: 1,
        capabilities: ["process.exec"],
        dispatcher: new ServerWorkerDispatcher({
          roots: [certificates.root],
          allowHostShell: true,
        }),
      });
      closers.push(() => client.close());
      expect((await client.connect()).isErr()).toBe(true);
      expect(
        (
          await relay.request({
            workerId: "worker-1",
            generation: 1,
            requestId: "rejected-request",
            capability: "process.exec",
            payload: { argv: ["printf", "must-not-run"], cwd: certificates.root },
          })
        ).isErr(),
      ).toBe(true);
    },
    realLoopbackTestTimeoutMs,
  );

  test(
    "[SWR-MTLS-003][SWR-ERROR-017] denies an untrusted client with a stable safe error",
    async () => {
      const certificates = createCertificates();
      const relay = new ServerWorkerRelayServer({
        tls: { ...certificates.server, ca: certificates.ca },
        leaseRegistry: new InMemoryServerWorkerLeaseRegistry({ leaseMs: 30_000 }),
        authorizePeer: ({ workerId, subject }) =>
          workerId === "worker-1" && subject.CN === "worker-1"
            ? ok(undefined)
            : err({
                code: "server_worker_certificate_rejected",
                category: "user",
                message: "binding mismatch",
                retryable: false,
                details: { phase: "server-worker-mtls" },
              }),
      });
      closers.push(() => relay.close());
      await relay.listen();
      const client = new ServerWorkerRelayClient({
        relay: { host: "127.0.0.1", port: relay.port, serverName: "relay.localhost" },
        tls: { ...certificates.bad, ca: certificates.ca },
        workerId: "worker-bad",
        generation: 1,
        capabilities: [],
        dispatcher: new ServerWorkerDispatcher({
          roots: [certificates.root],
          allowHostShell: false,
        }),
      });
      closers.push(() => client.close());
      const connected = await client.connect();
      expect(connected.isErr()).toBe(true);
      if (connected.isErr()) {
        expect(connected.error).toMatchObject({
          code: expect.any(String),
          category: expect.any(String),
          retryable: expect.any(Boolean),
          details: { phase: expect.any(String) },
        });
        expect(JSON.stringify(connected.error)).not.toContain(certificates.root);
        expect(JSON.stringify(connected.error)).not.toContain("PRIVATE KEY");
      }
    },
    realLoopbackTestTimeoutMs,
  );

  test(
    "[SWR-FORWARD-010][SWR-ORPHAN-015] multiplexes scoped bytes and closes the exact target socket on disconnect",
    async () => {
      const sockets = new Set<Socket>();
      const target = createTcpServer((socket) => {
        sockets.add(socket);
        socket.on("data", (data) => socket.write(Buffer.concat([Buffer.from("forward:"), data])));
        socket.on("close", () => sockets.delete(socket));
      });
      await new Promise<void>((resolve) => target.listen(0, "127.0.0.1", resolve));
      const targetAddress = target.address();
      if (!targetAddress || typeof targetAddress === "string")
        throw new Error("missing target port");
      closers.push(async () => {
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((resolve) => target.close(() => resolve()));
      });
      const certificates = createCertificates();
      const relay = new ServerWorkerRelayServer({
        tls: { ...certificates.server, ca: certificates.ca },
        leaseRegistry: new InMemoryServerWorkerLeaseRegistry({ leaseMs: 30_000 }),
        requiredCapabilities: ["network.forward"],
      });
      closers.push(() => relay.close());
      await relay.listen();
      const client = new ServerWorkerRelayClient({
        relay: { host: "127.0.0.1", port: relay.port, serverName: "relay.localhost" },
        tls: { ...certificates.worker, ca: certificates.ca },
        workerId: "worker-1",
        generation: 1,
        capabilities: ["network.forward"],
        dispatcher: new ServerWorkerDispatcher({
          roots: [certificates.root],
          allowHostShell: false,
        }),
        streamHandlers: {
          "network.forward": createServerWorkerNetworkForwardHandler({
            authorizeTarget: ({ host, port }) =>
              host === "127.0.0.1" && port === targetAddress.port,
          }),
        },
      });
      closers.push(() => client.close());
      expect((await client.connect()).isOk()).toBe(true);
      const received: Uint8Array[] = [];
      const opened = await relay.openStream({
        workerId: "worker-1",
        generation: 1,
        streamId: "forward-1",
        capability: "network.forward",
        payload: { host: "127.0.0.1", port: targetAddress.port },
        onData: (data) => {
          received.push(data);
        },
      });
      expect(opened.isOk()).toBe(true);
      if (opened.isErr()) return;
      expect((await opened.value.write(Buffer.from("hello"))).isOk()).toBe(true);
      for (let attempts = 0; attempts < 100 && received.length === 0; attempts += 1)
        await Bun.sleep(10);
      expect(Buffer.concat(received).toString()).toBe("forward:hello");
      await client.close();
      for (let attempts = 0; attempts < 100 && sockets.size > 0; attempts += 1) await Bun.sleep(10);
      expect(sockets.size).toBe(0);
    },
    realLoopbackTestTimeoutMs,
  );

  test(
    "[SWR-PTY-007] preserves opaque PTY bytes and resize control",
    async () => {
      const certificates = createCertificates();
      const relay = new ServerWorkerRelayServer({
        tls: { ...certificates.server, ca: certificates.ca },
        leaseRegistry: new InMemoryServerWorkerLeaseRegistry({ leaseMs: 30_000 }),
        requiredCapabilities: ["process.pty"],
      });
      closers.push(() => relay.close());
      await relay.listen();
      const client = new ServerWorkerRelayClient({
        relay: { host: "127.0.0.1", port: relay.port, serverName: "relay.localhost" },
        tls: { ...certificates.worker, ca: certificates.ca },
        workerId: "worker-1",
        generation: 1,
        capabilities: ["process.pty"],
        dispatcher: new ServerWorkerDispatcher({
          roots: [certificates.root],
          allowHostShell: true,
        }),
        streamHandlers: {
          "process.pty": createServerWorkerPtyHandler({
            roots: [certificates.root],
            allowHostShell: true,
          }),
        },
      });
      closers.push(() => client.close());
      expect((await client.connect()).isOk()).toBe(true);
      const received: Uint8Array[] = [];
      const opened = await relay.openStream({
        workerId: "worker-1",
        generation: 1,
        streamId: "pty-1",
        capability: "process.pty",
        payload: {
          argv: ["sh", "-c", "read line; printf 'pty:%s' \"$line\""],
          cwd: certificates.root,
          rows: 24,
          cols: 80,
        },
        onData: (data) => {
          received.push(data);
        },
      });
      expect(opened.isOk()).toBe(true);
      if (opened.isErr()) return;
      await opened.value.control({ kind: "resize", rows: 40, cols: 120 });
      await opened.value.write(Buffer.from("hello\n"));
      for (
        let attempts = 0;
        attempts < 100 && !Buffer.concat(received).toString().includes("pty:hello");
        attempts += 1
      )
        await Bun.sleep(10);
      expect(Buffer.concat(received).toString()).toContain("pty:hello");
    },
    realLoopbackTestTimeoutMs,
  );
});
