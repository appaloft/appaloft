import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import {
  DockerSandboxProvider,
  type SandboxDockerCommandRunner,
  type SandboxDockerCommandResult,
  type SandboxPortPublisher,
} from "../src/docker-sandbox-provider";

class CapturingRunner implements SandboxDockerCommandRunner {
  readonly calls: Array<{ argv: readonly string[]; stdin?: Uint8Array }> = [];
  runtimes = '{"io.containerd.runc.v2":{"path":"runc"},"runsc":{"path":"runsc"}}';
  resolvedPath: string | undefined;
  executionFailure: SandboxDockerCommandResult["failure"];

  async run(
    argv: readonly string[],
    input: { stdin?: Uint8Array; timeoutMs?: number } = {},
  ): Promise<SandboxDockerCommandResult> {
    this.calls.push({ argv: [...argv], ...(input.stdin ? { stdin: input.stdin.slice() } : {}) });
    const command = argv.join(" ");
    if (command.includes("info --format")) return this.result(this.runtimes);
    if (command.includes("network inspect --format")) return this.result("true\n");
    if (command.includes("realpath"))
      return this.result(`${this.resolvedPath ?? argv.at(-1)}\n`);
    if (command.includes("tar -C /workspace -cf -")) return this.result("archive");
    if (command.includes("inspect --format {{.Config.Image}}"))
      return this.result("python@sha256:abc123\n");
    if (command.includes("inspect --format") && !command.includes("image inspect"))
      return this.result("sbx_demo\n");
    if (command.includes("image inspect")) return this.result("4096\n");
    if (command.includes("exec -w") && !command.includes(" -d "))
      return {
        exitCode: 7,
        stdout: new TextEncoder().encode("out\n"),
        stderr: "err\n",
        ...(this.executionFailure ? { failure: this.executionFailure } : {}),
      };
    return this.result("");
  }

  private result(stdout: string): SandboxDockerCommandResult {
    return { exitCode: 0, stdout: new TextEncoder().encode(stdout), stderr: "" };
  }
}

const request = {
  sandboxId: "sbx_demo",
  source: { kind: "image" as const, image: "python@sha256:abc123" },
  requestedIsolation: "gvisor" as const,
  limits: {
    cpuMillis: 1_000,
    memoryBytes: 512 * 1024 * 1024,
    diskBytes: 2 * 1024 * 1024 * 1024,
    maxProcesses: 32,
  },
  networkPolicy: { mode: "deny" as const, rules: [] },
};

