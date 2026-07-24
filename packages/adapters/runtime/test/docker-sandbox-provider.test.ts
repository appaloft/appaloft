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
  runtimes = '{"io.containerd.runc.v2":{"path":"runc"},"runsc":{"path":"runsc"}}';
  resolvedPath: string | undefined;
  executionFailure: SandboxDockerCommandResult["failure"];
  failureCommandIncludes: string | undefined;
  inventory = "";

  async run(
    argv: readonly string[],
    input: { stdin?: Uint8Array; timeoutMs?: number } = {},
  ): Promise<SandboxDockerCommandResult> {
    this.calls.push({ argv: [...argv], ...(input.stdin ? { stdin: input.stdin.slice() } : {}) });
    const command = argv.join(" ");
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
    if (command.includes("realpath"))
      return this.result(`${this.resolvedPath ?? argv.at(-1)}\n`);
    if (command.includes("tar -C /workspace -cf -")) return this.result("archive");
    if (command.includes("inspect --format {{.Config.Image}}"))
      return this.result("python@sha256:abc123\n");
    if (command.includes("inspect --format") && !command.includes("image inspect")) {
      if (command.includes("appaloft.sandbox.owner")) return this.result("tenant_a\n");
      if (command.includes("appaloft.sandbox.egress")) return this.result("allowlist\n");
      return this.result("sbx_demo\n");
    }
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
        write() {},
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
  test("[TERM-SESSION-SANDBOX-001] opens the managed container shell through a PTY runner", async () => {
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
          "-w",
          "/workspace/src",
          "appaloft-sbx_demo",
          "sh",
          "-lc",
          expect.stringContaining("export HOME=/workspace"),
        ],
        initialRows: 32,
        initialCols: 120,
      },
    ]);
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

  test("[SBX-PROC-001] returns ordered stdout/stderr/exit frames from direct argv execution", async () => {
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
    expect(runner.calls.at(-1)?.stdin).toEqual(new TextEncoder().encode("input\n"));

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
    expect(bounded.mode).toBe("foreground");
    if (bounded.mode === "foreground") {
      expect(bounded.frames.at(-1)).toMatchObject({
        kind: "error",
        code: "sandbox_exec_output_limit",
        retryable: false,
      });
    }
  });

  test("[SBX-PROC-001] streams bounded launch input through a private pipe without placing it in argv", async () => {
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
    expect(launch?.argv.join(" ")).toContain('wait "$child"');
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

  test("[SBX-PROC-001] process termination is idempotent after a background command exits", async () => {
    const runner = new CapturingRunner();
    const provider = new DockerSandboxProvider({ isolation: "gvisor", runner });
    await provider.provision(request);

    await provider.terminateProcess({
      sandboxId: "sbx_demo",
      providerHandle: "appaloft-sbx_demo",
      processId: "spr_deadbeef",
    });

    const terminated = runner.calls.at(-1)?.argv.join(" ") ?? "";
    expect(terminated).toContain('kill "$pid" 2>/dev/null || true');
    expect(terminated).toContain('rm -f -- "$1"');
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
