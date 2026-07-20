import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  ExpiresAt,
  PromotionCandidatePreviewId,
  SandboxId,
  SandboxPromotion,
  SandboxPromotionId,
  SourceArtifactDigest,
  SourceArtifactId,
  UpdatedAt,
} from "../src";

describe("Sandbox Promotion", () => {
  test("[PROMOTION-PLAN-001] binds exact digest, target and expiry", () => {
    const promotion = SandboxPromotion.plan({
      id: SandboxPromotionId.rehydrate("spm_demo"),
      sandboxId: SandboxId.rehydrate("sbx_demo"),
      artifactId: SourceArtifactId.rehydrate("sart_demo"),
      artifactDigest: SourceArtifactDigest.rehydrate(
        "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      ),
      candidatePreviewId: PromotionCandidatePreviewId.rehydrate("spp_demo"),
      target: {
        projectId: "prj_demo",
        environmentId: "env_demo",
        destinationId: "dst_demo",
        resourceName: "Generated app",
      },
      createdAt: CreatedAt.rehydrate("2026-07-20T00:00:00.000Z"),
      expiresAt: ExpiresAt.rehydrate("2026-07-20T01:00:00.000Z"),
    })._unsafeUnwrap();

    const mismatch = promotion.accept({
      expectedArtifactDigest: SourceArtifactDigest.rehydrate(
        "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      ),
      idempotencyKey: "promote_once",
      at: UpdatedAt.rehydrate("2026-07-20T00:10:00.000Z"),
    });
    expect(mismatch.isErr()).toBe(true);

    promotion
      .accept({
        expectedArtifactDigest: promotion.toState().artifactDigest,
        idempotencyKey: "promote_once",
        at: UpdatedAt.rehydrate("2026-07-20T00:10:00.000Z"),
      })
      ._unsafeUnwrap();
    promotion
      .recordResource({
        resourceId: "res_demo",
        at: UpdatedAt.rehydrate("2026-07-20T00:11:00.000Z"),
      })
      ._unsafeUnwrap();
    promotion
      .recordDeployment({
        deploymentId: "dep_demo",
        at: UpdatedAt.rehydrate("2026-07-20T00:12:00.000Z"),
      })
      ._unsafeUnwrap();
    promotion.markVerified({ at: UpdatedAt.rehydrate("2026-07-20T00:13:00.000Z") })._unsafeUnwrap();

    expect(promotion.toState().status.value).toBe("completed");
    expect(promotion.toState().resourceId?.value).toBe("res_demo");
    expect(promotion.toState().deploymentId?.value).toBe("dep_demo");
  });
});
