import { createHash, randomUUID } from "node:crypto";

import {
  type SandboxExecResult,
  type SandboxFileDescriptor,
  type SandboxPortExposure,
  type SandboxProcessDescriptor,
  type SandboxProvider,
  type SandboxProviderRequest,
  type SandboxTerminalProcess,
} from "@appaloft/application";
import {
  type SandboxIsolation,
  type SandboxNetworkPolicyState,
  SandboxWorkspacePath,
} from "@appaloft/core";
import { sandboxWorkspaceProcessEnvironment } from "./sandbox-workspace-process-environment";

const sandboxProcessDockerExecArgs = Object.freeze(
  sandboxWorkspaceProcessEnvironment.flatMap((value) => ["-e", value]),
);

const terminateSandboxProcessGroupScript =
  'if [ -f "$1" ]; then pid="$(cat "$1")"; if kill -0 "-$pid" 2>/dev/null; then kill -TERM "-$pid" 2>/dev/null || true; attempts=0; while kill -0 "-$pid" 2>/dev/null && [ "$attempts" -lt 10 ]; do sleep 0.1; attempts=$((attempts + 1)); done; kill -KILL "-$pid" 2>/dev/null || true; else kill "$pid" 2>/dev/null || true; fi; fi; rm -f -- "$1" "$2"';

export interface SandboxDockerCommandResult {
  exitCode: number;
  stdout: Uint8Array;
  stderr: string;
  failure?: "timeout" | "output-limit";
}

export interface SandboxDockerCommandRunner {
  run(
    argv: readonly string[],
    input?: { stdin?: Uint8Array; timeoutMs?: number },
  ): Promise<SandboxDockerCommandResult>;
  openTerminal?(
    argv: readonly string[],
    input: { initialRows: number; initialCols: number },
  ): Promise<SandboxTerminalProcess>;
}

export interface SandboxPortPublisher {
  expose(input: {
    sandboxId: string;
    containerName: string;
    port: number;
    visibility: "private" | "organization" | "public";
    expiresAt?: string;
  }): Promise<SandboxPortExposure>;
  list(input: { sandboxId: string; containerName: string }): Promise<SandboxPortExposure[]>;
  revoke(input: {
    sandboxId: string;
    containerName: string;
    exposureId: string;
  }): Promise<void>;
}

export interface SandboxEgressPolicyAdapter {
  configure(input: {
    sandboxId: string;
    containerName: string;
    networkPolicy: SandboxNetworkPolicyState;
  }): Promise<{ proxyUrl: string; noProxy?: readonly string[] }>;
  renew?(input: { sandboxId: string; containerName: string }): Promise<void>;
  revoke(input: { sandboxId: string; containerName: string }): Promise<void>;
}

export class BunSandboxDockerCommandRunner implements SandboxDockerCommandRunner {
  async openTerminal(
    argv: readonly string[],
    input: { initialRows: number; initialCols: number },
  ): Promise<SandboxTerminalProcess> {
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    let terminalClosed = false;
    const stdout = new ReadableStream<Uint8Array>({
      start(nextController) {
        controller = nextController;
      },
    });
    const process = Bun.spawn([...argv], {
      env: {
        ...Bun.env,
        TERM: "xterm-256color",
      },
      terminal: {
        cols: input.initialCols,
        rows: input.initialRows,
        data(_terminal, data) {
          if (!terminalClosed) {
            controller?.enqueue(new Uint8Array(data));
          }
        },
        exit() {
          if (!terminalClosed) {
            terminalClosed = true;
            controller?.close();
          }
        },
      },
    });
    const terminal = process.terminal;
    if (!terminal) {
      process.kill();
      throw new Error("Bun did not attach a PTY to the Sandbox terminal process");
    }
    const closeTerminal = () => {
      if (!terminalClosed) {
        terminalClosed = true;
        terminal.close();
        controller?.close();
      }
    };
    return {
      stdin: {
        write(data) {
          return terminal.write(data);
        },
        end() {
          closeTerminal();
        },
      },
      stdout,
      stderr: null,
      exited: process.exited,
      kill() {
        process.kill();
      },
      resize(rows, cols) {
        terminal.resize(cols, rows);
      },
      async cleanup() {
        closeTerminal();
      },
    };
  }

  async run(
    argv: readonly string[],
    input: { stdin?: Uint8Array; timeoutMs?: number } = {},
  ): Promise<SandboxDockerCommandResult> {
    const process = Bun.spawn([...argv], {
      stdin: input.stdin ? "pipe" : "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    if (input.stdin && process.stdin) {
      process.stdin.write(input.stdin);
      process.stdin.end();
    }
    let failure: SandboxDockerCommandResult["failure"];
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (input.timeoutMs)
      timeout = setTimeout(() => {
        failure = "timeout";
        process.kill();
      }, input.timeoutMs);
    const readBounded = async (
      stream: ReadableStream<Uint8Array>,
      limit: number,
    ): Promise<Uint8Array> => {
      const reader = stream.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const item = await reader.read();
        if (item.done) break;
        const remaining = limit - size;
        if (remaining > 0) chunks.push(item.value.slice(0, remaining));
        size += item.value.byteLength;
        if (size > limit && !failure) {
          failure = "output-limit";
          process.kill();
        }
      }
      const output = new Uint8Array(Math.min(size, limit));
      let offset = 0;
      for (const chunk of chunks) {
        output.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return output;
    };
    const [exitCode, stdout, stderrBytes] = await Promise.all([
      process.exited,
      readBounded(process.stdout, 1024 * 1024),
      readBounded(process.stderr, 1024 * 1024),
    ]);
    if (timeout) clearTimeout(timeout);
    return {
      exitCode,
      stdout,
      stderr: text(stderrBytes),
      ...(failure ? { failure } : {}),
    };
  }
}

type DockerSandboxProviderInput = {
  key?: string;
  isolation?: Extract<SandboxIsolation, "container-trusted" | "gvisor">;
  runner?: SandboxDockerCommandRunner;
  portPublisher?: SandboxPortPublisher;
  egressPolicy?: SandboxEgressPolicyAdapter;
  internalNetwork?: string;
  now?: () => string;
  sleep?: (delayMs: number) => Promise<void>;
  credentialBroker?: boolean;
  portableRecovery?: {
    kind: "shared-filesystem";
    rootPath: string;
    storeId: string;
  };
};

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function containerName(sandboxId: string): string {
  if (!/^sbx_[A-Za-z0-9_.-]{1,120}$/.test(sandboxId)) {
    throw new Error("Sandbox id cannot be rendered as a Docker container name");
  }
  return `appaloft-${sandboxId}`;
}

function hibernationImage(sandboxId: string): string {
  if (!/^sbx_[A-Za-z0-9_.-]{1,120}$/.test(sandboxId)) {
    throw new Error("Sandbox id cannot be rendered as a Docker hibernation image");
  }
  return `appaloft-sandbox-hibernate:${sandboxId}`;
}

const portableRecoveryHandlePrefix = "appaloft-docker-recovery:v1:";
const portableSnapshotHandlePrefix = "appaloft-docker-snapshot:v1:";
const concurrentRemovalReadbackAttempts = 20;
const concurrentRemovalReadbackDelayMs = 250;

interface PortableRecoveryHandle {
  sandboxId: string;
  packageId: string;
  digest: string;
}

interface PortableSnapshotHandle {
  snapshotId: string;
  sourceSandboxId: string;
  packageId: string;
  digest: string;
}

function normalizedPortableRecoveryConfig(
  input: DockerSandboxProviderInput["portableRecovery"],
): DockerSandboxProviderInput["portableRecovery"] {
  if (!input) return undefined;
  const rootPath = input.rootPath.trim().replace(/\/+$/, "");
  if (
    !rootPath.startsWith("/") ||
    rootPath === "" ||
    rootPath.length > 512 ||
    /[\0\r\n]/u.test(rootPath) ||
    rootPath.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error("Sandbox portable recovery root must be a safe absolute path");
  }
  const storeId = input.storeId.trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(storeId)) {
    throw new Error("Sandbox portable recovery store id is invalid");
  }
  return { kind: "shared-filesystem", rootPath, storeId };
}

