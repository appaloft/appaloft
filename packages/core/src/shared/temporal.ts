import { domainError } from "./errors";
import { err, ok, type Result } from "./result";
import { ScalarValueObject } from "./value-object";

function normalizeIsoDateTime(value: string | Date, label: string): Result<string> {
  const raw = value instanceof Date ? value.toISOString() : value.trim();

  if (!raw) {
    return err(domainError.validation(`${label} is required`));
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return err(domainError.validation(`${label} must be a valid ISO date-time`));
  }

  return ok(parsed.toISOString());
}

function createDateTimeValue<TDateTime extends DateTimeValue>(
  value: string | Date,
  label: string,
  create: (normalized: string) => TDateTime,
): Result<TDateTime> {
  return normalizeIsoDateTime(value, label).map(create);
}

abstract class DateTimeValue extends ScalarValueObject<string> {
  protected constructor(value: string) {
    super(value);
  }

  toDate(): Date {
    return new Date(this.value);
  }
}

const createdAtBrand: unique symbol = Symbol("CreatedAt");
export class CreatedAt extends DateTimeValue {
  private [createdAtBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string | Date): Result<CreatedAt> {
    return createDateTimeValue(value, "CreatedAt", (normalized) => new CreatedAt(normalized));
  }

  static rehydrate(value: string): CreatedAt {
    return new CreatedAt(new Date(value).toISOString());
  }
}

const updatedAtBrand: unique symbol = Symbol("UpdatedAt");
export class UpdatedAt extends DateTimeValue {
  private [updatedAtBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string | Date): Result<UpdatedAt> {
    return createDateTimeValue(value, "UpdatedAt", (normalized) => new UpdatedAt(normalized));
  }

  static rehydrate(value: string): UpdatedAt {
    return new UpdatedAt(new Date(value).toISOString());
  }
}

const archivedAtBrand: unique symbol = Symbol("ArchivedAt");
export class ArchivedAt extends DateTimeValue {
  private [archivedAtBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string | Date): Result<ArchivedAt> {
    return createDateTimeValue(value, "ArchivedAt", (normalized) => new ArchivedAt(normalized));
  }

  static rehydrate(value: string): ArchivedAt {
    return new ArchivedAt(new Date(value).toISOString());
  }
}

const deletedAtBrand: unique symbol = Symbol("DeletedAt");
export class DeletedAt extends DateTimeValue {
  private [deletedAtBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string | Date): Result<DeletedAt> {
    return createDateTimeValue(value, "DeletedAt", (normalized) => new DeletedAt(normalized));
  }

  static rehydrate(value: string): DeletedAt {
    return new DeletedAt(new Date(value).toISOString());
  }
}

const deactivatedAtBrand: unique symbol = Symbol("DeactivatedAt");
export class DeactivatedAt extends DateTimeValue {
  private [deactivatedAtBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string | Date): Result<DeactivatedAt> {
    return createDateTimeValue(
      value,
      "DeactivatedAt",
      (normalized) => new DeactivatedAt(normalized),
    );
  }

  static rehydrate(value: string): DeactivatedAt {
    return new DeactivatedAt(new Date(value).toISOString());
  }
}

const occurredAtBrand: unique symbol = Symbol("OccurredAt");
export class OccurredAt extends DateTimeValue {
  private [occurredAtBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string | Date): Result<OccurredAt> {
    return createDateTimeValue(value, "OccurredAt", (normalized) => new OccurredAt(normalized));
  }

  static rehydrate(value: string): OccurredAt {
    return new OccurredAt(new Date(value).toISOString());
  }
}

const generatedAtBrand: unique symbol = Symbol("GeneratedAt");
export class GeneratedAt extends DateTimeValue {
  private [generatedAtBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string | Date): Result<GeneratedAt> {
    return createDateTimeValue(value, "GeneratedAt", (normalized) => new GeneratedAt(normalized));
  }

  static rehydrate(value: string): GeneratedAt {
    return new GeneratedAt(new Date(value).toISOString());
  }
}

const startedAtBrand: unique symbol = Symbol("StartedAt");
export class StartedAt extends DateTimeValue {
  private [startedAtBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string | Date): Result<StartedAt> {
    return createDateTimeValue(value, "StartedAt", (normalized) => new StartedAt(normalized));
  }

  static rehydrate(value: string): StartedAt {
    return new StartedAt(new Date(value).toISOString());
  }
}

const finishedAtBrand: unique symbol = Symbol("FinishedAt");
export class FinishedAt extends DateTimeValue {
  private [finishedAtBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string | Date): Result<FinishedAt> {
    return createDateTimeValue(value, "FinishedAt", (normalized) => new FinishedAt(normalized));
  }

  static rehydrate(value: string): FinishedAt {
    return new FinishedAt(new Date(value).toISOString());
  }
}

const sealedAtBrand: unique symbol = Symbol("SealedAt");
export class SealedAt extends DateTimeValue {
  private [sealedAtBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string | Date): Result<SealedAt> {
    return createDateTimeValue(value, "SealedAt", (normalized) => new SealedAt(normalized));
  }

  static rehydrate(value: string): SealedAt {
    return new SealedAt(new Date(value).toISOString());
  }
}

const joinedAtBrand: unique symbol = Symbol("JoinedAt");
export class JoinedAt extends DateTimeValue {
  private [joinedAtBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string | Date): Result<JoinedAt> {
    return createDateTimeValue(value, "JoinedAt", (normalized) => new JoinedAt(normalized));
  }

  static rehydrate(value: string): JoinedAt {
    return new JoinedAt(new Date(value).toISOString());
  }
}

const installedAtBrand: unique symbol = Symbol("InstalledAt");
export class InstalledAt extends DateTimeValue {
  private [installedAtBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string | Date): Result<InstalledAt> {
    return createDateTimeValue(value, "InstalledAt", (normalized) => new InstalledAt(normalized));
  }

  static rehydrate(value: string): InstalledAt {
    return new InstalledAt(new Date(value).toISOString());
  }
}
