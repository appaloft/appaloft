import { type SandboxId } from "../execution-sandbox";
import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { type CreatedAt, type ExpiresAt, type UpdatedAt } from "../shared/temporal";
import { ScalarValueObject } from "../shared/value-object";
import {
  type PromotionCandidatePreviewId,
  PromotionDeploymentId,
  PromotionIdempotencyKey,
  PromotionResourceId,
  type SandboxPromotionId,
  SandboxPromotionTarget,
  type SandboxPromotionTargetState,
  type SourceArtifactDigest,
  type SourceArtifactId,
} from "./values";

export type SandboxPromotionStatus =
  | "planned"
  | "accepted"
  | "creating-resource"
  | "deploying"
  | "verifying"
  | "completed"
  | "needs-attention"
  | "failed"
  | "superseded"
  | "expired";

const promotionStatusBrand: unique symbol = Symbol("SandboxPromotionStatusValue");
export class SandboxPromotionStatusValue extends ScalarValueObject<SandboxPromotionStatus> {
  private [promotionStatusBrand]!: void;
  private constructor(value: SandboxPromotionStatus) {
    super(value);
  }
  static planned(): SandboxPromotionStatusValue {
    return new SandboxPromotionStatusValue("planned");
  }
  static rehydrate(value: SandboxPromotionStatus): SandboxPromotionStatusValue {
    return new SandboxPromotionStatusValue(value);
  }
  isTerminal(): boolean {
    return ["completed", "superseded", "expired"].includes(this.value);
  }
}

export interface SandboxPromotionState {
  id: SandboxPromotionId;
  sandboxId: SandboxId;
  artifactId: SourceArtifactId;
  artifactDigest: SourceArtifactDigest;
  candidatePreviewId: PromotionCandidatePreviewId;
  target: SandboxPromotionTarget;
  status: SandboxPromotionStatusValue;
  acceptedIdempotencyKey?: PromotionIdempotencyKey;
  resourceId?: PromotionResourceId;
  deploymentId?: PromotionDeploymentId;
  createdAt: CreatedAt;
  updatedAt?: UpdatedAt;
  expiresAt: ExpiresAt;
}

export class SandboxPromotion extends AggregateRoot<SandboxPromotionState, SandboxPromotionId> {
  private constructor(state: SandboxPromotionState) {
    super(state);
  }

  static plan(input: {
    id: SandboxPromotionId;
    sandboxId: SandboxId;
    artifactId: SourceArtifactId;
    artifactDigest: SourceArtifactDigest;
    candidatePreviewId: PromotionCandidatePreviewId;
    target: SandboxPromotionTargetState;
    createdAt: CreatedAt;
    expiresAt: ExpiresAt;
  }): Result<SandboxPromotion> {
    if (input.expiresAt.toDate() <= input.createdAt.toDate()) {
      return err(domainError.validation("Sandbox Promotion expiry must be after creation"));
    }
    const target = SandboxPromotionTarget.create(input.target);
    if (target.isErr()) return err(target.error);
    const promotion = new SandboxPromotion({
      ...input,
      target: target.value,
      status: SandboxPromotionStatusValue.planned(),
    });
    promotion.recordDomainEvent("sandbox-promotion-planned", input.createdAt, {
      artifactId: input.artifactId.value,
      artifactDigest: input.artifactDigest.value,
      candidatePreviewId: input.candidatePreviewId.value,
    });
    return ok(promotion);
  }

  static rehydrate(state: SandboxPromotionState): SandboxPromotion {
    return new SandboxPromotion(state);
  }

  toState(): SandboxPromotionState {
    return { ...this.state };
  }

