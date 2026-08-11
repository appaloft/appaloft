import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import {
  DockerSandboxProvider,
  type SandboxDockerCommandRunner,
  type SandboxDockerCommandResult,
  type SandboxEgressPolicyAdapter,
  type SandboxPortPublisher,
} from "../src/docker-sandbox-provider";

class CapturingRunner implements SandboxDockerCommandRunner {
  readonly calls: Array<{ argv: readonly string[]; stdin?: Uint8Array }> = [];
  readonly terminalCalls: Array<{
    argv: readonly string[];
    initialRows: number;
    initialCols: number;
  }> = [];
  readonly terminalWrites: Uint8Array[] = [];
  runtimes = '{"io.containerd.runc.v2":{"path":"runc"},"runsc":{"path":"runsc"}}';
  resolvedPath: string | undefined;
  executionFailure: SandboxDockerCommandResult["failure"];
  failureCommandIncludes: string | undefined;
  concurrentRemoval = false;
  concurrentRemovalLeavesContainer = false;
  concurrentRemovalStarted = false;
  concurrentRemovalReadbacksBeforeAbsent = 0;
  concurrentRemovalReadbacks = 0;
  inventory = "";
  processSnapshot = "";
  portableRecoveryDigest = "b".repeat(64);
  snapshotImageIdentity = "ssn_demo|sbx_demo";

  async run(
    argv: readonly string[],
    input: { stdin?: Uint8Array; timeoutMs?: number } = {},
  ): Promise<SandboxDockerCommandResult> {
    this.calls.push({ argv: [...argv], ...(input.stdin ? { stdin: input.stdin.slice() } : {}) });
    const command = argv.join(" ");
    if (
      this.concurrentRemoval &&
      argv[0] === "docker" &&
      argv[1] === "rm" &&
      argv.includes("appaloft-sbx_demo")
    ) {
      this.concurrentRemovalStarted = true;
      return {
        exitCode: 1,
        stdout: new Uint8Array(),
        stderr:
          "Error response from daemon: removal of container appaloft-sbx_demo is already in progress",
      };
    }
    if (
      this.concurrentRemovalStarted &&
      !this.concurrentRemovalLeavesContainer &&
      command.includes("docker inspect --format")
    ) {
      this.concurrentRemovalReadbacks += 1;
      if (this.concurrentRemovalReadbacks <= this.concurrentRemovalReadbacksBeforeAbsent) {
        return this.result("sbx_demo\n");
      }
      return {
        exitCode: 1,
        stdout: new Uint8Array(),
        stderr: "Error: No such object: appaloft-sbx_demo",
      };
    }
    if (this.failureCommandIncludes && command.includes(this.failureCommandIncludes)) {
      return {
        exitCode: 1,
        stdout: new Uint8Array(),
        stderr: "injected worker failure",
      };
    }
    if (command.includes("info --format")) return this.result(this.runtimes);
    if (command.includes("network inspect --format")) return this.result("true\n");
    if (command.includes("ps -a --filter")) return this.result(this.inventory);
    if (command.includes("for f in /workspace/.appaloft-process-spr_*.pid")) {
      return this.result(this.processSnapshot);
    }
    if (command.includes("realpath"))
      return this.result(`${this.resolvedPath ?? argv.at(-1)}\n`);
    if (command.includes("tar -C /workspace -cf -")) return this.result("archive");
    if (command.startsWith("sha256sum --")) {
      return this.result(`${this.portableRecoveryDigest}  ${argv.at(-1)}\n`);
    }
    if (
      command.includes("appaloft.sandbox.base-image") &&
      !command.includes("image inspect")
    )
      return this.result("\n");
    if (command.includes("inspect --format {{.Image}}"))
      return this.result(`sha256:${"a".repeat(64)}\n`);
    if (command.includes("inspect --format") && !command.includes("image inspect")) {
      if (command.includes("appaloft.sandbox.owner")) return this.result("tenant_a\n");
      if (command.includes("appaloft.sandbox.egress")) return this.result("allowlist\n");
      return this.result("sbx_demo\n");
    }
    if (
      command.includes("image inspect") &&
      command.includes("appaloft.hibernate.sandbox")
    )
      return this.result("sbx_demo\n");
    if (
      command.includes("image inspect") &&
      command.includes("appaloft.sandbox.base-image")
    )
      return this.result(`sha256:${"a".repeat(64)}\n`);
    if (
      command.includes("image inspect") &&
      command.includes("appaloft.snapshot.id") &&
      command.includes("appaloft.snapshot.source-sandbox")
    )
      return this.result(`${this.snapshotImageIdentity}\n`);
    if (command.includes("image inspect")) return this.result("4096\n");
    if (argv[1] === "exec" && argv.includes("-w") && !argv.includes("-d"))
      return {
        exitCode: 7,
        stdout: new TextEncoder().encode("out\n"),
        stderr: "err\n",
        ...(this.executionFailure ? { failure: this.executionFailure } : {}),
      };
    return this.result("");
  }

  async openTerminal(
    argv: readonly string[],
    input: { initialRows: number; initialCols: number },
  ) {
    this.terminalCalls.push({
      argv: [...argv],
      initialRows: input.initialRows,
      initialCols: input.initialCols,
    });
    return {
      stdin: {
        write: (data: string | Uint8Array) => {
          this.terminalWrites.push(
            typeof data === "string" ? new TextEncoder().encode(data) : data.slice(),
          );
        },
        end() {},
      },
      stdout: null,
      stderr: null,
      exited: new Promise<number>(() => {}),
      kill() {},
    };
  }

