import { describe, expect, test } from "bun:test";
import {
  ConfigKey,
  ConfigScopeValue,
  ConfigValueText,
  CreatedAt,
  EnvironmentId,
  EnvironmentSnapshotId,
  GeneratedAt,
  ProjectId,
  Resource,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  ResourceServiceKindValue,
  ResourceServiceName,
  UpdatedAt,
  VariableExposureValue,
  VariableKindValue,
} from "../src";

const baseInput = {
  id: ResourceId.rehydrate("res_demo"),
  projectId: ProjectId.rehydrate("prj_demo"),
  environmentId: EnvironmentId.rehydrate("env_demo"),
  name: ResourceName.rehydrate("app-stack"),
  createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
};

describe("Resource", () => {
  test("allows compose-stack resources to contain multiple services", () => {
    const resource = Resource.create({
      ...baseInput,
      kind: ResourceKindValue.rehydrate("compose-stack"),
      services: [
        {
          name: ResourceServiceName.rehydrate("web"),
          kind: ResourceServiceKindValue.rehydrate("web"),
        },
        {
          name: ResourceServiceName.rehydrate("api"),
          kind: ResourceServiceKindValue.rehydrate("api"),
        },
      ],
    });

    expect(resource.isOk()).toBe(true);
    expect(resource._unsafeUnwrap().toState().services).toHaveLength(2);
  });

  test("rejects multiple services for non-compose resources", () => {
    const resource = Resource.create({
      ...baseInput,
      kind: ResourceKindValue.rehydrate("application"),
      services: [
        {
          name: ResourceServiceName.rehydrate("web"),
          kind: ResourceServiceKindValue.rehydrate("web"),
        },
        {
          name: ResourceServiceName.rehydrate("api"),
          kind: ResourceServiceKindValue.rehydrate("api"),
        },
      ],
    });

    expect(resource.isErr()).toBe(true);
  });

  test("[RES-PROFILE-CONFIG-012] materializes effective environment snapshot with resource override precedence", () => {
    const resource = Resource.create({
      ...baseInput,
      kind: ResourceKindValue.rehydrate("application"),
    })._unsafeUnwrap();

    resource
      .setVariable({
        key: ConfigKey.rehydrate("DATABASE_URL"),
        value: ConfigValueText.rehydrate("postgres://resource"),
        kind: VariableKindValue.rehydrate("secret"),
        exposure: VariableExposureValue.rehydrate("runtime"),
        isSecret: true,
        updatedAt: UpdatedAt.rehydrate("2026-01-01T00:01:00.000Z"),
      })
      ._unsafeUnwrap();

    const snapshot = resource.materializeEffectiveEnvironmentSnapshot({
      environmentId: EnvironmentId.rehydrate("env_demo"),
      snapshotId: EnvironmentSnapshotId.rehydrate("snap_demo"),
      createdAt: GeneratedAt.rehydrate("2026-01-01T00:02:00.000Z"),
      inherited: [
        {
          key: ConfigKey.rehydrate("DATABASE_URL"),
          value: ConfigValueText.rehydrate("postgres://environment"),
          kind: VariableKindValue.rehydrate("secret"),
          exposure: VariableExposureValue.rehydrate("runtime"),
          scope: ConfigScopeValue.rehydrate("environment"),
          isSecret: true,
        },
      ],
    });

    expect(snapshot.precedence).toEqual([
      "defaults",
      "system",
      "organization",
      "project",
      "environment",
      "resource",
      "deployment",
    ]);
    expect(snapshot.variables).toEqual([
      expect.objectContaining({
        key: "DATABASE_URL",
        value: "postgres://resource",
        scope: "resource",
        isSecret: true,
      }),
    ]);
  });
});
