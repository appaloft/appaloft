import { describe, expect, test } from "bun:test";

function ensureReflectMetadata(): void {
  const reflectObject = Reflect as typeof Reflect & {
    defineMetadata?: (...args: unknown[]) => void;
    getMetadata?: (...args: unknown[]) => unknown;
    getOwnMetadata?: (...args: unknown[]) => unknown;
    hasMetadata?: (...args: unknown[]) => boolean;
    metadata?: (_metadataKey: unknown, _metadataValue: unknown) => ClassDecorator;
  };

  reflectObject.defineMetadata ??= () => {};
  reflectObject.getMetadata ??= () => undefined;
  reflectObject.getOwnMetadata ??= () => undefined;
  reflectObject.hasMetadata ??= () => false;
  reflectObject.metadata ??= () => () => {};
}

describe("Blueprint CLI command input mapping", () => {
  test("[CLOUD-INSTALLED-APP-EXEC-053] accepts component-qualified and unqualified secret values", async () => {
    ensureReflectMetadata();
    const { installTargetInput, secretValuesInput } = await import("../src/commands/blueprint");

    expect(
      installTargetInput({
        projectName: "PocketBase Smoke",
        environmentName: "production",
        resourceSlugPrefix: "pocketbase-smoke",
        serverId: "srv_yundu",
      }),
    ).toEqual({
      projectName: "PocketBase Smoke",
      environmentName: "production",
      resourceSlugPrefix: "pocketbase-smoke",
      serverId: "srv_yundu",
    });

    expect(
      secretValuesInput([
        "pocketbase:POCKETBASE_ADMIN_PASSWORD=pocketbase-secret",
        "SECRET_KEY=teable-secret",
      ]),
    ).toEqual([
      {
        componentId: "pocketbase",
        key: "POCKETBASE_ADMIN_PASSWORD",
        value: "pocketbase-secret",
      },
      {
        key: "SECRET_KEY",
        value: "teable-secret",
      },
    ]);
  }, 15_000);

  test("[CLOUD-INSTALLED-APP-EXEC-053] rejects malformed secret values before command dispatch", async () => {
    ensureReflectMetadata();
    const { secretValuesInput } = await import("../src/commands/blueprint");

    expect(() => secretValuesInput(["SECRET_KEY"])).toThrow(
      "Blueprint secret values must use KEY=value or component:KEY=value.",
    );
    expect(() => secretValuesInput(["SECRET_KEY="])).toThrow(
      "Blueprint secret values must include a secret key and non-empty value.",
    );
  });
});
