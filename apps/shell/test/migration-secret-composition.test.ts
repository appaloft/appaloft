import "reflect-metadata";

import { describe, expect, test } from "bun:test";

import { type MigrationSecretResolver, tokens } from "@appaloft/application";
import { container as rootContainer } from "tsyringe";

import { createShellMigrationSecretResolverExtension } from "../src/composition";

describe("Shell migration secret composition", () => {
  test("[MIG-SEC-013] injects the bounded process-environment resolver before application handlers", async () => {
    const container = rootContainer.createChildContainer();
    const extension = createShellMigrationSecretResolverExtension({
      APPALOFT_MIGRATION_TOKEN: "resolved-at-the-composition-boundary",
    });

    await extension.configureRuntime?.({ container } as never);

    const resolver = container.resolve<MigrationSecretResolver>(tokens.migrationSecretResolver);
    const result = await resolver.resolve("env://APPALOFT_MIGRATION_TOKEN");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("resolved-at-the-composition-boundary");
    }
  });
});
