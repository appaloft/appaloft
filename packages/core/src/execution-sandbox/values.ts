import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { ScalarValueObject, ValueObject } from "../shared/value-object";

function sandboxValidation(message: string, details: Record<string, string | number> = {}) {
  return domainError.validation(message, { phase: "execution-sandbox-admission", ...details });
}

abstract class NonEmptySandboxId extends ScalarValueObject<string> {
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
      return err(sandboxValidation(`${field} is invalid`, { field }));
    }
    return ok(normalized);
  }
}

const sandboxIdBrand: unique symbol = Symbol("SandboxId");
export class SandboxId extends NonEmptySandboxId {
  private [sandboxIdBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<SandboxId> {
    return SandboxId.normalize(value, "sandboxId").map((normalized) => new SandboxId(normalized));
  }
  static rehydrate(value: string): SandboxId {
    return new SandboxId(value.trim());
  }
}

const sandboxTemplateIdBrand: unique symbol = Symbol("SandboxTemplateId");
export class SandboxTemplateId extends NonEmptySandboxId {
  private [sandboxTemplateIdBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<SandboxTemplateId> {
    return SandboxTemplateId.normalize(value, "sandboxTemplateId").map(
      (normalized) => new SandboxTemplateId(normalized),
    );
  }
  static rehydrate(value: string): SandboxTemplateId {
    return new SandboxTemplateId(value.trim());
  }
}

const sandboxSnapshotIdBrand: unique symbol = Symbol("SandboxSnapshotId");
export class SandboxSnapshotId extends NonEmptySandboxId {
  private [sandboxSnapshotIdBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<SandboxSnapshotId> {
    return SandboxSnapshotId.normalize(value, "sandboxSnapshotId").map(
      (normalized) => new SandboxSnapshotId(normalized),
    );
  }
  static rehydrate(value: string): SandboxSnapshotId {
    return new SandboxSnapshotId(value.trim());
  }
}

const sandboxTemplateNameBrand: unique symbol = Symbol("SandboxTemplateName");
export class SandboxTemplateName extends ScalarValueObject<string> {
  private [sandboxTemplateNameBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<SandboxTemplateName> {
    const normalized = value.trim();
    if (!normalized || normalized.length > 120) {
      return err(sandboxValidation("Sandbox template name is invalid", { field: "name" }));
    }
    return ok(new SandboxTemplateName(normalized));
  }
  static rehydrate(value: string): SandboxTemplateName {
    return new SandboxTemplateName(value.trim());
  }
}

export type SandboxIsolation = "container-trusted" | "gvisor" | "kata" | "microvm";
const isolationOrder: Record<SandboxIsolation, number> = {
  "container-trusted": 0,
  gvisor: 1,
  kata: 2,
  microvm: 3,
};

const sandboxIsolationBrand: unique symbol = Symbol("SandboxIsolationLevel");
export class SandboxIsolationLevel extends ScalarValueObject<SandboxIsolation> {
  private [sandboxIsolationBrand]!: void;
  private constructor(value: SandboxIsolation) {
    super(value);
  }
  static create(value: string): Result<SandboxIsolationLevel> {
    if (!(value in isolationOrder)) {
      return err(
        sandboxValidation("Sandbox isolation level is unsupported", { field: "isolation" }),
      );
    }
    return ok(new SandboxIsolationLevel(value as SandboxIsolation));
  }
  static rehydrate(value: SandboxIsolation): SandboxIsolationLevel {
    return new SandboxIsolationLevel(value);
  }
  static containerTrusted(): SandboxIsolationLevel {
    return new SandboxIsolationLevel("container-trusted");
  }
  static gvisor(): SandboxIsolationLevel {
    return new SandboxIsolationLevel("gvisor");
  }
  static kata(): SandboxIsolationLevel {
    return new SandboxIsolationLevel("kata");
  }
  static microvm(): SandboxIsolationLevel {
    return new SandboxIsolationLevel("microvm");
  }
  satisfies(minimum: SandboxIsolationLevel): boolean {
    return isolationOrder[this.value] >= isolationOrder[minimum.value];
  }
}

export interface SandboxResourceLimitsState {
  cpuMillis: number;
  memoryBytes: number;
  diskBytes: number;
  maxProcesses: number;
}

export class SandboxResourceLimits extends ValueObject<SandboxResourceLimitsState> {
  private constructor(state: SandboxResourceLimitsState) {
    super(Object.freeze({ ...state }));
  }
  static create(input: SandboxResourceLimitsState): Result<SandboxResourceLimits> {
    const integerFields = Object.entries(input);
    if (integerFields.some(([, value]) => !Number.isSafeInteger(value) || value <= 0)) {
      return err(sandboxValidation("Sandbox resource limits must be positive integers"));
    }
    if (input.cpuMillis > 128_000 || input.maxProcesses > 4096) {
      return err(sandboxValidation("Sandbox resource limits exceed platform-safe bounds"));
    }
    return ok(new SandboxResourceLimits(input));
  }
  static rehydrate(state: SandboxResourceLimitsState): SandboxResourceLimits {
    return new SandboxResourceLimits(state);
  }
  toState(): SandboxResourceLimitsState {
    return { ...this.state };
  }
  doesNotExceed(maximum: SandboxResourceLimits): boolean {
    const max = maximum.state;
    return (
      this.state.cpuMillis <= max.cpuMillis &&
      this.state.memoryBytes <= max.memoryBytes &&
      this.state.diskBytes <= max.diskBytes &&
      this.state.maxProcesses <= max.maxProcesses
    );
  }
}

const workspacePathBrand: unique symbol = Symbol("SandboxWorkspacePath");
export class SandboxWorkspacePath extends ScalarValueObject<string> {
  private [workspacePathBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<SandboxWorkspacePath> {
    const normalized = value.trim().replaceAll("\\", "/").replace(/^\.\//, "");
    const segments = normalized.split("/");
    if (
      !normalized ||
      normalized.startsWith("/") ||
      normalized.includes("\0") ||
      segments.some((segment) => !segment || segment === "." || segment === "..")
    ) {
      return err(
        sandboxValidation("Sandbox path must remain below the workspace root", { field: "path" }),
      );
    }
    return ok(new SandboxWorkspacePath(normalized));
  }
  static rehydrate(value: string): SandboxWorkspacePath {
    return new SandboxWorkspacePath(value);
  }
}
