import { describe, expect, test } from "bun:test";

import { resolveConfig } from "../src";

describe("resolveConfig", () => {
  test("defaults to embedded pglite for local development", () => {
    const config = resolveConfig({
      env: {},
    });

    expect(config.databaseDriver).toBe("pglite");
    expect(config.databaseUrl).toBeUndefined();
    expect(config.pgliteDataDir.endsWith(".yundu/data/pglite")).toBe(true);
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
