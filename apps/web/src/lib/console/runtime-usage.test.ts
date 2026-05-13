import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

import { formatRuntimeUsageBytes, runtimeUsageQueryKey } from "./runtime-usage";

describe("runtime usage console readback", () => {
  test("[RT-USAGE-008] formats compact usage values without changing DTO semantics", () => {
    expect(formatRuntimeUsageBytes(undefined)).toBeNull();
    expect(formatRuntimeUsageBytes(0)).toBe("0 B");
    expect(formatRuntimeUsageBytes(1024 * 1024)).toBe("1.0 MB");
    expect(
      runtimeUsageQueryKey({
        kind: "resource",
        resourceId: "res_demo",
      }),
    ).toEqual(["runtime-usage", "resource", "res_demo"]);
  });

  test("[RT-USAGE-008] exposes server and resource runtime usage through the shared oRPC client", async () => {
    const [componentSource, serverSource, resourceSource] = await Promise.all([
      readFile(new URL("../components/console/RuntimeUsagePanel.svelte", import.meta.url), "utf8"),
      readFile(new URL("../../routes/servers/[serverId]/+page.svelte", import.meta.url), "utf8"),
      readFile(
        new URL("../../routes/resources/[resourceId]/+page.svelte", import.meta.url),
        "utf8",
      ),
    ]);

    expect(componentSource).toContain("i18nKeys.console.runtimeUsage");
    expect(componentSource).toContain("runtimeUsageInspect");
    expect(serverSource).toContain("RuntimeUsagePanel");
    expect(serverSource).toContain('kind: "server"');
    expect(resourceSource).toContain("RuntimeUsagePanel");
    expect(resourceSource).toContain('kind: "resource"');
  });
});
