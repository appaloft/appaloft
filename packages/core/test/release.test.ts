import { describe, expect, test } from "bun:test";

import {
  ArtifactDigest,
  CreatedAt,
  EnvironmentId,
  EnvironmentSnapshotId,
  Release,
  ReleaseId,
  ReleaseVersion,
  SealedAt,
  SourceRevision,
  WorkloadId,
} from "../src";

const createdAt = CreatedAt.rehydrate("2026-07-20T00:00:00.000Z");
const sealedAt = SealedAt.rehydrate("2026-07-20T00:05:00.000Z");

function prepareRelease(input?: { artifactDigest?: string; sealedAt?: SealedAt }) {
  return Release.prepare({
    id: ReleaseId.rehydrate("rel_demo"),
    workloadId: WorkloadId.rehydrate("wld_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    version: ReleaseVersion.rehydrate("1.2.0"),
    sourceRevision: SourceRevision.rehydrate("git:abcdef123456"),
    ...(input?.artifactDigest
      ? { artifactDigest: ArtifactDigest.rehydrate(input.artifactDigest) }
      : {}),
    configSnapshotId: EnvironmentSnapshotId.rehydrate("snap_demo"),
    createdAt,
    ...(input?.sealedAt ? { sealedAt: input.sealedAt } : {}),
  });
}

describe("Release", () => {
  test("[CORE-REL-001] prepares a release and emits release.prepared", () => {
    const prepared = prepareRelease({
      artifactDigest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    });
    expect(prepared.isOk()).toBe(true);

    const release = prepared._unsafeUnwrap();
    expect(release.toState().id.value).toBe("rel_demo");
    expect(release.toState().version.value).toBe("1.2.0");
    expect(release.toState().sealedAt).toBeUndefined();
    expect(release.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: "release.prepared",
        aggregateId: "rel_demo",
        payload: {
          workloadId: "wld_demo",
          environmentId: "env_demo",
        },
      }),
    ]);
  });

  test("[CORE-REL-002] seals an unsealed release once and emits release.sealed", () => {
    const release = prepareRelease()._unsafeUnwrap();
    release.pullDomainEvents();

    const sealed = release.seal(sealedAt);
    expect(sealed.isOk()).toBe(true);
    expect(release.toState().sealedAt?.value).toBe(sealedAt.value);
    expect(release.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: "release.sealed",
        aggregateId: "rel_demo",
        payload: {
          workloadId: "wld_demo",
          environmentId: "env_demo",
        },
      }),
    ]);
  });

  test("[CORE-REL-003] rejects a second seal as an invariant violation", () => {
    const release = prepareRelease()._unsafeUnwrap();
    release.seal(sealedAt)._unsafeUnwrap();
    release.pullDomainEvents();

    const again = release.seal(SealedAt.rehydrate("2026-07-20T00:06:00.000Z"));
    expect(again.isErr()).toBe(true);
    expect(again._unsafeUnwrapErr()).toMatchObject({
      code: "invariant_violation",
      message: "Release is already sealed",
      details: { releaseId: "rel_demo" },
    });
    expect(release.toState().sealedAt?.value).toBe(sealedAt.value);
    expect(release.pullDomainEvents()).toEqual([]);
  });

  test("[CORE-REL-004] rehydrates a sealed release without inventing events and still blocks reseal", () => {
    const release = Release.rehydrate({
      id: ReleaseId.rehydrate("rel_rehydrated"),
      workloadId: WorkloadId.rehydrate("wld_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      version: ReleaseVersion.rehydrate("2.0.0"),
      sourceRevision: SourceRevision.rehydrate("git:fedcba654321"),
      configSnapshotId: EnvironmentSnapshotId.rehydrate("snap_demo"),
      createdAt,
      sealedAt,
    });

    expect(release.pullDomainEvents()).toEqual([]);
    expect(release.toState().sealedAt?.value).toBe(sealedAt.value);

    const resealed = release.seal(SealedAt.rehydrate("2026-07-20T00:10:00.000Z"));
    expect(resealed.isErr()).toBe(true);
    expect(resealed._unsafeUnwrapErr()).toMatchObject({
      code: "invariant_violation",
      message: "Release is already sealed",
      details: { releaseId: "rel_rehydrated" },
    });
    expect(release.toState().sealedAt?.value).toBe(sealedAt.value);
  });

  test("[CORE-REL-005] visitor accept forwards the aggregate without mutating state", () => {
    const release = prepareRelease()._unsafeUnwrap();
    release.pullDomainEvents();

    const seen = release.accept(
      {
        visitRelease(current, context: { label: string }) {
          return `${context.label}:${current.toState().id.value}`;
        },
      },
      { label: "audit" },
    );

    expect(seen).toBe("audit:rel_demo");
    expect(release.toState().sealedAt).toBeUndefined();
    expect(release.pullDomainEvents()).toEqual([]);
  });
});