  private result(stdout: string): SandboxDockerCommandResult {
    return { exitCode: 0, stdout: new TextEncoder().encode(stdout), stderr: "" };
  }
}

const request = {
  sandboxId: "sbx_demo",
  ownerScope: "tenant_a",
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
  test("[TERM-SESSION-SANDBOX-001][SBX-RUNTIME-005] opens the managed container shell with a Workspace-scoped home", async () => {
    const runner = new CapturingRunner();
    const provider = new DockerSandboxProvider({ isolation: "gvisor", runner });
    await provider.provision(request);

    await provider.openTerminal({
      sandboxId: "sbx_demo",
      providerHandle: "appaloft-sbx_demo",
      cwd: "src",
      initialRows: 32,
      initialCols: 120,
    });

    expect(runner.terminalCalls).toEqual([
      {
        argv: [
          "docker",
          "exec",
          "-it",
          "-e",
          "HOME=/workspace",
          "-e",
          "XDG_DATA_HOME=/workspace/.local/share",
          "-e",
          "XDG_CONFIG_HOME=/workspace/.config",
          "-e",
          "XDG_STATE_HOME=/workspace/.local/state",
          "-e",
          "XDG_CACHE_HOME=/workspace/.cache",
          "-w",
          "/workspace/src",
          "appaloft-sbx_demo",
          "sh",
          "-lc",
          expect.stringContaining("exec bash"),
        ],
        initialRows: 32,
        initialCols: 120,
      },
    ]);
  });

  test("[ADAPTER-CRED-006] opens an exact terminal child from echo-disabled ephemeral input", async () => {
    const runner = new CapturingRunner();
    const provider = new DockerSandboxProvider({ isolation: "gvisor", runner });
    await provider.provision(request);
    const initialInput = new TextEncoder().encode(
      "export OPENAI_API_KEY='model-secret-value'\nstty echo\nexec \"$@\"\n",
    );

    await provider.openTerminal({
      sandboxId: "sbx_demo",
      providerHandle: "appaloft-sbx_demo",
      cwd: ".",
      initialRows: 24,
      initialCols: 80,
      process: {
        argv: ["codex", "exec"],
        initialInput,
      },
    });

    expect(runner.terminalCalls[0]?.argv).toEqual([
      "docker",
      "exec",
      "-it",
      "-e",
      "HOME=/workspace",
      "-e",
      "XDG_DATA_HOME=/workspace/.local/share",
      "-e",
      "XDG_CONFIG_HOME=/workspace/.config",
      "-e",
      "XDG_STATE_HOME=/workspace/.local/state",
      "-e",
      "XDG_CACHE_HOME=/workspace/.cache",
      "-w",
      "/workspace",
      "appaloft-sbx_demo",
      "sh",
      "-c",
      expect.stringContaining("stty -echo"),
      "appaloft-managed-terminal",
      "codex",
      "exec",
    ]);
    expect(JSON.stringify(runner.terminalCalls[0]?.argv)).not.toContain("model-secret-value");
    expect(new TextDecoder().decode(runner.terminalWrites[0])).toContain("model-secret-value");
  });

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

  test("[SBX-RECONCILE-001] inventories and removes only an exactly owned runtime", async () => {
    const runner = new CapturingRunner();
    runner.inventory = "appaloft-sbx_demo\tsbx_demo\ttenant_a\n";
    const provider = new DockerSandboxProvider({ isolation: "gvisor", runner });
    await provider.provision(request);

    expect(await provider.listOwnedRuntimes({ ownerScope: "tenant_a", limit: 10 })).toEqual({
      items: [
        {
          ownerScope: "tenant_a",
          sandboxId: "sbx_demo",
          providerHandle: "appaloft-sbx_demo",
        },
      ],
    });
    await provider.removeOwnedRuntime({
      ownerScope: "tenant_a",
      sandboxId: "sbx_demo",
      providerHandle: "appaloft-sbx_demo",
    });

    expect(runner.calls.find((call) => call.argv[1] === "create")?.argv).toContain(
      "appaloft.sandbox.owner=tenant_a",
    );
    expect(runner.calls.some((call) => call.argv.includes("label=appaloft.sandbox.owner=tenant_a"))).toBe(
      true,
    );
    expect(runner.calls.at(-1)?.argv).toEqual([
      "docker",
      "rm",
      "-f",
      "appaloft-sbx_demo",
    ]);
  });

  test("[SBX-PORT-001] enables publishing only on a verified internal Docker network", async () => {
    const runner = new CapturingRunner();
    const exposed: unknown[] = [];
    const revoked: unknown[] = [];
    const exposure = {
      exposureId: "sexp_1",
      port: 3000,
      visibility: "private" as const,
      url: "https://preview.example.test/signed",
      expiresAt: "2026-07-20T01:00:00.000Z",
    };
    const publisher: SandboxPortPublisher = {
      async expose(input) {
        exposed.push(input);
        return { ...exposure, port: input.port, visibility: input.visibility };
      },
      async list() {
        return [exposure];
      },
      async revoke(input) {
        revoked.push(input);
      },
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
    await provider.terminate({
      sandboxId: "sbx_demo",
      providerHandle: "appaloft-sbx_demo",
    });
    expect(revoked).toEqual([
      {
        sandboxId: "sbx_demo",
        containerName: "appaloft-sbx_demo",
        exposureId: "sexp_1",
      },
    ]);
  });

  test("[SBX-PORT-001] retries external-access cleanup after the managed container is gone", async () => {
    const runner = new CapturingRunner();
    runner.failureCommandIncludes = "docker inspect --format";
    const revoked: unknown[] = [];
    const provider = new DockerSandboxProvider({
      isolation: "gvisor",
      runner,
      internalNetwork: "appaloft-sandbox-internal",
      egressPolicy: {
        async configure() {
          return { proxyUrl: "http://sandbox-gateway:8789" };
        },
        async revoke(input) {
          revoked.push(input);
        },
      },
    });

    await provider.terminate({
      sandboxId: "sbx_demo",
      providerHandle: "appaloft-sbx_demo",
    });

    expect(revoked).toEqual([
      {
        sandboxId: "sbx_demo",
        containerName: "appaloft-sbx_demo",
      },
    ]);
    expect(
      runner.calls.some(
        (call) =>
          call.argv[0] === "docker" &&
          call.argv[1] === "rm" &&
          call.argv.includes("appaloft-sbx_demo"),
      ),
    ).toBe(false);
  });

  test("[SBX-RUNTIME-006] converges after a concurrent removal outlives three ownership readbacks", async () => {
    const runner = new CapturingRunner();
    runner.concurrentRemoval = true;
    runner.concurrentRemovalReadbacksBeforeAbsent = 5;
    const delays: number[] = [];
    const provider = new DockerSandboxProvider({
      isolation: "gvisor",
      runner,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
    });
    await provider.provision(request);

    await provider.terminate({
      sandboxId: "sbx_demo",
      providerHandle: "appaloft-sbx_demo",
    });

    expect(runner.concurrentRemovalStarted).toBe(true);
    expect(runner.concurrentRemovalReadbacks).toBe(6);
    expect(delays).toEqual([250, 250, 250, 250, 250]);
  });

  test("[SBX-RUNTIME-006] fails closed when a concurrent-removal response leaves the container present", async () => {
    const runner = new CapturingRunner();
    runner.concurrentRemoval = true;
    runner.concurrentRemovalLeavesContainer = true;
    const delays: number[] = [];
    const provider = new DockerSandboxProvider({
      isolation: "gvisor",
      runner,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
    });
    await provider.provision(request);

    await expect(
      provider.terminate({
        sandboxId: "sbx_demo",
        providerHandle: "appaloft-sbx_demo",
      }),
    ).rejects.toThrow("removal of container appaloft-sbx_demo is already in progress");
    expect(delays).toHaveLength(19);
  });

  test("[AGENT-WS-EGRESS-019] injects only a scoped proxy env file and revokes it with the Sandbox", async () => {
    const runner = new CapturingRunner();
    const configured: unknown[] = [];
    const revoked: unknown[] = [];
    const egressPolicy: SandboxEgressPolicyAdapter = {
      async configure(input) {
        configured.push(input);
        return {
          proxyUrl: "http://seg_demo:scoped-token@sandbox-gateway:8789",
          noProxy: ["sandbox-gateway"],
        };
      },
      async revoke(input) {
        revoked.push(input);
      },
    };
    const provider = new DockerSandboxProvider({
      isolation: "gvisor",
      runner,
      internalNetwork: "appaloft-sandbox-internal",
      egressPolicy,
    });
    const allowlist = {
      ...request,
      networkPolicy: {
        mode: "allowlist" as const,
        rules: [{ kind: "domain" as const, value: "github.com", ports: [443] }],
      },
    };

    await provider.provision(allowlist);
    expect(provider.capabilities.networkPolicy).toEqual(["deny", "allowlist"]);
    expect(configured).toEqual([
      {
        sandboxId: "sbx_demo",
        containerName: "appaloft-sbx_demo",
        networkPolicy: allowlist.networkPolicy,
      },
    ]);
    const envWrite = runner.calls.find((call) => call.argv[0] === "dd");
    expect(new TextDecoder().decode(envWrite?.stdin)).toContain(
      "HTTPS_PROXY=http://seg_demo:scoped-token@sandbox-gateway:8789",
    );
    const create = runner.calls.find((call) => call.argv[1] === "create")?.argv ?? [];
    expect(create).toContain("appaloft-sandbox-internal");
    expect(create).toContain("--env-file");
    expect(create.join(" ")).not.toContain("scoped-token");
    expect(
      runner.calls.some(
        (call) =>
          call.argv[0] === "rm" &&
          call.argv[1] === "-f" &&
          call.argv[2] === "--",
      ),
    ).toBe(true);

    await provider.updateNetworkPolicy({
      sandboxId: "sbx_demo",
      providerHandle: "appaloft-sbx_demo",
      networkPolicy: {
        mode: "allowlist",
        rules: [{ kind: "domain", value: "registry.npmjs.org", ports: [443] }],
      },
    });
    expect(configured).toHaveLength(2);

    await provider.terminate({
      sandboxId: "sbx_demo",
      providerHandle: "appaloft-sbx_demo",
    });
    expect(revoked).toEqual([
      {
        sandboxId: "sbx_demo",
        containerName: "appaloft-sbx_demo",
      },
    ]);
  });

  test("[AGENT-WS-EGRESS-019] removes the container and revokes egress when transient secret cleanup fails", async () => {
    const runner = new CapturingRunner();
    runner.failureCommandIncludes = "rm -f -- /var/tmp/appaloft-sandbox-env/";
    const revoked: unknown[] = [];
    const provider = new DockerSandboxProvider({
      isolation: "gvisor",
      runner,
      internalNetwork: "appaloft-sandbox-internal",
      egressPolicy: {
        async configure() {
          return { proxyUrl: "http://seg_demo:scoped-token@sandbox-gateway:8789" };
        },
        async revoke(input) {
          revoked.push(input);
        },
      },
    });

    await expect(
      provider.provision({
        ...request,
        networkPolicy: {
          mode: "allowlist",
          rules: [{ kind: "domain", value: "github.com", ports: [443] }],
        },
      }),
    ).rejects.toThrow("cleanup was incomplete");
    expect(
      runner.calls.some(
        (call) =>
          call.argv[0] === "docker" &&
          call.argv[1] === "rm" &&
          call.argv.includes("appaloft-sbx_demo"),
      ),
    ).toBe(true);
    expect(revoked).toEqual([
      { sandboxId: "sbx_demo", containerName: "appaloft-sbx_demo" },
    ]);
  });

  test("[SBX-PROC-001][SBX-EXEC-STDIN-001][SBX-RUNTIME-005] attaches foreground stdin with a Workspace-scoped home", async () => {
    const runner = new CapturingRunner();
    const provider = new DockerSandboxProvider({ isolation: "gvisor", runner });
    await provider.provision(request);
    const result = await provider.exec({
      sandboxId: "sbx_demo",
      providerHandle: "appaloft-sbx_demo",
      argv: ["python", "-c", "print('hello')"],
      cwd: "src",
      stdin: new TextEncoder().encode("input\n"),
    });

    expect(result).toEqual({
      mode: "foreground",
      frames: [
        { kind: "stdout", sequence: 1, data: "out\n" },
        { kind: "stderr", sequence: 2, data: "err\n" },
        { kind: "exit", sequence: 3, exitCode: 7 },
      ],
    });
    const foreground = runner.calls.at(-1);
    expect(foreground?.argv).toEqual(
      expect.arrayContaining([
        "docker",
        "exec",
        "-i",
        "-e",
        "HOME=/workspace",
        "-e",
        "XDG_DATA_HOME=/workspace/.local/share",
        "-e",
        "XDG_CONFIG_HOME=/workspace/.config",
        "-e",
        "XDG_STATE_HOME=/workspace/.local/state",
        "-e",
        "XDG_CACHE_HOME=/workspace/.cache",
        "-w",
        "/workspace/src",
        "appaloft-sbx_demo",
        "appaloft-foreground",
        "python",
        "-c",
        "print('hello')",
      ]),
    );
    expect(foreground?.stdin).toEqual(new TextEncoder().encode("input\n"));
    expect(foreground?.argv.join(" ")).not.toContain("input");

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
    runner.executionFailure = "output-limit";
    const bounded = await provider.exec({
      sandboxId: "sbx_demo",
      providerHandle: "appaloft-sbx_demo",
      argv: ["yes"],
    });
    expect(runner.calls.at(-1)?.argv).not.toContain("-i");
    expect(bounded.mode).toBe("foreground");
    if (bounded.mode === "foreground") {
      expect(bounded.frames.at(-1)).toMatchObject({
        kind: "error",
        code: "sandbox_exec_output_limit",
        retryable: false,
      });
    }
  });

  test("[SBX-PROC-001][SBX-RUNTIME-005] streams bounded launch input through a Workspace-scoped process home", async () => {
    const runner = new CapturingRunner();
    const provider = new DockerSandboxProvider({ isolation: "gvisor", runner });
    await provider.provision(request);
    const secret = new TextEncoder().encode("scoped-launch-secret\n");
    const result = await provider.exec({
      sandboxId: "sbx_demo",
      providerHandle: "appaloft-sbx_demo",
      argv: ["agent-server", "serve"],
      background: true,
      stdin: secret,
    });

    expect(result).toMatchObject({ mode: "background" });
    const launch = runner.calls.find((call) => call.argv.includes("-d"));
    const delivered = runner.calls.at(-1);
    expect(launch?.argv).not.toContain("-i");
    expect(launch?.argv).toEqual(
      expect.arrayContaining([
        "-e",
        "HOME=/workspace",
        "XDG_DATA_HOME=/workspace/.local/share",
        "XDG_CONFIG_HOME=/workspace/.config",
        "XDG_STATE_HOME=/workspace/.local/state",
        "XDG_CACHE_HOME=/workspace/.cache",
      ]),
    );
    expect(launch?.argv.join(" ")).toContain('wait "$child"');
    expect(launch?.argv.join(" ")).toContain('exec setsid --wait "$@"');
    expect(launch?.argv.join(" ")).toContain('rm -f -- "$pid_file" "$input_pipe"');
    expect(delivered?.argv).toContain("-i");
    expect(runner.calls.every((call) => !call.argv.join(" ").includes("scoped-launch-secret"))).toBe(
      true,
    );
    expect(new TextDecoder().decode(delivered?.stdin)).toBe("scoped-launch-secret\n");
  });

  test("[SBX-PROC-001] cleans up a detached process when private input delivery fails", async () => {
    const runner = new CapturingRunner();
    const provider = new DockerSandboxProvider({ isolation: "gvisor", runner });
    await provider.provision(request);
    runner.failureCommandIncludes = "cat >";

    expect(
      provider.exec({
        sandboxId: "sbx_demo",
        providerHandle: "appaloft-sbx_demo",
        argv: ["agent-server", "serve"],
        background: true,
        stdin: new TextEncoder().encode("bounded-input\n"),
      }),
    ).rejects.toThrow("injected worker failure");
    expect(runner.calls.at(-1)?.argv.join(" ")).toContain("appaloft-background-cleanup");
  });

  test("[SBX-PROC-001] terminates the complete background process group idempotently", async () => {
    const runner = new CapturingRunner();
    const provider = new DockerSandboxProvider({ isolation: "gvisor", runner });
    await provider.provision(request);
    const started = await provider.exec({
      sandboxId: "sbx_demo",
      providerHandle: "appaloft-sbx_demo",
      argv: ["agent", "run"],
      background: true,
    });
    expect(started.mode).toBe("background");
    if (started.mode !== "background") throw new Error("expected background process");
    expect(runner.calls.findLast((call) => call.argv.includes("-d"))?.argv.join(" ")).toContain(
      'exec setsid --wait "$@"',
    );

    await provider.terminateProcess({
      sandboxId: "sbx_demo",
      providerHandle: "appaloft-sbx_demo",
      processId: started.processId,
    });

    const terminated = runner.calls.at(-1)?.argv.join(" ") ?? "";
    expect(terminated).toContain('kill -TERM "-$pid"');
    expect(terminated).toContain('kill -KILL "-$pid"');
    expect(terminated).toContain('kill "$pid" 2>/dev/null || true');
    expect(terminated).toContain('rm -f -- "$1" "$2"');
  });

  test("[#1051][SBX-PROC-001][AGENT-WS-OPEN-008] snapshots stale, live and terminal background processes in one container command", async () => {
    const runner = new CapturingRunner();
    runner.processSnapshot = [
      "pid:spr_stale.pid:41:exited",
      "pid:spr_live.pid:42:running",
      "exit:spr_done.exit:7:failed",
    ].join("\n");
    const provider = new DockerSandboxProvider({ isolation: "gvisor", runner });
    await provider.provision(request);

    expect(
      await provider.listProcesses({
        sandboxId: "sbx_demo",
        providerHandle: "appaloft-sbx_demo",
      }),
    ).toEqual([
      { processId: "spr_stale", status: "exited" },
      { processId: "spr_live", status: "running" },
      { processId: "spr_done", status: "failed", exitCode: 7 },
    ]);

    const livenessSnapshots = runner.calls.filter((call) =>
      call.argv.join(" ").includes("kill -0"),
    );
    expect(livenessSnapshots).toHaveLength(1);
    expect(livenessSnapshots[0]?.argv.join(" ")).toContain(
      'exit_file="/workspace/.appaloft-process-${process_id}.exit"',
    );
    expect(livenessSnapshots[0]?.argv.join(" ")).toContain(
      'printf \'pid:%s:%s:running\\n\'',
    );
    expect(livenessSnapshots[0]?.argv.join(" ")).toContain(
      'printf \'exit:%s:%s:%s\\n\'',
    );
    const exitCleanup = runner.calls.find((call) =>
      call.argv.includes("/workspace/.appaloft-process-spr_done.exit"),
    );
    expect(exitCleanup?.argv).toEqual([
      "docker",
      "exec",
      "appaloft-sbx_demo",
      "rm",
      "-f",
      "/workspace/.appaloft-process-spr_done.exit",
    ]);
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

  test("[AGENT-TASK-RESUME-002][SBX-FILE-004] replaces files atomically inside the workspace", async () => {
    const runner = new CapturingRunner();
    const provider = new DockerSandboxProvider({ isolation: "gvisor", runner });
    await provider.provision(request);
    const content = new TextEncoder().encode('{"status":"awaiting-approval"}');

    await provider.writeFile({
      sandboxId: "sbx_demo",
      providerHandle: "appaloft-sbx_demo",
      path: ".appaloft/tasks/srun_demo/state.json",
      content,
    });

    const write = runner.calls.at(-1);
    expect(write?.stdin).toEqual(content);
    const commandIndex = write?.argv.indexOf("-c") ?? -1;
    const script = commandIndex >= 0 ? (write?.argv[commandIndex + 1] ?? "") : "";
    expect(script).toContain('mktemp "$directory/.appaloft-write.XXXXXX"');
    expect(script).toContain('trap cleanup EXIT HUP INT TERM');
    expect(script).toContain('cat > "$temporary"');
    expect(script).toContain('chmod "$(stat -c %a "$destination")" "$temporary"');
    expect(script).toContain('mv -f -- "$temporary" "$destination"');
    expect(script).toContain("trap - EXIT HUP INT TERM");
    expect(script).not.toContain('cat > "$1"');
    expect(script.indexOf('cat > "$temporary"')).toBeLessThan(
      script.indexOf('mv -f -- "$temporary" "$destination"'),
    );
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
      portability: "provider-local",
    });
    const helperCreate = runner.calls.find(
      (call) => call.argv[1] === "create" && call.argv.includes("appaloft.snapshot.id=ssn_demo"),
    );
    expect(helperCreate?.argv).not.toContain("--mount");
    expect(helperCreate?.argv).toContain(
      `appaloft.sandbox.base-image=sha256:${"a".repeat(64)}`,
    );
    const workspaceTransfer = runner.calls.find(
      (call) =>
        call.argv[0] === "sh" &&
        call.argv[1] === "-c" &&
        call.argv.some((part) => part.includes("tar -C /workspace")),
    );
    expect(workspaceTransfer?.argv.join(" ")).toContain(
      "docker exec appaloft-sbx_demo tar -C /workspace -cf - .",
    );
    expect(workspaceTransfer?.argv.join(" ")).toContain(
      "docker exec -i appaloft-sbx_demo-snapshot-ssn_demo",
    );
    expect(workspaceTransfer?.argv.join(" ")).toContain(
      "rm -rf /appaloft-snapshot-workspace",
    );
  });

  test("[HIB-DOCKER-001][HIB-DOCKER-002][SBX-RUNTIME-005] releases compute and restores Workspace-scoped process state", async () => {
    const runner = new CapturingRunner();
    const provider = new DockerSandboxProvider({ isolation: "gvisor", runner });
    const provisioned = await provider.provision(request);

    const paused = await provider.pause({
      sandboxId: "sbx_demo",
      providerHandle: provisioned.providerHandle,
    });
    expect(paused).toEqual({
      providerHandle: "appaloft-sandbox-hibernate:sbx_demo",
    });
    expect(provider.capabilities.pause).toEqual({
      mode: "compute-released",
      portability: "provider-local",
    });
    expect(
      runner.calls.some(
        (call) =>
          call.argv[1] === "create" &&
          call.argv.includes("appaloft.hibernate.sandbox=sbx_demo"),
      ),
    ).toBe(true);
    expect(
      runner.calls.some(
        (call) =>
          call.argv.join(" ") === "docker rm -f appaloft-sbx_demo",
      ),
    ).toBe(true);

    const resumed = await provider.resume({
      ...request,
      providerHandle: paused.providerHandle,
    });
    expect(resumed).toEqual({
      providerHandle: "appaloft-sbx_demo",
      realizedIsolation: "gvisor",
    });
    const restoredCreate = runner.calls
      .filter((call) => call.argv[1] === "create")
      .find((call) => call.argv.includes(`sha256:${"a".repeat(64)}`));
    expect(restoredCreate?.argv).toBeDefined();
    expect(
      runner.calls.some(
        (call) =>
          call.argv[0] === "sh" &&
          call.argv[1] === "-c" &&
          call.argv.join(" ").includes(
            "tar -C /appaloft-snapshot-workspace -cf - .",
          ),
      ),
    ).toBe(true);
    expect(
      runner.calls.some(
        (call) =>
          call.argv.join(" ") ===
          "docker image rm appaloft-sandbox-hibernate:sbx_demo",
      ),
    ).toBe(true);

    await provider.exec({
      sandboxId: "sbx_demo",
      providerHandle: resumed.providerHandle,
      argv: ["sh", "-c", "test \"$HOME\" = /workspace"],
    });
    const resumedExec = runner.calls.at(-1)?.argv ?? [];
    expect(resumedExec).toEqual(
      expect.arrayContaining([
        "-e",
        "HOME=/workspace",
        "XDG_DATA_HOME=/workspace/.local/share",
        "XDG_CONFIG_HOME=/workspace/.config",
        "XDG_STATE_HOME=/workspace/.local/state",
        "XDG_CACHE_HOME=/workspace/.cache",
      ]),
    );
  });

  test("[HIB-DOCKER-003] terminates provider-local recovery idempotently", async () => {
    const runner = new CapturingRunner();
    const provider = new DockerSandboxProvider({ isolation: "gvisor", runner });

    await provider.terminate({
      sandboxId: "sbx_demo",
      providerHandle: "appaloft-sandbox-hibernate:sbx_demo",
    });
    expect(
      runner.calls.some(
        (call) =>
          call.argv.join(" ") ===
          "docker image rm appaloft-sandbox-hibernate:sbx_demo",
      ),
    ).toBe(true);
  });

  test("[PORT-REC-001][PORT-REC-002] restores through a shared recovery store", async () => {
    const sourceRunner = new CapturingRunner();
    const source = new DockerSandboxProvider({
      key: "server-a",
      isolation: "gvisor",
      runner: sourceRunner,
      portableRecovery: {
        kind: "shared-filesystem",
        rootPath: "/mnt/appaloft-recovery",
        storeId: "shared-a",
      },
    });
    const provisioned = await source.provision(request);
    const paused = await source.pause({
      sandboxId: request.sandboxId,
      providerHandle: provisioned.providerHandle,
    });

    expect(source.capabilities.pause).toEqual({
      mode: "compute-released",
      portability: "provider-family",
      recoveryFamily: expect.stringMatching(/^docker-workspace-tar-v1:[0-9a-f]{32}$/),
    });
    expect(JSON.stringify(source.capabilities)).not.toContain("shared-a");
    expect(paused.providerHandle).toStartWith("appaloft-docker-recovery:v1:");
    const savedPackage = sourceRunner.calls.find((call) => call.argv[1] === "save")?.argv[3];
    expect(savedPackage).toMatch(
      /^\/mnt\/appaloft-recovery\/v1\/sbx_demo-pr_[0-9a-f]{32}\.tar\.partial$/,
    );
    expect(
      sourceRunner.calls.some(
        (call) =>
          call.argv.join(" ") ===
          "docker image rm appaloft-sandbox-hibernate:sbx_demo",
      ),
    ).toBe(true);

    const targetRunner = new CapturingRunner();
    const target = new DockerSandboxProvider({
      key: "server-b",
      isolation: "gvisor",
      runner: targetRunner,
      portableRecovery: {
        kind: "shared-filesystem",
        rootPath: "/mnt/appaloft-recovery",
        storeId: "shared-a",
      },
    });
    expect(target.capabilities.pause).toEqual(source.capabilities.pause);
    expect(await target.resume({ ...request, providerHandle: paused.providerHandle })).toEqual({
      providerHandle: "appaloft-sbx_demo",
      realizedIsolation: "gvisor",
    });
    expect(
      targetRunner.calls.some(
        (call) =>
          call.argv.join(" ") ===
          `docker load --input ${savedPackage?.replace(/\.partial$/, "")}`,
      ),
    ).toBe(true);
    expect(
      targetRunner.calls.some(
        (call) =>
          call.argv.join(" ") ===
          `rm -f -- ${savedPackage?.replace(/\.partial$/, "")}`,
      ),
    ).toBe(true);
  });

  test("[PORT-REC-004] rejects a corrupt portable package before Docker load", async () => {
    const sourceRunner = new CapturingRunner();
    const source = new DockerSandboxProvider({
      isolation: "gvisor",
      runner: sourceRunner,
      portableRecovery: {
        kind: "shared-filesystem",
        rootPath: "/mnt/appaloft-recovery",
        storeId: "shared-a",
      },
    });
    const provisioned = await source.provision(request);
    const paused = await source.pause({
      sandboxId: request.sandboxId,
      providerHandle: provisioned.providerHandle,
    });
    const targetRunner = new CapturingRunner();
    targetRunner.portableRecoveryDigest = "c".repeat(64);
    const target = new DockerSandboxProvider({
      isolation: "gvisor",
      runner: targetRunner,
      portableRecovery: {
        kind: "shared-filesystem",
        rootPath: "/mnt/appaloft-recovery",
        storeId: "shared-a",
      },
    });

    expect(target.resume({ ...request, providerHandle: paused.providerHandle })).rejects.toThrow(
      "digest",
    );
    expect(targetRunner.calls.some((call) => call.argv[1] === "load")).toBe(false);
    expect(
      targetRunner.calls.some(
        (call) =>
          call.argv.join(" ") ===
          "rm -f -- /mnt/appaloft-recovery/v1/sbx_demo.tar",
      ),
    ).toBe(false);
  });

  test("[PORT-REC-005] terminates one exact portable recovery package", async () => {
    const runner = new CapturingRunner();
    const provider = new DockerSandboxProvider({
      isolation: "gvisor",
      runner,
      portableRecovery: {
        kind: "shared-filesystem",
        rootPath: "/mnt/appaloft-recovery",
        storeId: "shared-a",
      },
    });
    const provisioned = await provider.provision(request);
    const paused = await provider.pause({
      sandboxId: request.sandboxId,
      providerHandle: provisioned.providerHandle,
    });
    const savedPackage = runner.calls.find((call) => call.argv[1] === "save")?.argv[3];
    runner.calls.length = 0;

    await provider.terminate({
      sandboxId: request.sandboxId,
      providerHandle: paused.providerHandle,
    });
    expect(runner.calls[0]?.argv).toEqual([
      "rm",
      "-f",
      "--",
      savedPackage?.replace(/\.partial$/, "") as string,
    ]);
    expect(runner.calls.some((call) => call.argv.includes("/mnt/appaloft-recovery"))).toBe(false);
  });

  test("[SNAP-PORT-001][SNAP-PORT-002][SNAP-PORT-005] retains one portable Snapshot across repeated restores and exact deletion", async () => {
    const sourceRunner = new CapturingRunner();
    const source = new DockerSandboxProvider({
      key: "server-a",
      isolation: "gvisor",
      runner: sourceRunner,
      portableRecovery: {
        kind: "shared-filesystem",
        rootPath: "/mnt/appaloft-recovery",
        storeId: "shared-a",
      },
    });
    const provisioned = await source.provision(request);
    const snapshot = await source.captureSnapshot({
      sandboxId: request.sandboxId,
      providerHandle: provisioned.providerHandle,
      snapshotId: "ssn_demo",
      capability: "filesystem",
    });
    expect(snapshot.providerHandle).toStartWith("appaloft-docker-snapshot:v1:");
    expect(snapshot.sizeBytes).toBe(4096);
    expect(snapshot.portability).toBe("provider-family");
    expect(snapshot.recoveryFamily).toMatch(
      /^docker-workspace-tar-v1:[0-9a-f]{32}$/,
    );
    expect(source.capabilities.snapshotRecovery).toEqual({
      portability: "provider-family",
      recoveryFamily: snapshot.recoveryFamily,
    });
    const savedPackage = sourceRunner.calls
      .filter((call) => call.argv[1] === "save")
      .at(-1)?.argv[3];
    expect(savedPackage).toMatch(
      /^\/mnt\/appaloft-recovery\/v1\/snapshots\/ssn_demo-ps_[0-9a-f]{32}\.tar\.partial$/,
    );

    for (const sandboxId of ["sbx_restore_1", "sbx_restore_2"]) {
      const targetRunner = new CapturingRunner();
      const target = new DockerSandboxProvider({
        key: `target-${sandboxId}`,
        isolation: "gvisor",
        runner: targetRunner,
        portableRecovery: {
          kind: "shared-filesystem",
          rootPath: "/mnt/appaloft-recovery",
          storeId: "shared-a",
        },
      });
      await target.provision({
        ...request,
        sandboxId,
        source: {
          kind: "snapshot",
          providerHandle: snapshot.providerHandle,
          portability: snapshot.portability,
          ...(snapshot.recoveryFamily
            ? { recoveryFamily: snapshot.recoveryFamily }
            : {}),
        },
      });
      expect(
        targetRunner.calls.some(
          (call) =>
            call.argv.join(" ") ===
            `docker load --input ${savedPackage?.replace(/\.partial$/, "")}`,
        ),
      ).toBe(true);
      expect(
        targetRunner.calls.some(
          (call) =>
            call.argv.join(" ") ===
            `rm -f -- ${savedPackage?.replace(/\.partial$/, "")}`,
        ),
      ).toBe(false);
    }

    const deleteRunner = new CapturingRunner();
    const deletingProvider = new DockerSandboxProvider({
      key: "server-b",
      isolation: "gvisor",
      runner: deleteRunner,
      portableRecovery: {
        kind: "shared-filesystem",
        rootPath: "/mnt/appaloft-recovery",
        storeId: "shared-a",
      },
    });
    await deletingProvider.deleteSnapshot({
      snapshotId: "ssn_demo",
      providerHandle: snapshot.providerHandle,
    });
    expect(deleteRunner.calls[0]?.argv).toEqual([
      "rm",
      "-f",
      "--",
      savedPackage?.replace(/\.partial$/, "") as string,
    ]);
    expect(deleteRunner.calls.some((call) => call.argv.includes("/mnt/appaloft-recovery"))).toBe(
      false,
    );
  });

  test("[SNAP-PORT-004] rejects corrupt or wrongly owned reusable Snapshot packages without deleting them", async () => {
    const sourceRunner = new CapturingRunner();
    const source = new DockerSandboxProvider({
      key: "server-a",
      isolation: "gvisor",
      runner: sourceRunner,
      portableRecovery: {
        kind: "shared-filesystem",
        rootPath: "/mnt/appaloft-recovery",
        storeId: "shared-a",
      },
    });
    const provisioned = await source.provision(request);
    const snapshot = await source.captureSnapshot({
      sandboxId: request.sandboxId,
      providerHandle: provisioned.providerHandle,
      snapshotId: "ssn_demo",
      capability: "filesystem",
    });
    const packagePath = sourceRunner.calls
      .filter((call) => call.argv[1] === "save")
      .at(-1)?.argv[3]
      ?.replace(/\.partial$/, "");

    const corruptRunner = new CapturingRunner();
    corruptRunner.portableRecoveryDigest = "c".repeat(64);
    const corruptTarget = new DockerSandboxProvider({
      key: "server-b",
      isolation: "gvisor",
      runner: corruptRunner,
      portableRecovery: {
        kind: "shared-filesystem",
        rootPath: "/mnt/appaloft-recovery",
        storeId: "shared-a",
      },
    });
    await expect(
      corruptTarget.provision({
        ...request,
        sandboxId: "sbx_restore_corrupt",
        source: {
          kind: "snapshot",
          providerHandle: snapshot.providerHandle,
          portability: snapshot.portability,
          recoveryFamily: snapshot.recoveryFamily,
        },
      }),
    ).rejects.toThrow("digest");
    expect(corruptRunner.calls.some((call) => call.argv[1] === "load")).toBe(false);
    expect(
      corruptRunner.calls.some(
        (call) => call.argv.join(" ") === `rm -f -- ${packagePath}`,
      ),
    ).toBe(false);

    const ownershipRunner = new CapturingRunner();
    ownershipRunner.snapshotImageIdentity = "ssn_other|sbx_other";
    const ownershipTarget = new DockerSandboxProvider({
      key: "server-c",
      isolation: "gvisor",
      runner: ownershipRunner,
      portableRecovery: {
        kind: "shared-filesystem",
        rootPath: "/mnt/appaloft-recovery",
        storeId: "shared-a",
      },
    });
    await expect(
      ownershipTarget.provision({
        ...request,
        sandboxId: "sbx_restore_owner",
        source: {
          kind: "snapshot",
          providerHandle: snapshot.providerHandle,
          portability: snapshot.portability,
          recoveryFamily: snapshot.recoveryFamily,
        },
      }),
    ).rejects.toThrow("ownership");
    expect(ownershipRunner.calls.some((call) => call.argv[1] === "load")).toBe(true);
    expect(
      ownershipRunner.calls.some(
        (call) => call.argv.join(" ") === `rm -f -- ${packagePath}`,
      ),
    ).toBe(false);
  });
});
