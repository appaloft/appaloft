import { describe, expect, test } from "bun:test";
import {
  BuildStrategyKindValue,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DetectSummary,
  DisplayNameText,
  ExecutionStrategyKindValue,
  GeneratedAt,
  PackagingModeValue,
  PlanStepText,
  ProviderKey,
  ResourceSourceBinding,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  TargetKindValue,
  Version,
  VersionReference,
} from "../src";

function sourceWithVersion(version: Version) {
  return SourceDescriptor.rehydrate({
    kind: SourceKindValue.rehydrate("docker-image"),
    locator: SourceLocator.rehydrate("ghcr.io/acme/api:1.7.3"),
    displayName: DisplayNameText.rehydrate("api"),
  }).withVersion(version);
}

function runtimePlanWithSource(source: SourceDescriptor) {
  return RuntimePlan.create({
    id: RuntimePlanId.rehydrate("rpl_demo"),
    source,
    buildStrategy: BuildStrategyKindValue.rehydrate("prebuilt-image"),
    packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
    execution: RuntimeExecutionPlan.rehydrate({
      kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
    }),
    target: DeploymentTargetDescriptor.rehydrate({
      kind: TargetKindValue.rehydrate("single-server"),
      providerKey: ProviderKey.rehydrate("local-shell"),
      serverIds: [DeploymentTargetId.rehydrate("srv_demo")],
    }),
    detectSummary: DetectSummary.rehydrate("prebuilt image"),
    steps: [PlanStepText.rehydrate("Run container")],
    generatedAt: GeneratedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  });
}

describe("Version", () => {
  test("models fixed versions with aliases for equivalent references", () => {
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

    const version = Version.fixed({
      reference: tag,
      fixedIdentifier: digest,
      aliases: [tag],
    })._unsafeUnwrap();

    expect(version.isFixed()).toBe(true);
    expect(version.referencesSameVersion(tag)).toBe(true);
    expect(version.referencesSameVersion(digest)).toBe(true);
    expect(version.toState().aliases).toHaveLength(2);
  });

  test("keeps floating references out of fixed deployment runtime plans", () => {
    const latest = VersionReference.create({
      sourceKind: "docker-image",
      referenceKind: "image-tag",
      value: "latest",
    })._unsafeUnwrap();
    const floating = Version.floating({ reference: latest })._unsafeUnwrap();

    const result = runtimePlanWithSource(sourceWithVersion(floating));

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.details).toMatchObject({
        phase: "version-resolution",
        referenceKind: "image-tag",
        referenceValue: "latest",
      });
    }
  });

  test("rejects source/version mismatches in core value objects", () => {
    expect(
      VersionReference.create({
        sourceKind: "git",
        referenceKind: "image-tag",
        value: "latest",
      }).isErr(),
    ).toBe(true);

    const dockerVersion = VersionReference.create({
      sourceKind: "docker-image",
      referenceKind: "image-tag",
      value: "latest",
    })._unsafeUnwrap();

    const source = ResourceSourceBinding.create({
      kind: SourceKindValue.rehydrate("git-public"),
      locator: SourceLocator.rehydrate("https://github.com/acme/api.git"),
      displayName: DisplayNameText.rehydrate("api"),
      versionReference: dockerVersion,
    });

    expect(source.isErr()).toBe(true);
    if (source.isErr()) {
      expect(source.error.details).toMatchObject({
        phase: "resource-source-resolution",
        sourceKind: "git-public",
        versionSourceKind: "docker-image",
      });
    }
  });

  test("infers source-specific version reference kind when no hint is provided", () => {
    const gitTag = VersionReference.createForSource({
      sourceKind: "git",
      value: "v1.2.3",
    })._unsafeUnwrap();
    const gitSha = VersionReference.createForSource({
      sourceKind: "git",
      value: "0123456789abcdef0123456789abcdef01234567",
    })._unsafeUnwrap();
    const imageTag = VersionReference.createForSource({
      sourceKind: "docker-image",
      value: "latest",
    })._unsafeUnwrap();

    expect(gitTag.referenceKind).toBe("tag");
    expect(gitSha.referenceKind).toBe("commit-sha");
    expect(imageTag.referenceKind).toBe("image-tag");
  });

  test("accepts optional source-specific version kind hints and rejects incompatible hints", () => {
    const gitBranch = VersionReference.createForSource({
      sourceKind: "git",
      referenceKind: "branch",
      value: "v1.2.3",
    })._unsafeUnwrap();
    const dockerBranch = VersionReference.createForSource({
      sourceKind: "docker-image",
      referenceKind: "branch",
      value: "main",
    });

    expect(gitBranch.referenceKind).toBe("branch");
    expect(dockerBranch.isErr()).toBe(true);
    if (dockerBranch.isErr()) {
      expect(dockerBranch.error.details).toMatchObject({
        phase: "version-resolution",
        sourceKind: "docker-image",
        referenceKind: "branch",
      });
    }
  });

  test("allows legacy unknown versions to rehydrate for existing deployments", () => {
    const result = runtimePlanWithSource(sourceWithVersion(Version.unknown()));

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.source.version?.isUnknown()).toBe(true);
    }
  });
});
