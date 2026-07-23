import { type SandboxId } from "../execution-sandbox";
import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { type CreatedAt, type UpdatedAt } from "../shared/temporal";
import { ScalarValueObject } from "../shared/value-object";
import {
  type AgentHarnessTemplateId,
  type SandboxAgentRunId,
  type SandboxAgentRuntimeId,
} from "./values";

export type SandboxAgentRuntimeStatus =
  | "starting"
  | "ready"
  | "terminating"
  | "terminated"
  | "failed";

const runtimeStatusBrand: unique symbol = Symbol("SandboxAgentRuntimeStatusValue");
export class SandboxAgentRuntimeStatusValue extends ScalarValueObject<SandboxAgentRuntimeStatus> {
  private [runtimeStatusBrand]!: void;
  private constructor(value: SandboxAgentRuntimeStatus) {
    super(value);
  }
  static starting(): SandboxAgentRuntimeStatusValue {
    return new SandboxAgentRuntimeStatusValue("starting");
  }
  static rehydrate(value: SandboxAgentRuntimeStatus): SandboxAgentRuntimeStatusValue {
    return new SandboxAgentRuntimeStatusValue(value);
  }
  canAcceptRun(): boolean {
    return this.value === "ready";
  }
  isTerminal(): boolean {
    return this.value === "terminated";
  }
}

export interface SandboxAgentRuntimeState {
  id: SandboxAgentRuntimeId;
  sandboxId: SandboxId;
  harnessTemplateId: AgentHarnessTemplateId;
  status: SandboxAgentRuntimeStatusValue;
  activeRunId?: SandboxAgentRunId;
  createdAt: CreatedAt;
  updatedAt?: UpdatedAt;
}

export class SandboxAgentRuntime extends AggregateRoot<
  SandboxAgentRuntimeState,
  SandboxAgentRuntimeId
> {
  private constructor(state: SandboxAgentRuntimeState) {
    super(state);
  }

  static create(
    input: Omit<SandboxAgentRuntimeState, "status" | "activeRunId" | "updatedAt">,
  ): Result<SandboxAgentRuntime> {
    const runtime = new SandboxAgentRuntime({
      ...input,
      status: SandboxAgentRuntimeStatusValue.starting(),
    });
    runtime.recordDomainEvent("sandbox-agent-runtime-created", input.createdAt, {
      sandboxId: input.sandboxId.value,
      harnessTemplateId: input.harnessTemplateId.value,
    });
    return ok(runtime);
  }

  static rehydrate(state: SandboxAgentRuntimeState): SandboxAgentRuntime {
    return new SandboxAgentRuntime(state);
  }

  toState(): SandboxAgentRuntimeState {
    return { ...this.state };
  }

  markReady(input: { at: UpdatedAt }): Result<void> {
    if (this.state.status.value !== "starting") {
      return err(
        domainError.conflict("Sandbox Agent Runtime cannot become ready", {
          status: this.state.status.value,
        }),
      );
    }
    this.state.status = SandboxAgentRuntimeStatusValue.rehydrate("ready");
    this.state.updatedAt = input.at;
    return ok(undefined);
  }

  markFailed(input: { at: UpdatedAt }): Result<void> {
    if (this.state.status.value !== "starting") {
      return err(
        domainError.conflict("Sandbox Agent Runtime cannot fail startup", {
          status: this.state.status.value,
        }),
      );
    }
    this.state.status = SandboxAgentRuntimeStatusValue.rehydrate("failed");
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-agent-runtime-start-failed", input.at, {});
    return ok(undefined);
  }

  claimRun(input: { runId: SandboxAgentRunId; at: UpdatedAt }): Result<void> {
    if (!this.state.status.canAcceptRun()) {
      return err(
        domainError.conflict("Sandbox Agent Runtime is unavailable", {
          code: "sandbox_agent_runtime_unavailable",
          status: this.state.status.value,
        }),
      );
    }
    if (this.state.activeRunId) {
      if (this.state.activeRunId.equals(input.runId)) return ok(undefined);
      return err(
        domainError.conflict("Sandbox Agent Runtime is busy", {
          code: "sandbox_agent_runtime_busy",
          activeRunId: this.state.activeRunId.value,
        }),
      );
    }
    this.state.activeRunId = input.runId;
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-agent-run-claimed", input.at, { runId: input.runId.value });
    return ok(undefined);
  }

  releaseRun(input: { runId: SandboxAgentRunId; at: UpdatedAt }): Result<void> {
    if (!this.state.activeRunId) return ok(undefined);
    if (!this.state.activeRunId.equals(input.runId)) {
      return err(
        domainError.conflict("Sandbox Agent Runtime active Run does not match", {
          activeRunId: this.state.activeRunId.value,
          runId: input.runId.value,
        }),
      );
    }
    delete this.state.activeRunId;
    this.state.updatedAt = input.at;
    return ok(undefined);
  }

  terminate(input: { at: UpdatedAt }): Result<void> {
    if (this.state.status.isTerminal()) return ok(undefined);
    this.state.status = SandboxAgentRuntimeStatusValue.rehydrate("terminated");
    delete this.state.activeRunId;
    this.state.updatedAt = input.at;
    this.recordDomainEvent("sandbox-agent-runtime-terminated", input.at, {});
    return ok(undefined);
  }
}
