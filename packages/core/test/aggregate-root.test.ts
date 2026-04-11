import { describe, expect, test } from "bun:test";

import {
  ConfigKey,
  ConfigScopeValue,
  ConfigValueText,
  CreatedAt,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  EnvironmentProfile,
  Project,
  ProjectId,
  ProjectName,
  UpdatedAt,
  VariableExposureValue,
  VariableKindValue,
} from "../src";

describe("AggregateRoot", () => {
  test("records and clears domain events through the shared aggregate base class", () => {
    const project = Project.create({
      id: ProjectId.rehydrate("prj_demo"),
      name: ProjectName.rehydrate("Demo"),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();

    const events = project.pullDomainEvents();

    expect(events).toEqual([
      expect.objectContaining({
        type: "project.created",
        aggregateId: "prj_demo",
        payload: expect.objectContaining({
          slug: "demo",
        }),
      }),
    ]);
    expect(project.pullDomainEvents()).toEqual([]);
  });

  test("lets aggregates append multiple events without redefining a local queue", () => {
    const environment = EnvironmentProfile.create({
      id: EnvironmentId.rehydrate("env_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      name: EnvironmentName.rehydrate("development"),
      kind: EnvironmentKindValue.rehydrate("development"),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();
    expect(
      environment
        .setVariable({
          key: ConfigKey.rehydrate("PUBLIC_SITE_NAME"),
          value: ConfigValueText.rehydrate("yundu"),
          kind: VariableKindValue.rehydrate("plain-config"),
          exposure: VariableExposureValue.rehydrate("build-time"),
          scope: ConfigScopeValue.rehydrate("environment"),
          updatedAt: UpdatedAt.rehydrate("2026-01-01T00:01:00.000Z"),
        })
        .isOk(),
    ).toBe(true);
    expect(
      environment
        .unsetVariable({
          key: ConfigKey.rehydrate("PUBLIC_SITE_NAME"),
          exposure: VariableExposureValue.rehydrate("build-time"),
          scope: ConfigScopeValue.rehydrate("environment"),
          updatedAt: UpdatedAt.rehydrate("2026-01-01T00:02:00.000Z"),
        })
        .isOk(),
    ).toBe(true);

    expect(environment.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: "environment.variable_set",
        aggregateId: "env_demo",
      }),
      expect.objectContaining({
        type: "environment.variable_unset",
        aggregateId: "env_demo",
      }),
    ]);
  });
});
