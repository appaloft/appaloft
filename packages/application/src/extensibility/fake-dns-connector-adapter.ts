import {
  type DnsRecordApplySnapshot,
  type DnsRecordKind,
  DnsRecordPlan,
  type DnsRecordPurpose,
  type DnsRecordRequirementSnapshot,
  type DomainConnectApplySnapshot,
  DomainConnectSetup,
  type DomainConnectSetupSnapshot,
  type DomainError,
  domainError,
  err,
  ok,
  type Result,
} from "@appaloft/core";

import { type ExecutionContext } from "../execution-context";
import {
  type ConnectorCapabilityApplyInput,
  type ConnectorCapabilityApplyResult,
  type ConnectorCapabilityPlanInput,
  type ConnectorCapabilityPlanPreview,
  type ConnectorProviderAdapter,
  type DnsConnectorProviderRecordStore,
} from "../ports";

export interface FakeDnsConnectorProviderAdapterOptions {
  connectorKey: string;
  providerTitle: string;
  existingRecords?: readonly DnsRecordRequirementSnapshot[];
  failureMode?: FakeDnsConnectorProviderFailureMode;
  domainConnect?: {
    providerKey?: string;
    serviceId?: string;
    templateId?: string;
    consentBaseUrl?: string;
  };
}

export type FakeDnsConnectorProviderFailureMode =
  | "provider-error"
  | "rate-limit"
  | "revoked-credential";

interface StoredDnsRecord {
  record: DnsRecordRequirementSnapshot;
  providerRecordId: string;
  managed: boolean;
}

export class InMemoryDnsConnectorProviderRecordStore implements DnsConnectorProviderRecordStore {
  private readonly records: StoredDnsRecord[];
  private readonly failureMode: FakeDnsConnectorProviderFailureMode | undefined;

  constructor(
    records: readonly DnsRecordRequirementSnapshot[] = [],
    options: { failureMode?: FakeDnsConnectorProviderFailureMode } = {},
  ) {
    this.records = records.map((record) => ({
      record,
      providerRecordId: providerRecordId(record),
      managed: false,
    }));
    this.failureMode = options.failureMode;
  }

  async existingRecords(input: {
    zoneName?: string;
    records: readonly DnsRecordRequirementSnapshot[];
  }): Promise<Result<readonly DnsRecordRequirementSnapshot[]>> {
    void input;
    const failure = this.providerFailure("read");
    if (failure) return err(failure);
    return ok(this.records.map((record) => record.record));
  }

  async applyRecords(input: {
    zoneName?: string;
    records: readonly DnsRecordRequirementSnapshot[];
  }): Promise<Result<DnsRecordApplySnapshot>> {
    const failure = this.providerFailure("apply");
    if (failure) return err(failure);
    const plan = DnsRecordPlan.create({
      ...(input.zoneName ? { zoneName: input.zoneName } : {}),
      records: [...input.records],
      existingRecords: this.records.map((record) => record.record),
    });
    if (plan.isErr()) return err(plan.error);
    const applicable = plan.value.ensureApplicable();
    if (applicable.isErr()) return err(applicable.error);

    const effects: DnsRecordApplySnapshot["effects"] = [];
    for (const record of plan.value.records()) {
      const snapshot = record.toJSON();
      const existing = this.records.find((stored) => sameDnsRecord(stored.record, snapshot));
      if (existing) {
        effects.push({
          kind: "dns.record.exists",
          title: record.title(),
          description: `${record.description()} already exists at the provider.`,
          providerRecordId: existing.providerRecordId,
          managed: existing.managed,
        });
        continue;
      }

      const stored = {
        record: snapshot,
        providerRecordId: providerRecordId(snapshot),
        managed: true,
      };
      this.records.push(stored);
      effects.push({
        kind: "dns.record.upsert",
        title: record.title(),
        description: record.description(),
        providerRecordId: stored.providerRecordId,
        managed: true,
      });
    }

    return ok({
      ...(input.zoneName ? { zoneName: input.zoneName } : {}),
      status: effects.some((effect) => effect.kind === "dns.record.upsert")
        ? "applied"
        : "verified",
      records: plan.value.toJSON().records,
      conflicts: [],
      missingRecords: [],
      effects,
    });
  }

