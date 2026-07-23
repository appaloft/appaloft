import { describe, expect, test } from "bun:test";

import {
  AccessRoute,
  BuildStrategyKindValue,
  CanonicalRedirectStatusCode,
  DeploymentId,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DetectSummary,
  DisplayNameText,
  EdgeProxyKindValue,
  EnvironmentSnapshotId,
  ExecutionResult,
  ExecutionStatusValue,
  ExecutionStrategyKindValue,
  ExitCode,
  FilePathText,
  GeneratedAt,
  ImageReference,
  PackagingModeValue,
  PlanStepText,
  PortNumber,
  ProviderKey,
  PublicDomainName,
  RollbackPlan,
  RollbackPlanId,
  RoutePathPrefix,
  RuntimeArtifactIntentValue,
  RuntimeArtifactKindValue,
  RuntimeArtifactSnapshot,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  RuntimeVerificationStep,
  RuntimeVerificationStepKindValue,
  SourceApplicationShapeValue,
  SourceDescriptor,
  SourceDetectedFileValue,
  SourceDetectedScriptValue,
  SourceFrameworkValue,
  SourceInspectionSnapshot,
  SourceKindValue,
  SourceLocator,
  SourcePackageManagerValue,
  SourceRuntimeFamilyValue,
  SourceRuntimeVersionText,
  TargetKindValue,
  TlsModeValue,
  Version,
  VersionReference,
} from "../src";

function baseSource(input?: { kind?: "local-folder" | "docker-image" | "git-public" }) {
  return SourceDescriptor.rehydrate({
    kind: SourceKindValue.rehydrate(input?.kind ?? "local-folder"),
    locator: SourceLocator.rehydrate(
      input?.kind === "docker-image" ? "ghcr.io/acme/api:1.7.3" : "/workspace/app",
    ),
    displayName: DisplayNameText.rehydrate("app"),
  });
}

function baseTarget() {
  return DeploymentTargetDescriptor.rehydrate({
    kind: TargetKindValue.rehydrate("single-server"),
    providerKey: ProviderKey.rehydrate("local-shell"),
    serverIds: [DeploymentTargetId.rehydrate("srv_demo")],
  });
}

function baseExecution(input?: { accessRoutes?: AccessRoute[] }) {
  return RuntimeExecutionPlan.rehydrate({
    kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
    image: ImageReference.rehydrate("ghcr.io/acme/api:1.7.3"),
    ...(input?.accessRoutes ? { accessRoutes: input.accessRoutes } : {}),
  });
}

function accessRoute(input?: {
  domains?: string[];
  pathPrefix?: string;
  tlsMode?: "auto" | "disabled";
  proxyKind?: "traefik" | "none" | "caddy";
  redirectTo?: string;
  redirectStatus?: 301 | 302 | 307 | 308;
}) {
  return AccessRoute.create({
    proxyKind: EdgeProxyKindValue.rehydrate(input?.proxyKind ?? "traefik"),
    domains: (input?.domains ?? ["api.example.com"]).map((domain) =>
      PublicDomainName.rehydrate(domain),
    ),
    pathPrefix: RoutePathPrefix.rehydrate(input?.pathPrefix ?? "/"),
    tlsMode: TlsModeValue.rehydrate(input?.tlsMode ?? "auto"),
    targetPort: PortNumber.rehydrate(3000),
    ...(input?.redirectTo
      ? {
          redirectTo: PublicDomainName.rehydrate(input.redirectTo),
          redirectStatus: CanonicalRedirectStatusCode.rehydrate(input.redirectStatus ?? 301),
        }
      : {}),
  });
}

function createRuntimePlan(input?: {
  source?: SourceDescriptor;
  steps?: PlanStepText[];
  execution?: RuntimeExecutionPlan;
  runtimeArtifact?: RuntimeArtifactSnapshot;
}) {
  return RuntimePlan.create({
    id: RuntimePlanId.rehydrate("rpl_demo"),
    source: input?.source ?? baseSource(),
    buildStrategy: BuildStrategyKindValue.rehydrate("prebuilt-image"),
    packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
    execution: input?.execution ?? baseExecution(),
    ...(input?.runtimeArtifact ? { runtimeArtifact: input.runtimeArtifact } : {}),
    target: baseTarget(),
    detectSummary: DetectSummary.rehydrate("prebuilt image"),
    steps: input?.steps ?? [PlanStepText.rehydrate("Run container")],
    generatedAt: GeneratedAt.rehydrate("2026-07-20T00:00:00.000Z"),
  });
}