describe("DockerSandboxProvider", () => {
  test("[SBX-RUNTIME-002] provisions a constrained gVisor container without shell interpolation", async () => {
    const runner = new CapturingRunner();
    const provider = new DockerSandboxProvider({ isolation: "gvisor", runner });
    const provisioned = await provider.provision(request);

    expect(provisioned).toEqual({
      providerHandle: "appaloft-sbx_demo",
      realizedIsolation: "gvisor",
    });
    const create = runner.calls.find((call) => call.argv[1] === "create")?.argv;
    expect(create).toContain("runsc");
    expect(create).toContain("none");
    expect(create).toContain("no-new-privileges=true");
    expect(create).toContain("ALL");
    expect(create).toContain("/workspace:rw,nosuid,nodev,size=2048m");
    expect(create).not.toContain("--storage-opt");
    expect(create).toContain("python@sha256:abc123");
    expect(create).not.toContain("sh -lc");
    expect(provider.capabilities.ports).toBe(false);
  });

  test("[SBX-RUNTIME-004] refuses gVisor admission when runsc is unavailable", async () => {
    const runner = new CapturingRunner();
    runner.runtimes = '{"io.containerd.runc.v2":{"path":"runc"}}';
    const provider = new DockerSandboxProvider({ isolation: "gvisor", runner });

    expect(provider.provision(request)).rejects.toThrow("runsc");
    expect(runner.calls.some((call) => call.argv[1] === "create")).toBe(false);
  });

  test("[SBX-PORT-001] enables publishing only on a verified internal Docker network", async () => {
    const runner = new CapturingRunner();
    const exposed: unknown[] = [];
    const publisher: SandboxPortPublisher = {
      async expose(input) {
        exposed.push(input);
        return {
          exposureId: "sexp_1",
          port: input.port,
          visibility: input.visibility,
          url: "https://preview.example.test/signed",
          expiresAt: "2026-07-20T01:00:00.000Z",
        };
      },
      async list() {
        return [];
      },
      async revoke() {},
    };
    const provider = new DockerSandboxProvider({
      isolation: "gvisor",
      runner,
      internalNetwork: "appaloft-sandbox-internal",
      portPublisher: publisher,
    });
    await provider.provision(request);
    expect(provider.capabilities.ports).toBe(true);
    expect(runner.calls.find((call) => call.argv[1] === "create")?.argv).toContain(
      "appaloft-sandbox-internal",
    );
    expect(
      await provider.exposePort({
        sandboxId: "sbx_demo",
        providerHandle: "appaloft-sbx_demo",
        port: 3000,
        visibility: "private",
      }),
    ).toMatchObject({ exposureId: "sexp_1", port: 3000 });
    expect(exposed).toHaveLength(1);
  });

  test("[SBX-PROC-001] returns ordered stdout/stderr/exit frames from direct argv execution", async () => {
    const runner = new CapturingRunner();
    const provider = new DockerSandboxProvider({ isolation: "gvisor", runner });
    await provider.provision(request);
    const result = await provider.exec({
      sandboxId: "sbx_demo",
      providerHandle: "appaloft-sbx_demo",
      argv: ["python", "-c", "print('hello')"],
      cwd: "src",
    });

    expect(result).toEqual({
      mode: "foreground",
      frames: [
        { kind: "stdout", sequence: 1, data: "out\n" },
        { kind: "stderr", sequence: 2, data: "err\n" },
        { kind: "exit", sequence: 3, exitCode: 7 },
      ],
    });
    expect(runner.calls.at(-1)?.argv).toEqual(
      expect.arrayContaining([
        "docker",
        "exec",
        "-w",
        "/workspace/src",
        "appaloft-sbx_demo",
        "appaloft-foreground",
        "python",
        "-c",
        "print('hello')",
      ]),
    );

    runner.executionFailure = "timeout";
    const timedOut = await provider.exec({
      sandboxId: "sbx_demo",
      providerHandle: "appaloft-sbx_demo",
      argv: ["sleep", "60"],
      timeoutMs: 10,
    });
    expect(timedOut.mode).toBe("foreground");
    if (timedOut.mode === "foreground") {
      expect(timedOut.frames.at(-1)).toMatchObject({
        kind: "error",
        code: "sandbox_exec_timeout",
        retryable: false,
      });
    }
  });

  test("[SBX-FILE-003] revalidates handles and paths before Docker mutation", async () => {
    const runner = new CapturingRunner();
    const provider = new DockerSandboxProvider({ isolation: "gvisor", runner });
    await provider.provision(request);
    const before = runner.calls.length;

    expect(
      provider.writeFile({
        sandboxId: "sbx_demo",
        providerHandle: "customer-container",
        path: "safe.txt",
        content: new Uint8Array([1]),
      }),
    ).rejects.toThrow("handle");
    expect(runner.calls).toHaveLength(before);
    expect(
      provider.writeFile({
        sandboxId: "sbx_demo",
        providerHandle: "appaloft-sbx_demo",
        path: "../host-secret",
        content: new Uint8Array([1]),
      }),
    ).rejects.toThrow("workspace");
    expect(runner.calls.at(-1)?.argv[1]).toBe("inspect");

    runner.resolvedPath = "/etc/passwd";
    expect(
      provider.readFile({
        sandboxId: "sbx_demo",
        providerHandle: "appaloft-sbx_demo",
        path: "workspace-link",
      }),
    ).rejects.toThrow("symbolic link");
  });

  test("[SBX-SNAPSHOT-001] captures a named Docker image and returns observed size", async () => {
    const runner = new CapturingRunner();
    const provider = new DockerSandboxProvider({ isolation: "gvisor", runner });
    await provider.provision(request);

    expect(
      await provider.captureSnapshot({
        sandboxId: "sbx_demo",
        providerHandle: "appaloft-sbx_demo",
        snapshotId: "ssn_demo",
        capability: "filesystem",
      }),
    ).toEqual({
      providerHandle: "appaloft-sandbox-snapshot:ssn_demo",
      sizeBytes: 4096,
    });
    const helperCreate = runner.calls.find(
      (call) => call.argv[1] === "create" && call.argv.includes("appaloft.snapshot.id=ssn_demo"),
    );
    expect(helperCreate?.argv).not.toContain("--mount");
    const restoreArchive = runner.calls.find(
      (call) =>
        call.argv[1] === "exec" &&
        call.argv.some((part) => part.includes("appaloft-snapshot-workspace")),
    );
    expect(restoreArchive?.stdin).toBeDefined();
  });
});
