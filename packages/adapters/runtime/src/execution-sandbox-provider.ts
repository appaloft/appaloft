import {
  type SandboxExecResult,
  type SandboxFileDescriptor,
  type SandboxPortExposure,
  type SandboxProcessDescriptor,
  type SandboxProvider,
  type SandboxProviderRequest,
} from "@appaloft/application";
import { type SandboxIsolation, SandboxWorkspacePath } from "@appaloft/core";

type HermeticRuntime = {
  handle: string;
  paused: boolean;
  files: Map<string, Uint8Array>;
  processes: Map<string, SandboxProcessDescriptor>;
  ports: Map<string, SandboxPortExposure>;
  nextProcess: number;
  nextExposure: number;
};

export class HermeticSandboxProvider implements SandboxProvider {
  readonly key = "hermetic";
  readonly capabilities;
  private readonly runtimes = new Map<string, HermeticRuntime>();
  private readonly now: () => string;

  constructor(input: { isolation?: SandboxIsolation; now?: () => string } = {}) {
    this.capabilities = {
      isolation: input.isolation ?? ("container-trusted" as const),
      pause: true,
      snapshot: ["filesystem" as const],
      processes: true,
      files: true,
      ports: true,
      networkPolicy: true,
      credentialBroker: false,
    };
    this.now = input.now ?? (() => "2030-01-01T00:00:00.000Z");
  }

  hasRuntime(sandboxId: string): boolean {
    return this.runtimes.has(sandboxId);
  }

  async provision(request: SandboxProviderRequest) {
    const handle = `hermetic:${request.sandboxId}`;
    this.runtimes.set(request.sandboxId, {
      handle,
      paused: false,
      files: new Map(),
      processes: new Map(),
      ports: new Map(),
      nextProcess: 1,
      nextExposure: 1,
    });
    return { providerHandle: handle, realizedIsolation: this.capabilities.isolation };
  }

  async pause(request: { sandboxId: string; providerHandle: string }): Promise<void> {
    this.runtime(request).paused = true;
  }

  async resume(request: { sandboxId: string; providerHandle: string }) {
    const runtime = this.runtime(request);
    runtime.paused = false;
    return {
      providerHandle: runtime.handle,
      realizedIsolation: this.capabilities.isolation,
    };
  }

  async terminate(request: { sandboxId: string; providerHandle: string }): Promise<void> {
    this.runtime(request);
    this.runtimes.delete(request.sandboxId);
  }

  async exec(request: {
    sandboxId: string;
    providerHandle: string;
    argv: string[];
    cwd?: string;
    background?: boolean;
    timeoutMs?: number;
  }): Promise<SandboxExecResult> {
    const runtime = this.runtime(request);
    if (runtime.paused) throw new Error("Sandbox runtime is paused");
    if (request.cwd) this.path(request.cwd);
    if (request.background) {
      const processId = `spr_${runtime.nextProcess++}`;
      runtime.processes.set(processId, { processId, status: "running" });
      return { mode: "background", processId };
    }
    return {
      mode: "foreground",
      frames: [
        { kind: "stdout", sequence: 1, data: `${request.argv.join(" ")}\n` },
        { kind: "exit", sequence: 2, exitCode: 0 },
      ],
    };
  }

  async listProcesses(request: {
    sandboxId: string;
    providerHandle: string;
  }): Promise<SandboxProcessDescriptor[]> {
    return [...this.runtime(request).processes.values()].map((process) => ({ ...process }));
  }

  async terminateProcess(request: {
    sandboxId: string;
    providerHandle: string;
    processId: string;
  }): Promise<void> {
    const runtime = this.runtime(request);
    const process = runtime.processes.get(request.processId);
    if (!process) throw new Error("Sandbox process was not found");
    runtime.processes.set(request.processId, { ...process, status: "terminated" });
  }