function fixedDockerVersion() {
  const tag = VersionReference.create({
    sourceKind: "docker-image",
    referenceKind: "image-tag",
    value: "1.7.3",
  })._unsafeUnwrap();
  const digest = VersionReference.create({
    sourceKind: "docker-image",
    referenceKind: "image-digest",
    value: "sha256:8b1a9953c4611296a827abf8c47804d7f6f4e6a6d7f4aaf8f6f5c6e6d7c8b9a0",
  })._unsafeUnwrap();
  return Version.fixed({
    reference: tag,
    fixedIdentifier: digest,
    aliases: [tag],
  })._unsafeUnwrap();
}

describe("AccessRoute", () => {
  test("requires domains when proxy routing is enabled", () => {
    const route = AccessRoute.create({
      proxyKind: EdgeProxyKindValue.rehydrate("traefik"),
      domains: [],
      pathPrefix: RoutePathPrefix.rehydrate("/"),
      tlsMode: TlsModeValue.rehydrate("auto"),
      targetPort: PortNumber.rehydrate(3000),
    });

    expect(route.isErr()).toBe(true);
  });

  test("[DMBH-RUNTIME-001] composes proxy kind predicates for route domain admission", () => {
    const disabledWithDomain = AccessRoute.create({
      proxyKind: EdgeProxyKindValue.rehydrate("none"),
      domains: [PublicDomainName.rehydrate("api.example.com")],
      pathPrefix: RoutePathPrefix.rehydrate("/"),
      tlsMode: TlsModeValue.rehydrate("disabled"),
    });
    const enabledWithDomain = AccessRoute.create({
      proxyKind: EdgeProxyKindValue.rehydrate("traefik"),
      domains: [PublicDomainName.rehydrate("api.example.com")],
      pathPrefix: RoutePathPrefix.rehydrate("/"),
      tlsMode: TlsModeValue.rehydrate("auto"),
      targetPort: PortNumber.rehydrate(3000),
    });
    const redirectToSelf = AccessRoute.create({
      proxyKind: EdgeProxyKindValue.rehydrate("traefik"),
      domains: [PublicDomainName.rehydrate("api.example.com")],
      pathPrefix: RoutePathPrefix.rehydrate("/"),
      tlsMode: TlsModeValue.rehydrate("auto"),
      targetPort: PortNumber.rehydrate(3000),
      redirectTo: PublicDomainName.rehydrate("api.example.com"),
    });

    expect(EdgeProxyKindValue.rehydrate("none").isDisabled()).toBe(true);
    expect(EdgeProxyKindValue.rehydrate("traefik").isProviderBacked()).toBe(true);
    expect(disabledWithDomain.isErr()).toBe(true);
    expect(enabledWithDomain.isOk()).toBe(true);
    expect(redirectToSelf.isErr()).toBe(true);
  });

  test("[CORE-RUNTIME-ROUTE-001] rejects redirect status without target and matches expectations", () => {
    const missingTarget = AccessRoute.create({
      proxyKind: EdgeProxyKindValue.rehydrate("traefik"),
      domains: [PublicDomainName.rehydrate("api.example.com")],
      pathPrefix: RoutePathPrefix.rehydrate("/v1"),
      tlsMode: TlsModeValue.rehydrate("auto"),
      targetPort: PortNumber.rehydrate(3000),
      redirectStatus: CanonicalRedirectStatusCode.rehydrate(302),
    });
    expect(missingTarget.isErr()).toBe(true);
    expect(missingTarget._unsafeUnwrapErr().message).toBe(
      "Canonical redirect status requires redirect target",
    );

    const route = accessRoute({
      domains: ["api.example.com"],
      pathPrefix: "/v1",
      redirectTo: "www.example.com",
      redirectStatus: 301,
    })._unsafeUnwrap();

    expect(route.routeBehavior).toBe("redirect");
    expect(route.redirectTo).toBe("www.example.com");
    expect(route.redirectStatus).toBe(301);
    expect(
      route.matchesExpectation({
        host: PublicDomainName.rehydrate("api.example.com"),
        pathPrefix: RoutePathPrefix.rehydrate("/v1"),
        tlsMode: TlsModeValue.rehydrate("auto"),
      }),
    ).toBe(true);
    expect(
      route.matchesExpectation({
        host: PublicDomainName.rehydrate("other.example.com"),
        pathPrefix: RoutePathPrefix.rehydrate("/v1"),
        tlsMode: TlsModeValue.rehydrate("auto"),
      }),
    ).toBe(false);
  });

  test("[DMBH-RUNTIME-001] artifact kind and intent answer prerequisite requirements", () => {
    const prebuiltWithoutImage = RuntimeArtifactSnapshot.create({
      kind: RuntimeArtifactKindValue.rehydrate("image"),
      intent: RuntimeArtifactIntentValue.rehydrate("prebuilt-image"),
    });
    const prebuiltWithImage = RuntimeArtifactSnapshot.create({
      kind: RuntimeArtifactKindValue.rehydrate("image"),
      intent: RuntimeArtifactIntentValue.rehydrate("prebuilt-image"),
      image: ImageReference.rehydrate("ghcr.io/appaloft/demo:latest"),
    });
    const composeWithoutFile = RuntimeArtifactSnapshot.create({
      kind: RuntimeArtifactKindValue.rehydrate("compose-project"),
      intent: RuntimeArtifactIntentValue.rehydrate("compose-project"),
    });
    const composeWithFile = RuntimeArtifactSnapshot.create({
      kind: RuntimeArtifactKindValue.rehydrate("compose-project"),
      intent: RuntimeArtifactIntentValue.rehydrate("compose-project"),
      composeFile: FilePathText.rehydrate("compose.yaml"),
    });

    expect(RuntimeArtifactIntentValue.rehydrate("prebuilt-image").isPrebuiltImage()).toBe(true);
    expect(RuntimeArtifactKindValue.rehydrate("compose-project").isComposeProject()).toBe(true);
    expect(prebuiltWithoutImage.isErr()).toBe(true);
    expect(prebuiltWithImage.isOk()).toBe(true);
    expect(composeWithoutFile.isErr()).toBe(true);
    expect(composeWithFile.isOk()).toBe(true);
  });

  test("normalizes public domain names", () => {
    const domain = PublicDomainName.create("API.Example.COM")._unsafeUnwrap();

    expect(domain.value).toBe("api.example.com");
  });
});