function portableRecoveryFamily(storeId: string): string {
  const digest = createHash("sha256").update(storeId, "utf8").digest("hex");
  return `docker-workspace-tar-v1:${digest.slice(0, 32)}`;
}

function encodePortableRecoveryHandle(input: PortableRecoveryHandle): string {
  return `${portableRecoveryHandlePrefix}${Buffer.from(JSON.stringify(input)).toString("base64url")}`;
}

function decodePortableRecoveryHandle(
  providerHandle: string,
  expectedSandboxId: string,
): PortableRecoveryHandle {
  if (!providerHandle.startsWith(portableRecoveryHandlePrefix)) {
    throw new Error("Docker portable recovery handle is invalid");
  }
  const encoded = providerHandle.slice(portableRecoveryHandlePrefix.length);
  try {
    const decoded = Buffer.from(encoded, "base64url");
    if (decoded.toString("base64url") !== encoded) throw new Error("non-canonical handle");
    const value = JSON.parse(decoded.toString("utf8")) as Partial<PortableRecoveryHandle>;
    if (
      value.sandboxId !== expectedSandboxId ||
      !/^sbx_[A-Za-z0-9_.-]{1,120}$/.test(value.sandboxId) ||
      typeof value.packageId !== "string" ||
      !/^pr_[0-9a-f]{32}$/.test(value.packageId) ||
      typeof value.digest !== "string" ||
      !/^sha256:[0-9a-f]{64}$/.test(value.digest)
    ) {
      throw new Error("invalid recovery handle");
    }
    return {
      sandboxId: value.sandboxId,
      packageId: value.packageId,
      digest: value.digest,
    };
  } catch {
    throw new Error("Docker portable recovery handle is invalid");
  }
}

function encodePortableSnapshotHandle(input: PortableSnapshotHandle): string {
  return `${portableSnapshotHandlePrefix}${Buffer.from(JSON.stringify(input)).toString("base64url")}`;
}

function decodePortableSnapshotHandle(providerHandle: string): PortableSnapshotHandle {
  if (!providerHandle.startsWith(portableSnapshotHandlePrefix)) {
    throw new Error("Docker portable Snapshot handle is invalid");
  }
  const encoded = providerHandle.slice(portableSnapshotHandlePrefix.length);
  try {
    const decoded = Buffer.from(encoded, "base64url");
    if (decoded.toString("base64url") !== encoded) throw new Error("non-canonical handle");
    const value = JSON.parse(decoded.toString("utf8")) as Partial<PortableSnapshotHandle>;
    if (
      typeof value.snapshotId !== "string" ||
      !/^ssn_[A-Za-z0-9_.-]{1,120}$/.test(value.snapshotId) ||
      typeof value.sourceSandboxId !== "string" ||
      !/^sbx_[A-Za-z0-9_.-]{1,120}$/.test(value.sourceSandboxId) ||
      typeof value.packageId !== "string" ||
      !/^ps_[0-9a-f]{32}$/.test(value.packageId) ||
      typeof value.digest !== "string" ||
      !/^sha256:[0-9a-f]{64}$/.test(value.digest)
    ) {
      throw new Error("invalid Snapshot handle");
    }
    return {
      snapshotId: value.snapshotId,
      sourceSandboxId: value.sourceSandboxId,
      packageId: value.packageId,
      digest: value.digest,
    };
  } catch {
    throw new Error("Docker portable Snapshot handle is invalid");
  }
}

export class DockerSandboxProvider implements SandboxProvider {
  readonly key: string;
  readonly capabilities: SandboxProvider["capabilities"];
  private readonly runner: SandboxDockerCommandRunner;
  private readonly portPublisher: SandboxPortPublisher | undefined;
  private readonly egressPolicy: SandboxEgressPolicyAdapter | undefined;
  private readonly now: () => string;
  private readonly sleep: (delayMs: number) => Promise<void>;
  private readonly runtimeName: "runc" | "runsc";
  private readonly networkName: string;
  private readonly portableRecovery: DockerSandboxProviderInput["portableRecovery"];

  constructor(input: DockerSandboxProviderInput = {}) {
    const isolation = input.isolation ?? "container-trusted";
    this.key = input.key ?? (isolation === "gvisor" ? "docker-gvisor" : "docker");
    this.runtimeName = isolation === "gvisor" ? "runsc" : "runc";
    if (input.internalNetwork && !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(input.internalNetwork)) {
      throw new Error("Sandbox internal Docker network name is invalid");
    }
    if (input.portPublisher && !input.internalNetwork) {
      throw new Error("Sandbox port publishing requires an internal Docker network");
    }
    if (input.egressPolicy && !input.internalNetwork) {
      throw new Error("Sandbox egress policy requires an internal Docker network");
    }
    this.networkName = input.internalNetwork ?? "none";
    this.portableRecovery = normalizedPortableRecoveryConfig(input.portableRecovery);
    this.capabilities = {
      isolation,
      pause: {
        mode: "compute-released",
        ...(this.portableRecovery
          ? {
              portability: "provider-family" as const,
              recoveryFamily: portableRecoveryFamily(this.portableRecovery.storeId),
            }
          : { portability: "provider-local" as const }),
      },
      snapshot: ["filesystem" as const],
      snapshotRecovery: this.portableRecovery
        ? {
            portability: "provider-family" as const,
            recoveryFamily: portableRecoveryFamily(this.portableRecovery.storeId),
          }
        : { portability: "provider-local" as const },
      processes: true,
      files: true,
      ports: Boolean(input.portPublisher),
      networkPolicy: input.egressPolicy ? ["deny", "allowlist"] : ["deny"],
      credentialBroker: input.credentialBroker ?? false,
    };
    this.runner = input.runner ?? new BunSandboxDockerCommandRunner();
    this.portPublisher = input.portPublisher;
    this.egressPolicy = input.egressPolicy;
    this.now = input.now ?? (() => new Date().toISOString());
    this.sleep = input.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  }

  async probe(): Promise<void> {
    await this.docker(["version", "--format", "{{.Server.Version}}"]);
    if (this.runtimeName === "runsc") {
      const result = await this.docker(["info", "--format", "{{json .Runtimes}}"]);
      if (!text(result.stdout).includes('"runsc"')) {
        throw new Error("Docker worker does not expose the required runsc runtime");
      }
    }
    if (this.networkName !== "none") {
      const result = await this.docker([
        "network",
        "inspect",
        "--format",
        "{{.Internal}}",
        this.networkName,
      ]);
      if (text(result.stdout).trim() !== "true") {
        throw new Error("Sandbox Docker network must be internal to preserve default-deny egress");
      }
    }
  }

