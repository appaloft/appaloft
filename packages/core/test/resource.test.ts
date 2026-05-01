import { describe, expect, test } from "bun:test";
import {
  ConfigKey,
  ConfigScopeValue,
  ConfigValueText,
  CreatedAt,
  DisplayNameText,
  EnvironmentId,
  EnvironmentSnapshotId,
  GeneratedAt,
  HealthCheckIntervalSeconds,
  HealthCheckRetryCount,
  HealthCheckStartPeriodSeconds,
  HealthCheckTimeoutSeconds,
  HealthCheckTypeValue,
  PortNumber,
  ProjectId,
  Resource,
  ResourceExposureModeValue,
  ResourceGeneratedAccessModeValue,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  ResourceNetworkProtocolValue,
  ResourceServiceKindValue,
  ResourceServiceName,
  RoutePathPrefix,
  RuntimePlanStrategyValue,
  SourceKindValue,
  SourceLocator,
  StaticPublishDirectory,
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
    expect(ResourceKindValue.rehydrate("compose-stack").allowsMultipleServices()).toBe(true);

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
    expect(ResourceKindValue.rehydrate("application").allowsMultipleServices()).toBe(false);

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
    if (resource.isErr()) {
      expect(resource.error.code).toBe("invariant_violation");
      expect(resource.error.details).toMatchObject({
        phase: "resource-admission",
        kind: "application",
        serviceCount: 2,
      });
    }
  });

  test("[DMBH-RES-001] Resource answers deployment admission questions without caller-owned primitive checks", () => {
    const resource = Resource.create({
      ...baseInput,
      kind: ResourceKindValue.rehydrate("static-site"),
      sourceBinding: {
        kind: SourceKindValue.rehydrate("local-folder"),
        locator: SourceLocator.rehydrate("/workspace/site"),
        displayName: DisplayNameText.rehydrate("site"),
      },
      runtimeProfile: {
        strategy: RuntimePlanStrategyValue.rehydrate("static"),
        publishDirectory: StaticPublishDirectory.rehydrate("/dist"),
      },
      networkProfile: {
        internalPort: PortNumber.rehydrate(80),
        upstreamProtocol: ResourceNetworkProtocolValue.rehydrate("http"),
        exposureMode: ResourceExposureModeValue.rehydrate("reverse-proxy"),
      },
      accessProfile: {
        generatedAccessMode: ResourceGeneratedAccessModeValue.rehydrate("inherit"),
        pathPrefix: RoutePathPrefix.rehydrate("/docs"),
      },
    })._unsafeUnwrap();

    expect(resource.requiresInternalPort()).toBe(true);
    expect(ResourceKindValue.rehydrate("static-site").requiresInternalPort()).toBe(true);
    expect(ResourceServiceKindValue.rehydrate("api").requiresInternalPort()).toBe(true);
    expect(resource.shouldEnrichSourceFromDetector()).toBe(true);

    const source = resource.createDeploymentSourceDescriptor();
    expect(source.isOk()).toBe(true);
    if (source.isOk()) {
      expect(source.value.source.kind.value).toBe("local-folder");
      expect(source.value.reasoning).toEqual(["Resource source binding kind: local-folder"]);
    }

    const profile = resource.resolveDeploymentProfile({ operationName: "deployments.create" });
    expect(profile.isOk()).toBe(true);
    if (profile.isOk()) {
      expect(profile.value).toMatchObject({
        method: "static",
        publishDirectory: "/dist",
        port: 80,
        exposureMode: "reverse-proxy",
        upstreamProtocol: "http",
        accessContext: {
          projectId: "prj_demo",
          environmentId: "env_demo",
          resourceId: "res_demo",
          resourceSlug: "app-stack",
          exposureMode: "reverse-proxy",
          upstreamProtocol: "http",
          routePurpose: "default-resource-access",
          pathPrefix: "/docs",
        },
      });
    }
  });

  test("[DMBH-RES-001] Resource composes network and health value predicates", () => {
    expect(ResourceExposureModeValue.rehydrate("direct-port").isDirectPort()).toBe(true);
    expect(HealthCheckTypeValue.rehydrate("http").isHttp()).toBe(true);

    const invalidHostPort = Resource.create({
      ...baseInput,
      kind: ResourceKindValue.rehydrate("application"),
      networkProfile: {
        internalPort: PortNumber.rehydrate(3000),
        upstreamProtocol: ResourceNetworkProtocolValue.rehydrate("http"),
        exposureMode: ResourceExposureModeValue.rehydrate("reverse-proxy"),
        hostPort: PortNumber.rehydrate(8080),
      },
    });
    expect(invalidHostPort.isErr()).toBe(true);

    const resource = Resource.create({
      ...baseInput,
      kind: ResourceKindValue.rehydrate("application"),
    })._unsafeUnwrap();
    const commandHealth = resource.configureHealthPolicy({
      policy: {
        enabled: true,
        type: HealthCheckTypeValue.rehydrate("command"),
        intervalSeconds: HealthCheckIntervalSeconds.rehydrate(30),
        timeoutSeconds: HealthCheckTimeoutSeconds.rehydrate(5),
        retries: HealthCheckRetryCount.rehydrate(3),
        startPeriodSeconds: HealthCheckStartPeriodSeconds.rehydrate(0),
      },
      configuredAt: UpdatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      defaultStrategy: RuntimePlanStrategyValue.rehydrate("auto"),
    });

    expect(commandHealth.isErr()).toBe(true);
    if (commandHealth.isErr()) {
      expect(commandHealth.error.details).toMatchObject({
        phase: "health-policy-resolution",
        healthCheckType: "command",
      });
    }
  });

  test("[DMBH-RES-001] Resource rejects missing source binding and missing internal port through domain behavior", () => {
    const resource = Resource.create({
      ...baseInput,
      kind: ResourceKindValue.rehydrate("application"),
    })._unsafeUnwrap();

    const source = resource.createDeploymentSourceDescriptor();
    expect(source.isErr()).toBe(true);
    if (source.isErr()) {
      expect(source.error.details?.phase).toBe("resource-source-resolution");
      expect(source.error.details?.resourceId).toBe("res_demo");
    }

    const profile = resource.resolveDeploymentProfile({ queryName: "deployments.plan" });
    expect(profile.isErr()).toBe(true);
    if (profile.isErr()) {
      expect(profile.error.details?.queryName).toBe("deployments.plan");
      expect(profile.error.details?.phase).toBe("resource-network-resolution");
      expect(profile.error.details?.resourceKind).toBe("application");
    }
  });

  test("[DMBH-RES-001] Resource composes kind and service internal-port requirements", () => {
    const external = Resource.create({
      ...baseInput,
      kind: ResourceKindValue.rehydrate("external"),
    })._unsafeUnwrap();
    expect(external.requiresInternalPort()).toBe(false);
    expect(ResourceKindValue.rehydrate("external").requiresInternalPort()).toBe(false);

    const externalWithApiService = Resource.create({
      ...baseInput,
      kind: ResourceKindValue.rehydrate("external"),
      services: [
        {
          name: ResourceServiceName.rehydrate("api"),
          kind: ResourceServiceKindValue.rehydrate("api"),
        },
      ],
    })._unsafeUnwrap();
    expect(externalWithApiService.requiresInternalPort()).toBe(true);
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
