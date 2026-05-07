import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import {
  type ResourceId,
  type ScheduledTaskId,
  type ScheduledTaskRunId,
} from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import { type CreatedAt, type FinishedAt, type StartedAt } from "../shared/temporal";
import { ScalarValueObject } from "../shared/value-object";

export type ScheduledTaskConcurrencyPolicy = "forbid";
export type ScheduledTaskDefinitionStatus = "enabled" | "disabled";
export type ScheduledTaskRunTriggerKind = "manual" | "scheduled";
export type ScheduledTaskRunStatus = "accepted" | "running" | "succeeded" | "failed" | "skipped";
export type ScheduledTaskRunSkippedReason =
  | "concurrency-forbidden"
  | "resource-archived"
  | "task-disabled";

const scheduledTaskValidationPhase = "scheduled-task-definition-admission";
const scheduledTaskRunValidationPhase = "scheduled-task-run-admission";
const scheduledTaskRunTransitionPhase = "scheduled-task-run-state-transition";
const scheduleMacros = ["@hourly", "@daily", "@weekly", "@monthly"] as const;
const concurrencyPolicies = ["forbid"] as const;
const scheduledTaskDefinitionStatuses = ["enabled", "disabled"] as const;
const scheduledTaskRunTriggerKinds = ["manual", "scheduled"] as const;
const scheduledTaskRunStatuses = ["accepted", "running", "succeeded", "failed", "skipped"] as const;
const scheduledTaskRunSkippedReasons = [
  "concurrency-forbidden",
  "resource-archived",
  "task-disabled",
] as const;

function scheduledTaskValidationError(
  message: string,
  details?: Record<string, string | number | boolean>,
) {
  return domainError.validation(message, {
    phase: scheduledTaskValidationPhase,
    ...(details ?? {}),
  });
}

function scheduledTaskRunValidationError(
  message: string,
  details?: Record<string, string | number | boolean>,
) {
  return domainError.validation(message, {
    phase: scheduledTaskRunValidationPhase,
    ...(details ?? {}),
  });
}

function scheduledTaskRunTransitionError(
  message: string,
  details?: Record<string, string | number | boolean>,
) {
  return domainError.conflict(message, {
    phase: scheduledTaskRunTransitionPhase,
    ...(details ?? {}),
  });
}

function includesValue<TValue extends string>(
  values: readonly TValue[],
  value: string,
): value is TValue {
  return values.includes(value as TValue);
}

const scheduledTaskSecretRedaction = "********";

function scheduledTaskSecretDetectionPatterns(): RegExp[] {
  return [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
    /\b(?:password|passwd|pwd|secret|token|api[_-]?key|private[_ -]?key)\s*[:=]\s*\S+/i,
    /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/i,
    /\b(?:ghp_|github_pat_|xox[baprs]-|sk-[A-Za-z0-9_-]{16,})[A-Za-z0-9_-]*/i,
    /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@[^\s]+/i,
  ];
}

function scheduledTaskSecretReplacementPatterns(): RegExp[] {
  return [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/gi,
    /\b(?:password|passwd|pwd|secret|token|api[_-]?key|private[_ -]?key)\s*[:=]\s*\S+/gi,
    /\b(?:bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
    /\b(?:ghp_|github_pat_|xox[baprs]-|sk-[A-Za-z0-9_-]{16,})[A-Za-z0-9_-]*/gi,
    /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]+@[^\s]+/gi,
  ];
}

export function containsScheduledTaskSecretText(value: string): boolean {
  return scheduledTaskSecretDetectionPatterns().some((pattern) => pattern.test(value));
}

export function redactScheduledTaskSecretText(
  value: string,
  additionalRedactions: readonly string[] = [],
): string {
  const redactedByPattern = scheduledTaskSecretReplacementPatterns().reduce(
    (text, pattern) => text.replace(pattern, scheduledTaskSecretRedaction),
    value,
  );

  return additionalRedactions.reduce(
    (text, redaction) =>
      redaction.length > 0 ? text.replaceAll(redaction, scheduledTaskSecretRedaction) : text,
    redactedByPattern,
  );
}

