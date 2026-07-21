import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { type CreatedAt, type ExpiresAt, type UpdatedAt } from "../shared/temporal";
import { ScalarValueObject } from "../shared/value-object";
import {
  type SandboxAgentApprovalId,
  type SandboxAgentRunId,
  type SandboxAgentRuntimeId,
} from "./values";

export type SandboxAgentApprovalCapability =
  | "network"
  | "credential"
  | "public-port"
  | "external-write"
  | "promotion";
export type SandboxAgentApprovalStatus = "requested" | "approved" | "rejected" | "expired";

const digestBrand: unique symbol = Symbol("SandboxAgentApprovalRequestDigest");
export class SandboxAgentApprovalRequestDigest extends ScalarValueObject<string> {
  private [digestBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<SandboxAgentApprovalRequestDigest> {
    const normalized = value.trim().toLowerCase();
    if (!/^sha256:[a-f0-9]{64}$/.test(normalized)) {
      return err(domainError.validation("Agent approval request digest is invalid"));
    }
    return ok(new SandboxAgentApprovalRequestDigest(normalized));
  }
  static rehydrate(value: string): SandboxAgentApprovalRequestDigest {
    return new SandboxAgentApprovalRequestDigest(value.trim().toLowerCase());
  }
}

export interface SandboxAgentApprovalState {
  id: SandboxAgentApprovalId;
  runtimeId: SandboxAgentRuntimeId;
  runId: SandboxAgentRunId;
  sandboxId: string;
  capability: SandboxAgentApprovalCapability;
  requestDigest: SandboxAgentApprovalRequestDigest;
  destination?: string;
  status: SandboxAgentApprovalStatus;
  createdAt: CreatedAt;
  expiresAt: ExpiresAt;
  updatedAt?: UpdatedAt;
  resolvedBy?: string;
}

export class SandboxAgentApproval extends AggregateRoot<
  SandboxAgentApprovalState,
  SandboxAgentApprovalId
> {
  private constructor(state: SandboxAgentApprovalState) {
    super(state);
  }

  static create(
    input: Omit<SandboxAgentApprovalState, "status" | "requestDigest"> & {
      requestDigest: string;
    },
  ): Result<SandboxAgentApproval> {
    const digest = SandboxAgentApprovalRequestDigest.create(input.requestDigest);
    if (digest.isErr()) return err(digest.error);
    const destination = input.destination?.trim();
    if (destination && (destination.length > 512 || destination.includes("\0"))) {
      return err(domainError.validation("Agent approval destination is invalid"));
    }
    const approval = new SandboxAgentApproval({
      ...input,
      ...(destination ? { destination } : {}),
      requestDigest: digest.value,
      status: "requested",
    });
    approval.recordDomainEvent("sandbox-agent-approval-requested", input.createdAt, {
      runId: input.runId.value,
      capability: input.capability,
      requestDigest: digest.value.value,
      destination: destination ?? null,
      expiresAt: input.expiresAt.value,
    });
    return ok(approval);
  }

  static rehydrate(state: SandboxAgentApprovalState): SandboxAgentApproval {
    return new SandboxAgentApproval(state);
  }

  toState(): SandboxAgentApprovalState {
    return { ...this.state };
  }

  resolve(input: { decision: "approve" | "reject"; actorId: string; at: UpdatedAt }): Result<void> {
    if (this.state.status === (input.decision === "approve" ? "approved" : "rejected")) {
      return ok(undefined);
    }
    if (this.state.status !== "requested") {
      return err(domainError.conflict("Agent approval is already terminal"));
    }
    if (input.at.toDate() >= this.state.expiresAt.toDate()) {
      this.state.status = "expired";
      this.state.updatedAt = input.at;
      return err(domainError.conflict("Agent approval has expired"));
    }
    const actorId = input.actorId.trim();
    if (!actorId || actorId.length > 160) {
      return err(domainError.validation("Agent approval actor is invalid"));
    }
    this.state.status = input.decision === "approve" ? "approved" : "rejected";
    this.state.resolvedBy = actorId;
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-agent-approval-resolved", input.at, {
      decision: input.decision,
      resolvedBy: actorId,
    });
    return ok(undefined);
  }

  expire(input: { at: UpdatedAt }): Result<void> {
    if (this.state.status === "expired") return ok(undefined);
    if (this.state.status !== "requested") {
      return err(domainError.conflict("Resolved Agent approval cannot expire"));
    }
    if (input.at.toDate() < this.state.expiresAt.toDate()) {
      return err(domainError.conflict("Agent approval has not expired"));
    }
    this.state.status = "expired";
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-agent-approval-expired", input.at, {});
    return ok(undefined);
  }
}
