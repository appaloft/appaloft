import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { ScalarValueObject } from "../shared/value-object";

export type DnsRecordKind = "A" | "AAAA" | "CNAME" | "TXT";
export type DnsRecordPurpose =
  | "domain-routing"
  | "domain-verification"
  | "certificate-validation"
  | "manual";

export interface DnsRecordRequirementSnapshot {
  name: string;
  type: DnsRecordKind;
  value: string;
  ttl?: number;
  proxied?: boolean;
  purpose: DnsRecordPurpose;
}

export interface DnsRecordConflictSnapshot {
  name: string;
  requestedType: DnsRecordKind;
  existingType: DnsRecordKind;
  reason: "cname-exclusive" | "different-value";
  existingValue: string;
  requestedValue: string;
}

export interface DnsRecordPlanSnapshot {
  zoneName?: string;
  records: DnsRecordRequirementSnapshot[];
  conflicts: DnsRecordConflictSnapshot[];
}

export interface DnsRecordActionEffectSnapshot {
  kind: string;
  title: string;
  description?: string;
  providerRecordId?: string;
  managed?: boolean;
}

export interface DnsRecordApplySnapshot {
  zoneName?: string;
  status: "applied" | "verified" | "cleaned-up" | "conflict" | "skipped";
  records: DnsRecordRequirementSnapshot[];
  conflicts: DnsRecordConflictSnapshot[];
  missingRecords: DnsRecordRequirementSnapshot[];
  effects: DnsRecordActionEffectSnapshot[];
}

const dnsRecordKinds = ["A", "AAAA", "CNAME", "TXT"] as const satisfies readonly DnsRecordKind[];
const dnsRecordPurposes = [
  "domain-routing",
  "domain-verification",
  "certificate-validation",
  "manual",
] as const satisfies readonly DnsRecordPurpose[];

function requiredText(value: string, label: string): Result<string> {
  const normalized = value.trim();
  if (!normalized) {
    return err(domainError.validation(`${label} is required`));
  }
  return ok(normalized);
}

const dnsRecordNameBrand: unique symbol = Symbol("DnsRecordName");
export class DnsRecordName extends ScalarValueObject<string> {
  private [dnsRecordNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DnsRecordName> {
    return requiredText(value, "DNS record name").map(
      (normalized) => new DnsRecordName(normalized.replace(/\.$/, "").toLowerCase()),
    );
  }

  static rehydrate(value: string): DnsRecordName {
    return new DnsRecordName(value.replace(/\.$/, "").toLowerCase());
  }
}

const dnsRecordValueBrand: unique symbol = Symbol("DnsRecordValue");
export class DnsRecordValue extends ScalarValueObject<string> {
  private [dnsRecordValueBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DnsRecordValue> {
    return requiredText(value, "DNS record value").map(
      (normalized) => new DnsRecordValue(normalized),
    );
  }

  static rehydrate(value: string): DnsRecordValue {
    return new DnsRecordValue(value.trim());
  }
}

export class DnsRecordRequirement {
  private constructor(
    private readonly nameValue: DnsRecordName,
    private readonly typeValue: DnsRecordKind,
    private readonly valueValue: DnsRecordValue,
    private readonly purposeValue: DnsRecordPurpose,
    private readonly ttlValue?: number,
    private readonly proxiedValue?: boolean,
  ) {}

  static create(input: DnsRecordRequirementSnapshot): Result<DnsRecordRequirement> {
    const name = DnsRecordName.create(input.name);
    if (name.isErr()) return err(name.error);
    if (!dnsRecordKinds.includes(input.type)) {
      return err(domainError.validation(`Unsupported DNS record type ${input.type}`));
    }
    const value = DnsRecordValue.create(input.value);
    if (value.isErr()) return err(value.error);
    if (!dnsRecordPurposes.includes(input.purpose)) {
      return err(domainError.validation(`Unsupported DNS record purpose ${input.purpose}`));
    }
    if (input.ttl !== undefined && (!Number.isInteger(input.ttl) || input.ttl < 1)) {
      return err(domainError.validation("DNS record TTL must be a positive integer"));
    }

    return ok(
      new DnsRecordRequirement(
        name.value,
        input.type,
        value.value,
        input.purpose,
        input.ttl,
        input.proxied,
      ),
    );
  }

  static rehydrate(input: DnsRecordRequirementSnapshot): DnsRecordRequirement {
    return new DnsRecordRequirement(
      DnsRecordName.rehydrate(input.name),
      input.type,
      DnsRecordValue.rehydrate(input.value),
      input.purpose,
      input.ttl,
      input.proxied,
    );
  }

  conflictsWith(existing: DnsRecordRequirement): DnsRecordConflictSnapshot | null {
    if (this.nameValue.value !== existing.nameValue.value) {
      return null;
    }

    const cnameExclusive = this.typeValue === "CNAME" || existing.typeValue === "CNAME";
    if (cnameExclusive && !this.sameRecord(existing)) {
      return this.conflictSnapshot(existing, "cname-exclusive");
    }

    if (
      this.typeValue === existing.typeValue &&
      this.valueValue.value !== existing.valueValue.value
    ) {
      return this.conflictSnapshot(existing, "different-value");
    }

    return null;
  }