  async provision(request: SandboxProviderRequest) {
    if (request.requestedIsolation !== this.capabilities.isolation) {
      throw new Error("Docker provider isolation does not match the admitted Sandbox request");
    }
    if (request.networkPolicy.mode === "allowlist" && !this.egressPolicy) {
      throw new Error("Docker provider requires an egress policy adapter for allowlist mode");
    }
    await this.probe();
    let source = request.source;
    let portableSnapshotImage: string | undefined;
    if (
      source.kind === "snapshot" &&
      source.providerHandle.startsWith(portableSnapshotHandlePrefix)
    ) {
      portableSnapshotImage = await this.loadPortableSnapshot(source.providerHandle);
      source = { ...source, providerHandle: portableSnapshotImage };
    }
    const name = containerName(request.sandboxId);
    const memoryMb = Math.max(4, Math.ceil(request.limits.memoryBytes / (1024 * 1024)));
    const diskMb = Math.max(4, Math.ceil(request.limits.diskBytes / (1024 * 1024)));
    if (
      source.kind === "snapshot" &&
      !/^appaloft-sandbox-(?:snapshot:ssn_|hibernate:sbx_)[A-Za-z0-9_.-]{1,120}$/.test(
        source.providerHandle,
      )
    ) {
      throw new Error("Docker snapshot provider handle is invalid");
    }
    const image = source.kind === "image" ? source.image : source.providerHandle;
    const startup =
      source.kind === "snapshot"
        ? "set -e; cp -a /appaloft-snapshot-workspace/. /workspace/; touch /tmp/.appaloft-workspace-ready; trap : TERM INT; sleep infinity & wait"
        : "set -e; touch /tmp/.appaloft-workspace-ready; trap : TERM INT; sleep infinity & wait";
    let egress: { proxyUrl: string; noProxy?: readonly string[] } | undefined;
    let envFile: string | undefined;
    try {
      egress =
        request.networkPolicy.mode === "allowlist"
          ? await this.egressPolicy?.configure({
              sandboxId: request.sandboxId,
              containerName: name,
              networkPolicy: request.networkPolicy,
            })
          : undefined;
      envFile = egress
        ? await this.writeEgressEnvFile(request.sandboxId, egress)
        : undefined;
      await this.docker([
        "create",
        "--name",
        name,
        "--label",
        "appaloft.managed=true",
        "--label",
        `appaloft.sandbox.id=${request.sandboxId}`,
        "--label",
        `appaloft.sandbox.owner=${this.ownerScope(request.ownerScope)}`,
        "--label",
        `appaloft.sandbox.egress=${egress ? "allowlist" : "deny"}`,
        "--runtime",
        this.runtimeName,
        "--network",
        this.networkName,
        ...(envFile ? ["--env-file", envFile] : []),
        "--cpus",
        String(request.limits.cpuMillis / 1000),
        "--memory",
        `${memoryMb}m`,
        "--pids-limit",
        String(request.limits.maxProcesses),
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges=true",
        "--read-only",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=64m",
        "--tmpfs",
        `/workspace:rw,nosuid,nodev,size=${diskMb}m`,
        "--workdir",
        "/workspace",
        image,
        "sh",
        "-c",
        startup,
      ]);
      await this.docker(["start", name]);
      await this.docker([
        "exec",
        name,
        "sh",
        "-c",
        "i=0; while [ $i -lt 100 ]; do test -f /tmp/.appaloft-workspace-ready && exit 0; i=$((i+1)); sleep 0.05; done; exit 1",
      ]);
      if (envFile) {
        await this.removeWorkerFile(envFile);
        envFile = undefined;
      }
    } catch (error) {
      const cleanupFailures: string[] = [];
      const removed = await this.runner.run(["docker", "rm", "-f", name]);
      if (removed.exitCode !== 0) cleanupFailures.push("container");
      if (egress) {
        try {
          await this.egressPolicy?.revoke({
            sandboxId: request.sandboxId,
            containerName: name,
          });
        } catch {
          cleanupFailures.push("egress policy");
        }
      }
      if (envFile) {
        try {
          await this.removeWorkerFile(envFile);
        } catch {
          cleanupFailures.push("transient environment file");
        }
      }
      if (cleanupFailures.length > 0) {
        throw new Error(
          `Docker Sandbox provision failed and cleanup was incomplete (${cleanupFailures.join(", ")})`,
          { cause: error },
        );
      }
      if (portableSnapshotImage) {
        await this.runner.run(["docker", "image", "rm", portableSnapshotImage]);
      }
      throw error;
    }
    if (portableSnapshotImage) {
      await this.runner.run(["docker", "image", "rm", portableSnapshotImage]);
    }
    return { providerHandle: name, realizedIsolation: this.capabilities.isolation };
  }

  async pause(request: {
    sandboxId: string;
    providerHandle: string;
  }): Promise<{ providerHandle: string }> {
    await this.assertHandle(request);
    const image = hibernationImage(request.sandboxId);
    await this.captureWorkspaceImage({
      ...request,
      image,
      helper: `${containerName(request.sandboxId)}-hibernate`,
      labels: [`appaloft.hibernate.sandbox=${request.sandboxId}`],
    });
    let portableHandle: string | undefined;
    try {
      if (this.portableRecovery) {
        portableHandle = await this.storePortableRecovery(request.sandboxId, image);
        await this.docker(["image", "rm", image]);
      }
      await this.revokeExternalAccess(request);
      await this.docker(["rm", "-f", request.providerHandle]);
    } catch (error) {
      if (portableHandle) {
        await this.deletePortableRecovery(request.sandboxId, portableHandle).catch(() => undefined);
      }
      await this.runner.run(["docker", "image", "rm", image]);
      throw error;
    }
    return { providerHandle: portableHandle ?? image };
  }

  async resume(request: SandboxProviderRequest & { providerHandle: string }) {
    const expected = hibernationImage(request.sandboxId);
    const portable = request.providerHandle.startsWith(portableRecoveryHandlePrefix);
    if (!portable && request.providerHandle !== expected) {
      throw new Error("Docker hibernation handle does not match the Sandbox");
    }
    if (portable) {
      await this.loadPortableRecovery(request.sandboxId, request.providerHandle, expected);
    }
    const inspected = await this.docker([
      "image",
      "inspect",
      "--format",
      '{{index .Config.Labels "appaloft.hibernate.sandbox"}}',
      expected,
    ]);
    if (text(inspected.stdout).trim() !== request.sandboxId) {
      throw new Error("Docker hibernation image is not owned by the Sandbox");
    }
    const inspectedBaseImage = await this.docker([
      "image",
      "inspect",
      "--format",
      '{{index .Config.Labels "appaloft.sandbox.base-image"}}',
      expected,
    ]);
    const baseImage = text(inspectedBaseImage.stdout).trim();
    if (!/^sha256:[0-9a-f]{64}$/.test(baseImage)) {
      throw new Error("Docker hibernation image has no valid base image identity");
    }
    const helper = `${containerName(request.sandboxId)}-hibernate-restore`;
    await this.runner.run(["docker", "rm", "-f", helper]);
    let provisioned: Awaited<ReturnType<DockerSandboxProvider["provision"]>> | undefined;
    try {
      await this.docker([
        "create",
        "--name",
        helper,
        "--label",
        "appaloft.managed=true",
        "--label",
        `appaloft.hibernate.restore=${request.sandboxId}`,
        "--network",
        "none",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges=true",
        expected,
        "sh",
        "-c",
        "trap : TERM INT; sleep infinity & wait",
      ]);
      await this.docker(["start", helper]);
      provisioned = await this.provision({
        ...request,
        source: { kind: "image", image: baseImage },
      });
      await this.workerCommand([
        "sh",
        "-c",
        `docker exec ${helper} tar -C /appaloft-snapshot-workspace -cf - . | docker exec -i ${provisioned.providerHandle} tar -xf - -C /workspace`,
      ]);
      await this.docker(["rm", "-f", helper]);
      await this.docker(["image", "rm", expected]);
      if (portable) {
        await this.deletePortableRecovery(request.sandboxId, request.providerHandle);
      }
      return provisioned;
    } catch (error) {
      if (provisioned) {
        await this.runner.run(["docker", "rm", "-f", provisioned.providerHandle]);
        await this.revokeExternalAccess({
          sandboxId: request.sandboxId,
          providerHandle: provisioned.providerHandle,
        });
      }
      throw error;
    } finally {
      await this.runner.run(["docker", "rm", "-f", helper]);
      if (portable) await this.runner.run(["docker", "image", "rm", expected]);
    }
  }

