import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { type CreatedAt, type ExpiresAt, type UpdatedAt } from "../shared/temporal";
import { ScalarValueObject } from "../shared/value-object";
import { type SandboxNetworkPolicy } from "./network-policy";
import {
  type SandboxId,
  type SandboxIsolationLevel,
  type SandboxResourceLimits,
  type SandboxSnapshotId,
  type SandboxTemplateId,
} from "./values";

export type SandboxSource =
  | { kind: "template"; templateId: SandboxTemplateId }
  | { kind: "image"; image: string }
  | { kind: "snapshot"; snapshotId: SandboxSnapshotId };
export type SandboxStatus =
  | "requested"
  | "provisioning"
  | "ready"
  | "pausing"
  | "paused"
  | "resuming"
  | "failed"
  | "terminating"
  | "terminated"
  | "expired";

const sandboxStatusBrand: unique symbol = Symbol("SandboxStatusValue");
export class SandboxStatusValue extends ScalarValueObject<SandboxStatus> {
  private [sandboxStatusBrand]!: void;
  private constructor(value: SandboxStatus) {
    super(value);
  }
  static rehydrate(value: SandboxStatus): SandboxStatusValue {
    return new SandboxStatusValue(value);
  }
  static requested(): SandboxStatusValue {
    return new SandboxStatusValue("requested");
  }
  isTerminal(): boolean {
    return ["terminated", "expired"].includes(this.value);
  }
}

export interface SandboxState {
  id: SandboxId;
  source: SandboxSource;
  status: SandboxStatusValue;
  requestedIsolation: SandboxIsolationLevel;
  realizedIsolation?: SandboxIsolationLevel;
  limits: SandboxResourceLimits;
  networkPolicy: SandboxNetworkPolicy;
  createdAt: CreatedAt;
  updatedAt?: UpdatedAt;
  expiresAt?: ExpiresAt;
  currentAttemptId?: string;
  provisionAttempts: number;
  providerHandle?: string;
}

function transitionError(status: SandboxStatus, action: string) {
  return domainError.conflict(`Sandbox cannot ${action} from ${status}`, {
    phase: "execution-sandbox-state-transition",
    status,
    action,
  });
}