  async verifyRecords(input: {
    zoneName?: string;
    records: readonly DnsRecordRequirementSnapshot[];
  }): Promise<Result<DnsRecordApplySnapshot>> {
    const failure = this.providerFailure("verify");
    if (failure) return err(failure);
    const plan = DnsRecordPlan.create({
      ...(input.zoneName ? { zoneName: input.zoneName } : {}),
      records: [...input.records],
      existingRecords: this.records.map((record) => record.record),
    });
    if (plan.isErr()) return err(plan.error);

    const missing = plan.value.missingFrom(this.records.map((record) => record.record));
    if (missing.isErr()) return err(missing.error);

    const missingRecords = missing.value.map((record) => record.toJSON());
    return ok({
      ...(input.zoneName ? { zoneName: input.zoneName } : {}),
      status: missingRecords.length === 0 ? "verified" : "conflict",
      records: plan.value.toJSON().records,
      conflicts: plan.value.conflicts(),
      missingRecords,
      effects: plan.value.records().map((record) => {
        const snapshot = record.toJSON();
        const existing = this.records.find((stored) => sameDnsRecord(stored.record, snapshot));
        return {
          kind: existing ? "dns.record.verified" : "dns.record.missing",
          title: record.title(),
          description: existing
            ? `${record.description()} is present at the provider.`
            : `${record.description()} is missing at the provider.`,
          ...(existing
            ? {
                providerRecordId: existing.providerRecordId,
                managed: existing.managed,
              }
            : {}),
        };
      }),
    });
  }

  async cleanupRecords(input: {
    zoneName?: string;
    records: readonly DnsRecordRequirementSnapshot[];
  }): Promise<Result<DnsRecordApplySnapshot>> {
    const failure = this.providerFailure("cleanup");
    if (failure) return err(failure);
    const plan = DnsRecordPlan.create({
      ...(input.zoneName ? { zoneName: input.zoneName } : {}),
      records: [...input.records],
      existingRecords: this.records.map((record) => record.record),
    });
    if (plan.isErr()) return err(plan.error);

    const effects: DnsRecordApplySnapshot["effects"] = [];
    for (const record of plan.value.records()) {
      const snapshot = record.toJSON();
      const index = this.records.findIndex((stored) => sameDnsRecord(stored.record, snapshot));
      if (index === -1) {
        effects.push({
          kind: "dns.record.cleanup.missing",
          title: record.title(),
          description: `${record.description()} is not present at the provider.`,
          managed: false,
        });
        continue;
      }

      const existing = this.records[index];
      if (!existing?.managed) {
        effects.push({
          kind: "dns.record.cleanup.skipped",
          title: record.title(),
          description: `${record.description()} is not Appaloft-managed and was left untouched.`,
          ...(existing?.providerRecordId ? { providerRecordId: existing.providerRecordId } : {}),
          managed: false,
        });
        continue;
      }

      this.records.splice(index, 1);
      effects.push({
        kind: "dns.record.cleanup.deleted",
        title: record.title(),
        description: `${record.description()} was removed from the provider.`,
        providerRecordId: existing.providerRecordId,
        managed: true,
      });
    }

    return ok({
      ...(input.zoneName ? { zoneName: input.zoneName } : {}),
      status: effects.some((effect) => effect.kind === "dns.record.cleanup.deleted")
        ? "cleaned-up"
        : "skipped",
      records: plan.value.toJSON().records,
      conflicts: plan.value.conflicts(),
      missingRecords: [],
      effects,
    });
  }

  private providerFailure(operation: string): DomainError | null {
    if (!this.failureMode) return null;
    return fakeDnsProviderFailure(this.failureMode, operation);
  }
}