  async terminate(request: { sandboxId: string; providerHandle: string }): Promise<void> {
    if (request.providerHandle.startsWith(portableRecoveryHandlePrefix)) {
      await this.deletePortableRecovery(request.sandboxId, request.providerHandle);
      await this.runner.run(["docker", "image", "rm", hibernationImage(request.sandboxId)]);
      await this.revokeExternalAccess({
        sandboxId: request.sandboxId,
        providerHandle: containerName(request.sandboxId),
      });
      return;
    }
    if (request.providerHandle === hibernationImage(request.sandboxId)) {
      const inspected = await this.runner.run([
        "docker",
        "image",
        "inspect",
        "--format",
        '{{index .Config.Labels "appaloft.hibernate.sandbox"}}',
        request.providerHandle,
      ]);
      if (inspected.exitCode === 0 && text(inspected.stdout).trim() === request.sandboxId) {
        await this.docker(["image", "rm", request.providerHandle]);
      }
      await this.revokeExternalAccess({
        sandboxId: request.sandboxId,
        providerHandle: containerName(request.sandboxId),
      });
      return;
    }
    const containerExists = await this.assertHandleIfPresent(request);
    try {
      if (containerExists) await this.removeContainerConvergently(request);
    } finally {
      await this.revokeExternalAccess(request);
    }
  }

  async openTerminal(request: {
    sandboxId: string;
    providerHandle: string;
    cwd?: string;
    initialRows: number;
    initialCols: number;
    process?: {
      argv: string[];
      initialInput?: Uint8Array;
    };
  }): Promise<SandboxTerminalProcess> {
    await this.assertHandle(request);
    if (!this.runner.openTerminal) {
      throw new Error("Sandbox Docker command runner does not support PTY sessions");
    }
    const cwd = request.cwd && request.cwd !== "."
      ? await this.confinedWorkspacePath(request, request.cwd, "existing")
      : "/workspace";
    const processArgv = request.process?.argv;
    if (
      processArgv &&
      (processArgv.length === 0 ||
        processArgv.length > 128 ||
        processArgv.some((value) => !value || value.length > 8_192 || value.includes("\0")))
    ) {
      throw new Error("Sandbox terminal process argv is invalid");
    }
    const initialInput = request.process?.initialInput;
    if (initialInput && initialInput.byteLength > 64 * 1024) {
      throw new Error("Sandbox terminal process initial input exceeds the limit");
    }
    const terminal = await this.runner.openTerminal(
      processArgv
        ? [
            "docker",
            "exec",
            "-it",
            ...sandboxProcessDockerExecArgs,
            "-w",
            cwd,
            request.providerHandle,
            "sh",
            "-c",
            'stty -echo; exec sh -s -- "$@"',
            "appaloft-managed-terminal",
            ...processArgv,
          ]
        : [
            "docker",
            "exec",
            "-it",
            ...sandboxProcessDockerExecArgs,
            "-w",
            cwd,
            request.providerHandle,
            "sh",
            "-lc",
            'if command -v bash >/dev/null 2>&1; then exec bash --noprofile --norc -i; fi; exec sh -i',
          ],
      {
        initialRows: request.initialRows,
        initialCols: request.initialCols,
      },
    );
    if (initialInput?.byteLength) {
      await terminal.stdin.write(initialInput);
      await terminal.stdin.flush?.();
    }
    return terminal;
  }