  accept(input: {
    expectedArtifactDigest: SourceArtifactDigest;
    idempotencyKey: string;
    at: UpdatedAt;
  }): Result<void> {
    if (this.state.acceptedIdempotencyKey?.value === input.idempotencyKey.trim()) {
      return ok(undefined);
    }
    if (this.state.status.value !== "planned") {
      return err(domainError.conflict("Sandbox Promotion is not plan-acceptable"));
    }
    if (input.at.toDate() >= this.state.expiresAt.toDate()) {
      this.state.status = SandboxPromotionStatusValue.rehydrate("expired");
      return err(
        domainError.conflict("Sandbox Promotion plan expired", {
          code: "sandbox_promotion_plan_expired",
        }),
      );
    }
    if (!this.state.artifactDigest.equals(input.expectedArtifactDigest)) {
      return err(
        domainError.conflict("Sandbox Promotion artifact digest mismatch", {
          code: "sandbox_promotion_artifact_mismatch",
        }),
      );
    }
    const key = PromotionIdempotencyKey.create(input.idempotencyKey);
    if (key.isErr()) return err(key.error);
    this.state.acceptedIdempotencyKey = key.value;
    this.state.status = SandboxPromotionStatusValue.rehydrate("creating-resource");
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-promotion-accepted", input.at, {
      artifactDigest: this.state.artifactDigest.value,
    });
    return ok(undefined);
  }

  recordResource(input: { resourceId: string; at: UpdatedAt }): Result<void> {
    if (!this.state.acceptedIdempotencyKey) {
      return err(domainError.conflict("Sandbox Promotion has not been accepted"));
    }
    const resourceId = PromotionResourceId.create(input.resourceId);
    if (resourceId.isErr()) return err(resourceId.error);
    if (this.state.resourceId && !this.state.resourceId.equals(resourceId.value)) {
      return err(domainError.conflict("Sandbox Promotion already references another Resource"));
    }
    this.state.resourceId = resourceId.value;
    this.state.status = SandboxPromotionStatusValue.rehydrate("deploying");
    this.state.updatedAt = input.at;
    return ok(undefined);
  }

  recordDeployment(input: { deploymentId: string; at: UpdatedAt }): Result<void> {
    if (!this.state.resourceId) {
      return err(domainError.conflict("Sandbox Promotion Resource has not been created"));
    }
    const deploymentId = PromotionDeploymentId.create(input.deploymentId);
    if (deploymentId.isErr()) return err(deploymentId.error);
    this.state.deploymentId = deploymentId.value;
    this.state.status = SandboxPromotionStatusValue.rehydrate("verifying");
    this.state.updatedAt = input.at;
    return ok(undefined);
  }

  markVerified(input: { at: UpdatedAt }): Result<void> {
    if (this.state.status.value !== "verifying" || !this.state.deploymentId) {
      return err(domainError.conflict("Sandbox Promotion is not ready for proof completion"));
    }
    this.state.status = SandboxPromotionStatusValue.rehydrate("completed");
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-promotion-completed", input.at, {
      resourceId: this.state.resourceId?.value ?? null,
      deploymentId: this.state.deploymentId.value,
      proofVerdict: "verified",
    });
    return ok(undefined);
  }

  markNeedsAttention(input: { at: UpdatedAt; reasonCode: string }): Result<void> {
    if (!this.state.deploymentId) {
      return err(domainError.conflict("Sandbox Promotion has no Deployment evidence"));
    }
    this.state.status = SandboxPromotionStatusValue.rehydrate("needs-attention");
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-promotion-needs-attention", input.at, {
      reasonCode: input.reasonCode,
    });
    return ok(undefined);
  }

  markFailed(input: { at: UpdatedAt; code: string }): Result<void> {
    if (this.state.status.isTerminal()) {
      return err(domainError.conflict("Terminal Sandbox Promotion cannot fail"));
    }
    this.state.status = SandboxPromotionStatusValue.rehydrate("failed");
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-promotion-failed", input.at, { code: input.code });
    return ok(undefined);
  }

  retry(input: { idempotencyKey: string; at: UpdatedAt }): Result<void> {
    if (
      !this.state.resourceId ||
      !["failed", "needs-attention"].includes(this.state.status.value)
    ) {
      return err(domainError.conflict("Sandbox Promotion is not retryable"));
    }
    const key = PromotionIdempotencyKey.create(input.idempotencyKey);
    if (key.isErr()) return err(key.error);
    this.state.acceptedIdempotencyKey = key.value;
    delete this.state.deploymentId;
    this.state.status = SandboxPromotionStatusValue.rehydrate("deploying");
    this.state.updatedAt = input.at;
    return ok(undefined);
  }
}
