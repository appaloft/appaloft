import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { type CreatedAt, type UpdatedAt } from "../shared/temporal";
import { ScalarValueObject } from "../shared/value-object";
import { AgentRunContext, type SandboxAgentRunId, type SandboxAgentRuntimeId } from "./values";

export type SandboxAgentRunStatus =
  | "accepted"
  | "running"
  | "waiting-approval"
  | "completed"
  | "failed"
  | "cancelled";

const runStatusBrand: unique symbol = Symbol("SandboxAgentRunStatusValue");
export class SandboxAgentRunStatusValue extends ScalarValueObject<SandboxAgentRunStatus> {
  private [runStatusBrand]!: void;
  private constructor(value: SandboxAgentRunStatus) {
    super(value);
  }
  static accepted(): SandboxAgentRunStatusValue {
    return new SandboxAgentRunStatusValue("accepted");
  }
  static rehydrate(value: SandboxAgentRunStatus): SandboxAgentRunStatusValue {
    return new SandboxAgentRunStatusValue(value);
  }
  isTerminal(): boolean {
    return ["completed", "failed", "cancelled"].includes(this.value);
  }
}

const taskDigestBrand: unique symbol = Symbol("AgentTaskDigest");
export class AgentTaskDigest extends ScalarValueObject<string> {
  private [taskDigestBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<AgentTaskDigest> {
    const normalized = value.trim();
    if (!normalized || normalized.length > 256) {
      return err(domainError.validation("Agent task digest is invalid"));
    }
    return ok(new AgentTaskDigest(normalized));
  }
  static rehydrate(value: string): AgentTaskDigest {
    return new AgentTaskDigest(value.trim());
  }
}

const outcomeDigestBrand: unique symbol = Symbol("AgentRunOutcomeDigest");
export class AgentRunOutcomeDigest extends ScalarValueObject<string> {
  private [outcomeDigestBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<AgentRunOutcomeDigest> {
    const normalized = value.trim();
    if (!normalized || normalized.length > 256) {
      return err(domainError.validation("Agent Run outcome digest is invalid"));
    }
    return ok(new AgentRunOutcomeDigest(normalized));
  }
  static rehydrate(value: string): AgentRunOutcomeDigest {
    return new AgentRunOutcomeDigest(value.trim());
  }
}

const failureCodeBrand: unique symbol = Symbol("SandboxAgentRunFailureCode");
export class SandboxAgentRunFailureCode extends ScalarValueObject<string> {
  private [failureCodeBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<SandboxAgentRunFailureCode> {
    const normalized = value.trim();
    if (!/^[a-z0-9][a-z0-9._-]{0,119}$/u.test(normalized)) {
      return err(domainError.validation("Sandbox Agent Run failure code is invalid"));
    }
    return ok(new SandboxAgentRunFailureCode(normalized));
  }
  static rehydrate(value: string): SandboxAgentRunFailureCode {
    return new SandboxAgentRunFailureCode(value.trim());
  }
}

const failureSummaryBrand: unique symbol = Symbol("SandboxAgentRunFailureSummary");
export class SandboxAgentRunFailureSummary extends ScalarValueObject<string> {
  private [failureSummaryBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<SandboxAgentRunFailureSummary> {
    const normalized = value.trim();
    if (!normalized || normalized.length > 1_024 || normalized.includes("\0")) {
      return err(domainError.validation("Sandbox Agent Run failure summary is invalid"));
    }
    return ok(new SandboxAgentRunFailureSummary(normalized));
  }
  static rehydrate(value: string): SandboxAgentRunFailureSummary {
    return new SandboxAgentRunFailureSummary(value.trim());
  }
}

export interface SandboxAgentRunState {
  id: SandboxAgentRunId;
  runtimeId: SandboxAgentRuntimeId;
  context: AgentRunContext;
  taskDigest: AgentTaskDigest;
  status: SandboxAgentRunStatusValue;
  outcomeDigest?: AgentRunOutcomeDigest;
  failureCode?: SandboxAgentRunFailureCode;
  failureSummary?: SandboxAgentRunFailureSummary;
  createdAt: CreatedAt;
  updatedAt?: UpdatedAt;
}

export class SandboxAgentRun extends AggregateRoot<SandboxAgentRunState, SandboxAgentRunId> {
  private constructor(state: SandboxAgentRunState) {
    super(state);
  }