describe("RuntimePlan", () => {
  test("[CORE-RUNTIME-PLAN-001] creates a deployable plan with fixed source version and steps", () => {
    const source = baseSource({ kind: "docker-image" }).withVersion(fixedDockerVersion());
    const plan = createRuntimePlan({
      source,
      runtimeArtifact: RuntimeArtifactSnapshot.create({
        kind: RuntimeArtifactKindValue.rehydrate("image"),
        intent: RuntimeArtifactIntentValue.rehydrate("prebuilt-image"),
        image: ImageReference.rehydrate(
          "ghcr.io/acme/api@sha256:8b1a9953c4611296a827abf8c47804d7f6f4e6a6d7f4aaf8f6f5c6e6d7c8b9a0",
        ),
      })._unsafeUnwrap(),
    })._unsafeUnwrap();

    expect(plan.id).toBe("rpl_demo");
    expect(plan.hasSteps()).toBe(true);
    expect(plan.steps).toEqual(["Run container"]);
    expect(plan.source.version?.isFixedForDeployment()).toBe(true);
    expect(plan.runtimeArtifact?.image).toContain("ghcr.io/acme/api@sha256:");
    expect(plan.buildStrategy).toBe("prebuilt-image");
    expect(plan.packagingMode).toBe("all-in-one-docker");
    expect(plan.execution.kind).toBe("docker-container");
    expect(plan.target.serverIds).toEqual(["srv_demo"]);
  });

  test("[CORE-RUNTIME-PLAN-002] rejects empty step lists", () => {
    const created = createRuntimePlan({ steps: [] });
    expect(created.isErr()).toBe(true);
    expect(created._unsafeUnwrapErr().message).toBe("Runtime plan must contain at least one step");
  });

  test("[CORE-RUNTIME-PLAN-003] rejects floating source versions fail-closed", () => {
    const floating = Version.floating({
      reference: VersionReference.create({
        sourceKind: "docker-image",
        referenceKind: "image-tag",
        value: "latest",
      })._unsafeUnwrap(),
    })._unsafeUnwrap();

    const created = createRuntimePlan({
      source: baseSource({ kind: "docker-image" }).withVersion(floating),
    });

    expect(created.isErr()).toBe(true);
    expect(created._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      details: {
        phase: "version-resolution",
        referenceKind: "image-tag",
        referenceValue: "latest",
      },
    });
  });

  test("[CORE-RUNTIME-PLAN-004] allows unknown source versions for legacy rehydrate paths", () => {
    const created = createRuntimePlan({
      source: baseSource({ kind: "docker-image" }).withVersion(Version.unknown()),
    });

    expect(created.isOk()).toBe(true);
    expect(created._unsafeUnwrap().source.version?.isFixedForDeployment()).toBe(true);
    expect(created._unsafeUnwrap().source.version?.isUnknown()).toBe(true);
  });

  test("[CORE-RUNTIME-PLAN-005] withExecution/withSource/withExecutionMetadata preserve plan identity", () => {
    const plan = createRuntimePlan()._unsafeUnwrap();
    const route = accessRoute()._unsafeUnwrap();

    const withRoute = plan.withExecution(baseExecution({ accessRoutes: [route] }));
    const withMeta = withRoute.withExecutionMetadata({ releaseChannel: "stable" });
    const withSource = withMeta.withSource(
      baseSource({ kind: "git-public" }).withVersion(fixedDockerVersion()),
    );

    expect(withSource.id).toBe("rpl_demo");
    expect(withSource.source.kind).toBe("git-public");
    expect(withSource.execution.metadata).toEqual({ releaseChannel: "stable" });
    expect(
      withSource.hasAccessRoute({
        host: PublicDomainName.rehydrate("api.example.com"),
        pathPrefix: RoutePathPrefix.rehydrate("/"),
        tlsMode: TlsModeValue.rehydrate("auto"),
      }),
    ).toBe(true);
    expect(
      plan.hasAccessRoute({
        host: PublicDomainName.rehydrate("api.example.com"),
        pathPrefix: RoutePathPrefix.rehydrate("/"),
        tlsMode: TlsModeValue.rehydrate("auto"),
      }),
    ).toBe(false);
  });

  test("[CORE-RUNTIME-PLAN-006] execution helpers replace access routes and verification steps", () => {
    const route = accessRoute({ domains: ["app.example.com"], pathPrefix: "/api" })._unsafeUnwrap();
    const verification = RuntimeVerificationStep.create({
      kind: RuntimeVerificationStepKindValue.rehydrate("public-http"),
      label: PlanStepText.rehydrate("Probe public health"),
    })._unsafeUnwrap();

    const execution = baseExecution()
      .withAccessRoutes([route])
      .withVerificationSteps([verification])
      .withMetadata({ owner: "platform" });

    expect(execution.accessRoutes).toHaveLength(1);
    expect(execution.verificationSteps.map((step) => step.toState().label.value)).toEqual([
      "Probe public health",
    ]);
    expect(execution.metadata).toEqual({ owner: "platform" });
    expect(
      execution.hasAccessRoute({
        host: PublicDomainName.rehydrate("app.example.com"),
        pathPrefix: RoutePathPrefix.rehydrate("/api"),
        tlsMode: TlsModeValue.rehydrate("auto"),
      }),
    ).toBe(true);
  });
});

