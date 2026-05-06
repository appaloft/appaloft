import { describe, expect, test } from "bun:test";
import {
  BuildStrategyKindValue,
  ConfigKey,
  ConfigScopeValue,
  ConfigValueText,
  CreatedAt,
  Deployment,
  DeploymentDependencyBindingSnapshotReadinessValue,
  DeploymentDependencyRuntimeSecretRef,
  DeploymentId,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DestinationId,
  DetectSummary,
  DisplayNameText,
  EnvironmentConfigSnapshot,
  EnvironmentId,
  EnvironmentSnapshotId,
  ExecutionStrategyKindValue,
  GeneratedAt,
  ImageReference,
  PackagingModeValue,
  PlanStepText,
  PortNumber,
  ProjectId,
  ProviderKey,
  ResourceBindingId,
  ResourceBindingScopeValue,
  ResourceBindingTargetName,
  ResourceId,
  ResourceInjectionModeValue,
  ResourceInstanceId,
  ResourceInstanceKindValue,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  TargetKindValue,
  VariableExposureValue,
  VariableKindValue,
  domainError,
  err,
  ok,
} from "@appaloft/core";
import { type DependencyResourceSecretStore, type ExecutionContext } from "@appaloft/application";
import { resolveDependencyRuntimeEnvironment } from "../src/dependency-runtime-secrets";
import {
  RuntimeCommandBuilder,
  renderRuntimeCommandString,
} from "../src/runtime-commands";

function shellQuote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

function testContext(requestId: string): ExecutionContext {
  return {
    requestId,
    entrypoint: "system",
  } as ExecutionContext;
}

class MemoryDependencyResourceSecretStore implements DependencyResourceSecretStore {
  private readonly values = new Map<string, string>();

  store(input: { dependencyResourceId: string; purpose: "connection"; secretValue: string }): void {
    this.values.set(
      `appaloft://dependency-resources/${input.dependencyResourceId}/${input.purpose}`,
      input.secretValue,
    );
  }

  async storeConnection(): ReturnType<DependencyResourceSecretStore["storeConnection"]> {
    throw new Error("storeConnection is not used by this test");
  }

  async resolve(
    _context: ExecutionContext,
    input: Parameters<DependencyResourceSecretStore["resolve"]>[1],
  ): ReturnType<DependencyResourceSecretStore["resolve"]> {
    const value = this.values.get(input.secretRef);
    if (!value) {
      return err(domainError.notFound("dependency_resource_secret", input.secretRef));
    }
    return ok({ secretRef: input.secretRef, secretValue: value });
  }
}