  async listFiles(request: {
    sandboxId: string;
    providerHandle: string;
    path: string;
  }): Promise<SandboxFileDescriptor[]> {
    const runtime = this.runtime(request);
    const prefix = `${this.path(request.path).replace(/\/$/, "")}/`;
    return [...runtime.files.entries()]
      .filter(([path]) => path === request.path || path.startsWith(prefix))
      .map(([path, content]) => ({ path, sizeBytes: content.byteLength }));
  }

  async readFile(request: {
    sandboxId: string;
    providerHandle: string;
    path: string;
  }): Promise<Uint8Array> {
    const content = this.runtime(request).files.get(this.path(request.path));
    if (!content) throw new Error("Sandbox file was not found");
    return content.slice();
  }

  async writeFile(request: {
    sandboxId: string;
    providerHandle: string;
    path: string;
    content: Uint8Array;
  }): Promise<SandboxFileDescriptor> {
    const runtime = this.runtime(request);
    const path = this.path(request.path);
    runtime.files.set(path, request.content.slice());
    return {
      path,
      sizeBytes: request.content.byteLength,
      digest: `sha256:hermetic-${request.content.byteLength}`,
      modifiedAt: this.now(),
    };
  }

  async removeFile(request: {
    sandboxId: string;
    providerHandle: string;
    path: string;
    recursive?: boolean;
  }): Promise<void> {
    const runtime = this.runtime(request);
    const path = this.path(request.path);
    const descendants = [...runtime.files.keys()].filter((candidate) =>
      candidate.startsWith(`${path}/`),
    );
    if (descendants.length > 0 && !request.recursive) {
      throw new Error("Recursive Sandbox file removal requires explicit policy");
    }
    runtime.files.delete(path);
    for (const descendant of descendants) runtime.files.delete(descendant);
  }

  async exposePort(request: {
    sandboxId: string;
    providerHandle: string;
    port: number;
    visibility: "private" | "organization" | "public";
    expiresAt?: string;
  }): Promise<SandboxPortExposure> {
    const runtime = this.runtime(request);
    const exposureId = `sexp_${runtime.nextExposure++}`;
    const exposure: SandboxPortExposure = {
      exposureId,
      port: request.port,
      visibility: request.visibility,
      url: `https://sandbox.invalid/${request.sandboxId}/${exposureId}`,
      expiresAt: request.expiresAt ?? this.now(),
    };
    runtime.ports.set(exposureId, exposure);
    return { ...exposure };
  }

  async listPorts(request: {
    sandboxId: string;
    providerHandle: string;
  }): Promise<SandboxPortExposure[]> {
    return [...this.runtime(request).ports.values()].map((exposure) => ({ ...exposure }));
  }

  async revokePort(request: {
    sandboxId: string;
    providerHandle: string;
    exposureId: string;
  }): Promise<void> {
    this.runtime(request).ports.delete(request.exposureId);
  }

  async captureSnapshot(request: {
    sandboxId: string;
    providerHandle: string;
    snapshotId: string;
    capability: "filesystem" | "filesystem-memory";
  }): Promise<{ providerHandle: string; sizeBytes: number }> {
    if (request.capability !== "filesystem") {
      throw new Error("Hermetic provider supports filesystem snapshots only");
    }
    const sizeBytes = [...this.runtime(request).files.values()].reduce(
      (total, content) => total + content.byteLength,
      0,
    );
    return { providerHandle: `hermetic-snapshot:${request.snapshotId}`, sizeBytes };
  }

  private runtime(request: { sandboxId: string; providerHandle: string }): HermeticRuntime {
    const runtime = this.runtimes.get(request.sandboxId);
    if (!runtime || runtime.handle !== request.providerHandle) {
      throw new Error("Sandbox provider handle was not found");
    }
    return runtime;
  }

  private path(value: string): string {
    const path = SandboxWorkspacePath.create(value);
    if (path.isErr()) throw new Error("Sandbox path escaped the workspace");
    return path.value.value;
  }
}