describe("DeploymentTargetDescriptor", () => {
  test("[CORE-RUNTIME-TARGET-001] requires at least one server id", () => {
    const empty = DeploymentTargetDescriptor.create({
      kind: TargetKindValue.rehydrate("single-server"),
      providerKey: ProviderKey.rehydrate("local-shell"),
      serverIds: [],
    });
    expect(empty.isErr()).toBe(true);
    expect(empty._unsafeUnwrapErr().message).toBe(
      "Deployment target descriptor must contain at least one server",
    );

    const okTarget = DeploymentTargetDescriptor.create({
      kind: TargetKindValue.rehydrate("single-server"),
      providerKey: ProviderKey.rehydrate("local-shell"),
      serverIds: [DeploymentTargetId.rehydrate("srv_a"), DeploymentTargetId.rehydrate("srv_b")],
      metadata: { region: "local" },
    })._unsafeUnwrap();

    expect(okTarget.serverIds).toEqual(["srv_a", "srv_b"]);
    expect(okTarget.metadata).toEqual({ region: "local" });
  });
});

describe("SourceDescriptor and inspection", () => {
  test("[CORE-RUNTIME-SOURCE-001] visitor dispatches by source kind without mutation", () => {
    const source = baseSource({ kind: "git-public" });
    const seen = source.accept({
      localFolder: () => "local-folder",
      localGit: () => "local-git",
      remoteGit: () => "remote-git",
      gitPublic: (current) => `git-public:${current.locator}`,
      gitGithubApp: () => "git-github-app",
      gitDeployKey: () => "git-deploy-key",
      zipArtifact: () => "zip-artifact",
      dockerfileInline: () => "dockerfile-inline",
      dockerComposeInline: () => "docker-compose-inline",
      dockerImage: () => "docker-image",
      compose: () => "compose",
    });

    expect(seen).toBe("git-public:/workspace/app");
    expect(source.kind).toBe("git-public");
  });

  test("[CORE-RUNTIME-SOURCE-002] inspection snapshot reports detected files and scripts", () => {
    const inspection = SourceInspectionSnapshot.create({
      runtimeFamily: SourceRuntimeFamilyValue.rehydrate("node"),
      framework: SourceFrameworkValue.rehydrate("nextjs"),
      packageManager: SourcePackageManagerValue.rehydrate("bun"),
      applicationShape: SourceApplicationShapeValue.rehydrate("ssr"),
      runtimeVersion: SourceRuntimeVersionText.rehydrate("22.0.0"),
      projectName: DisplayNameText.rehydrate("web"),
      detectedFiles: [
        SourceDetectedFileValue.rehydrate("package-json"),
        SourceDetectedFileValue.rehydrate("next-config"),
      ],
      detectedScripts: [SourceDetectedScriptValue.rehydrate("build")],
      dockerfilePath: FilePathText.rehydrate("Dockerfile"),
    })._unsafeUnwrap();

    expect(inspection.runtimeFamily).toBe("node");
    expect(inspection.framework).toBe("nextjs");
    expect(inspection.hasDetectedFile("package-json")).toBe(true);
    expect(inspection.hasDetectedFile("go-mod")).toBe(false);
    expect(inspection.hasDetectedScript("build")).toBe(true);
    expect(inspection.dockerfilePath).toBe("Dockerfile");

    const invalidFamily = SourceRuntimeFamilyValue.create("fortran");
    expect(invalidFamily.isErr()).toBe(true);
    expect(SourceRuntimeVersionText.create("").isErr()).toBe(true);
  });
});

