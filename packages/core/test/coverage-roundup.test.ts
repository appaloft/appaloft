import { describe, expect, test } from "bun:test";

import {
  ActiveDomainBindingByOwnerAndRouteSpec,
  accessRouteOpenPathPrefix,
  accessRouteUrl,
  Certificate,
  CertificateAttemptId,
  CertificateAttemptIdempotencyKeyValue,
  CertificateByAttemptIdempotencyKeySpec,
  CertificateChallengeTypeValue,
  CertificateId,
  CertificateIssueReasonValue,
  CertificatePolicyValue,
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetByProviderAndHostSpec,
  DeploymentTargetId,
  DeploymentTargetName,
  Destination,
  DestinationId,
  DestinationName,
  DomainBinding,
  DomainBindingId,
  DomainBindingStatusValue,
  domainError,
  EdgeProxyKindValue,
  EnvironmentByProjectAndNameSpec,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  EnvironmentProfile,
  errorKnowledgeKey,
  HostAddress,
  NonDeletedDeploymentTargetByEndpointSpec,
  normalizeAccessRoutePathPrefix,
  PortNumber,
  ProjectId,
  ProviderKey,
  PublicDomainName,
  ResourceBinding,
  ResourceBindingId,
  ResourceBindingScopeValue,
  ResourceBindingsByResourceSpec,
  ResourceBindingTargetName,
  ResourceId,
  ResourceInjectionModeValue,
  ResourceInstanceId,
  RoutePathPrefix,
  StorageVolume,
  StorageVolumeByEnvironmentAndSlugSpec,
  StorageVolumeId,
  StorageVolumeKindValue,
  StorageVolumeName,
  TargetKindValue,
  TlsModeValue,
  UpdatedAt,
  UpsertDestinationSpec,
  UpsertDomainBindingSpec,
  UpsertEnvironmentSpec,
  UpsertStorageVolumeSpec,
} from "../src";

const createdAt = CreatedAt.rehydrate("2026-07-20T00:00:00.000Z");

describe("Access route URL helpers", () => {
  test("[CORE-ACCESS-URL-001] normalizes path prefixes and builds open URLs", () => {
    expect(normalizeAccessRoutePathPrefix("api")).toBe("/api");
    expect(normalizeAccessRoutePathPrefix("/already")).toBe("/already");
    expect(
      accessRouteOpenPathPrefix({
        routePathPrefix: "/app",
        metadata: { "access.defaultOpenPathPrefix": "/app/dashboard" },
      }),
    ).toBe("/app/dashboard");
    expect(
      accessRouteOpenPathPrefix({
        routePathPrefix: "/app",
        metadata: { "access.defaultOpenPathPrefix": "/other" },
      }),
    ).toBe("/app");
    expect(
      accessRouteUrl({
        scheme: "https",
        hostname: "demo.example.com",
        routePathPrefix: "/",
        metadata: { "access.defaultOpenPathPrefix": "/welcome" },
      }),
    ).toBe("https://demo.example.com/welcome");
    expect(
      accessRouteUrl({
        scheme: "http",
        hostname: "demo.example.com",
        routePathPrefix: "/api",
      }),
    ).toBe("http://demo.example.com/api");
  });
});

