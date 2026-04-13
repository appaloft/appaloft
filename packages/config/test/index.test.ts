import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import { resolveConfig } from "../src";

const testHome = "/Users/yundu";
const testXdgDataHome = "/var/lib/xdg-data";
const testAppData = "C:\\Users\\yundu\\AppData\\Roaming";

function expectedDefaultDataDir(): string {
  if (process.platform === "darwin") {
    return join(testHome, "Library", "Application Support", "Yundu", "data");
  }

  if (process.platform === "win32") {
    return join(testAppData, "Yundu", "data");
  }

  return join(testXdgDataHome, "yundu", "data");
}

describe("resolveConfig", () => {
  test("defaults to embedded pglite with user-level storage", () => {
    const config = resolveConfig({
      env: {
        APPDATA: testAppData,
        HOME: testHome,
        XDG_DATA_HOME: testXdgDataHome,
      },
    });

    expect(config.databaseDriver).toBe("pglite");
    expect(config.databaseUrl).toBeUndefined();
    expect(config.dataDir).toBe(expectedDefaultDataDir());
    expect(config.pgliteDataDir).toBe(join(expectedDefaultDataDir(), "pglite"));
  });

  test("infers postgres when a database URL is configured", () => {
    const config = resolveConfig({
      env: {
        YUNDU_DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/yundu",
      },
    });

    expect(config.databaseDriver).toBe("postgres");
    expect(config.databaseUrl).toBe("postgres://postgres:postgres@127.0.0.1:5432/yundu");
  });

  test("derives pglite storage from explicit data dir", () => {
    const config = resolveConfig({
      env: {
        YUNDU_DATA_DIR: ".yundu/data",
      },
    });

    expect(config.dataDir.endsWith(".yundu/data")).toBe(true);
    expect(config.pgliteDataDir.endsWith(".yundu/data/pglite")).toBe(true);
  });

  test("keeps an explicit pglite driver even if a database URL exists", () => {
    const config = resolveConfig({
      env: {
        YUNDU_DATABASE_DRIVER: "pglite",
        YUNDU_DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/yundu",
      },
    });

    expect(config.databaseDriver).toBe("pglite");
    expect(config.databaseUrl).toBe("postgres://postgres:postgres@127.0.0.1:5432/yundu");
  });
});