describe("RollbackPlan and ExecutionResult", () => {
  test("[CORE-RUNTIME-ROLLBACK-001] requires steps and preserves target metadata", () => {
    const empty = RollbackPlan.create({
      id: RollbackPlanId.rehydrate("rbp_demo"),
      deploymentId: DeploymentId.rehydrate("dep_demo"),
      snapshotId: EnvironmentSnapshotId.rehydrate("snap_demo"),
      target: baseTarget(),
      steps: [],
      generatedAt: GeneratedAt.rehydrate("2026-07-20T00:05:00.000Z"),
    });
    expect(empty.isErr()).toBe(true);
    expect(empty._unsafeUnwrapErr().message).toBe("Rollback plan must contain at least one step");

    const plan = RollbackPlan.create({
      id: RollbackPlanId.rehydrate("rbp_demo"),
      deploymentId: DeploymentId.rehydrate("dep_demo"),
      snapshotId: EnvironmentSnapshotId.rehydrate("snap_demo"),
      target: baseTarget(),
      steps: [PlanStepText.rehydrate("Restore previous container")],
      generatedAt: GeneratedAt.rehydrate("2026-07-20T00:05:00.000Z"),
    })._unsafeUnwrap();

    expect(plan.steps).toEqual(["Restore previous container"]);
    expect(plan.deploymentId).toBe("dep_demo");
    expect(plan.snapshotId).toBe("snap_demo");
    expect(plan.target.providerKey).toBe("local-shell");
  });

  test("[CORE-RUNTIME-RESULT-001] models succeeded and failed execution outcomes", () => {
    const succeeded = ExecutionResult.create({
      status: ExecutionStatusValue.rehydrate("succeeded"),
      exitCode: ExitCode.rehydrate(0),
      retryable: false,
      timeline: [],
      metadata: { stage: "verify" },
    })._unsafeUnwrap();

    expect(succeeded.status).toBe("succeeded");
    expect(succeeded.exitCode).toBe(0);
    expect(succeeded.retryable).toBe(false);
    expect(succeeded.metadata).toEqual({ stage: "verify" });

    const failed = ExecutionResult.rehydrate({
      status: ExecutionStatusValue.rehydrate("failed"),
      exitCode: ExitCode.rehydrate(1),
      retryable: true,
      timeline: [],
      metadata: { reason: "healthcheck-timeout" },
    });

    expect(failed.status).toBe("failed");
    expect(failed.retryable).toBe(true);
    expect(failed.toState().metadata).toEqual({ reason: "healthcheck-timeout" });
  });
});

describe("Runtime vocabulary validation", () => {
  test("[CORE-RUNTIME-VOCAB-001] rejects unknown artifact kinds and intents", () => {
    expect(RuntimeArtifactKindValue.create("oci-bundle").isErr()).toBe(true);
    expect(RuntimeArtifactIntentValue.create("pull-through-cache").isErr()).toBe(true);
    expect(RuntimeVerificationStepKindValue.create("ssh-probe").isErr()).toBe(true);
  });
});