export class FakeDnsConnectorProviderAdapter implements ConnectorProviderAdapter {
  readonly connectorKey: string;
  private readonly providerTitle: string;
  private readonly recordStore: DnsConnectorProviderRecordStore;
  private readonly domainConnectProviderKey: string;
  private readonly domainConnectServiceId: string;
  private readonly domainConnectTemplateId: string;
  private readonly domainConnectConsentBaseUrl: string;

  constructor(options: FakeDnsConnectorProviderAdapterOptions) {
    this.connectorKey = options.connectorKey;
    this.providerTitle = options.providerTitle;
    this.recordStore = new InMemoryDnsConnectorProviderRecordStore(options.existingRecords, {
      ...(options.failureMode ? { failureMode: options.failureMode } : {}),
    });
    this.domainConnectProviderKey = options.domainConnect?.providerKey ?? "cloudflare";
    this.domainConnectServiceId = options.domainConnect?.serviceId ?? "appaloft";
    this.domainConnectTemplateId = options.domainConnect?.templateId ?? "appaloft-domain";
    this.domainConnectConsentBaseUrl =
      options.domainConnect?.consentBaseUrl ??
      "https://domainconnect.example.test/v2/domainTemplates/providers";
  }

  canPlan(capabilityKey: string): boolean {
    return capabilityKey === "dns.records.plan" || capabilityKey === "dns.domain-connect.start";
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

    if (input.capabilityKey === "dns.domain-connect.start") {
      const setup = this.domainConnectSetup(input);
      if (setup.isErr()) return err(setup.error);
      return ok(this.toDomainConnectPreview(input, setup.value));
    }

    const parameters = parseDnsPlanParameters(input.parameters ?? {});
    if (parameters.isErr()) return err(parameters.error);

    const existingRecords = await this.recordStore.existingRecords(parameters.value);
    if (existingRecords.isErr()) return err(existingRecords.error);

    const plan = DnsRecordPlan.create({
      ...(parameters.value.zoneName ? { zoneName: parameters.value.zoneName } : {}),
      records: parameters.value.records,
      existingRecords: [...existingRecords.value],
    });
    if (plan.isErr()) return err(plan.error);

    return ok(this.toPreview(input, plan.value));
  }

  canApply(capabilityKey: string): boolean {
    return (
      capabilityKey === "dns.records.apply" ||
      capabilityKey === "dns.records.verify" ||
      capabilityKey === "dns.records.cleanup" ||
      capabilityKey === "dns.domain-connect.complete"
    );
  }