function createDeploymentWithDependencyRef(secretRef: string): Deployment {
  return Deployment.create({
    id: DeploymentId.rehydrate("dep_runtime_secret"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    resourceId: ResourceId.rehydrate("res_demo"),
    serverId: DeploymentTargetId.rehydrate("srv_demo"),
    destinationId: DestinationId.rehydrate("dst_demo"),
    runtimePlan: RuntimePlan.rehydrate({
      id: RuntimePlanId.rehydrate("plan_runtime_secret"),
      source: SourceDescriptor.rehydrate({
        kind: SourceKindValue.rehydrate("docker-image"),
        locator: SourceLocator.rehydrate("registry.example.com/app:latest"),
        displayName: DisplayNameText.rehydrate("app image"),
      }),
      buildStrategy: BuildStrategyKindValue.rehydrate("prebuilt-image"),
      packagingMode: PackagingModeValue.rehydrate("image"),
      execution: RuntimeExecutionPlan.rehydrate({
        kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
        image: ImageReference.rehydrate("registry.example.com/app:latest"),
        port: PortNumber.rehydrate(3000),
      }),
      target: DeploymentTargetDescriptor.rehydrate({
        kind: TargetKindValue.rehydrate("single-server"),
        providerKey: ProviderKey.rehydrate("generic-ssh"),
        serverIds: [DeploymentTargetId.rehydrate("srv_demo")],
      }),
      detectSummary: DetectSummary.rehydrate("prebuilt image"),
      steps: [PlanStepText.rehydrate("run image")],
      generatedAt: GeneratedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    }),
    environmentSnapshot: EnvironmentConfigSnapshot.rehydrate({
      id: EnvironmentSnapshotId.rehydrate("snap_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      createdAt: GeneratedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      precedence: [ConfigScopeValue.rehydrate("environment")],
      variables: [
        {
          key: ConfigKey.rehydrate("APP_SECRET"),
          value: ConfigValueText.rehydrate("environment-secret"),
          kind: VariableKindValue.rehydrate("secret"),
          exposure: VariableExposureValue.rehydrate("runtime"),
          scope: ConfigScopeValue.rehydrate("environment"),
          isSecret: true,
        },
      ],
    }),
    dependencyBindingReferences: [
      {
        bindingId: ResourceBindingId.rehydrate("rbd_pg"),
        dependencyResourceId: ResourceInstanceId.rehydrate("rsi_pg"),
        kind: ResourceInstanceKindValue.rehydrate("postgres"),
        targetName: ResourceBindingTargetName.rehydrate("DATABASE_URL"),
        scope: ResourceBindingScopeValue.rehydrate("runtime-only"),
        injectionMode: ResourceInjectionModeValue.rehydrate("env"),
        runtimeSecretRef: DeploymentDependencyRuntimeSecretRef.rehydrate(secretRef),
        snapshotReadiness: DeploymentDependencyBindingSnapshotReadinessValue.ready(),
      },
    ],
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();
}

describe("dependency runtime secret resolution", () => {
  test("[DEP-BIND-SECRET-RESOLVE-005] resolves Appaloft-owned dependency refs into runtime env with redaction metadata", async () => {
    const context = testContext("req_dependency_runtime_secret_test");
    const store = new MemoryDependencyResourceSecretStore();
    const secretValue = "postgres://app:super-secret@db.example.com:5432/app";
    store.store({
      dependencyResourceId: "rsi_pg",
      purpose: "connection",
      secretValue,
    });

    const resolved = await resolveDependencyRuntimeEnvironment({
      context,
      deployment: createDeploymentWithDependencyRef(
        "appaloft://dependency-resources/rsi_pg/connection",
      ),
      dependencyResourceSecretStore: store,
      port: 4000,
      baseEnv: {},
    });

    expect(resolved.isOk()).toBe(true);
    const runtime = resolved._unsafeUnwrap();
    expect(runtime.env.DATABASE_URL).toBe(secretValue);
    expect(runtime.env.PORT).toBe("4000");
    expect(runtime.redactions).toContain(secretValue);
    expect(runtime.redactions).toContain("environment-secret");
    expect(runtime.dependencyTargetNames.has("DATABASE_URL")).toBe(true);

    const command = RuntimeCommandBuilder.docker().runContainer({
      image: "registry.example.com/app:latest",
      containerName: "appaloft-dep_runtime_secret",
      env: [
        {
          name: "DATABASE_URL",
          value: runtime.env.DATABASE_URL ?? "",
          redacted: runtime.dependencyTargetNames.has("DATABASE_URL"),
        },
      ],
    });
    expect(renderRuntimeCommandString(command, { quote: shellQuote })).toContain(secretValue);
    const display = renderRuntimeCommandString(command, { quote: shellQuote, mode: "display" });
    expect(display).toContain("DATABASE_URL=[redacted]");
    expect(display).not.toContain(secretValue);
  });

  test("[DEP-BIND-SECRET-RESOLVE-005] rejects unresolved Appaloft-owned refs before runtime env materialization", async () => {
    const context = testContext("req_dependency_runtime_secret_missing_test");
    const store = new MemoryDependencyResourceSecretStore();

    const resolved = await resolveDependencyRuntimeEnvironment({
      context,
      deployment: createDeploymentWithDependencyRef(
        "appaloft://dependency-resources/rsi_pg/connection",
      ),
      dependencyResourceSecretStore: store,
      baseEnv: {},
    });

    expect(resolved.isErr()).toBe(true);
    expect(resolved._unsafeUnwrapErr()).toMatchObject({
      code: "dependency_runtime_injection_blocked",
      details: {
        reason: "dependency_runtime_secret_unresolved",
        targetName: "DATABASE_URL",
      },
    });
  });

  test("[DEP-BIND-SECRET-RESOLVE-005] omits dependency values from package/build env materialization", async () => {
    const context = testContext("req_dependency_runtime_secret_package_env_test");
    const store = new MemoryDependencyResourceSecretStore();
    const secretValue = "postgres://app:super-secret@db.example.com:5432/app";
    store.store({
      dependencyResourceId: "rsi_pg",
      purpose: "connection",
      secretValue,
    });

    const resolved = await resolveDependencyRuntimeEnvironment({
      context,
      deployment: createDeploymentWithDependencyRef(
        "appaloft://dependency-resources/rsi_pg/connection",
      ),
      dependencyResourceSecretStore: store,
      includeDependencyRuntimeSecrets: false,
      baseEnv: {},
    });

    expect(resolved.isOk()).toBe(true);
    const runtime = resolved._unsafeUnwrap();
    expect(runtime.env.DATABASE_URL).toBeUndefined();
    expect(runtime.redactions).not.toContain(secretValue);
    expect(runtime.dependencyTargetNames.has("DATABASE_URL")).toBe(false);
  });
});
