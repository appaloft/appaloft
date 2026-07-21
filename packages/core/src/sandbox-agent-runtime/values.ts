import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { ScalarValueObject, ValueObject } from "../shared/value-object";

function agentValidation(message: string, details: Record<string, unknown> = {}) {
  return domainError.validation(message, {
    phase: "sandbox-agent-runtime-admission",
    ...details,
  });
}

abstract class AgentIdentifier extends ScalarValueObject<string> {
  protected constructor(value: string) {
    super(value);
  }

  protected static normalize(value: string, field: string): Result<string> {
    const normalized = value.trim();
    if (
      !normalized ||
      normalized.length > 160 ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(normalized)
    ) {
      return err(agentValidation(`${field} is invalid`, { field }));
    }
    return ok(normalized);
  }
}

const runtimeIdBrand: unique symbol = Symbol("SandboxAgentRuntimeId");
export class SandboxAgentRuntimeId extends AgentIdentifier {
  private [runtimeIdBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<SandboxAgentRuntimeId> {
    return AgentIdentifier.normalize(value, "runtimeId").map(
      (normalized) => new SandboxAgentRuntimeId(normalized),
    );
  }
  static rehydrate(value: string): SandboxAgentRuntimeId {
    return new SandboxAgentRuntimeId(value.trim());
  }
}

const runIdBrand: unique symbol = Symbol("SandboxAgentRunId");
export class SandboxAgentRunId extends AgentIdentifier {
  private [runIdBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<SandboxAgentRunId> {
    return AgentIdentifier.normalize(value, "runId").map(
      (normalized) => new SandboxAgentRunId(normalized),
    );
  }
  static rehydrate(value: string): SandboxAgentRunId {
    return new SandboxAgentRunId(value.trim());
  }
}

const approvalIdBrand: unique symbol = Symbol("SandboxAgentApprovalId");
export class SandboxAgentApprovalId extends AgentIdentifier {
  private [approvalIdBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<SandboxAgentApprovalId> {
    return AgentIdentifier.normalize(value, "approvalId").map(
      (normalized) => new SandboxAgentApprovalId(normalized),
    );
  }
  static rehydrate(value: string): SandboxAgentApprovalId {
    return new SandboxAgentApprovalId(value.trim());
  }
}

const harnessTemplateIdBrand: unique symbol = Symbol("AgentHarnessTemplateId");
export class AgentHarnessTemplateId extends AgentIdentifier {
  private [harnessTemplateIdBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<AgentHarnessTemplateId> {
    return AgentIdentifier.normalize(value, "harnessTemplateId").map(
      (normalized) => new AgentHarnessTemplateId(normalized),
    );
  }
  static rehydrate(value: string): AgentHarnessTemplateId {
    return new AgentHarnessTemplateId(value.trim());
  }
}

const artifactIdBrand: unique symbol = Symbol("SourceArtifactId");
export class SourceArtifactId extends AgentIdentifier {
  private [artifactIdBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<SourceArtifactId> {
    return AgentIdentifier.normalize(value, "artifactId").map(
      (normalized) => new SourceArtifactId(normalized),
    );
  }
  static rehydrate(value: string): SourceArtifactId {
    return new SourceArtifactId(value.trim());
  }
}

const promotionIdBrand: unique symbol = Symbol("SandboxPromotionId");
export class SandboxPromotionId extends AgentIdentifier {
  private [promotionIdBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<SandboxPromotionId> {
    return AgentIdentifier.normalize(value, "promotionId").map(
      (normalized) => new SandboxPromotionId(normalized),
    );
  }
  static rehydrate(value: string): SandboxPromotionId {
    return new SandboxPromotionId(value.trim());
  }
}

const previewIdBrand: unique symbol = Symbol("PromotionCandidatePreviewId");
export class PromotionCandidatePreviewId extends AgentIdentifier {
  private [previewIdBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<PromotionCandidatePreviewId> {
    return AgentIdentifier.normalize(value, "candidatePreviewId").map(
      (normalized) => new PromotionCandidatePreviewId(normalized),
    );
  }
  static rehydrate(value: string): PromotionCandidatePreviewId {
    return new PromotionCandidatePreviewId(value.trim());
  }
}

abstract class BoundedText extends ScalarValueObject<string> {
  protected constructor(value: string) {
    super(value);
  }
  protected static normalize(value: string, field: string, maximum: number): Result<string> {
    const normalized = value.trim();
    if (!normalized || normalized.length > maximum || normalized.includes("\0")) {
      return err(agentValidation(`${field} is invalid`, { field }));
    }
    return ok(normalized);
  }
}

const digestBrand: unique symbol = Symbol("SourceArtifactDigest");
export class SourceArtifactDigest extends ScalarValueObject<string> {
  private [digestBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<SourceArtifactDigest> {
    const normalized = value.trim().toLowerCase();
    if (!/^sha256:[a-f0-9]{64}$/.test(normalized)) {
      return err(agentValidation("Source Artifact digest is invalid", { field: "digest" }));
    }
    return ok(new SourceArtifactDigest(normalized));
  }
  static rehydrate(value: string): SourceArtifactDigest {
    return new SourceArtifactDigest(value.trim().toLowerCase());
  }
}

const workspaceRevisionBrand: unique symbol = Symbol("WorkspaceRevision");
export class WorkspaceRevision extends BoundedText {
  private [workspaceRevisionBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<WorkspaceRevision> {
    return BoundedText.normalize(value, "workspaceRevision", 256).map(
      (normalized) => new WorkspaceRevision(normalized),
    );
  }
  static rehydrate(value: string): WorkspaceRevision {
    return new WorkspaceRevision(value.trim());
  }
}

const storeReferenceBrand: unique symbol = Symbol("SourceArtifactStoreReference");
export class SourceArtifactStoreReference extends BoundedText {
  private [storeReferenceBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<SourceArtifactStoreReference> {
    return BoundedText.normalize(value, "storeReference", 1024).map(
      (normalized) => new SourceArtifactStoreReference(normalized),
    );
  }
  static rehydrate(value: string): SourceArtifactStoreReference {
    return new SourceArtifactStoreReference(value.trim());
  }
}

const sourceRootBrand: unique symbol = Symbol("SourceArtifactRoot");
export class SourceArtifactRoot extends ScalarValueObject<string> {
  private [sourceRootBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<SourceArtifactRoot> {
    const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
    const segments = normalized.split("/");
    if (
      !normalized ||
      normalized.startsWith("/") ||
      normalized.length > 1024 ||
      segments.some((segment) => !segment || segment === "." || segment === "..")
    ) {
      return err(agentValidation("Source Artifact root must remain inside the workspace"));
    }
    return ok(new SourceArtifactRoot(normalized));
  }
  static rehydrate(value: string): SourceArtifactRoot {
    return new SourceArtifactRoot(value);
  }
}

export type AgentRunContextMode = "fresh" | "continue";
export type AgentRunContextState =
  | { mode: "fresh" }
  | { mode: "continue"; parentRunId: SandboxAgentRunId };

export class AgentRunContext extends ValueObject<AgentRunContextState> {
  private constructor(state: AgentRunContextState) {
    super(state);
  }
  static create(input: { mode: "fresh" } | { mode: "continue"; parentRunId?: SandboxAgentRunId }) {
    if (input.mode === "continue" && !input.parentRunId) {
      return err(agentValidation("Continued Run requires parentRunId"));
    }
    return ok(
      new AgentRunContext(
        input.mode === "fresh"
          ? { mode: "fresh" }
          : { mode: "continue", parentRunId: input.parentRunId as SandboxAgentRunId },
      ),
    );
  }
  static rehydrate(state: AgentRunContextState): AgentRunContext {
    return new AgentRunContext(state);
  }
  get mode(): AgentRunContextMode {
    return this.state.mode;
  }
  get parentRunId(): SandboxAgentRunId | undefined {
    return this.state.mode === "continue" ? this.state.parentRunId : undefined;
  }
  toState(): AgentRunContextState {
    return this.state.mode === "fresh"
      ? { mode: "fresh" }
      : { mode: "continue", parentRunId: this.state.parentRunId };
  }
}

export interface SandboxPromotionTargetState {
  projectId: string;
  environmentId: string;
  destinationId?: string;
  resourceName: string;
}

export class SandboxPromotionTarget extends ValueObject<SandboxPromotionTargetState> {
  private constructor(state: SandboxPromotionTargetState) {
    super(Object.freeze({ ...state }));
  }
  static create(input: SandboxPromotionTargetState): Result<SandboxPromotionTarget> {
    const normalized = {
      projectId: input.projectId.trim(),
      environmentId: input.environmentId.trim(),
      ...(input.destinationId ? { destinationId: input.destinationId.trim() } : {}),
      resourceName: input.resourceName.trim(),
    };
    if (
      !normalized.projectId ||
      !normalized.environmentId ||
      !normalized.resourceName ||
      normalized.resourceName.length > 160
    ) {
      return err(agentValidation("Sandbox Promotion target is invalid"));
    }
    return ok(new SandboxPromotionTarget(normalized));
  }
  static rehydrate(state: SandboxPromotionTargetState): SandboxPromotionTarget {
    return new SandboxPromotionTarget(state);
  }
  toState(): SandboxPromotionTargetState {
    return { ...this.state };
  }
}

const idempotencyKeyBrand: unique symbol = Symbol("PromotionIdempotencyKey");
export class PromotionIdempotencyKey extends BoundedText {
  private [idempotencyKeyBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<PromotionIdempotencyKey> {
    return BoundedText.normalize(value, "idempotencyKey", 256).map(
      (normalized) => new PromotionIdempotencyKey(normalized),
    );
  }
  static rehydrate(value: string): PromotionIdempotencyKey {
    return new PromotionIdempotencyKey(value.trim());
  }
}

const promotionResourceIdBrand: unique symbol = Symbol("PromotionResourceId");
export class PromotionResourceId extends AgentIdentifier {
  private [promotionResourceIdBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<PromotionResourceId> {
    return AgentIdentifier.normalize(value, "resourceId").map(
      (normalized) => new PromotionResourceId(normalized),
    );
  }
  static rehydrate(value: string): PromotionResourceId {
    return new PromotionResourceId(value.trim());
  }
}

const promotionDeploymentIdBrand: unique symbol = Symbol("PromotionDeploymentId");
export class PromotionDeploymentId extends AgentIdentifier {
  private [promotionDeploymentIdBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<PromotionDeploymentId> {
    return AgentIdentifier.normalize(value, "deploymentId").map(
      (normalized) => new PromotionDeploymentId(normalized),
    );
  }
  static rehydrate(value: string): PromotionDeploymentId {
    return new PromotionDeploymentId(value.trim());
  }
}
