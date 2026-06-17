import {
  type DnsRecordKind,
  DnsRecordPlan,
  type DnsRecordPurpose,
  type DnsRecordRequirementSnapshot,
  domainError,
  err,
  ok,
  type Result,
} from "@appaloft/core";

import { type ExecutionContext } from "../execution-context";
import {
  type ConnectorCapabilityPlanInput,
  type ConnectorCapabilityPlanPreview,
  type ConnectorProviderAdapter,
  type DnsConnectorProviderReadModel,
} from "../ports";

export interface FakeDnsConnectorProviderAdapterOptions {
  connectorKey: string;
  providerTitle: string;
  existingRecords?: readonly DnsRecordRequirementSnapshot[];
}

export class InMemoryDnsConnectorProviderReadModel implements DnsConnectorProviderReadModel {
  constructor(private readonly records: readonly DnsRecordRequirementSnapshot[] = []) {}

  async existingRecords(input: {
    zoneName?: string;
    records: readonly DnsRecordRequirementSnapshot[];
  }): Promise<Result<readonly DnsRecordRequirementSnapshot[]>> {
    void input;
    return ok(this.records);
  }
}

export class FakeDnsConnectorProviderAdapter implements ConnectorProviderAdapter {
  readonly connectorKey: string;
  private readonly providerTitle: string;
  private readonly readModel: DnsConnectorProviderReadModel;

  constructor(options: FakeDnsConnectorProviderAdapterOptions) {
    this.connectorKey = options.connectorKey;
    this.providerTitle = options.providerTitle;
    this.readModel = new InMemoryDnsConnectorProviderReadModel(options.existingRecords);
  }

  canPlan(capabilityKey: string): boolean {
    return capabilityKey === "dns.records.plan";
  }

  async planCapability(
    context: ExecutionContext,
    input: ConnectorCapabilityPlanInput,
  ): Promise<Result<ConnectorCapabilityPlanPreview>> {
    void context;
    if (!this.canPlan(input.capabilityKey)) {
      return err(
        domainError.validation(`Connector ${this.connectorKey} cannot plan ${input.capabilityKey}`),
      );
    }

    const parameters = parseDnsPlanParameters(input.parameters ?? {});
    if (parameters.isErr()) return err(parameters.error);

    const existingRecords = await this.readModel.existingRecords(parameters.value);
    if (existingRecords.isErr()) return err(existingRecords.error);

    const plan = DnsRecordPlan.create({
      ...(parameters.value.zoneName ? { zoneName: parameters.value.zoneName } : {}),
      records: parameters.value.records,
      existingRecords: [...existingRecords.value],
    });
    if (plan.isErr()) return err(plan.error);

    return ok(this.toPreview(input, plan.value));
  }

  private toPreview(
    input: ConnectorCapabilityPlanInput,
    plan: DnsRecordPlan,
  ): ConnectorCapabilityPlanPreview {
    const dnsRecords = plan.toJSON();
    const planId = `dnsplan_${stableHash({
      connectorKey: input.connectorKey,
      capabilityKey: input.capabilityKey,
      ownerRef: input.ownerRef,
      dnsRecords,
    })}`;

    return {
      planId,
      connectorKey: input.connectorKey,
      capabilityKey: input.capabilityKey,
      riskLevel: plan.hasConflicts() ? "medium" : "low",
      requiresExplicitAcceptance: true,
      summary: `${this.providerTitle}: ${plan.summary()}`,
      effects: [
        ...plan.records().map((record) => ({
          kind: "dns.record.upsert",
          title: record.title(),
          description: record.description(),
        })),
        ...plan.conflicts().map((conflict) => ({
          kind: "dns.record.conflict",
          title: `Conflict at ${conflict.name}`,
          description: `${conflict.existingType} ${conflict.name} already points to ${conflict.existingValue}; requested ${conflict.requestedType} ${conflict.requestedValue}.`,
        })),
      ],
      cleanup: {
        supported: true,
        description:
          "Cleanup is limited to Appaloft-managed DNS records after apply support lands.",
      },
      providerPlan: {
        kind: "dns-records",
        dnsRecords,
      },
    };
  }
}