  async listOwnedRuntimes(request: { ownerScope: string; limit: number; cursor?: string }) {
    const ownerScope = this.ownerScope(request.ownerScope);
    const offset = request.cursor ? Number(request.cursor) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Invalid runtime cursor");
    const listed = await this.docker([
      "ps",
      "-a",
      "--filter",
      "label=appaloft.managed=true",
      "--filter",
      `label=appaloft.sandbox.owner=${ownerScope}`,
      "--format",
      '{{.Names}}\t{{.Label "appaloft.sandbox.id"}}\t{{.Label "appaloft.sandbox.owner"}}',
    ]);
    const owned = text(listed.stdout)
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [providerHandle, sandboxId, observedOwner] = line.split("\t");
        if (
          !providerHandle ||
          !sandboxId ||
          observedOwner !== ownerScope ||
          providerHandle !== containerName(sandboxId)
        ) {
          throw new Error("Docker returned an invalid managed Sandbox inventory record");
        }
        return { sandboxId, providerHandle, ownerScope };
      });
    const items = owned.slice(offset, offset + request.limit);
    const nextOffset = offset + items.length;
    return {
      items,
      ...(nextOffset < owned.length ? { nextCursor: String(nextOffset) } : {}),
    };
  }

  async removeOwnedRuntime(request: {
    sandboxId: string;
    providerHandle: string;
    ownerScope: string;
  }): Promise<void> {
    await this.assertHandle(request);
    const ownerScope = this.ownerScope(request.ownerScope);
    const inspected = await this.docker([
      "inspect",
      "--format",
      '{{index .Config.Labels "appaloft.sandbox.owner"}}',
      request.providerHandle,
    ]);
    if (text(inspected.stdout).trim() !== ownerScope) {
      throw new Error("Docker container is not owned by the requested owner scope");
    }
    try {
      await this.docker(["rm", "-f", request.providerHandle]);
    } finally {
      await this.revokeExternalAccess(request);
    }
  }

  async exec(request: {
    sandboxId: string;
    providerHandle: string;
    argv: string[];
    cwd?: string;
    background?: boolean;
    timeoutMs?: number;
    stdin?: Uint8Array;
  }): Promise<SandboxExecResult> {
    await this.assertHandle(request);
    const cwd = request.cwd
      ? await this.confinedWorkspacePath(request, request.cwd, "existing")
      : "/workspace";
    if (request.background) {
      const processId = `spr_${randomUUID().replaceAll("-", "")}`;
      const pidFile = `/workspace/.appaloft-process-${processId}.pid`;
      const exitFile = `/workspace/.appaloft-process-${processId}.exit`;
      if (request.stdin) {
        const inputPipe = `/tmp/appaloft-process-${processId}.stdin`;
        try {
          await this.docker([
            "exec",
            request.providerHandle,
            "sh",
            "-c",
            'umask 077; mkfifo "$1"',
            "appaloft-background-input",
            inputPipe,
          ]);
          await this.docker([
            "exec",
            "-d",
            ...sandboxProcessDockerExecArgs,
            "-w",
            cwd,
            request.providerHandle,
            "sh",
            "-c",
            'pid_file="$1"; exit_file="$2"; input_pipe="$3"; shift 3; ( exec setsid "$@" < "$input_pipe" ) & child=$!; printf "%s\\n" "$child" > "$pid_file"; wait "$child"; code=$?; printf "%s\\n" "$code" > "$exit_file"; rm -f -- "$pid_file" "$input_pipe"; exit "$code"',
            "appaloft-background",
            pidFile,
            exitFile,
            inputPipe,
            ...request.argv,
          ]);
          await this.docker(
            [
              "exec",
              "-i",
              request.providerHandle,
              "sh",
              "-c",
              'input_pipe="$1"; cat > "$input_pipe"; code=$?; rm -f -- "$input_pipe"; exit "$code"',
              "appaloft-background-input",
              inputPipe,
            ],
            {
              stdin: request.stdin,
              timeoutMs: Math.min(request.timeoutMs ?? 30_000, 30_000),
            },
          );
        } catch (error) {
          await this.runner.run([
            "docker",
            "exec",
            request.providerHandle,
            "sh",
            "-c",
            `${terminateSandboxProcessGroupScript}; rm -f -- "$3"`,
            "appaloft-background-cleanup",
            pidFile,
            inputPipe,
            exitFile,
          ]);
          throw error;
        }
      } else {
        await this.docker([
          "exec",
          "-d",
          ...sandboxProcessDockerExecArgs,
          "-w",
          cwd,
          request.providerHandle,
          "sh",
          "-c",
          'pid_file="$1"; exit_file="$2"; shift 2; ( exec setsid "$@" ) & child=$!; printf "%s\\n" "$child" > "$pid_file"; wait "$child"; code=$?; printf "%s\\n" "$code" > "$exit_file"; rm -f -- "$pid_file"; exit "$code"',
          "appaloft-background",
          pidFile,
          exitFile,
          ...request.argv,
        ]);
      }
      return { mode: "background", processId };
    }
    const processId = `spr_${randomUUID().replaceAll("-", "")}`;
    const pidFile = `/workspace/.appaloft-process-${processId}.pid`;
    const result = await this.docker(
      [
        "exec",
        ...(request.stdin ? ["-i"] : []),
        ...sandboxProcessDockerExecArgs,
        "-w",
        cwd,
        request.providerHandle,
        "sh",
        "-c",
        'echo $$ > "$1"; shift; "$@"; code=$?; rm -f "$1"; exit "$code"',
        "appaloft-foreground",
        pidFile,
        ...request.argv,
      ],
      request.timeoutMs || request.stdin
        ? {
            ...(request.timeoutMs ? { timeoutMs: request.timeoutMs } : {}),
            ...(request.stdin ? { stdin: request.stdin } : {}),
          }
        : undefined,
      true,
    );
    if (result.failure) {
      await this.runner.run([
        "docker",
        "exec",
        request.providerHandle,
        "sh",
        "-c",
        '[ -f "$1" ] && kill "$(cat "$1")" 2>/dev/null; rm -f "$1"',
        "appaloft-process-limit",
        pidFile,
      ]);
    }
    const frames = [] as Extract<SandboxExecResult, { mode: "foreground" }>["frames"];
    let sequence = 1;
    if (result.stdout.byteLength > 0)
      frames.push({ kind: "stdout", sequence: sequence++, data: text(result.stdout) });
    if (result.stderr.length > 0)
      frames.push({ kind: "stderr", sequence: sequence++, data: result.stderr });
    if (result.failure) {
      frames.push({
        kind: "error",
        sequence,
        code:
          result.failure === "timeout" ? "sandbox_exec_timeout" : "sandbox_exec_output_limit",
        retryable: false,
      });
    } else {
      frames.push({ kind: "exit", sequence, exitCode: result.exitCode });
    }
    return { mode: "foreground", frames };
  }

  async listProcesses(request: {
    sandboxId: string;
    providerHandle: string;
  }): Promise<SandboxProcessDescriptor[]> {
    await this.assertHandle(request);
    const listed = await this.docker([
      "exec",
      request.providerHandle,
      "sh",
      "-c",
      "for f in /workspace/.appaloft-process-spr_*.pid; do [ -f \"$f\" ] || continue; file_name=\"${f##*-}\"; process_id=\"${file_name%.pid}\"; exit_file=\"/workspace/.appaloft-process-${process_id}.exit\"; [ -f \"$exit_file\" ] && continue; pid=\"$(cat \"$f\" 2>/dev/null || true)\"; if [ -n \"$pid\" ] && kill -0 \"$pid\" 2>/dev/null; then printf 'pid:%s:%s:running\\n' \"$file_name\" \"$pid\"; else printf 'pid:%s:%s:exited\\n' \"$file_name\" \"$pid\"; fi; done; for f in /workspace/.appaloft-process-spr_*.exit; do [ -f \"$f\" ] || continue; file_name=\"${f##*-}\"; exit_code=\"$(cat \"$f\" 2>/dev/null || true)\"; if [ \"$exit_code\" = 0 ]; then status=exited; else status=failed; fi; printf 'exit:%s:%s:%s\\n' \"$file_name\" \"$exit_code\" \"$status\"; done",
    ]);
    const processes: SandboxProcessDescriptor[] = [];
    const consumedExitFiles: string[] = [];
    for (const line of text(listed.stdout).trim().split("\n")) {
      if (!line) continue;
      const [kind, fileName, value, observedStatus] = line.split(":");
      if (!kind || !fileName || value === undefined || !observedStatus) continue;
      const processId = fileName.replace(/\.(?:pid|exit)$/u, "");
      if (!/^spr_[A-Za-z0-9]{1,128}$/u.test(processId)) continue;
      if (kind === "exit") {
        const exitCode = Number(value);
        if (Number.isInteger(exitCode)) {
          processes.push({
            processId,
            status: exitCode === 0 ? "exited" : "failed",
            exitCode,
          });
          consumedExitFiles.push(`/workspace/.appaloft-process-${processId}.exit`);
        }
        continue;
      }
      if (kind !== "pid" || !/^\d+$/u.test(value)) continue;
      if (observedStatus !== "running" && observedStatus !== "exited") continue;
      processes.push({ processId, status: observedStatus });
    }
    if (consumedExitFiles.length > 0) {
      await this.runner.run([
        "docker",
        "exec",
        request.providerHandle,
        "rm",
        "-f",
        ...consumedExitFiles,
      ]);
    }
    return processes;
  }

  async terminateProcess(request: {
    sandboxId: string;
    providerHandle: string;
    processId: string;
  }): Promise<void> {
    await this.assertHandle(request);
    if (!/^spr_[A-Za-z0-9]{1,128}$/.test(request.processId)) throw new Error("Invalid process id");
    const pidFile = `/workspace/.appaloft-process-${request.processId}.pid`;
    const exitFile = `/workspace/.appaloft-process-${request.processId}.exit`;
    await this.docker([
      "exec",
      request.providerHandle,
      "sh",
      "-c",
      terminateSandboxProcessGroupScript,
      "appaloft-process-terminate",
      pidFile,
      exitFile,
    ]);
  }

  async listFiles(request: {
    sandboxId: string;
    providerHandle: string;
    path: string;
  }): Promise<SandboxFileDescriptor[]> {
    await this.assertHandle(request);
    const path = await this.confinedWorkspacePath(request, request.path, "existing");
    const listed = await this.docker([
      "exec",
      request.providerHandle,
      "find",
      path,
      "-type",
      "f",
      "-print",
    ]);
    const files: SandboxFileDescriptor[] = [];
    for (const absolutePath of text(listed.stdout).trim().split("\n")) {
      if (!absolutePath) continue;
      const sized = await this.docker([
        "exec",
        request.providerHandle,
        "stat",
        "-c",
        "%s",
        absolutePath,
      ]);
      files.push({
        path: absolutePath.replace(/^\/workspace\/?/, ""),
        sizeBytes: Number(text(sized.stdout).trim()),
      });
    }
    return files;
  }

  async readFile(request: {
    sandboxId: string;
    providerHandle: string;
    path: string;
  }): Promise<Uint8Array> {
    await this.assertHandle(request);
    const path = await this.confinedWorkspacePath(request, request.path, "existing");
    return (await this.docker(["exec", request.providerHandle, "cat", path]))
      .stdout;
  }

  async writeFile(request: {
    sandboxId: string;
    providerHandle: string;
    path: string;
    content: Uint8Array;
  }): Promise<SandboxFileDescriptor> {
    await this.assertHandle(request);
    const path = await this.confinedWorkspacePath(request, request.path, "write");
    await this.docker(
      [
        "exec",
        "-i",
        request.providerHandle,
        "sh",
        "-c",
        'destination="$1"; directory="$(dirname "$destination")"; mkdir -p "$directory" || exit 1; temporary="$(mktemp "$directory/.appaloft-write.XXXXXX")" || exit 1; cleanup() { rm -f -- "$temporary"; }; trap cleanup EXIT HUP INT TERM; cat > "$temporary" || exit 1; if [ -e "$destination" ]; then chmod "$(stat -c %a "$destination")" "$temporary" || exit 1; fi; mv -f -- "$temporary" "$destination" || exit 1; trap - EXIT HUP INT TERM',
        "appaloft-file-write",
        path,
      ],
      { stdin: request.content },
    );
    return { path: request.path, sizeBytes: request.content.byteLength, modifiedAt: this.now() };
  }

  async removeFile(request: {
    sandboxId: string;
    providerHandle: string;
    path: string;
    recursive?: boolean;
  }): Promise<void> {
    await this.assertHandle(request);
    const path = await this.confinedWorkspacePath(request, request.path, "existing");
    await this.docker([
      "exec",
      request.providerHandle,
      "rm",
      ...(request.recursive ? ["-rf"] : ["-f"]),
      "--",
      path,
    ]);
  }

  async exposePort(request: {
    sandboxId: string;
    providerHandle: string;
    port: number;
    visibility: "private" | "organization" | "public";
    expiresAt?: string;
  }): Promise<SandboxPortExposure> {
    await this.assertHandle(request);
    if (!this.portPublisher) throw new Error("Sandbox port publisher is not configured");
    return this.portPublisher.expose({
      sandboxId: request.sandboxId,
      containerName: request.providerHandle,
      port: request.port,
      visibility: request.visibility,
      ...(request.expiresAt ? { expiresAt: request.expiresAt } : {}),
    });
  }

  async listPorts(request: {
    sandboxId: string;
    providerHandle: string;
  }): Promise<SandboxPortExposure[]> {
    await this.assertHandle(request);
    if (!this.portPublisher) return [];
    return this.portPublisher.list({
      sandboxId: request.sandboxId,
      containerName: request.providerHandle,
    });
  }

  async revokePort(request: {
    sandboxId: string;
    providerHandle: string;
    exposureId: string;
  }): Promise<void> {
    await this.assertHandle(request);
    if (!this.portPublisher) throw new Error("Sandbox port publisher is not configured");
    await this.portPublisher.revoke({
      sandboxId: request.sandboxId,
      containerName: request.providerHandle,
      exposureId: request.exposureId,
    });
  }

  private async captureWorkspaceImage(input: {
    sandboxId: string;
    providerHandle: string;
    image: string;
    helper: string;
    labels: readonly string[];
  }): Promise<number> {
    const inspectedBaseImage = await this.docker([
      "inspect",
      "--format",
      '{{index .Config.Labels "appaloft.sandbox.base-image"}}',
      input.providerHandle,
    ]);
    const declaredBaseImage = text(inspectedBaseImage.stdout).trim();
    const inspectedRuntimeImage = await this.docker([
      "inspect",
      "--format",
      "{{.Image}}",
      input.providerHandle,
    ]);
    const runtimeImage = text(inspectedRuntimeImage.stdout).trim();
    const sourceImage =
      /^sha256:[0-9a-f]{64}$/.test(declaredBaseImage) ? declaredBaseImage : runtimeImage;
    if (!/^sha256:[0-9a-f]{64}$/.test(sourceImage)) {
      throw new Error("Docker Sandbox base image identity is invalid");
    }
    await this.runner.run(["docker", "rm", "-f", input.helper]);
    try {
      await this.docker([
        "create",
        "--name",
        input.helper,
        "--label",
        "appaloft.managed=true",
        ...input.labels.flatMap((label) => ["--label", label]),
        "--label",
        `appaloft.sandbox.base-image=${sourceImage}`,
        "--network",
        "none",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges=true",
        sourceImage,
        "sh",
        "-c",
        "trap : TERM INT; sleep infinity & wait",
      ]);
      await this.docker(["start", input.helper]);
      await this.workerCommand([
        "sh",
        "-c",
        `docker exec ${input.providerHandle} tar -C /workspace -cf - . | docker exec -i ${input.helper} sh -c 'rm -rf /appaloft-snapshot-workspace && mkdir -p /appaloft-snapshot-workspace && tar -xf - -C /appaloft-snapshot-workspace'`,
      ]);
      await this.docker(["commit", input.helper, input.image]);
    } finally {
      await this.runner.run(["docker", "rm", "-f", input.helper]);
    }
    const inspected = await this.docker([
      "image",
      "inspect",
      "--format",
      "{{.Size}}",
      input.image,
    ]);
    return Number(text(inspected.stdout).trim());
  }

  async captureSnapshot(request: {
    sandboxId: string;
    providerHandle: string;
    snapshotId: string;
    capability: "filesystem" | "filesystem-memory";
  }): ReturnType<SandboxProvider["captureSnapshot"]> {
    await this.assertHandle(request);
    if (request.capability !== "filesystem") throw new Error("Unsupported snapshot capability");
    if (!/^ssn_[A-Za-z0-9_.-]{1,120}$/.test(request.snapshotId)) {
      throw new Error("Sandbox snapshot id is invalid");
    }
    const image = `appaloft-sandbox-snapshot:${request.snapshotId}`;
    const helper = `${containerName(request.sandboxId)}-snapshot-${request.snapshotId}`;
    const sizeBytes = await this.captureWorkspaceImage({
      ...request,
      image,
      helper,
      labels: [
        `appaloft.snapshot.id=${request.snapshotId}`,
        `appaloft.snapshot.source-sandbox=${request.sandboxId}`,
      ],
    });
    if (this.portableRecovery) {
      const providerHandle = await this.storePortableSnapshot({
        snapshotId: request.snapshotId,
        sourceSandboxId: request.sandboxId,
        image,
      });
      try {
        await this.docker(["image", "rm", image]);
      } catch (error) {
        await this.deletePortableSnapshot(providerHandle).catch(() => undefined);
        throw error;
      }
      return {
        providerHandle,
        sizeBytes,
        portability: "provider-family" as const,
        recoveryFamily: portableRecoveryFamily(this.portableRecovery.storeId),
      };
    }
    return { providerHandle: image, sizeBytes, portability: "provider-local" as const };
  }

  async deleteSnapshot(request: { snapshotId: string; providerHandle: string }): Promise<void> {
    if (request.providerHandle.startsWith(portableSnapshotHandlePrefix)) {
      const snapshot = decodePortableSnapshotHandle(request.providerHandle);
      if (snapshot.snapshotId !== request.snapshotId) {
        throw new Error("Docker portable Snapshot handle does not match the Snapshot");
      }
      await this.deletePortableSnapshot(request.providerHandle);
      await this.runner.run([
        "docker",
        "image",
        "rm",
        `appaloft-sandbox-snapshot:${request.snapshotId}`,
      ]);
      return;
    }
    const expected = `appaloft-sandbox-snapshot:${request.snapshotId}`;
    if (request.providerHandle !== expected) {
      throw new Error("Sandbox snapshot provider handle does not match the managed image");
    }
    const inspected = await this.docker([
      "image",
      "inspect",
      "--format",
      '{{index .Config.Labels "appaloft.snapshot.id"}}',
      request.providerHandle,
    ]);
    if (text(inspected.stdout).trim() !== request.snapshotId) {
      throw new Error("Docker snapshot image is not owned by the requested snapshot");
    }
    await this.docker(["image", "rm", request.providerHandle]);
  }

  async updateNetworkPolicy(request: {
    sandboxId: string;
    providerHandle: string;
    networkPolicy: SandboxNetworkPolicyState;
  }): Promise<void> {
    await this.assertHandle(request);
    if (request.networkPolicy.mode === "deny") {
      await this.egressPolicy?.revoke({
        sandboxId: request.sandboxId,
        containerName: request.providerHandle,
      });
      return;
    }
    if (!this.egressPolicy) {
      throw new Error("Docker provider requires an egress adapter for allowlist mode");
    }
    const inspected = await this.docker([
      "inspect",
      "--format",
      '{{index .Config.Labels "appaloft.sandbox.egress"}}',
      request.providerHandle,
    ]);
    if (text(inspected.stdout).trim() !== "allowlist") {
      throw new Error("Docker Sandbox must be recreated to enable allowlist egress");
    }
    await this.egressPolicy.configure({
      sandboxId: request.sandboxId,
      containerName: request.providerHandle,
      networkPolicy: request.networkPolicy,
    });
  }

  private async writeEgressEnvFile(
    sandboxId: string,
    input: { proxyUrl: string; noProxy?: readonly string[] },
  ): Promise<string> {
    let proxy: URL;
    try {
      proxy = new URL(input.proxyUrl);
    } catch {
      throw new Error("Sandbox egress adapter returned an invalid proxy URL");
    }
    if (
      !["http:", "https:"].includes(proxy.protocol) ||
      !proxy.hostname ||
      /[\r\n\0]/u.test(input.proxyUrl)
    ) {
      throw new Error("Sandbox egress adapter returned an unsafe proxy URL");
    }
    const noProxy = ["127.0.0.1", "localhost", "::1", ...(input.noProxy ?? [])];
    if (
      noProxy.length > 64 ||
      noProxy.some(
        (entry) =>
          !entry ||
          entry.length > 253 ||
          /[\s,\r\n\0]/u.test(entry),
      )
    ) {
      throw new Error("Sandbox egress adapter returned an invalid no-proxy list");
    }
    const content = [
      `HTTP_PROXY=${input.proxyUrl}`,
      `HTTPS_PROXY=${input.proxyUrl}`,
      `http_proxy=${input.proxyUrl}`,
      `https_proxy=${input.proxyUrl}`,
      `NO_PROXY=${noProxy.join(",")}`,
      `no_proxy=${noProxy.join(",")}`,
      "APPALOFT_SANDBOX_EGRESS_PROXY=1",
      "",
    ].join("\n");
    const directory = "/var/tmp/appaloft-sandbox-env";
    const path = `${directory}/${sandboxId}-${randomUUID()}.env`;
    await this.workerCommand(["mkdir", "-p", directory]);
    await this.workerCommand(
      ["dd", "if=/dev/stdin", `of=${path}`, "status=none"],
      { stdin: new TextEncoder().encode(content) },
    );
    await this.workerCommand(["chmod", "600", path]);
    return path;
  }

  private async removeWorkerFile(path: string): Promise<void> {
    const result = await this.runner.run(["rm", "-f", "--", path]);
    if (result.exitCode !== 0) {
      throw new Error("Sandbox worker failed to remove a transient environment file");
    }
  }

  private async revokeExternalAccess(input: {
    sandboxId: string;
    providerHandle: string;
  }): Promise<void> {
    const cleanups: Promise<void>[] = [];
    if (this.portPublisher) {
      cleanups.push(
        (async () => {
          const exposures = await this.portPublisher?.list({
            sandboxId: input.sandboxId,
            containerName: input.providerHandle,
          });
          const revoked = await Promise.allSettled(
            (exposures ?? []).map((exposure) =>
              this.portPublisher?.revoke({
                sandboxId: input.sandboxId,
                containerName: input.providerHandle,
                exposureId: exposure.exposureId,
              }),
            ),
          );
          if (revoked.some((result) => result.status === "rejected")) {
            throw new Error("Sandbox provider failed to revoke every port exposure");
          }
        })(),
      );
    }
    if (this.egressPolicy) {
      cleanups.push(
        this.egressPolicy.revoke({
          sandboxId: input.sandboxId,
          containerName: input.providerHandle,
        }),
      );
    }
    const results = await Promise.allSettled(cleanups);
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length > 0) {
      throw new Error("Sandbox provider failed to revoke external access");
    }
  }

  private async workerCommand(
    argv: readonly string[],
    input?: { stdin?: Uint8Array; timeoutMs?: number },
  ): Promise<SandboxDockerCommandResult> {
    const result = await this.runner.run(argv, input);
    if (result.exitCode !== 0) {
      throw new Error(`Sandbox worker command failed: ${result.stderr || text(result.stdout)}`);
    }
    return result;
  }

  private portableRecoveryPath(sandboxId: string, packageId: string): string {
    if (!this.portableRecovery) {
      throw new Error("Docker portable recovery store is not configured");
    }
    containerName(sandboxId);
    if (!/^pr_[0-9a-f]{32}$/.test(packageId)) {
      throw new Error("Docker portable recovery package id is invalid");
    }
    return `${this.portableRecovery.rootPath}/v1/${sandboxId}-${packageId}.tar`;
  }

  private portableSnapshotPath(snapshotId: string, packageId: string): string {
    if (!this.portableRecovery) {
      throw new Error("Docker portable recovery store is not configured");
    }
    if (
      !/^ssn_[A-Za-z0-9_.-]{1,120}$/.test(snapshotId) ||
      !/^ps_[0-9a-f]{32}$/.test(packageId)
    ) {
      throw new Error("Docker portable Snapshot package identity is invalid");
    }
    return `${this.portableRecovery.rootPath}/v1/snapshots/${snapshotId}-${packageId}.tar`;
  }

  private async storePortableRecovery(sandboxId: string, image: string): Promise<string> {
    if (!this.portableRecovery) {
      throw new Error("Docker portable recovery store is not configured");
    }
    const packageId = `pr_${randomUUID().replaceAll("-", "")}`;
    const path = this.portableRecoveryPath(sandboxId, packageId);
    const partialPath = `${path}.partial`;
    await this.workerCommand(["mkdir", "-p", "--", `${this.portableRecovery.rootPath}/v1`]);
    await this.workerCommand(["chmod", "700", `${this.portableRecovery.rootPath}/v1`]);
    await this.workerCommand(["rm", "-f", "--", partialPath]);
    try {
      await this.docker(["save", "--output", partialPath, image]);
      await this.workerCommand(["chmod", "600", partialPath]);
      const observed = await this.workerCommand(["sha256sum", "--", partialPath]);
      const digest = text(observed.stdout).trim().split(/\s+/u)[0];
      if (!digest || !/^[0-9a-f]{64}$/.test(digest)) {
        throw new Error("Docker portable recovery digest is invalid");
      }
      await this.workerCommand(["mv", "--", partialPath, path]);
      return encodePortableRecoveryHandle({
        sandboxId,
        packageId,
        digest: `sha256:${digest}`,
      });
    } catch (error) {
      await this.runner.run(["rm", "-f", "--", partialPath]);
      throw error;
    }
  }

  private async loadPortableRecovery(
    sandboxId: string,
    providerHandle: string,
    image: string,
  ): Promise<void> {
    if (!this.portableRecovery) {
      throw new Error("Docker portable recovery store is not configured");
    }
    const recovery = decodePortableRecoveryHandle(providerHandle, sandboxId);
    const path = this.portableRecoveryPath(sandboxId, recovery.packageId);
    const observed = await this.workerCommand(["sha256sum", "--", path]);
    const digest = text(observed.stdout).trim().split(/\s+/u)[0];
    if (`sha256:${digest}` !== recovery.digest) {
      throw new Error("Docker portable recovery package digest does not match");
    }
    await this.docker(["load", "--input", path]);
    const ownership = await this.docker([
      "image",
      "inspect",
      "--format",
      '{{index .Config.Labels "appaloft.hibernate.sandbox"}}',
      image,
    ]);
    if (text(ownership.stdout).trim() !== sandboxId) {
      await this.runner.run(["docker", "image", "rm", image]);
      throw new Error("Docker portable recovery package is not owned by the Sandbox");
    }
  }

  private async deletePortableRecovery(
    sandboxId: string,
    providerHandle: string,
  ): Promise<void> {
    const recovery = decodePortableRecoveryHandle(providerHandle, sandboxId);
    const path = this.portableRecoveryPath(sandboxId, recovery.packageId);
    await this.workerCommand(["rm", "-f", "--", path]);
  }

  private async storePortableSnapshot(input: {
    snapshotId: string;
    sourceSandboxId: string;
    image: string;
  }): Promise<string> {
    if (!this.portableRecovery) {
      throw new Error("Docker portable recovery store is not configured");
    }
    const packageId = `ps_${randomUUID().replaceAll("-", "")}`;
    const path = this.portableSnapshotPath(input.snapshotId, packageId);
    const partialPath = `${path}.partial`;
    const directory = `${this.portableRecovery.rootPath}/v1/snapshots`;
    await this.workerCommand(["mkdir", "-p", "--", directory]);
    await this.workerCommand(["chmod", "700", directory]);
    await this.workerCommand(["rm", "-f", "--", partialPath]);
    try {
      await this.docker(["save", "--output", partialPath, input.image]);
      await this.workerCommand(["chmod", "600", partialPath]);
      const observed = await this.workerCommand(["sha256sum", "--", partialPath]);
      const digest = text(observed.stdout).trim().split(/\s+/u)[0];
      if (!digest || !/^[0-9a-f]{64}$/.test(digest)) {
        throw new Error("Docker portable Snapshot digest is invalid");
      }
      await this.workerCommand(["mv", "--", partialPath, path]);
      return encodePortableSnapshotHandle({
        snapshotId: input.snapshotId,
        sourceSandboxId: input.sourceSandboxId,
        packageId,
        digest: `sha256:${digest}`,
      });
    } catch (error) {
      await this.runner.run(["rm", "-f", "--", partialPath]);
      throw error;
    }
  }

  private async loadPortableSnapshot(providerHandle: string): Promise<string> {
    if (!this.portableRecovery) {
      throw new Error("Docker portable recovery store is not configured");
    }
    const snapshot = decodePortableSnapshotHandle(providerHandle);
    const path = this.portableSnapshotPath(snapshot.snapshotId, snapshot.packageId);
    const observed = await this.workerCommand(["sha256sum", "--", path]);
    const digest = text(observed.stdout).trim().split(/\s+/u)[0];
    if (`sha256:${digest}` !== snapshot.digest) {
      throw new Error("Docker portable Snapshot package digest does not match");
    }
    await this.docker(["load", "--input", path]);
    const image = `appaloft-sandbox-snapshot:${snapshot.snapshotId}`;
    const ownership = await this.docker([
      "image",
      "inspect",
      "--format",
      '{{index .Config.Labels "appaloft.snapshot.id"}}|{{index .Config.Labels "appaloft.snapshot.source-sandbox"}}',
      image,
    ]);
    if (
      text(ownership.stdout).trim() !==
      `${snapshot.snapshotId}|${snapshot.sourceSandboxId}`
    ) {
      await this.runner.run(["docker", "image", "rm", image]);
      throw new Error("Docker portable Snapshot package ownership does not match");
    }
    return image;
  }

  private async deletePortableSnapshot(providerHandle: string): Promise<void> {
    const snapshot = decodePortableSnapshotHandle(providerHandle);
    const path = this.portableSnapshotPath(snapshot.snapshotId, snapshot.packageId);
    await this.workerCommand(["rm", "-f", "--", path]);
  }

  private workspacePath(path: string): string {
    const checked = SandboxWorkspacePath.create(path);
    if (checked.isErr()) throw new Error("Sandbox path escaped the workspace");
    return `/workspace/${checked.value.value}`.replace(/\/$/, "");
  }

  private ownerScope(value: string): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value)) {
      throw new Error("Sandbox owner scope is invalid");
    }
    return value;
  }

  private async confinedWorkspacePath(
    request: { sandboxId: string; providerHandle: string },
    path: string,
    intent: "existing" | "write",
  ): Promise<string> {
    const lexical = this.workspacePath(path);
    const script =
      intent === "write"
        ? 'mkdir -p "$(dirname "$1")" || exit 1; if [ -e "$1" ] || [ -L "$1" ]; then realpath "$1"; else parent=$(realpath "$(dirname "$1")") || exit 1; printf "%s/%s\\n" "$parent" "$(basename "$1")"; fi'
        : 'realpath "$1"';
    const resolved = await this.docker([
      "exec",
      request.providerHandle,
      "sh",
      "-c",
      script,
      "appaloft-workspace-path",
      lexical,
    ]);
    const absolute = text(resolved.stdout).trim();
    if (absolute !== "/workspace" && !absolute.startsWith("/workspace/")) {
      throw new Error("Sandbox path escaped the workspace through a symbolic link");
    }
    return absolute;
  }

  private async assertHandle(request: {
    sandboxId: string;
    providerHandle: string;
  }): Promise<void> {
    if (request.providerHandle !== containerName(request.sandboxId)) {
      throw new Error("Sandbox provider handle does not match the managed container");
    }
    const inspected = await this.docker([
      "inspect",
      "--format",
      '{{index .Config.Labels "appaloft.sandbox.id"}}',
      request.providerHandle,
    ]);
    if (text(inspected.stdout).trim() !== request.sandboxId) {
      throw new Error("Docker container is not owned by the requested Sandbox");
    }
  }

  private async assertHandleIfPresent(request: {
    sandboxId: string;
    providerHandle: string;
  }): Promise<boolean> {
    if (request.providerHandle !== containerName(request.sandboxId)) {
      throw new Error("Sandbox provider handle does not match the managed container");
    }
    const inspected = await this.docker(
      [
        "inspect",
        "--format",
        '{{index .Config.Labels "appaloft.sandbox.id"}}',
        request.providerHandle,
      ],
      undefined,
      true,
    );
    if (inspected.exitCode === 0) {
      if (text(inspected.stdout).trim() !== request.sandboxId) {
        throw new Error("Docker container is not owned by the requested Sandbox");
      }
      return true;
    }
    const listed = await this.docker([
      "ps",
      "-a",
      "--filter",
      `name=^/${request.providerHandle}$`,
      "--format",
      "{{.Names}}",
    ]);
    if (!text(listed.stdout).trim()) return false;
    throw new Error(`Docker Sandbox inspect failed: ${inspected.stderr || text(inspected.stdout)}`);
  }

  private async docker(
    args: readonly string[],
    input?: { stdin?: Uint8Array; timeoutMs?: number },
    allowFailure = false,
  ): Promise<SandboxDockerCommandResult> {
    const result = await this.runner.run(["docker", ...args], input);
    if (!allowFailure && result.exitCode !== 0) {
      throw new Error(`Docker Sandbox command failed: ${result.stderr || text(result.stdout)}`);
    }
    return result;
  }

  private async removeContainerConvergently(request: {
    sandboxId: string;
    providerHandle: string;
  }): Promise<void> {
    const removed = await this.runner.run(["docker", "rm", "-f", request.providerHandle]);
    if (removed.exitCode === 0) return;
    const concurrentRemoval = `removal of container ${request.providerHandle} is already in progress`;
    if (!removed.stderr?.toLowerCase().includes(concurrentRemoval.toLowerCase())) {
      throw new Error(`Docker Sandbox command failed: ${removed.stderr || text(removed.stdout)}`);
    }
    for (let attempt = 1; attempt <= concurrentRemovalReadbackAttempts; attempt += 1) {
      if (!(await this.assertHandleIfPresent(request))) return;
      if (attempt < concurrentRemovalReadbackAttempts) {
        await this.sleep(concurrentRemovalReadbackDelayMs);
      }
    }
    throw new Error(`Docker Sandbox command failed: ${removed.stderr || text(removed.stdout)}`);
  }
}
