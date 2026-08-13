import { describe, expect, test } from "bun:test";

import { ProcessEnvironmentMigrationSecretResolver } from "../src/migration-secret-resolver";

describe("ProcessEnvironmentMigrationSecretResolver", () => {
  test("[MIG-SEC-013] resolves only an explicit env:// reference", async () => {
    const resolver = new ProcessEnvironmentMigrationSecretResolver({
      APPALOFT_MIGRATION_DATABASE_URL: "postgres://user:password@example.test/db",
    });

    const result = await resolver.resolve("env://APPALOFT_MIGRATION_DATABASE_URL");

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("postgres://user:password@example.test/db");
    }
  });

  test("[MIG-SEC-013] rejects unsupported reference schemes without echoing the reference", async () => {
    const resolver = new ProcessEnvironmentMigrationSecretResolver({});

    const result = await resolver.resolve("vault://operator/private/value");

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("validation_error");
      expect(JSON.stringify(result.error)).not.toContain("operator/private/value");
    }
  });

  test("[MIG-SEC-013] rejects invalid or absent environment values without exposing values", async () => {
    const resolver = new ProcessEnvironmentMigrationSecretResolver({
      APPALOFT_MIGRATION_EMPTY: "",
      APPALOFT_MIGRATION_PRESENT: "must-not-leak",
    });

    for (const secretRef of [
      "env://lowercase",
      "env://APPALOFT_MIGRATION_EMPTY",
      "env://APPALOFT_MIGRATION_MISSING",
    ]) {
      const result = await resolver.resolve(secretRef);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(JSON.stringify(result.error)).not.toContain("must-not-leak");
      }
    }
  });
});
