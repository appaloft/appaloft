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