function safeImage(value: string): boolean {
  return value.length > 0 && value.length <= 512 && !/[\s;&|`$<>\0]/u.test(value);
}

export class Sandbox extends AggregateRoot<SandboxState, SandboxId> {
  private constructor(state: SandboxState) {
    super(state);
  }

  static create(input: Omit<SandboxState, "status" | "provisionAttempts">): Result<Sandbox> {
    if (input.source.kind === "image" && !safeImage(input.source.image)) {
      return err(
        domainError.validation("Sandbox image reference is invalid", {
          phase: "execution-sandbox-admission",
          field: "source.image",
        }),
      );
    }
    if (input.expiresAt && input.expiresAt.toDate() <= input.createdAt.toDate()) {
      return err(
        domainError.validation("Sandbox expiry must be after creation", {
          phase: "execution-sandbox-admission",
          field: "expiresAt",
        }),
      );
    }
    const sandbox = new Sandbox({
      ...input,
      status: SandboxStatusValue.requested(),
      provisionAttempts: 0,
    });
    sandbox.recordDomainEvent("sandbox-requested", input.createdAt, {
      requestedIsolation: input.requestedIsolation.value,
      sourceKind: input.source.kind,
    });
    return ok(sandbox);
  }

  static rehydrate(state: SandboxState): Sandbox {
    return new Sandbox(state);
  }

  toState(): SandboxState {
    return { ...this.state };
  }

  canUseRuntime(): boolean {
    return this.state.status.value === "ready";
  }

  startProvisioning(input: { attemptId: string; at: UpdatedAt }): Result<void> {
    if (this.state.status.value !== "requested" && this.state.status.value !== "failed") {
      return err(transitionError(this.state.status.value, "start provisioning"));
    }
    this.state.status = SandboxStatusValue.rehydrate("provisioning");
    this.state.currentAttemptId = input.attemptId;
    this.state.provisionAttempts += 1;
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-provisioning-started", input.at, {
      attemptId: input.attemptId,
    });
    return ok(undefined);
  }

  markReady(input: {
    realizedIsolation: SandboxIsolationLevel;
    providerHandle: string;
    at: UpdatedAt;
  }): Result<void> {
    if (!["provisioning", "resuming"].includes(this.state.status.value)) {
      return err(transitionError(this.state.status.value, "become ready"));
    }
    if (!input.realizedIsolation.satisfies(this.state.requestedIsolation)) {
      return err(
        domainError.invariant("Provider isolation is weaker than requested", {
          phase: "execution-sandbox-provider-observation",
          requestedIsolation: this.state.requestedIsolation.value,
          realizedIsolation: input.realizedIsolation.value,
        }),
      );
    }
    const handle = input.providerHandle.trim();
    if (!handle || handle.length > 512 || /\s/.test(handle)) {
      return err(
        domainError.validation("Sandbox provider handle is invalid", {
          phase: "execution-sandbox-provider-observation",
          field: "providerHandle",
        }),
      );
    }
    const wasResuming = this.state.status.value === "resuming";
    this.state.status = SandboxStatusValue.rehydrate("ready");
    this.state.realizedIsolation = input.realizedIsolation;
    this.state.providerHandle = handle;
    this.state.updatedAt = input.at;
    this.recordDomainEvent(wasResuming ? "sandbox-resumed" : "sandbox-ready", input.at, {
      realizedIsolation: input.realizedIsolation.value,
      attemptId: this.state.currentAttemptId ?? null,
    });
    return ok(undefined);
  }

  requestPause(input: { at: UpdatedAt }): Result<void> {
    if (this.state.status.value !== "ready") {
      return err(transitionError(this.state.status.value, "pause"));
    }
    this.state.status = SandboxStatusValue.rehydrate("pausing");
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-pause-requested", input.at, {});
    return ok(undefined);
  }

  markPaused(input: { at: UpdatedAt }): Result<void> {
    if (this.state.status.value !== "pausing") {
      return err(transitionError(this.state.status.value, "become paused"));
    }
    this.state.status = SandboxStatusValue.rehydrate("paused");
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-paused", input.at, {});
    return ok(undefined);
  }

  markPauseFailed(input: { code: string; at: UpdatedAt }): Result<void> {
    if (this.state.status.value !== "pausing") {
      return err(transitionError(this.state.status.value, "fail pause"));
    }
    this.state.status = SandboxStatusValue.rehydrate("ready");
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-pause-failed", input.at, { code: input.code });
    return ok(undefined);
  }

  requestResume(input: { at: UpdatedAt }): Result<void> {
    if (this.state.status.value !== "paused") {
      return err(transitionError(this.state.status.value, "resume"));
    }
    this.state.status = SandboxStatusValue.rehydrate("resuming");
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-resume-requested", input.at, {});
    return ok(undefined);
  }

  markResumeFailed(input: { code: string; at: UpdatedAt }): Result<void> {
    if (this.state.status.value !== "resuming") {
      return err(transitionError(this.state.status.value, "fail resume"));
    }
    this.state.status = SandboxStatusValue.rehydrate("paused");
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-resume-failed", input.at, { code: input.code });
    return ok(undefined);
  }

  requestTermination(input: { at: UpdatedAt }): Result<void> {
    if (this.state.status.isTerminal()) return ok(undefined);
    if (this.state.status.value === "terminating") return ok(undefined);
    this.state.status = SandboxStatusValue.rehydrate("terminating");
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-termination-requested", input.at, {});
    return ok(undefined);
  }

  markTerminated(input: { at: UpdatedAt }): Result<void> {
    if (this.state.status.value === "terminated") return ok(undefined);
    if (this.state.status.value !== "terminating") {
      return err(transitionError(this.state.status.value, "become terminated"));
    }
    this.state.status = SandboxStatusValue.rehydrate("terminated");
    delete this.state.providerHandle;
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-terminated", input.at, {});
    return ok(undefined);
  }

  expire(input: { at: UpdatedAt }): Result<void> {
    if (this.state.status.value === "expired") return ok(undefined);
    if (this.state.status.value === "terminated") {
      return err(transitionError(this.state.status.value, "expire"));
    }
    this.state.status = SandboxStatusValue.rehydrate("expired");
    delete this.state.providerHandle;
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-expired", input.at, {});
    return ok(undefined);
  }

  markFailed(input: { code: string; retryable: boolean; at: UpdatedAt }): Result<void> {
    if (this.state.status.isTerminal()) {
      return err(transitionError(this.state.status.value, "fail"));
    }
    this.state.status = SandboxStatusValue.rehydrate("failed");
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-failed", input.at, {
      code: input.code,
      retryable: input.retryable,
      attemptId: this.state.currentAttemptId ?? null,
    });
    return ok(undefined);
  }
}
