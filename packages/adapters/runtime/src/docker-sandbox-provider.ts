import { randomUUID } from "node:crypto";

import {
  type SandboxExecResult,
  type SandboxFileDescriptor,
  type SandboxPortExposure,
  type SandboxProcessDescriptor,
  type SandboxProvider,
  type SandboxProviderRequest,
} from "@appaloft/application";
import { type SandboxIsolation, SandboxWorkspacePath } from "@appaloft/core";

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

export class BunSandboxDockerCommandRunner implements SandboxDockerCommandRunner {
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
  internalNetwork?: string;
  now?: () => string;
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

export class DockerSandboxProvider implements SandboxProvider {
  readonly key: string;
  readonly capabilities;
  private readonly runner: SandboxDockerCommandRunner;
  private readonly portPublisher: SandboxPortPublisher | undefined;
  private readonly now: () => string;
  private readonly runtimeName: "runc" | "runsc";
  private readonly networkName: string;

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
    this.networkName = input.internalNetwork ?? "none";
    this.capabilities = {
      isolation,
      pause: true,
      snapshot: ["filesystem" as const],
      processes: true,
      files: true,
      ports: Boolean(input.portPublisher),
      networkPolicy: ["deny" as const],
      credentialBroker: false,
    };
    this.runner = input.runner ?? new BunSandboxDockerCommandRunner();
    this.portPublisher = input.portPublisher;
    this.now = input.now ?? (() => new Date().toISOString());
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
    if (request.networkPolicy.mode !== "deny") {
      throw new Error("Docker provider requires an egress policy adapter for allowlist mode");
    }
    await this.probe();
    const name = containerName(request.sandboxId);
    const memoryMb = Math.max(4, Math.ceil(request.limits.memoryBytes / (1024 * 1024)));
    const diskMb = Math.max(4, Math.ceil(request.limits.diskBytes / (1024 * 1024)));
    if (
      request.source.kind === "snapshot" &&
      !/^appaloft-sandbox-snapshot:ssn_[A-Za-z0-9_.-]{1,120}$/.test(
        request.source.providerHandle,
      )
    ) {
      throw new Error("Docker snapshot provider handle is invalid");
    }
    const image = request.source.kind === "image" ? request.source.image : request.source.providerHandle;
    const startup =
      request.source.kind === "snapshot"
        ? "cp -a /appaloft-snapshot-workspace/. /workspace/ && trap : TERM INT; sleep infinity & wait"
        : "trap : TERM INT; sleep infinity & wait";
    await this.docker([
      "create",
      "--name",
      name,
      "--label",
      "appaloft.managed=true",
      "--label",
      `appaloft.sandbox.id=${request.sandboxId}`,
      "--runtime",
      this.runtimeName,
      "--network",
      this.networkName,
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
    try {
      await this.docker(["start", name]);
    } catch (error) {
      await this.runner.run(["docker", "rm", "-f", name]);
      throw error;
    }
    return { providerHandle: name, realizedIsolation: this.capabilities.isolation };
  }

  async pause(request: { sandboxId: string; providerHandle: string }): Promise<void> {
    await this.assertHandle(request);
    await this.docker(["pause", request.providerHandle]);
  }

  async resume(request: { sandboxId: string; providerHandle: string }) {
    await this.assertHandle(request);
    await this.docker(["unpause", request.providerHandle]);
    return {
      providerHandle: request.providerHandle,
      realizedIsolation: this.capabilities.isolation,
    };
  }

  async terminate(request: { sandboxId: string; providerHandle: string }): Promise<void> {
    await this.assertHandle(request);
    await this.docker(["rm", "-f", request.providerHandle]);
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
      await this.docker([
        "exec",
        ...(request.stdin ? ["-i"] : []),
        "-d",
        "-w",
        cwd,
        request.providerHandle,
        "sh",
        "-c",
        'echo $$ > "$1"; shift; exec "$@"',
        "appaloft-background",
        pidFile,
        ...request.argv,
      ]);
      return { mode: "background", processId };
    }
    const processId = `spr_${randomUUID().replaceAll("-", "")}`;
    const pidFile = `/workspace/.appaloft-process-${processId}.pid`;
    const result = await this.docker(
      [
        "exec",
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
      "for f in /workspace/.appaloft-process-spr_*.pid; do [ -f \"$f\" ] || continue; printf '%s:%s\\n' \"${f##*-}\" \"$(cat \"$f\")\"; done",
    ]);
    const processes: SandboxProcessDescriptor[] = [];
    for (const line of text(listed.stdout).trim().split("\n")) {
      if (!line) continue;
      const separator = line.lastIndexOf(":");
      const processId = line.slice(0, separator).replace(/\.pid$/, "");
      const pid = line.slice(separator + 1);
      const observed = await this.runner.run([
        "docker",
        "exec",
        request.providerHandle,
        "sh",
        "-c",
        'kill -0 "$1" 2>/dev/null',
        "appaloft-process-check",
        pid,
      ]);
      processes.push({ processId, status: observed.exitCode === 0 ? "running" : "exited" });
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
    await this.docker([
      "exec",
      request.providerHandle,
      "sh",
      "-c",
      '[ -f "$1" ] && kill "$(cat "$1")" && rm -f "$1"',
      "appaloft-process-terminate",
      pidFile,
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
        'mkdir -p "$(dirname "$1")" && cat > "$1"',
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

  async captureSnapshot(request: {
    sandboxId: string;
    providerHandle: string;
    snapshotId: string;
    capability: "filesystem" | "filesystem-memory";
  }): Promise<{ providerHandle: string; sizeBytes: number }> {
    await this.assertHandle(request);
    if (request.capability !== "filesystem") throw new Error("Unsupported snapshot capability");
    const image = `appaloft-sandbox-snapshot:${request.snapshotId}`;
    const helper = `${containerName(request.sandboxId)}-snapshot-${request.snapshotId}`;
    const inspectedSource = await this.docker([
      "inspect",
      "--format",
      "{{.Config.Image}}",
      request.providerHandle,
    ]);
    const sourceImage = text(inspectedSource.stdout).trim();
    const archive = await this.docker([
      "exec",
      request.providerHandle,
      "tar",
      "-C",
      "/workspace",
      "-cf",
      "-",
      ".",
    ]);
    await this.docker([
      "create",
      "--name",
      helper,
      "--label",
      "appaloft.managed=true",
      "--label",
      `appaloft.snapshot.id=${request.snapshotId}`,
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
    try {
      await this.docker(["start", helper]);
      await this.docker(
        [
          "exec",
          "-i",
          helper,
          "sh",
          "-c",
          "mkdir -p /appaloft-snapshot-workspace && tar -xf - -C /appaloft-snapshot-workspace",
        ],
        { stdin: archive.stdout },
      );
      await this.docker(["commit", helper, image]);
    } finally {
      await this.runner.run(["docker", "rm", "-f", helper]);
    }
    const inspected = await this.docker(["image", "inspect", "--format", "{{.Size}}", image]);
    return { providerHandle: image, sizeBytes: Number(text(inspected.stdout).trim()) };
  }

  async deleteSnapshot(request: { snapshotId: string; providerHandle: string }): Promise<void> {
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

  private workspacePath(path: string): string {
    const checked = SandboxWorkspacePath.create(path);
    if (checked.isErr()) throw new Error("Sandbox path escaped the workspace");
    return `/workspace/${checked.value.value}`.replace(/\/$/, "");
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
}