function parseDnsPlanParameters(
  parameters: Record<string, unknown>,
): Result<{ zoneName?: string; records: DnsRecordRequirementSnapshot[] }> {
  if (Array.isArray(parameters.records)) {
    const records = parameters.records.map((record) => recordFromUnknown(record));
    const failed = records.find((record) => record.isErr());
    if (failed?.isErr()) return err(failed.error);
    return ok({
      ...(typeof parameters.zoneName === "string" && parameters.zoneName.trim()
        ? { zoneName: parameters.zoneName.trim() }
        : {}),
      records: records.map((record) => record._unsafeUnwrap()),
    });
  }

  const name = requiredString(parameters.hostname ?? parameters.name, "hostname");
  if (name.isErr()) return err(name.error);
  const value = requiredString(parameters.target ?? parameters.value, "target");
  if (value.isErr()) return err(value.error);
  const type = optionalRecordType(parameters.recordType ?? parameters.type);
  if (type.isErr()) return err(type.error);
  const purpose = optionalPurpose(parameters.purpose);
  if (purpose.isErr()) return err(purpose.error);

  return ok({
    ...(typeof parameters.zoneName === "string" && parameters.zoneName.trim()
      ? { zoneName: parameters.zoneName.trim() }
      : {}),
    records: [
      {
        name: name.value,
        type: type.value,
        value: value.value,
        purpose: purpose.value,
        ...(typeof parameters.ttl === "number" ? { ttl: parameters.ttl } : {}),
        ...(typeof parameters.proxied === "boolean" ? { proxied: parameters.proxied } : {}),
      },
    ],
  });
}

function recordFromUnknown(value: unknown): Result<DnsRecordRequirementSnapshot> {
  if (!value || typeof value !== "object") {
    return err(domainError.validation("DNS record must be an object"));
  }
  const input = value as Record<string, unknown>;
  const name = requiredString(input.name, "record.name");
  if (name.isErr()) return err(name.error);
  const recordValue = requiredString(input.value, "record.value");
  if (recordValue.isErr()) return err(recordValue.error);
  const type = optionalRecordType(input.type);
  if (type.isErr()) return err(type.error);
  const purpose = optionalPurpose(input.purpose);
  if (purpose.isErr()) return err(purpose.error);

  return ok({
    name: name.value,
    type: type.value,
    value: recordValue.value,
    purpose: purpose.value,
    ...(typeof input.ttl === "number" ? { ttl: input.ttl } : {}),
    ...(typeof input.proxied === "boolean" ? { proxied: input.proxied } : {}),
  });
}

function requiredString(value: unknown, label: string): Result<string> {
  if (typeof value !== "string" || !value.trim()) {
    return err(domainError.validation(`DNS ${label} is required`));
  }
  return ok(value.trim());
}

function optionalRecordType(value: unknown): Result<DnsRecordKind> {
  const normalized =
    typeof value === "string" && value.trim() ? value.trim().toUpperCase() : "CNAME";
  if (
    normalized === "A" ||
    normalized === "AAAA" ||
    normalized === "CNAME" ||
    normalized === "TXT"
  ) {
    return ok(normalized);
  }
  return err(domainError.validation(`Unsupported DNS record type ${normalized}`));
}

function optionalPurpose(value: unknown): Result<DnsRecordPurpose> {
  const normalized = typeof value === "string" && value.trim() ? value.trim() : "domain-routing";
  if (
    normalized === "domain-routing" ||
    normalized === "domain-verification" ||
    normalized === "certificate-validation" ||
    normalized === "manual"
  ) {
    return ok(normalized);
  }
  return err(domainError.validation(`Unsupported DNS record purpose ${normalized}`));
}

function stableHash(value: unknown): string {
  const input = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