describe("Error knowledge and domainError catalog completeness", () => {
  test("[CORE-SHARED-ERR-003] errorKnowledgeKey joins code and optional phase", () => {
    expect(errorKnowledgeKey({ code: "validation_error" })).toBe("validation_error");
    expect(errorKnowledgeKey({ code: "validation_error", phase: "admission" })).toBe(
      "validation_error.admission",
    );
  });

  test("[CORE-SHARED-ERR-004] every domainError factory returns a unique code", () => {
    const codes: string[] = [];
    for (const [name, factory] of Object.entries(domainError)) {
      if (typeof factory !== "function") continue;
      let error: { code: string; message: string; category: string };
      if (name === "notFound") {
        error = (factory as (entity: string, id: string) => typeof error)("project", "prj_x");
      } else if (name === "domainBindingProxyRequired") {
        error = (factory as (details?: Record<string, string>) => typeof error)({
          resourceId: "res_demo",
        });
      } else {
        error = (factory as (message: string, details?: Record<string, string>) => typeof error)(
          `message-for-${name}`,
          { source: name },
        );
      }
      expect(error.code.length).toBeGreaterThan(0);
      expect(error.message.length).toBeGreaterThan(0);
      expect(["user", "infra", "provider", "retryable", "timeout"]).toContain(error.category);
      codes.push(error.code);
    }

    expect(codes.length).toBeGreaterThan(90);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("Additional selection specifications", () => {
  test("[CORE-SPEC-EXTRA-001] active domain binding and resource-binding-by-resource isolation", () => {
    const active = DomainBinding.rehydrate({
      id: DomainBindingId.rehydrate("dom_active"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      resourceId: ResourceId.rehydrate("res_demo"),
      serverId: DeploymentTargetId.rehydrate("srv_demo"),
      destinationId: DestinationId.rehydrate("dst_demo"),
      domainName: PublicDomainName.rehydrate("app.example.com"),
      pathPrefix: RoutePathPrefix.rehydrate("/"),
      proxyKind: EdgeProxyKindValue.rehydrate("traefik"),
      tlsMode: TlsModeValue.rehydrate("auto"),
      certificatePolicy: CertificatePolicyValue.rehydrate("auto"),
      status: DomainBindingStatusValue.rehydrate("ready"),
      verificationAttempts: [],
      createdAt,
    });
    const inactive = DomainBinding.rehydrate({
      ...active.toState(),
      id: DomainBindingId.rehydrate("dom_failed"),
      status: DomainBindingStatusValue.rehydrate("failed"),
    });

    const activeSpec = ActiveDomainBindingByOwnerAndRouteSpec.create({
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      resourceId: ResourceId.rehydrate("res_demo"),
      domainName: PublicDomainName.rehydrate("app.example.com"),
      pathPrefix: RoutePathPrefix.rehydrate("/"),
    });
    expect(activeSpec.isSatisfiedBy(active)).toBe(true);
    expect(activeSpec.isSatisfiedBy(inactive)).toBe(false);
    expect(
      UpsertDomainBindingSpec.fromDomainBinding(active).accept({
        visitUpsertDomainBinding: (spec) => spec.state.id.value,
      }),
    ).toBe("dom_active");

    const binding = ResourceBinding.create({
      id: ResourceBindingId.rehydrate("rbd_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      resourceId: ResourceId.rehydrate("res_demo"),
      resourceInstanceId: ResourceInstanceId.rehydrate("rsi_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      targetName: ResourceBindingTargetName.rehydrate("DATABASE_URL"),
      scope: ResourceBindingScopeValue.rehydrate("runtime-only"),
      injectionMode: ResourceInjectionModeValue.rehydrate("env"),
      createdAt,
    })._unsafeUnwrap();
    const other = ResourceBinding.create({
      id: ResourceBindingId.rehydrate("rbd_other"),
      projectId: ProjectId.rehydrate("prj_demo"),
      resourceId: ResourceId.rehydrate("res_other"),
      resourceInstanceId: ResourceInstanceId.rehydrate("rsi_other"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      targetName: ResourceBindingTargetName.rehydrate("REDIS_URL"),
      scope: ResourceBindingScopeValue.rehydrate("runtime-only"),
      injectionMode: ResourceInjectionModeValue.rehydrate("env"),
      createdAt,
    })._unsafeUnwrap();

    const byResource = ResourceBindingsByResourceSpec.create(ResourceId.rehydrate("res_demo"));
    expect(byResource.isSatisfiedBy(binding)).toBe(true);
    expect(byResource.isSatisfiedBy(other)).toBe(false);
  });

  test("[CORE-SPEC-EXTRA-002] storage/env/target visitors and certificate idempotency selection", () => {
    const volume = StorageVolume.create({
      id: StorageVolumeId.rehydrate("stv_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      name: StorageVolumeName.rehydrate("App Data"),
      kind: StorageVolumeKindValue.rehydrate("named-volume"),
      createdAt,
    })._unsafeUnwrap();
    const bySlug = StorageVolumeByEnvironmentAndSlugSpec.create(
      ProjectId.rehydrate("prj_demo"),
      EnvironmentId.rehydrate("env_demo"),
      volume.toState().slug,
    );
    expect(bySlug.isSatisfiedBy(volume)).toBe(true);
    expect(
      UpsertStorageVolumeSpec.fromStorageVolume(volume).accept({
        visitUpsertStorageVolume: (spec) => spec.state.id.value,
      }),
    ).toBe("stv_demo");

    const env = EnvironmentProfile.create({
      id: EnvironmentId.rehydrate("env_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      name: EnvironmentName.rehydrate("production"),
      kind: EnvironmentKindValue.rehydrate("production"),
      createdAt,
    })._unsafeUnwrap();
    expect(
      EnvironmentByProjectAndNameSpec.create(
        ProjectId.rehydrate("prj_demo"),
        EnvironmentName.rehydrate("production"),
      ).accept("query", {
        visitEnvironmentById: () => "id",
        visitEnvironmentByProjectAndName: (_query, spec) =>
          `${spec.projectId.value}:${spec.name.value}`,
      }),
    ).toBe("prj_demo:production");
    expect(
      UpsertEnvironmentSpec.fromEnvironment(env).accept({
        visitUpsertEnvironment: (spec) => spec.state.id.value,
      }),
    ).toBe("env_demo");

    const target = DeploymentTarget.register({
      id: DeploymentTargetId.rehydrate("srv_demo"),
      name: DeploymentTargetName.rehydrate("edge"),
      host: HostAddress.rehydrate("10.0.0.8"),
      port: PortNumber.rehydrate(22),
      providerKey: ProviderKey.rehydrate("local-shell"),
      targetKind: TargetKindValue.rehydrate("single-server"),
      createdAt,
    })._unsafeUnwrap();
    expect(
      DeploymentTargetByProviderAndHostSpec.create(
        ProviderKey.rehydrate("local-shell"),
        HostAddress.rehydrate("10.0.0.8"),
      ).accept("query", {
        visitDeploymentTargetById: () => "id",
        visitDeploymentTargetByProviderAndHost: (_query, spec) =>
          `${spec.providerKey.value}:${spec.host.value}`,
        visitNonDeletedDeploymentTargetByEndpoint: () => "endpoint",
      }),
    ).toBe("local-shell:10.0.0.8");
    expect(
      NonDeletedDeploymentTargetByEndpointSpec.create(
        ProviderKey.rehydrate("local-shell"),
        HostAddress.rehydrate("10.0.0.8"),
        PortNumber.rehydrate(22),
      ).accept("query", {
        visitDeploymentTargetById: () => "id",
        visitDeploymentTargetByProviderAndHost: () => "provider",
        visitNonDeletedDeploymentTargetByEndpoint: (_query, spec) =>
          `${spec.providerKey.value}:${spec.host.value}:${spec.port.value}`,
      }),
    ).toBe("local-shell:10.0.0.8:22");
    expect(target.toState().host.value).toBe("10.0.0.8");

    const destination = Destination.register({
      id: DestinationId.rehydrate("dst_demo"),
      serverId: DeploymentTargetId.rehydrate("srv_demo"),
      name: DestinationName.rehydrate("default"),
      createdAt,
    })._unsafeUnwrap();
    expect(
      UpsertDestinationSpec.fromDestination(destination).accept({
        visitUpsertDestination: (spec) => spec.state.id.value,
      }),
    ).toBe("dst_demo");

    const certificate = Certificate.request({
      id: CertificateId.rehydrate("crt_demo"),
      domainBindingId: DomainBindingId.rehydrate("dom_demo"),
      domainName: PublicDomainName.rehydrate("secure.example.com"),
      attemptId: CertificateAttemptId.rehydrate("cat_demo"),
      reason: CertificateIssueReasonValue.rehydrate("issue"),
      providerKey: ProviderKey.rehydrate("acme"),
      challengeType: CertificateChallengeTypeValue.rehydrate("http-01"),
      requestedAt: createdAt,
      idempotencyKey: CertificateAttemptIdempotencyKeyValue.rehydrate("idem_cert_1"),
    })._unsafeUnwrap();
    expect(
      CertificateByAttemptIdempotencyKeySpec.create("idem_cert_1").isSatisfiedBy(certificate),
    ).toBe(true);
    expect(
      CertificateByAttemptIdempotencyKeySpec.create("idem_other").isSatisfiedBy(certificate),
    ).toBe(false);
  });
});
