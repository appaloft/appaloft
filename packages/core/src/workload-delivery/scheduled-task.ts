import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import { type ResourceId, type ScheduledTaskId } from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import { type CreatedAt } from "../shared/temporal";
import { ScalarValueObject } from "../shared/value-object";

export type ScheduledTaskConcurrencyPolicy = "forbid";
export type ScheduledTaskDefinitionStatus = "enabled" | "disabled";

const scheduledTaskValidationPhase = "scheduled-task-definition-admission";
const scheduleMacros = ["@hourly", "@daily", "@weekly", "@monthly"] as const;
const concurrencyPolicies = ["forbid"] as const;
const scheduledTaskDefinitionStatuses = ["enabled", "disabled"] as const;

function scheduledTaskValidationError(
  message: string,
  details?: Record<string, string | number | boolean>,
) {
  return domainError.validation(message, {
    phase: scheduledTaskValidationPhase,
    ...(details ?? {}),
  });
}

function includesValue<TValue extends string>(
  values: readonly TValue[],
  value: string,
): value is TValue {
  return values.includes(value as TValue);
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

    if (
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(normalized) ||
      /\b(?:password|secret|token|private[_ -]?key)\s*[:=]/i.test(normalized) ||
      /\b(?:ghp_|github_pat_|xox[baprs]-|sk-[A-Za-z0-9_-]{16,})/.test(normalized)
    ) {
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

  toState(): ScheduledTaskDefinitionState {
    return { ...this.state };
  }
}