  static create(input: {
    id: SandboxAgentRunId;
    runtimeId: SandboxAgentRuntimeId;
    context: { mode: "fresh" } | { mode: "continue"; parentRunId?: SandboxAgentRunId };
    taskDigest: string;
    createdAt: CreatedAt;
  }): Result<SandboxAgentRun> {
    const context = AgentRunContext.create(input.context);
    if (context.isErr()) return err(context.error);
    const taskDigest = AgentTaskDigest.create(input.taskDigest);
    if (taskDigest.isErr()) return err(taskDigest.error);
    const run = new SandboxAgentRun({
      id: input.id,
      runtimeId: input.runtimeId,
      context: context.value,
      taskDigest: taskDigest.value,
      status: SandboxAgentRunStatusValue.accepted(),
      createdAt: input.createdAt,
    });
    run.recordDomainEvent("sandbox-agent-run-accepted", input.createdAt, {
      runtimeId: input.runtimeId.value,
      contextMode: context.value.mode,
      parentRunId: context.value.parentRunId?.value ?? null,
    });
    return ok(run);
  }

  static rehydrate(state: SandboxAgentRunState): SandboxAgentRun {
    return new SandboxAgentRun(state);
  }

  toState(): SandboxAgentRunState {
    return { ...this.state };
  }

  start(input: { at: UpdatedAt }): Result<void> {
    if (this.state.status.value !== "accepted") {
      return err(
        domainError.conflict("Sandbox Agent Run cannot start", { status: this.state.status.value }),
      );
    }
    this.state.status = SandboxAgentRunStatusValue.rehydrate("running");
    this.state.updatedAt = input.at;
    return ok(undefined);
  }

  waitForApproval(input: { at: UpdatedAt }): Result<void> {
    if (this.state.status.value !== "running") {
      return err(domainError.conflict("Sandbox Agent Run cannot wait for approval"));
    }
    this.state.status = SandboxAgentRunStatusValue.rehydrate("waiting-approval");
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-agent-run-waiting-for-approval", input.at, {});
    return ok(undefined);
  }

  resume(input: { at: UpdatedAt }): Result<void> {
    if (this.state.status.value !== "waiting-approval") {
      return err(domainError.conflict("Sandbox Agent Run is not waiting for approval"));
    }
    this.state.status = SandboxAgentRunStatusValue.rehydrate("running");
    this.state.updatedAt = input.at;
    return ok(undefined);
  }

  complete(input: { at: UpdatedAt; outcomeDigest: string }): Result<void> {
    if (this.state.status.value !== "running") {
      return err(
        domainError.conflict("Sandbox Agent Run cannot complete", {
          status: this.state.status.value,
        }),
      );
    }
    const digest = AgentRunOutcomeDigest.create(input.outcomeDigest);
    if (digest.isErr()) return err(digest.error);
    this.state.status = SandboxAgentRunStatusValue.rehydrate("completed");
    this.state.outcomeDigest = digest.value;
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-agent-run-completed", input.at, {
      outcomeDigest: digest.value.value,
    });
    return ok(undefined);
  }

  fail(input: { at: UpdatedAt; code: string; summary: string }): Result<void> {
    if (this.state.status.isTerminal()) return ok(undefined);
    const failureCode = SandboxAgentRunFailureCode.create(input.code);
    if (failureCode.isErr()) return err(failureCode.error);
    const failureSummary = SandboxAgentRunFailureSummary.create(input.summary);
    if (failureSummary.isErr()) return err(failureSummary.error);
    this.state.status = SandboxAgentRunStatusValue.rehydrate("failed");
    this.state.failureCode = failureCode.value;
    this.state.failureSummary = failureSummary.value;
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-agent-run-failed", input.at, {
      code: failureCode.value.value,
      summary: failureSummary.value.value,
    });
    return ok(undefined);
  }

  cancel(input: { at: UpdatedAt }): Result<void> {
    if (this.state.status.value === "cancelled") return ok(undefined);
    if (this.state.status.isTerminal()) {
      return err(domainError.conflict("Terminal Sandbox Agent Run cannot be cancelled"));
    }
    this.state.status = SandboxAgentRunStatusValue.rehydrate("cancelled");
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-agent-run-cancelled", input.at, {});
    return ok(undefined);
  }
}