  async applyCapability(
    context: ExecutionContext,
    input: ConnectorCapabilityApplyInput,
  ): Promise<Result<ConnectorCapabilityApplyResult>> {
    void context;
    if (!this.canApply(input.capabilityKey)) {
      return err(
        domainError.validation(
          `Connector ${this.connectorKey} cannot apply ${input.capabilityKey}`,
        ),
      );
    }

    if (input.capabilityKey === "dns.domain-connect.complete") {
      const setup = this.domainConnectSetup(input);
      if (setup.isErr()) return err(setup.error);
      const applied = await this.recordStore.applyRecords({
        zoneName: setup.value.toJSON().zoneName,
        records: setup.value.records().map((record) => record.toJSON()),
      });
      if (applied.isErr()) return err(applied.error);
      return ok(this.toDomainConnectApplyResult(input, setup.value, applied.value));
    }

    const parameters = parseDnsPlanParameters(input.parameters ?? {});
    if (parameters.isErr()) return err(parameters.error);

    const dnsRecords =
      input.capabilityKey === "dns.records.cleanup"
        ? await this.recordStore.cleanupRecords(parameters.value)
        : input.capabilityKey === "dns.records.verify"
          ? await this.recordStore.verifyRecords(parameters.value)
          : await this.recordStore.applyRecords(parameters.value);
    if (dnsRecords.isErr()) return err(dnsRecords.error);

    return ok(this.toApplyResult(input, dnsRecords.value));
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
        description: "Cleanup is limited to Appaloft-managed DNS records.",
      },
      providerPlan: {
        kind: "dns-records",
        dnsRecords,
      },
    };
  }

  private toDomainConnectPreview(
    input: ConnectorCapabilityPlanInput,
    setup: DomainConnectSetup,
  ): ConnectorCapabilityPlanPreview {
    const domainConnectSetup = setup.toJSON();
    const planId = `domainconnect_${stableHash({
      connectorKey: input.connectorKey,
      capabilityKey: input.capabilityKey,
      ownerRef: input.ownerRef,
      domainConnectSetup,
    })}`;

    return {
      planId,
      connectorKey: input.connectorKey,
      capabilityKey: input.capabilityKey,
      riskLevel: "low",
      requiresExplicitAcceptance: false,
      summary: `${this.providerTitle}: ${setup.summary()}`,
      effects: [
        {
          kind: "dns.domain-connect.redirect",
          title: setup.title(),
          description: setup.description(),
        },
        ...setup.records().map((record) => ({
          kind: "dns.domain-connect.template-record",
          title: record.title(),
          description: record.description(),
        })),
      ],
      cleanup: {
        supported: false,
        description: "Temporary Domain Connect setup stores no reusable provider token.",
      },
      providerPlan: {
        kind: "domain-connect-setup",
        domainConnectSetup,
      },
    };
  }

  private toApplyResult(
    input: ConnectorCapabilityApplyInput,
    dnsRecords: DnsRecordApplySnapshot,
  ): ConnectorCapabilityApplyResult {
    return {
      operationId: `dnsop_${stableHash({
        connectorKey: input.connectorKey,
        capabilityKey: input.capabilityKey,
        ownerRef: input.ownerRef,
        acceptedPlanId: input.acceptedPlanId,
        dnsRecords,
      })}`,
      connectorKey: input.connectorKey,
      capabilityKey: input.capabilityKey,
      status: dnsRecords.status,
      summary: `${this.providerTitle}: ${dnsActionSummary(input.capabilityKey, dnsRecords)}`,
      effects: dnsRecords.effects,
      providerResult: {
        kind: "dns-records",
        dnsRecords,
      },
    };
  }

  private toDomainConnectApplyResult(
    input: ConnectorCapabilityApplyInput,
    setup: DomainConnectSetup,
    dnsRecords: DnsRecordApplySnapshot,
  ): ConnectorCapabilityApplyResult {
    const setupSnapshot = setup.toJSON();
    const domainConnectApply: DomainConnectApplySnapshot = {
      ...setupSnapshot,
      status: dnsRecords.status === "applied" ? "applied" : "verified",
      dnsRecords,
    };

    return {
      operationId: `domainconnectop_${stableHash({
        connectorKey: input.connectorKey,
        capabilityKey: input.capabilityKey,
        ownerRef: input.ownerRef,
        acceptedPlanId: input.acceptedPlanId,
        domainConnectApply,
      })}`,
      connectorKey: input.connectorKey,
      capabilityKey: input.capabilityKey,
      status: dnsRecords.status,
      summary: `${this.providerTitle}: Domain Connect completed for ${setupSnapshot.hostname}.`,
      effects: [
        {
          kind: "dns.domain-connect.completed",
          title: setup.title(),
          description: "Provider consent completed and Appaloft verified the requested records.",
        },
        ...dnsRecords.effects,
      ],
      providerResult: {
        kind: "domain-connect-apply",
        dnsRecords,
        domainConnectApply,
      },
    };
  }

  private domainConnectSetup(
    input: ConnectorCapabilityPlanInput | ConnectorCapabilityApplyInput,
  ): Result<DomainConnectSetup> {
    const parameters = parseDnsPlanParameters(input.parameters ?? {});
    if (parameters.isErr()) return err(parameters.error);
    const zoneName = parameters.value.zoneName;
    if (!zoneName) {
      return err(domainError.validation("Domain Connect zoneName is required"));
    }
    const firstRecord = parameters.value.records[0];
    if (!firstRecord) {
      return err(domainError.validation("Domain Connect requires at least one DNS record"));
    }
    const serviceId = optionalString(input.parameters?.serviceId, this.domainConnectServiceId);
    const templateId = optionalString(input.parameters?.templateId, this.domainConnectTemplateId);
    const state = optionalString(
      input.parameters?.state,
      `dc_${stableHash({
        connectorKey: input.connectorKey,
        capabilityKey: input.capabilityKey,
        ownerRef: input.ownerRef,
        zoneName,
        records: parameters.value.records,
      })}`,
    );
    const setup: DomainConnectSetupSnapshot = {
      providerKey: this.domainConnectProviderKey,
      zoneName,
      hostname: firstRecord.name,
      serviceId,
      templateId,
      redirectUrl: domainConnectRedirectUrl({
        baseUrl: this.domainConnectConsentBaseUrl,
        providerKey: this.domainConnectProviderKey,
        serviceId,
        templateId,
        zoneName,
        hostname: firstRecord.name,
        state,
      }),
      state,
      records: parameters.value.records,
    };
    return DomainConnectSetup.create(setup);
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

function optionalString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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

function sameDnsRecord(left: DnsRecordRequirementSnapshot, right: DnsRecordRequirementSnapshot) {
  return (
    left.name.replace(/\.$/, "").toLowerCase() === right.name.replace(/\.$/, "").toLowerCase() &&
    left.type === right.type &&
    left.value === right.value
  );
}

function providerRecordId(record: DnsRecordRequirementSnapshot): string {
  return `dnsrec_${stableHash({
    name: record.name.replace(/\.$/, "").toLowerCase(),
    type: record.type,
    value: record.value,
  })}`;
}

function fakeDnsProviderFailure(
  mode: FakeDnsConnectorProviderFailureMode,
  operation: string,
): DomainError {
  if (mode === "rate-limit") {
    return {
      code: "connector_provider_rate_limited",
      category: "retryable",
      message: `Fake DNS provider rate-limited ${operation}.`,
      retryable: true,
      details: {
        providerKind: "dns",
        operation,
        failureMode: mode,
      },
    };
  }
  if (mode === "revoked-credential") {
    return {
      code: "connector_provider_credential_revoked",
      category: "provider",
      message: `Fake DNS provider rejected ${operation} because the credential is revoked.`,
      retryable: false,
      details: {
        providerKind: "dns",
        operation,
        failureMode: mode,
      },
    };
  }
  return {
    code: "connector_provider_error",
    category: "provider",
    message: `Fake DNS provider failed ${operation}.`,
    retryable: true,
    details: {
      providerKind: "dns",
      operation,
      failureMode: mode,
    },
  };
}

function dnsActionSummary(capabilityKey: string, dnsRecords: DnsRecordApplySnapshot): string {
  const recordCount = dnsRecords.records.length;
  const recordLabel = `DNS record${recordCount === 1 ? "" : "s"}`;
  const zoneSuffix = dnsRecords.zoneName ? ` in ${dnsRecords.zoneName}` : "";
  if (capabilityKey === "dns.records.cleanup") {
    return `${recordCount} ${recordLabel} cleanup finished${zoneSuffix} with status ${dnsRecords.status}.`;
  }
  if (capabilityKey === "dns.records.verify") {
    return `${recordCount} ${recordLabel} verified${zoneSuffix}; ${dnsRecords.missingRecords.length} missing.`;
  }
  return `${recordCount} ${recordLabel} apply finished${zoneSuffix} with status ${dnsRecords.status}.`;
}

function domainConnectRedirectUrl(input: {
  baseUrl: string;
  providerKey: string;
  serviceId: string;
  templateId: string;
  zoneName: string;
  hostname: string;
  state: string;
}): string {
  const baseUrl = input.baseUrl.replace(/\/$/, "");
  const query = new URLSearchParams({
    domain: input.zoneName,
    host: input.hostname,
    state: input.state,
  });
  return `${baseUrl}/${encodeURIComponent(input.providerKey)}/services/${encodeURIComponent(input.serviceId)}/templates/${encodeURIComponent(input.templateId)}/apply?${query.toString()}`;
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