function isIntegerTokenInRange(value: string, min: number, max: number): boolean {
  if (!/^\d+$/.test(value)) {
    return false;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max;
}

function isCronFieldPartInRange(value: string, min: number, max: number): boolean {
  if (value === "*") {
    return true;
  }

  if (value.startsWith("*/")) {
    return isIntegerTokenInRange(value.slice(2), 1, max);
  }

  const rangeSeparatorIndex = value.indexOf("-");
  if (rangeSeparatorIndex > 0) {
    const start = value.slice(0, rangeSeparatorIndex);
    const end = value.slice(rangeSeparatorIndex + 1);
    if (!isIntegerTokenInRange(start, min, max) || !isIntegerTokenInRange(end, min, max)) {
      return false;
    }

    return Number(start) <= Number(end);
  }

  return isIntegerTokenInRange(value, min, max);
}

function isCronFieldInRange(value: string, min: number, max: number): boolean {
  return value.split(",").every((part) => part !== "" && isCronFieldPartInRange(part, min, max));
}

function isFiveFieldCronExpression(value: string): boolean {
  const fields = value.split(" ");
  if (fields.length !== 5) {
    return false;
  }

  const minute = fields[0] ?? "";
  const hour = fields[1] ?? "";
  const dayOfMonth = fields[2] ?? "";
  const month = fields[3] ?? "";
  const dayOfWeek = fields[4] ?? "";
  return (
    isCronFieldInRange(minute, 0, 59) &&
    isCronFieldInRange(hour, 0, 23) &&
    isCronFieldInRange(dayOfMonth, 1, 31) &&
    isCronFieldInRange(month, 1, 12) &&
    isCronFieldInRange(dayOfWeek, 0, 7)
  );
}

const scheduledTaskScheduleExpressionBrand: unique symbol = Symbol(
  "ScheduledTaskScheduleExpression",
);
export class ScheduledTaskScheduleExpression extends ScalarValueObject<string> {
  private [scheduledTaskScheduleExpressionBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ScheduledTaskScheduleExpression> {
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!normalized) {
      return err(
        scheduledTaskValidationError("Scheduled task schedule is required", {
          field: "schedule",
        }),
      );
    }

    if (includesValue(scheduleMacros, normalized)) {
      return ok(new ScheduledTaskScheduleExpression(normalized));
    }

    if (!isFiveFieldCronExpression(normalized)) {
      return err(
        scheduledTaskValidationError(
          "Scheduled task schedule must be a safe 5-field cron expression or supported macro",
          {
            field: "schedule",
          },
        ),
      );
    }

    return ok(new ScheduledTaskScheduleExpression(normalized));
  }

  static rehydrate(value: string): ScheduledTaskScheduleExpression {
    return new ScheduledTaskScheduleExpression(value.trim().replace(/\s+/g, " "));
  }
}

const scheduledTaskTimezoneBrand: unique symbol = Symbol("ScheduledTaskTimezone");
export class ScheduledTaskTimezone extends ScalarValueObject<string> {
  private [scheduledTaskTimezoneBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ScheduledTaskTimezone> {
    const normalized = value.trim();
    if (!normalized) {
      return err(
        scheduledTaskValidationError("Scheduled task timezone is required", {
          field: "timezone",
        }),
      );
    }

    try {
      new Intl.DateTimeFormat("en-US", { timeZone: normalized });
    } catch {
      return err(
        scheduledTaskValidationError("Scheduled task timezone must be an IANA timezone", {
          field: "timezone",
          timezone: normalized,
        }),
      );
    }

    return ok(new ScheduledTaskTimezone(normalized));
  }

  static rehydrate(value: string): ScheduledTaskTimezone {
    return new ScheduledTaskTimezone(value.trim());
  }
}

const scheduledTaskCommandIntentBrand: unique symbol = Symbol("ScheduledTaskCommandIntent");
export class ScheduledTaskCommandIntent extends ScalarValueObject<string> {
  private [scheduledTaskCommandIntentBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ScheduledTaskCommandIntent> {
    const normalized = value.trim();
    if (!normalized) {
      return err(
        scheduledTaskValidationError("Scheduled task command intent is required", {
          field: "commandIntent",
        }),
      );
    }

    if (normalized.length > 500) {
      return err(
        scheduledTaskValidationError(
          "Scheduled task command intent must be at most 500 characters",
          {
            field: "commandIntent",
            maxLength: 500,
          },
        ),
      );
    }

    if (/[\r\n]/.test(normalized)) {
      return err(
        scheduledTaskValidationError("Scheduled task command intent must be a single line", {
          field: "commandIntent",
        }),
      );
    }

    if (containsScheduledTaskSecretText(normalized)) {
      return err(
        scheduledTaskValidationError("Scheduled task command intent must not contain secrets", {
          field: "commandIntent",
        }),
      );
    }

    return ok(new ScheduledTaskCommandIntent(normalized));
  }

  static rehydrate(value: string): ScheduledTaskCommandIntent {
    return new ScheduledTaskCommandIntent(value.trim());
  }
}

const scheduledTaskTimeoutSecondsBrand: unique symbol = Symbol("ScheduledTaskTimeoutSeconds");
export class ScheduledTaskTimeoutSeconds extends ScalarValueObject<number> {
  private [scheduledTaskTimeoutSecondsBrand]!: void;

  private constructor(value: number) {
    super(value);
  }

  static create(value: number): Result<ScheduledTaskTimeoutSeconds> {
    if (!Number.isInteger(value) || value < 1 || value > 86_400) {
      return err(
        scheduledTaskValidationError(
          "Scheduled task timeout seconds must be an integer between 1 and 86400",
          {
            field: "timeoutSeconds",
          },
        ),
      );
    }

    return ok(new ScheduledTaskTimeoutSeconds(value));
  }

  static rehydrate(value: number): ScheduledTaskTimeoutSeconds {
    return new ScheduledTaskTimeoutSeconds(value);
  }
}

const scheduledTaskRetryLimitBrand: unique symbol = Symbol("ScheduledTaskRetryLimit");
export class ScheduledTaskRetryLimit extends ScalarValueObject<number> {
  private [scheduledTaskRetryLimitBrand]!: void;

  private constructor(value: number) {
    super(value);
  }

  static create(value: number): Result<ScheduledTaskRetryLimit> {
    if (!Number.isInteger(value) || value < 0 || value > 10) {
      return err(
        scheduledTaskValidationError(
          "Scheduled task retry limit must be an integer between 0 and 10",
          {
            field: "retryLimit",
          },
        ),
      );
    }

    return ok(new ScheduledTaskRetryLimit(value));
  }

  static rehydrate(value: number): ScheduledTaskRetryLimit {
    return new ScheduledTaskRetryLimit(value);
  }
}

const scheduledTaskConcurrencyPolicyBrand: unique symbol = Symbol("ScheduledTaskConcurrencyPolicy");
export class ScheduledTaskConcurrencyPolicyValue extends ScalarValueObject<ScheduledTaskConcurrencyPolicy> {
  private [scheduledTaskConcurrencyPolicyBrand]!: void;

  private constructor(value: ScheduledTaskConcurrencyPolicy) {
    super(value);
  }

  static create(value: string): Result<ScheduledTaskConcurrencyPolicyValue> {
    const normalized = value.trim();
    if (!includesValue(concurrencyPolicies, normalized)) {
      return err(
        scheduledTaskValidationError(
          "Scheduled task concurrency policy must be a supported policy",
          {
            field: "concurrencyPolicy",
            concurrencyPolicy: normalized,
          },
        ),
      );
    }

    return ok(new ScheduledTaskConcurrencyPolicyValue(normalized));
  }

  static forbid(): ScheduledTaskConcurrencyPolicyValue {
    return new ScheduledTaskConcurrencyPolicyValue("forbid");
  }

  static rehydrate(value: ScheduledTaskConcurrencyPolicy): ScheduledTaskConcurrencyPolicyValue {
    return new ScheduledTaskConcurrencyPolicyValue(value);
  }
}

const scheduledTaskDefinitionStatusBrand: unique symbol = Symbol("ScheduledTaskDefinitionStatus");
export class ScheduledTaskDefinitionStatusValue extends ScalarValueObject<ScheduledTaskDefinitionStatus> {
  private [scheduledTaskDefinitionStatusBrand]!: void;

  private constructor(value: ScheduledTaskDefinitionStatus) {
    super(value);
  }

  static create(value: string): Result<ScheduledTaskDefinitionStatusValue> {
    const normalized = value.trim();
    if (!includesValue(scheduledTaskDefinitionStatuses, normalized)) {
      return err(
        scheduledTaskValidationError("Scheduled task status must be supported", {
          field: "status",
          status: normalized,
        }),
      );
    }

    return ok(new ScheduledTaskDefinitionStatusValue(normalized));
  }

  static enabled(): ScheduledTaskDefinitionStatusValue {
    return new ScheduledTaskDefinitionStatusValue("enabled");
  }

  static disabled(): ScheduledTaskDefinitionStatusValue {
    return new ScheduledTaskDefinitionStatusValue("disabled");
  }

  static rehydrate(value: ScheduledTaskDefinitionStatus): ScheduledTaskDefinitionStatusValue {
    return new ScheduledTaskDefinitionStatusValue(value);
  }

  isEnabled(): boolean {
    return this.state === "enabled";
  }
}

const scheduledTaskRunTriggerKindBrand: unique symbol = Symbol("ScheduledTaskRunTriggerKind");
export class ScheduledTaskRunTriggerKindValue extends ScalarValueObject<ScheduledTaskRunTriggerKind> {
  private [scheduledTaskRunTriggerKindBrand]!: void;

  private constructor(value: ScheduledTaskRunTriggerKind) {
    super(value);
  }

  static create(value: string): Result<ScheduledTaskRunTriggerKindValue> {
    const normalized = value.trim();
    if (!includesValue(scheduledTaskRunTriggerKinds, normalized)) {
      return err(
        scheduledTaskRunValidationError("Scheduled task run trigger kind must be supported", {
          field: "triggerKind",
          triggerKind: normalized,
        }),
      );
    }

    return ok(new ScheduledTaskRunTriggerKindValue(normalized));
  }

  static manual(): ScheduledTaskRunTriggerKindValue {
    return new ScheduledTaskRunTriggerKindValue("manual");
  }

  static scheduled(): ScheduledTaskRunTriggerKindValue {
    return new ScheduledTaskRunTriggerKindValue("scheduled");
  }

  static rehydrate(value: ScheduledTaskRunTriggerKind): ScheduledTaskRunTriggerKindValue {
    return new ScheduledTaskRunTriggerKindValue(value);
  }
}

const scheduledTaskRunStatusBrand: unique symbol = Symbol("ScheduledTaskRunStatus");
export class ScheduledTaskRunStatusValue extends ScalarValueObject<ScheduledTaskRunStatus> {
  private [scheduledTaskRunStatusBrand]!: void;

  private constructor(value: ScheduledTaskRunStatus) {
    super(value);
  }

  static create(value: string): Result<ScheduledTaskRunStatusValue> {
    const normalized = value.trim();
    if (!includesValue(scheduledTaskRunStatuses, normalized)) {
      return err(
        scheduledTaskRunValidationError("Scheduled task run status must be supported", {
          field: "status",
          status: normalized,
        }),
      );
    }

    return ok(new ScheduledTaskRunStatusValue(normalized));
  }

  static accepted(): ScheduledTaskRunStatusValue {
    return new ScheduledTaskRunStatusValue("accepted");
  }

  static running(): ScheduledTaskRunStatusValue {
    return new ScheduledTaskRunStatusValue("running");
  }

  static succeeded(): ScheduledTaskRunStatusValue {
    return new ScheduledTaskRunStatusValue("succeeded");
  }

  static failed(): ScheduledTaskRunStatusValue {
    return new ScheduledTaskRunStatusValue("failed");
  }

  static skipped(): ScheduledTaskRunStatusValue {
    return new ScheduledTaskRunStatusValue("skipped");
  }

  static rehydrate(value: ScheduledTaskRunStatus): ScheduledTaskRunStatusValue {
    return new ScheduledTaskRunStatusValue(value);
  }

  start(): Result<ScheduledTaskRunStatusValue> {
    if (this.value !== "accepted") {
      return err(
        scheduledTaskRunTransitionError(
          "Scheduled task run must be accepted before runtime execution starts",
          { status: this.value },
        ),
      );
    }

    return ok(ScheduledTaskRunStatusValue.running());
  }

  succeed(): Result<ScheduledTaskRunStatusValue> {
    if (this.value !== "running") {
      return err(
        scheduledTaskRunTransitionError(
          "Scheduled task run must be running before it can succeed",
          { status: this.value },
        ),
      );
    }

    return ok(ScheduledTaskRunStatusValue.succeeded());
  }

  fail(): Result<ScheduledTaskRunStatusValue> {
    if (this.value !== "running") {
      return err(
        scheduledTaskRunTransitionError("Scheduled task run must be running before it can fail", {
          status: this.value,
        }),
      );
    }

    return ok(ScheduledTaskRunStatusValue.failed());
  }

  skip(): Result<ScheduledTaskRunStatusValue> {
    if (this.value !== "accepted") {
      return err(
        scheduledTaskRunTransitionError(
          "Scheduled task run must be accepted before it can be skipped",
          { status: this.value },
        ),
      );
    }

    return ok(ScheduledTaskRunStatusValue.skipped());
  }

  isRunning(): boolean {
    return this.value === "running";
  }

  isTerminal(): boolean {
    return this.value === "succeeded" || this.value === "failed" || this.value === "skipped";
  }

  isNonTerminal(): boolean {
    return !this.isTerminal();
  }
}

const scheduledTaskRunSkippedReasonBrand: unique symbol = Symbol("ScheduledTaskRunSkippedReason");
export class ScheduledTaskRunSkippedReasonValue extends ScalarValueObject<ScheduledTaskRunSkippedReason> {
  private [scheduledTaskRunSkippedReasonBrand]!: void;

  private constructor(value: ScheduledTaskRunSkippedReason) {
    super(value);
  }

  static create(value: string): Result<ScheduledTaskRunSkippedReasonValue> {
    const normalized = value.trim();
    if (!includesValue(scheduledTaskRunSkippedReasons, normalized)) {
      return err(
        scheduledTaskRunValidationError("Scheduled task run skipped reason must be supported", {
          field: "skippedReason",
          skippedReason: normalized,
        }),
      );
    }

    return ok(new ScheduledTaskRunSkippedReasonValue(normalized));
  }

  static concurrencyForbidden(): ScheduledTaskRunSkippedReasonValue {
    return new ScheduledTaskRunSkippedReasonValue("concurrency-forbidden");
  }

  static resourceArchived(): ScheduledTaskRunSkippedReasonValue {
    return new ScheduledTaskRunSkippedReasonValue("resource-archived");
  }

  static taskDisabled(): ScheduledTaskRunSkippedReasonValue {
    return new ScheduledTaskRunSkippedReasonValue("task-disabled");
  }

  static rehydrate(value: ScheduledTaskRunSkippedReason): ScheduledTaskRunSkippedReasonValue {
    return new ScheduledTaskRunSkippedReasonValue(value);
  }
}

const scheduledTaskRunExitCodeBrand: unique symbol = Symbol("ScheduledTaskRunExitCode");
export class ScheduledTaskRunExitCode extends ScalarValueObject<number> {
  private [scheduledTaskRunExitCodeBrand]!: void;

  private constructor(value: number) {
    super(value);
  }

  static create(value: number): Result<ScheduledTaskRunExitCode> {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      return err(
        scheduledTaskRunValidationError(
          "Scheduled task run exit code must be an integer between 0 and 255",
          { field: "exitCode" },
        ),
      );
    }

    return ok(new ScheduledTaskRunExitCode(value));
  }

  static rehydrate(value: number): ScheduledTaskRunExitCode {
    return new ScheduledTaskRunExitCode(value);
  }

  isSuccessful(): boolean {
    return this.value === 0;
  }
}

const scheduledTaskRunFailureSummaryBrand: unique symbol = Symbol("ScheduledTaskRunFailureSummary");
export class ScheduledTaskRunFailureSummary extends ScalarValueObject<string> {
  private [scheduledTaskRunFailureSummaryBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ScheduledTaskRunFailureSummary> {
    const normalized = value.trim();
    if (!normalized) {
      return err(
        scheduledTaskRunValidationError("Scheduled task run failure summary is required", {
          field: "failureSummary",
        }),
      );
    }

    if (normalized.length > 1_000) {
      return err(
        scheduledTaskRunValidationError(
          "Scheduled task run failure summary must be at most 1000 characters",
          { field: "failureSummary", maxLength: 1_000 },
        ),
      );
    }

    if (containsScheduledTaskSecretText(normalized)) {
      return err(
        scheduledTaskRunValidationError(
          "Scheduled task run failure summary must not contain secrets",
          {
            field: "failureSummary",
          },
        ),
      );
    }

    return ok(new ScheduledTaskRunFailureSummary(normalized));
  }

  static rehydrate(value: string): ScheduledTaskRunFailureSummary {
    return new ScheduledTaskRunFailureSummary(value.trim());
  }
}

export interface ScheduledTaskDefinitionState {
  id: ScheduledTaskId;
  resourceId: ResourceId;
  schedule: ScheduledTaskScheduleExpression;
  timezone: ScheduledTaskTimezone;
  commandIntent: ScheduledTaskCommandIntent;
  timeoutSeconds: ScheduledTaskTimeoutSeconds;
  retryLimit: ScheduledTaskRetryLimit;
  concurrencyPolicy: ScheduledTaskConcurrencyPolicyValue;
  status: ScheduledTaskDefinitionStatusValue;
  createdAt: CreatedAt;
}

export interface CreateScheduledTaskDefinitionInput {
  id: ScheduledTaskId;
  resourceId: ResourceId;
  schedule: ScheduledTaskScheduleExpression;
  timezone: ScheduledTaskTimezone;
  commandIntent: ScheduledTaskCommandIntent;
  timeoutSeconds: ScheduledTaskTimeoutSeconds;
  retryLimit: ScheduledTaskRetryLimit;
  concurrencyPolicy?: ScheduledTaskConcurrencyPolicyValue;
  status?: ScheduledTaskDefinitionStatusValue;
  createdAt: CreatedAt;
}

export interface ConfigureScheduledTaskDefinitionInput {
  schedule?: ScheduledTaskScheduleExpression;
  timezone?: ScheduledTaskTimezone;
  commandIntent?: ScheduledTaskCommandIntent;
  timeoutSeconds?: ScheduledTaskTimeoutSeconds;
  retryLimit?: ScheduledTaskRetryLimit;
  concurrencyPolicy?: ScheduledTaskConcurrencyPolicyValue;
  status?: ScheduledTaskDefinitionStatusValue;
}

export interface ScheduledTaskDefinitionSelectionSpecVisitor<TResult> {
  visitScheduledTaskDefinitionById(spec: ScheduledTaskDefinitionByIdSpec): TResult;
}

export interface ScheduledTaskDefinitionSelectionSpec {
  accept<TResult>(visitor: ScheduledTaskDefinitionSelectionSpecVisitor<TResult>): TResult;
}

export interface ScheduledTaskDefinitionMutationSpecVisitor<TResult> {
  visitUpsertScheduledTaskDefinition(spec: UpsertScheduledTaskDefinitionSpec): TResult;
  visitDeleteScheduledTaskDefinition(spec: DeleteScheduledTaskDefinitionSpec): TResult;
}

export interface ScheduledTaskDefinitionMutationSpec {
  accept<TResult>(visitor: ScheduledTaskDefinitionMutationSpecVisitor<TResult>): TResult;
}

export class ScheduledTaskDefinitionByIdSpec implements ScheduledTaskDefinitionSelectionSpec {
  private constructor(
    public readonly taskId: ScheduledTaskId,
    public readonly resourceId?: ResourceId,
  ) {}

  static create(taskId: ScheduledTaskId, resourceId?: ResourceId): ScheduledTaskDefinitionByIdSpec {
    return new ScheduledTaskDefinitionByIdSpec(taskId, resourceId);
  }

  accept<TResult>(visitor: ScheduledTaskDefinitionSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitScheduledTaskDefinitionById(this);
  }
}

export class UpsertScheduledTaskDefinitionSpec implements ScheduledTaskDefinitionMutationSpec {
  private constructor(public readonly state: ScheduledTaskDefinitionState) {}

  static fromTaskDefinition(task: ScheduledTaskDefinition): UpsertScheduledTaskDefinitionSpec {
    const state = task.toState();
    return new UpsertScheduledTaskDefinitionSpec(state);
  }

  get taskId(): ScheduledTaskId {
    return this.state.id;
  }

  get resourceId(): ResourceId {
    return this.state.resourceId;
  }

  accept<TResult>(visitor: ScheduledTaskDefinitionMutationSpecVisitor<TResult>): TResult {
    return visitor.visitUpsertScheduledTaskDefinition(this);
  }
}

export class DeleteScheduledTaskDefinitionSpec implements ScheduledTaskDefinitionMutationSpec {
  private constructor(
    public readonly taskId: ScheduledTaskId,
    public readonly resourceId: ResourceId,
  ) {}

  static create(
    taskId: ScheduledTaskId,
    resourceId: ResourceId,
  ): DeleteScheduledTaskDefinitionSpec {
    return new DeleteScheduledTaskDefinitionSpec(taskId, resourceId);
  }

  accept<TResult>(visitor: ScheduledTaskDefinitionMutationSpecVisitor<TResult>): TResult {
    return visitor.visitDeleteScheduledTaskDefinition(this);
  }
}

export class ScheduledTaskDefinition extends AggregateRoot<
  ScheduledTaskDefinitionState,
  ScheduledTaskId
> {
  private constructor(state: ScheduledTaskDefinitionState) {
    super(state);
  }

  static create(input: CreateScheduledTaskDefinitionInput): Result<ScheduledTaskDefinition> {
    return ok(
      new ScheduledTaskDefinition({
        id: input.id,
        resourceId: input.resourceId,
        schedule: input.schedule,
        timezone: input.timezone,
        commandIntent: input.commandIntent,
        timeoutSeconds: input.timeoutSeconds,
        retryLimit: input.retryLimit,
        concurrencyPolicy: input.concurrencyPolicy ?? ScheduledTaskConcurrencyPolicyValue.forbid(),
        status: input.status ?? ScheduledTaskDefinitionStatusValue.enabled(),
        createdAt: input.createdAt,
      }),
    );
  }

  static rehydrate(state: ScheduledTaskDefinitionState): ScheduledTaskDefinition {
    return new ScheduledTaskDefinition({ ...state });
  }

  belongsToResource(resourceId: ResourceId): boolean {
    return this.state.resourceId.equals(resourceId);
  }

  usesForbidConcurrency(): boolean {
    return this.state.concurrencyPolicy.value === "forbid";
  }

  isEnabled(): boolean {
    return this.state.status.isEnabled();
  }

  configure(input: ConfigureScheduledTaskDefinitionInput): Result<void> {
    if (input.schedule) {
      this.state.schedule = input.schedule;
    }
    if (input.timezone) {
      this.state.timezone = input.timezone;
    }
    if (input.commandIntent) {
      this.state.commandIntent = input.commandIntent;
    }
    if (input.timeoutSeconds) {
      this.state.timeoutSeconds = input.timeoutSeconds;
    }
    if (input.retryLimit) {
      this.state.retryLimit = input.retryLimit;
    }
    if (input.concurrencyPolicy) {
      this.state.concurrencyPolicy = input.concurrencyPolicy;
    }
    if (input.status) {
      this.state.status = input.status;
    }

    return ok(undefined);
  }

  toState(): ScheduledTaskDefinitionState {
    return { ...this.state };
  }
}

export interface ScheduledTaskRunAttemptState {
  id: ScheduledTaskRunId;
  taskId: ScheduledTaskId;
  resourceId: ResourceId;
  triggerKind: ScheduledTaskRunTriggerKindValue;
  status: ScheduledTaskRunStatusValue;
  createdAt: CreatedAt;
  startedAt?: StartedAt;
  finishedAt?: FinishedAt;
  exitCode?: ScheduledTaskRunExitCode;
  failureSummary?: ScheduledTaskRunFailureSummary;
  skippedReason?: ScheduledTaskRunSkippedReasonValue;
}

export interface CreateScheduledTaskRunAttemptInput {
  id: ScheduledTaskRunId;
  taskId: ScheduledTaskId;
  resourceId: ResourceId;
  triggerKind: ScheduledTaskRunTriggerKindValue;
  createdAt: CreatedAt;
}

export interface ScheduledTaskRunAttemptSelectionSpecVisitor<TResult> {
  visitScheduledTaskRunAttemptById(spec: ScheduledTaskRunAttemptByIdSpec): TResult;
}

export interface ScheduledTaskRunAttemptSelectionSpec {
  accept<TResult>(visitor: ScheduledTaskRunAttemptSelectionSpecVisitor<TResult>): TResult;
}

export interface ScheduledTaskRunAttemptMutationSpecVisitor<TResult> {
  visitUpsertScheduledTaskRunAttempt(spec: UpsertScheduledTaskRunAttemptSpec): TResult;
}

export interface ScheduledTaskRunAttemptMutationSpec {
  accept<TResult>(visitor: ScheduledTaskRunAttemptMutationSpecVisitor<TResult>): TResult;
}

export class ScheduledTaskRunAttemptByIdSpec implements ScheduledTaskRunAttemptSelectionSpec {
  private constructor(
    public readonly runId: ScheduledTaskRunId,
    public readonly taskId?: ScheduledTaskId,
    public readonly resourceId?: ResourceId,
  ) {}

  static create(input: {
    runId: ScheduledTaskRunId;
    taskId?: ScheduledTaskId;
    resourceId?: ResourceId;
  }): ScheduledTaskRunAttemptByIdSpec {
    return new ScheduledTaskRunAttemptByIdSpec(input.runId, input.taskId, input.resourceId);
  }

  accept<TResult>(visitor: ScheduledTaskRunAttemptSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitScheduledTaskRunAttemptById(this);
  }
}

export class UpsertScheduledTaskRunAttemptSpec implements ScheduledTaskRunAttemptMutationSpec {
  private constructor(public readonly state: ScheduledTaskRunAttemptState) {}

  static fromRunAttempt(runAttempt: ScheduledTaskRunAttempt): UpsertScheduledTaskRunAttemptSpec {
    const state = runAttempt.toState();
    return new UpsertScheduledTaskRunAttemptSpec(state);
  }

  get runId(): ScheduledTaskRunId {
    return this.state.id;
  }

  get taskId(): ScheduledTaskId {
    return this.state.taskId;
  }

  get resourceId(): ResourceId {
    return this.state.resourceId;
  }

  accept<TResult>(visitor: ScheduledTaskRunAttemptMutationSpecVisitor<TResult>): TResult {
    return visitor.visitUpsertScheduledTaskRunAttempt(this);
  }
}

export class ScheduledTaskRunAttempt extends AggregateRoot<
  ScheduledTaskRunAttemptState,
  ScheduledTaskRunId
> {
  private constructor(state: ScheduledTaskRunAttemptState) {
    super(state);
  }

  static create(input: CreateScheduledTaskRunAttemptInput): Result<ScheduledTaskRunAttempt> {
    return ok(
      new ScheduledTaskRunAttempt({
        id: input.id,
        taskId: input.taskId,
        resourceId: input.resourceId,
        triggerKind: input.triggerKind,
        status: ScheduledTaskRunStatusValue.accepted(),
        createdAt: input.createdAt,
      }),
    );
  }

  static rehydrate(state: ScheduledTaskRunAttemptState): ScheduledTaskRunAttempt {
    return new ScheduledTaskRunAttempt({ ...state });
  }

  start(input: { startedAt: StartedAt }): Result<void> {
    return this.state.status.start().map((status) => {
      this.state.status = status;
      this.state.startedAt = input.startedAt;
      return undefined;
    });
  }

  markSucceeded(input: {
    finishedAt: FinishedAt;
    exitCode?: ScheduledTaskRunExitCode;
  }): Result<void> {
    if (input.exitCode && !input.exitCode.isSuccessful()) {
      return err(
        scheduledTaskRunTransitionError(
          "Scheduled task run succeeded terminal state requires a successful exit code",
          { exitCode: input.exitCode.value },
        ),
      );
    }

    return this.state.status.succeed().map((status) => {
      this.state.status = status;
      this.state.finishedAt = input.finishedAt;
      this.state.exitCode = input.exitCode ?? ScheduledTaskRunExitCode.rehydrate(0);
      return undefined;
    });
  }

  markFailed(input: {
    finishedAt: FinishedAt;
    failureSummary: ScheduledTaskRunFailureSummary;
    exitCode?: ScheduledTaskRunExitCode;
  }): Result<void> {
    if (input.exitCode?.isSuccessful()) {
      return err(
        scheduledTaskRunTransitionError(
          "Scheduled task run failed terminal state cannot use a successful exit code",
          { exitCode: input.exitCode.value },
        ),
      );
    }

    return this.state.status.fail().map((status) => {
      this.state.status = status;
      this.state.finishedAt = input.finishedAt;
      this.state.failureSummary = input.failureSummary;
      if (input.exitCode) {
        this.state.exitCode = input.exitCode;
      }
      return undefined;
    });
  }

  markSkipped(input: {
    finishedAt: FinishedAt;
    skippedReason: ScheduledTaskRunSkippedReasonValue;
    failureSummary?: ScheduledTaskRunFailureSummary;
  }): Result<void> {
    return this.state.status.skip().map((status) => {
      this.state.status = status;
      this.state.finishedAt = input.finishedAt;
      this.state.skippedReason = input.skippedReason;
      if (input.failureSummary) {
        this.state.failureSummary = input.failureSummary;
      }
      return undefined;
    });
  }

  belongsToTask(taskId: ScheduledTaskId): boolean {
    return this.state.taskId.equals(taskId);
  }

  belongsToResource(resourceId: ResourceId): boolean {
    return this.state.resourceId.equals(resourceId);
  }

  isRunning(): boolean {
    return this.state.status.isRunning();
  }

  isTerminal(): boolean {
    return this.state.status.isTerminal();
  }

  isNonTerminal(): boolean {
    return this.state.status.isNonTerminal();
  }

  toState(): ScheduledTaskRunAttemptState {
    return { ...this.state };
  }
}