  sameRecord(other: DnsRecordRequirement): boolean {
    return (
      this.nameValue.value === other.nameValue.value &&
      this.typeValue === other.typeValue &&
      this.valueValue.value === other.valueValue.value
    );
  }

  title(): string {
    return `${this.typeValue} ${this.nameValue.value}`;
  }

  description(): string {
    return `${this.typeValue} ${this.nameValue.value} -> ${this.valueValue.value}`;
  }

  toJSON(): DnsRecordRequirementSnapshot {
    return {
      name: this.nameValue.value,
      type: this.typeValue,
      value: this.valueValue.value,
      purpose: this.purposeValue,
      ...(this.ttlValue !== undefined ? { ttl: this.ttlValue } : {}),
      ...(this.proxiedValue !== undefined ? { proxied: this.proxiedValue } : {}),
    };
  }

  private conflictSnapshot(
    existing: DnsRecordRequirement,
    reason: DnsRecordConflictSnapshot["reason"],
  ): DnsRecordConflictSnapshot {
    return {
      name: this.nameValue.value,
      requestedType: this.typeValue,
      existingType: existing.typeValue,
      reason,
      existingValue: existing.valueValue.value,
      requestedValue: this.valueValue.value,
    };
  }
}

export class DnsRecordPlan {
  private constructor(
    private readonly recordsValue: DnsRecordRequirement[],
    private readonly conflictsValue: DnsRecordConflictSnapshot[],
    private readonly zoneNameValue?: string,
  ) {}

  static create(input: {
    zoneName?: string;
    records: DnsRecordRequirementSnapshot[];
    existingRecords?: DnsRecordRequirementSnapshot[];
  }): Result<DnsRecordPlan> {
    if (input.records.length === 0) {
      return err(domainError.validation("At least one DNS record is required"));
    }

    const records: DnsRecordRequirement[] = [];
    for (const recordInput of input.records) {
      const record = DnsRecordRequirement.create(recordInput);
      if (record.isErr()) return err(record.error);
      records.push(record.value);
    }

    const existingRecords: DnsRecordRequirement[] = [];
    for (const recordInput of input.existingRecords ?? []) {
      const record = DnsRecordRequirement.create(recordInput);
      if (record.isErr()) return err(record.error);
      existingRecords.push(record.value);
    }

    const conflicts = records.flatMap((record) =>
      existingRecords
        .map((existing) => record.conflictsWith(existing))
        .filter((conflict): conflict is DnsRecordConflictSnapshot => Boolean(conflict)),
    );

    return ok(
      new DnsRecordPlan(
        records,
        conflicts,
        input.zoneName?.trim().replace(/\.$/, "").toLowerCase(),
      ),
    );
  }

  hasConflicts(): boolean {
    return this.conflictsValue.length > 0;
  }

  records(): DnsRecordRequirement[] {
    return [...this.recordsValue];
  }

  conflicts(): DnsRecordConflictSnapshot[] {
    return [...this.conflictsValue];
  }

  ensureApplicable(): Result<DnsRecordPlan> {
    if (this.hasConflicts()) {
      return err(
        domainError.conflict("DNS records cannot be applied while conflicts exist", {
          conflictCount: this.conflictsValue.length,
        }),
      );
    }
    return ok(this);
  }

  missingFrom(
    existingRecordInputs: DnsRecordRequirementSnapshot[],
  ): Result<DnsRecordRequirement[]> {
    const existingRecords: DnsRecordRequirement[] = [];
    for (const recordInput of existingRecordInputs) {
      const record = DnsRecordRequirement.create(recordInput);
      if (record.isErr()) return err(record.error);
      existingRecords.push(record.value);
    }

    return ok(
      this.recordsValue.filter(
        (record) => !existingRecords.some((existing) => record.sameRecord(existing)),
      ),
    );
  }

  summary(): string {
    const recordCount = this.recordsValue.length;
    const zoneSuffix = this.zoneNameValue ? ` in ${this.zoneNameValue}` : "";
    if (this.hasConflicts()) {
      return `${recordCount} DNS record${recordCount === 1 ? "" : "s"} planned${zoneSuffix}, ${this.conflictsValue.length} conflict${this.conflictsValue.length === 1 ? "" : "s"} detected.`;
    }
    return `${recordCount} DNS record${recordCount === 1 ? "" : "s"} planned${zoneSuffix}.`;
  }

  toJSON(): DnsRecordPlanSnapshot {
    return {
      ...(this.zoneNameValue ? { zoneName: this.zoneNameValue } : {}),
      records: this.recordsValue.map((record) => record.toJSON()),
      conflicts: this.conflicts(),
    };
  }
}
