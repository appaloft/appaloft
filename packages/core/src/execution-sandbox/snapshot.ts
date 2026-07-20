import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { type CreatedAt, type ExpiresAt, type UpdatedAt } from "../shared/temporal";
import { ScalarValueObject } from "../shared/value-object";
import { type SandboxId, type SandboxSnapshotId } from "./values";

export type SandboxSnapshotCapability = "filesystem" | "filesystem-memory";
export type SandboxSnapshotStatus = "requested" | "capturing" | "ready" | "failed" | "deleted";

const snapshotStatusBrand: unique symbol = Symbol("SandboxSnapshotStatusValue");
export class SandboxSnapshotStatusValue extends ScalarValueObject<SandboxSnapshotStatus> {
  private [snapshotStatusBrand]!: void;
  private constructor(value: SandboxSnapshotStatus) {
    super(value);
  }
  static requested(): SandboxSnapshotStatusValue {
    return new SandboxSnapshotStatusValue("requested");
  }
  static rehydrate(value: SandboxSnapshotStatus): SandboxSnapshotStatusValue {
    return new SandboxSnapshotStatusValue(value);
  }
}

export interface SandboxSnapshotState {
  id: SandboxSnapshotId;
  sourceSandboxId: SandboxId;
  capability: SandboxSnapshotCapability;
  status: SandboxSnapshotStatusValue;
  createdAt: CreatedAt;
  updatedAt?: UpdatedAt;
  expiresAt?: ExpiresAt;
  currentAttemptId?: string;
  providerHandle?: string;
  sizeBytes?: number;
}

function snapshotTransitionError(status: SandboxSnapshotStatus, action: string) {
  return domainError.conflict(`Sandbox snapshot cannot ${action} from ${status}`, {
    phase: "execution-sandbox-snapshot-transition",
    status,
    action,
  });
}

export class SandboxSnapshot extends AggregateRoot<SandboxSnapshotState, SandboxSnapshotId> {
  private constructor(state: SandboxSnapshotState) {
    super(state);
  }
  static create(input: Omit<SandboxSnapshotState, "status">): Result<SandboxSnapshot> {
    if (input.expiresAt && input.expiresAt.toDate() <= input.createdAt.toDate()) {
      return err(
        domainError.validation("Sandbox snapshot expiry must be after creation", {
          phase: "execution-sandbox-snapshot-admission",
          field: "expiresAt",
        }),
      );
    }
    const snapshot = new SandboxSnapshot({
      ...input,
      status: SandboxSnapshotStatusValue.requested(),
    });
    snapshot.recordDomainEvent("sandbox-snapshot-requested", input.createdAt, {
      sourceSandboxId: input.sourceSandboxId.value,
      capability: input.capability,
    });
    return ok(snapshot);
  }
  static rehydrate(state: SandboxSnapshotState): SandboxSnapshot {
    return new SandboxSnapshot(state);
  }
  toState(): SandboxSnapshotState {
    return { ...this.state };
  }
  canCreateSandbox(): boolean {
    return this.state.status.value === "ready";
  }
  startCapture(input: { attemptId: string; at: UpdatedAt }): Result<void> {
    if (this.state.status.value !== "requested" && this.state.status.value !== "failed") {
      return err(snapshotTransitionError(this.state.status.value, "start capture"));
    }
    this.state.status = SandboxSnapshotStatusValue.rehydrate("capturing");
    this.state.currentAttemptId = input.attemptId;
    this.state.updatedAt = input.at;
    return ok(undefined);
  }
  markReady(input: { providerHandle: string; sizeBytes: number; at: UpdatedAt }): Result<void> {
    if (this.state.status.value !== "capturing") {
      return err(snapshotTransitionError(this.state.status.value, "become ready"));
    }
    if (
      !input.providerHandle.trim() ||
      /\s/.test(input.providerHandle) ||
      !Number.isSafeInteger(input.sizeBytes) ||
      input.sizeBytes < 0
    ) {
      return err(
        domainError.validation("Sandbox snapshot provider observation is invalid", {
          phase: "execution-sandbox-snapshot-provider-observation",
        }),
      );
    }
    this.state.status = SandboxSnapshotStatusValue.rehydrate("ready");
    this.state.providerHandle = input.providerHandle;
    this.state.sizeBytes = input.sizeBytes;
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-snapshot-ready", input.at, {
      sourceSandboxId: this.state.sourceSandboxId.value,
      capability: this.state.capability,
      sizeBytes: input.sizeBytes,
      attemptId: this.state.currentAttemptId ?? null,
    });
    return ok(undefined);
  }
  markFailed(input: { code: string; at: UpdatedAt }): Result<void> {
    if (this.state.status.value !== "capturing") {
      return err(snapshotTransitionError(this.state.status.value, "fail"));
    }
    this.state.status = SandboxSnapshotStatusValue.rehydrate("failed");
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-snapshot-failed", input.at, {
      code: input.code,
      attemptId: this.state.currentAttemptId ?? null,
    });
    return ok(undefined);
  }
  delete(input: { at: UpdatedAt }): Result<void> {
    if (this.state.status.value === "capturing") {
      return err(snapshotTransitionError(this.state.status.value, "delete"));
    }
    this.state.status = SandboxSnapshotStatusValue.rehydrate("deleted");
    delete this.state.providerHandle;
    this.state.updatedAt = input.at;
    return ok(undefined);
  }
}
