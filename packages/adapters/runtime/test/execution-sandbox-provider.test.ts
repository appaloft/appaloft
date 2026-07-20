import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { HermeticSandboxProvider } from "../src/execution-sandbox-provider";

describe("HermeticSandboxProvider", () => {
  test("[SBX-RUNTIME-001] closes lifecycle, process, file, port and snapshot contracts", async () => {
    const provider = new HermeticSandboxProvider({ isolation: "gvisor" });
    const provisioned = await provider.provision({
      sandboxId: "sbx_demo",
      source: { kind: "image", image: "python@sha256:abc123" },
      requestedIsolation: "gvisor",
      limits: {
        cpuMillis: 1_000,
        memoryBytes: 512 * 1024 * 1024,
        diskBytes: 1024 * 1024 * 1024,
        maxProcesses: 32,
      },
      networkPolicy: { mode: "deny", rules: [] },
    });

    expect(provisioned.realizedIsolation).toBe("gvisor");
    await provider.writeFile({
      sandboxId: "sbx_demo",
      providerHandle: provisioned.providerHandle,
      path: "input/data.bin",
      content: new Uint8Array([0, 255, 1]),
    });
    expect(
      await provider.readFile({
        sandboxId: "sbx_demo",
        providerHandle: provisioned.providerHandle,
        path: "input/data.bin",
      }),
    ).toEqual(new Uint8Array([0, 255, 1]));

    const foreground = await provider.exec({
      sandboxId: "sbx_demo",
      providerHandle: provisioned.providerHandle,
      argv: ["echo", "hello"],
    });
    expect(foreground).toMatchObject({ mode: "foreground" });
    if (foreground.mode === "foreground") {
      expect(foreground.frames.at(-1)).toMatchObject({ kind: "exit", exitCode: 0 });
    }
    const background = await provider.exec({
      sandboxId: "sbx_demo",
      providerHandle: provisioned.providerHandle,
      argv: ["server"],
      background: true,
    });
    expect(background).toMatchObject({ mode: "background" });
    expect(await provider.listProcesses({ sandboxId: "sbx_demo", providerHandle: provisioned.providerHandle })).toHaveLength(1);

    const exposure = await provider.exposePort({
      sandboxId: "sbx_demo",
      providerHandle: provisioned.providerHandle,
      port: 3000,
      visibility: "private",
    });
    expect(exposure.url).toStartWith("https://sandbox.invalid/");
    expect(exposure.url).not.toContain("127.0.0.1");

    expect(
      await provider.captureSnapshot({
        sandboxId: "sbx_demo",
        providerHandle: provisioned.providerHandle,
        snapshotId: "ssn_demo",
        capability: "filesystem",
      }),
    ).toMatchObject({ providerHandle: "hermetic-snapshot:ssn_demo", sizeBytes: 3 });

    await provider.terminate({
      sandboxId: "sbx_demo",
      providerHandle: provisioned.providerHandle,
    });
    expect(provider.hasRuntime("sbx_demo")).toBe(false);
  });

  test("[SBX-FILE-002] revalidates traversal at the provider boundary", async () => {
    const provider = new HermeticSandboxProvider();
    const provisioned = await provider.provision({
      sandboxId: "sbx_demo",
      source: { kind: "image", image: "alpine@sha256:abc123" },
      requestedIsolation: "container-trusted",
      limits: { cpuMillis: 100, memoryBytes: 1024, diskBytes: 1024, maxProcesses: 2 },
      networkPolicy: { mode: "deny", rules: [] },
    });
    expect(
      provider.writeFile({
        sandboxId: "sbx_demo",
        providerHandle: provisioned.providerHandle,
        path: "../escape",
        content: new Uint8Array([1]),
      }),
    ).rejects.toThrow("workspace");
  });
});
