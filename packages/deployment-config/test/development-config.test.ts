import { describe, expect, test } from "bun:test";

import { parseAppaloftDeploymentConfig } from "../src";

describe("development config overlay", () => {
  test("[DEV-PLAN-002] accepts root and service development command/watch overlays", () => {
    const parsed = parseAppaloftDeploymentConfig({
      runtime: {
        strategy: "workspace-commands",
        startCommand: "bun run start",
      },
      network: { internalPort: 3000 },
      development: {
        command: "bun run dev",
        watch: "native",
      },
      services: {
        api: {
          kind: "web",
          runtime: {
            strategy: "workspace-commands",
            startCommand: "bun run api:start",
          },
          development: {
            command: "bun run api:dev",
            watch: "restart",
          },
        },
      },
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.development).toEqual({ command: "bun run dev", watch: "native" });
    expect(parsed.data.services?.api?.development).toEqual({
      command: "bun run api:dev",
      watch: "restart",
    });
  });

  test("[DEV-PLAN-002] rejects empty commands and unsupported watch modes", () => {
    const parsed = parseAppaloftDeploymentConfig({
      development: {
        command: " ",
        watch: "poll",
      },
    });

    expect(parsed.success).toBe(false);
  });
});
