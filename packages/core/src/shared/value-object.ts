export abstract class ValueObject<TState> {
  protected constructor(protected readonly state: TState) {}

  protected snapshot(): unknown {
    return this.state;
  }

  equals(other: ValueObject<TState>): boolean {
    return JSON.stringify(this.snapshot()) === JSON.stringify(other.snapshot());
  }
}

export abstract class ScalarValueObject<
  TValue extends string | number | boolean,
> extends ValueObject<TValue> {
  protected constructor(value: TValue) {
    super(value);
  }

  get value(): TValue {
    return this.state;
  }

  toString(): string {
    return String(this.state);
  }

  toJSON(): TValue {
    return this.state;
  }
}
