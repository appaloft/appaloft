import { domainError } from "./errors";
import { err, ok, type Result } from "./result";
import { ScalarValueObject } from "./value-object";

const portNumberBrand: unique symbol = Symbol("PortNumber");

export class PortNumber extends ScalarValueObject<number> {
  private [portNumberBrand]!: void;

  private constructor(value: number) {
    super(value);
  }

  static create(value: number): Result<PortNumber> {
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
      return err(domainError.validation("Port must be an integer between 1 and 65535"));
    }

    return ok(new PortNumber(value));
  }

  static rehydrate(value: number): PortNumber {
    return new PortNumber(value);
  }
}

function createPositiveIntegerValue<TValue>(
  value: number,
  label: string,
  create: (validated: number) => TValue,
): Result<TValue> {
  if (!Number.isInteger(value) || value < 1) {
    return err(domainError.validation(`${label} must be a positive integer`));
  }

  return ok(create(value));
}

const healthCheckExpectedStatusCodeBrand: unique symbol = Symbol("HealthCheckExpectedStatusCode");
export class HealthCheckExpectedStatusCode extends ScalarValueObject<number> {
  private [healthCheckExpectedStatusCodeBrand]!: void;

  private constructor(value: number) {
    super(value);
  }

  static create(value: number): Result<HealthCheckExpectedStatusCode> {
    if (!Number.isInteger(value) || value < 100 || value > 599) {
      return err(
        domainError.validation("Health check expected status code must be between 100 and 599"),
      );
    }

    return ok(new HealthCheckExpectedStatusCode(value));
  }

  static rehydrate(value: number): HealthCheckExpectedStatusCode {
    return new HealthCheckExpectedStatusCode(value);
  }
}

const healthCheckIntervalSecondsBrand: unique symbol = Symbol("HealthCheckIntervalSeconds");
export class HealthCheckIntervalSeconds extends ScalarValueObject<number> {
  private [healthCheckIntervalSecondsBrand]!: void;

  private constructor(value: number) {
    super(value);
  }

  static create(value: number): Result<HealthCheckIntervalSeconds> {
    return createPositiveIntegerValue(
      value,
      "Health check interval seconds",
      (validated) => new HealthCheckIntervalSeconds(validated),
    );
  }

  static rehydrate(value: number): HealthCheckIntervalSeconds {
    return new HealthCheckIntervalSeconds(value);
  }
}

const healthCheckTimeoutSecondsBrand: unique symbol = Symbol("HealthCheckTimeoutSeconds");
export class HealthCheckTimeoutSeconds extends ScalarValueObject<number> {
  private [healthCheckTimeoutSecondsBrand]!: void;

  private constructor(value: number) {
    super(value);
  }

  static create(value: number): Result<HealthCheckTimeoutSeconds> {
    return createPositiveIntegerValue(
      value,
      "Health check timeout seconds",
      (validated) => new HealthCheckTimeoutSeconds(validated),
    );
  }

  static rehydrate(value: number): HealthCheckTimeoutSeconds {
    return new HealthCheckTimeoutSeconds(value);
  }
}

const healthCheckRetryCountBrand: unique symbol = Symbol("HealthCheckRetryCount");
export class HealthCheckRetryCount extends ScalarValueObject<number> {
  private [healthCheckRetryCountBrand]!: void;

  private constructor(value: number) {
    super(value);
  }

  static create(value: number): Result<HealthCheckRetryCount> {
    return createPositiveIntegerValue(
      value,
      "Health check retry count",
      (validated) => new HealthCheckRetryCount(validated),
    );
  }

  static rehydrate(value: number): HealthCheckRetryCount {
    return new HealthCheckRetryCount(value);
  }
}

const healthCheckStartPeriodSecondsBrand: unique symbol = Symbol("HealthCheckStartPeriodSeconds");
export class HealthCheckStartPeriodSeconds extends ScalarValueObject<number> {
  private [healthCheckStartPeriodSecondsBrand]!: void;

  private constructor(value: number) {
    super(value);
  }

  static create(value: number): Result<HealthCheckStartPeriodSeconds> {
    if (!Number.isInteger(value) || value < 0) {
      return err(
        domainError.validation("Health check start period seconds must be a non-negative integer"),
      );
    }

    return ok(new HealthCheckStartPeriodSeconds(value));
  }

  static rehydrate(value: number): HealthCheckStartPeriodSeconds {
    return new HealthCheckStartPeriodSeconds(value);
  }
}

const exitCodeBrand: unique symbol = Symbol("ExitCode");
export class ExitCode extends ScalarValueObject<number> {
  private [exitCodeBrand]!: void;

  private constructor(value: number) {
    super(value);
  }

  static create(value: number): Result<ExitCode> {
    if (!Number.isInteger(value) || value < 0) {
      return err(domainError.validation("Exit code must be a non-negative integer"));
    }

    return ok(new ExitCode(value));
  }

  static rehydrate(value: number): ExitCode {
    return new ExitCode(value);
  }
}
