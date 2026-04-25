import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  ConfigKey,
  ConfigScopeValue,
  ConfigValueText,
  CreatedAt,
  Environment,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  ProjectId,
  UpdatedAt,
  UpsertEnvironmentSpec,
  VariableExposureValue,
  VariableKindValue,
} from "@appaloft/core";
import { FixedClock, MemoryEnvironmentRepository } from "@appaloft/testkit";

import { createExecutionContext, toRepositoryContext } from "../src";
import { EnvironmentEffectivePrecedenceQueryService } from "../src/use-cases";

function environmentFixture(): Environment {
  const environment = Environment.create({
    id: EnvironmentId.rehydrate("env_production"),
    projectId: ProjectId.rehydrate("prj_demo"),
    name: EnvironmentName.rehydrate("production"),
    kind: EnvironmentKindValue.rehydrate("production"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();

  environment
    .setVariable({
      key: ConfigKey.rehydrate("DATABASE_URL"),
      value: ConfigValueText.rehydrate("postgres://defaults"),
      kind: VariableKindValue.rehydrate("plain-config"),
      exposure: VariableExposureValue.rehydrate("runtime"),
      scope: ConfigScopeValue.rehydrate("defaults"),
      updatedAt: UpdatedAt.rehydrate("2026-01-01T00:00:01.000Z"),
    })
    ._unsafeUnwrap();
  environment
    .setVariable({
      key: ConfigKey.rehydrate("DATABASE_URL"),
      value: ConfigValueText.rehydrate("postgres://environment"),
      kind: VariableKindValue.rehydrate("secret"),
      exposure: VariableExposureValue.rehydrate("runtime"),
      scope: ConfigScopeValue.rehydrate("environment"),
      isSecret: true,
      updatedAt: UpdatedAt.rehydrate("2026-01-01T00:00:02.000Z"),
    })
    ._unsafeUnwrap();
  environment
    .setVariable({
      key: ConfigKey.rehydrate("PUBLIC_BASE_URL"),
      value: ConfigValueText.rehydrate("https://app.example.test"),
      kind: VariableKindValue.rehydrate("plain-config"),
      exposure: VariableExposureValue.rehydrate("build-time"),
      scope: ConfigScopeValue.rehydrate("environment"),
      updatedAt: UpdatedAt.rehydrate("2026-01-01T00:00:03.000Z"),
    })
    ._unsafeUnwrap();

  return environment;
}

async function createHarness(input?: { environment?: Environment }) {
  const context = createExecutionContext({
    requestId: "req_environment_effective_precedence_test",
    entrypoint: "system",
  });
  const repositoryContext = toRepositoryContext(context);
  const environments = new MemoryEnvironmentRepository();
  const environment = input?.environment ?? environmentFixture();

  await environments.upsert(
    repositoryContext,
    environment,
    UpsertEnvironmentSpec.fromEnvironment(environment),
  );

  return {
    context,
    environments,
    queryService: new EnvironmentEffectivePrecedenceQueryService(
      environments,
      new FixedClock("2026-01-01T00:00:10.000Z"),
    ),
  };
}

describe("environment effective precedence query", () => {
  test("[ENV-PRECEDENCE-QRY-001] [ENV-PRECEDENCE-QRY-002] resolves precedence and masks secrets", async () => {
    const { context, queryService } = await createHarness();

    const result = await queryService.execute(context, {
      environmentId: "env_production",
    });

    expect(result.isOk()).toBe(true);
    const view = result._unsafeUnwrap();

    expect(view).toMatchObject({
      schemaVersion: "environments.effective-precedence/v1",
      environmentId: "env_production",
      projectId: "prj_demo",
      generatedAt: "2026-01-01T00:00:10.000Z",
    });
    expect(view.precedence).toEqual([
      "defaults",
      "system",
      "organization",
      "project",
      "environment",
      "resource",
      "deployment",
    ]);
    expect(view.ownedEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "DATABASE_URL",
          value: "postgres://defaults",
          scope: "defaults",
          exposure: "runtime",
          kind: "plain-config",
          isSecret: false,
          updatedAt: "2026-01-01T00:00:01.000Z",
        }),
        expect.objectContaining({
          key: "DATABASE_URL",
          value: "****",
          scope: "environment",
          exposure: "runtime",
          kind: "secret",
          isSecret: true,
          updatedAt: "2026-01-01T00:00:02.000Z",
        }),
      ]),
    );
    expect(view.effectiveEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "DATABASE_URL",
          value: "****",
          scope: "environment",
          exposure: "runtime",
          kind: "secret",
          isSecret: true,
        }),
        expect.objectContaining({
          key: "PUBLIC_BASE_URL",
          value: "https://app.example.test",
          scope: "environment",
          exposure: "build-time",
          kind: "plain-config",
          isSecret: false,
        }),
      ]),
    );
    expect(JSON.stringify(view)).not.toContain("postgres://environment");
  });

  test("[ENV-PRECEDENCE-QRY-003] returns not_found for a missing environment", async () => {
    const { context, queryService } = await createHarness();

    const result = await queryService.execute(context, {
      environmentId: "env_missing",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toMatchObject({
        code: "not_found",
        retryable: false,
        details: {
          entity: "environment",
          id: "env_missing",
          phase: "environment-read",
        },
      });
    }
  });
});
