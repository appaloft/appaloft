import { describe, expect, test } from "bun:test";
import {
  ConfigKey,
  ConfigScopeValue,
  ConfigValueText,
  EnvironmentConfigSet,
  EnvironmentConfigSnapshot,
  EnvironmentId,
  EnvironmentSnapshotId,
  GeneratedAt,
  UpdatedAt,
  VariableExposureValue,
  VariableKindValue,
} from "../src";

const runtime = VariableExposureValue.rehydrate("runtime");
const plainConfig = VariableKindValue.rehydrate("plain-config");
const generatedAt = GeneratedAt.rehydrate("2026-01-01T00:03:00.000Z");
const environmentId = EnvironmentId.rehydrate("env_demo");

function setVariable(
  configSet: EnvironmentConfigSet,
  input: {
    key: string;
    value: string;
    scope: "defaults" | "environment" | "resource";
    exposure?: "runtime" | "build-time";
    isSecret?: boolean;
    updatedAt?: string;
  },
) {
  return configSet
    .setEntry({
      key: ConfigKey.rehydrate(input.key),
      value: ConfigValueText.rehydrate(input.value),
      kind: input.isSecret
        ? VariableKindValue.rehydrate("secret")
        : VariableKindValue.rehydrate("plain-config"),
      exposure: VariableExposureValue.rehydrate(input.exposure ?? "runtime"),
      scope: ConfigScopeValue.rehydrate(input.scope),
      ...(input.isSecret === undefined ? {} : { isSecret: input.isSecret }),
      updatedAt: UpdatedAt.rehydrate(input.updatedAt ?? "2026-01-01T00:00:00.000Z"),
    })
    ._unsafeUnwrap();
}

describe("EnvironmentConfigSet", () => {
  test("[DMBH-CONFIG-001] entries answer identity and precedence for effective snapshots", () => {
    const configSet = EnvironmentConfigSet.empty();
    setVariable(configSet, {
      key: "DATABASE_URL",
      value: "postgres://defaults",
      scope: "defaults",
    });
    setVariable(configSet, {
      key: "DATABASE_URL",
      value: "postgres://environment",
      scope: "environment",
      isSecret: true,
    });
    setVariable(configSet, {
      key: "PUBLIC_BASE_URL",
      value: "https://app.example.test",
      scope: "environment",
      exposure: "build-time",
    });

    const snapshot = configSet.materializeSnapshot({
      environmentId,
      snapshotId: EnvironmentSnapshotId.rehydrate("snap_demo"),
      createdAt: generatedAt,
    });

    expect(snapshot.variables).toHaveLength(2);
    expect(snapshot.variables.find((entry) => entry.key === "DATABASE_URL")?.value).toBe(
      "postgres://environment",
    );
    expect(snapshot.variables.find((entry) => entry.key === "DATABASE_URL")?.scope).toBe(
      "environment",
    );
    expect(snapshot.variables.find((entry) => entry.key === "PUBLIC_BASE_URL")?.exposure).toBe(
      "build-time",
    );
  });

  test("[DMBH-CONFIG-001] set and unset use scoped variable identity", () => {
    const configSet = EnvironmentConfigSet.empty();
    setVariable(configSet, {
      key: "APP_PORT",
      value: "3000",
      scope: "environment",
    });
    setVariable(configSet, {
      key: "APP_PORT",
      value: "3100",
      scope: "environment",
    });
    setVariable(configSet, {
      key: "APP_PORT",
      value: "8080",
      scope: "resource",
    });

    expect(configSet.toState()).toHaveLength(2);
    expect(
      configSet
        .unsetEntry({
          key: ConfigKey.rehydrate("APP_PORT"),
          exposure: runtime,
          scope: ConfigScopeValue.rehydrate("environment"),
        })
        .isOk(),
    ).toBe(true);

    expect(configSet.toState()).toHaveLength(1);
    expect(configSet.toState()[0]?.scope.value).toBe("resource");
    expect(configSet.toState()[0]?.value.value).toBe("8080");
  });

  test("[DMBH-CONFIG-001] snapshot entries answer diff equality", () => {
    const current = EnvironmentConfigSet.empty();
    setVariable(current, {
      key: "DATABASE_URL",
      value: "postgres://environment",
      scope: "environment",
      isSecret: true,
    });
    setVariable(current, {
      key: "APP_PORT",
      value: "3000",
      scope: "environment",
    });

    const other = EnvironmentConfigSnapshot.rehydrate({
      id: EnvironmentSnapshotId.rehydrate("snap_other"),
      environmentId,
      createdAt: generatedAt,
      precedence: [ConfigScopeValue.rehydrate("environment")],
      variables: [
        {
          key: ConfigKey.rehydrate("DATABASE_URL"),
          value: ConfigValueText.rehydrate("postgres://environment"),
          kind: VariableKindValue.rehydrate("secret"),
          exposure: runtime,
          scope: ConfigScopeValue.rehydrate("environment"),
          isSecret: true,
        },
        {
          key: ConfigKey.rehydrate("APP_PORT"),
          value: ConfigValueText.rehydrate("3100"),
          kind: plainConfig,
          exposure: runtime,
          scope: ConfigScopeValue.rehydrate("environment"),
          isSecret: false,
        },
      ],
    });

    const diff = current.diffAgainstSnapshot(environmentId, generatedAt, other);

    expect(diff).toEqual([
      expect.objectContaining({
        key: expect.objectContaining({ value: "APP_PORT" }),
        change: "changed",
      }),
      expect.objectContaining({
        key: expect.objectContaining({ value: "DATABASE_URL" }),
        change: "unchanged",
      }),
    ]);
  });
});
