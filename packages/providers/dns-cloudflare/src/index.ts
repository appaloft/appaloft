import {
  type ConnectorCapabilityApplyInput,
  type ConnectorCapabilityApplyResult,
  type ConnectorCapabilityPlanInput,
  type ConnectorCapabilityPlanPreview,
  type ConnectorProviderAdapter,
  type DnsConnectorProviderRecordStore,
  type DnsConnectorZoneSnapshot,
  type ExecutionContext,
} from "@appaloft/application";
import {
  type DnsRecordApplySnapshot,
  type DnsRecordKind,
  DnsRecordPlan,
  type DnsRecordPurpose,
  type DnsRecordRequirementSnapshot,
  type DomainError,
  domainError,
  err,
  ok,
  type Result,
} from "@appaloft/core";

export interface CloudflareDnsCredentialProvider {
  apiToken(): Promise<Result<string, DomainError>> | Result<string, DomainError>;
}

export type CloudflareDnsFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface StaticCloudflareDnsCredentialProviderOptions {
  apiToken: string;
}

export class StaticCloudflareDnsCredentialProvider implements CloudflareDnsCredentialProvider {
  private readonly token: string;

  constructor(options: StaticCloudflareDnsCredentialProviderOptions) {
    this.token = options.apiToken;
  }

  apiToken(): Result<string, DomainError> {
    const token = this.token.trim();
    if (!token) {
      return err(domainError.validation("Cloudflare DNS API token is required"));
    }
    return ok(token);
  }
}

export interface CloudflareDnsConnectorProviderAdapterOptions {
  connectorKey?: string;
  providerTitle?: string;
  apiBaseUrl?: string;
  fetcher?: CloudflareDnsFetch;
  credentialProvider: CloudflareDnsCredentialProvider;
}

interface CloudflareListResponse<T> {
  success: boolean;
  result: T[];
  errors?: CloudflareApiError[];
}

interface CloudflareSingleResponse<T> {
  success: boolean;
  result: T;
  errors?: CloudflareApiError[];
}

interface CloudflareApiError {
  code?: number;
  message?: string;
}

interface CloudflareZoneRecord {
  id: string;
  name: string;
  account?: {
    id?: string;
    name?: string;
  } | null;
}

interface CloudflareDnsRecord {
  id: string;
  type: DnsRecordKind;
  name: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
  comment?: string | null;
  tags?: string[] | null;
}

const appaloftDnsComment = "Managed by Appaloft";
const appaloftDnsTag = "appaloft:managed";
const supportedRecordTypes = ["A", "AAAA", "CNAME", "TXT"] as const;

export class CloudflareDnsRecordStore implements DnsConnectorProviderRecordStore {
  private readonly apiBaseUrl: string;
  private readonly fetcher: CloudflareDnsFetch;
  private readonly credentialProvider: CloudflareDnsCredentialProvider;

  constructor(options: CloudflareDnsConnectorProviderAdapterOptions) {
    this.apiBaseUrl = (options.apiBaseUrl ?? "https://api.cloudflare.com/client/v4").replace(
      /\/$/,
      "",
    );
    this.fetcher = options.fetcher ?? fetch;
    this.credentialProvider = options.credentialProvider;
  }

  async existingRecords(input: {
    zoneName?: string;
    records: readonly DnsRecordRequirementSnapshot[];
  }): Promise<Result<readonly DnsRecordRequirementSnapshot[], DomainError>> {
    const listed = await this.listRelevantRecords(input);
    if (listed.isErr()) return err(listed.error);
    return ok(listed.value.records.map(recordFromCloudflare));
  }

  async applyRecords(input: {
    zoneName?: string;
    records: readonly DnsRecordRequirementSnapshot[];
  }): Promise<Result<DnsRecordApplySnapshot, DomainError>> {
    const listed = await this.listRelevantRecords(input);
    if (listed.isErr()) return err(listed.error);
    const existingRecords = listed.value.records.map(recordFromCloudflare);
    const plan = DnsRecordPlan.create({
      ...(input.zoneName ? { zoneName: input.zoneName } : {}),
      records: [...input.records],
      existingRecords,
    });
    if (plan.isErr()) return err(plan.error);
    const applicable = plan.value.ensureApplicable();
    if (applicable.isErr()) return err(applicable.error);

    const effects: DnsRecordApplySnapshot["effects"] = [];
    for (const record of plan.value.records()) {
      const snapshot = record.toJSON();
      const existing = listed.value.records.find((candidate) =>
        sameDnsRecord(recordFromCloudflare(candidate), snapshot),
      );
      if (existing) {
        effects.push({
          kind: "dns.record.exists",
          title: record.title(),
          description: `${record.description()} already exists at Cloudflare.`,
          providerRecordId: existing.id,
          managed: isAppaloftManagedRecord(existing),
        });
        continue;
      }

      const created = await this.createRecord({
        zoneId: listed.value.zone.id,
        record: snapshot,
      });
      if (created.isErr()) return err(created.error);
      effects.push({
        kind: "dns.record.upsert",
        title: record.title(),
        description: record.description(),
        providerRecordId: created.value.id,
        managed: true,
      });
    }

    return ok({
      ...(input.zoneName ? { zoneName: normalizeZoneName(input.zoneName) } : {}),
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
  }): Promise<Result<DnsRecordApplySnapshot, DomainError>> {
    const listed = await this.listRelevantRecords(input);
    if (listed.isErr()) return err(listed.error);
    const existingRecords = listed.value.records.map(recordFromCloudflare);
    const plan = DnsRecordPlan.create({
      ...(input.zoneName ? { zoneName: input.zoneName } : {}),
      records: [...input.records],
      existingRecords,
    });
    if (plan.isErr()) return err(plan.error);
    const missing = plan.value.missingFrom(existingRecords);
    if (missing.isErr()) return err(missing.error);

    const missingRecords = missing.value.map((record) => record.toJSON());
    return ok({
      ...(input.zoneName ? { zoneName: normalizeZoneName(input.zoneName) } : {}),
      status: missingRecords.length === 0 ? "verified" : "conflict",
      records: plan.value.toJSON().records,
      conflicts: plan.value.conflicts(),
      missingRecords,
      effects: plan.value.records().map((record) => {
        const snapshot = record.toJSON();
        const existing = listed.value.records.find((candidate) =>
          sameDnsRecord(recordFromCloudflare(candidate), snapshot),
        );
        return {
          kind: existing ? "dns.record.verified" : "dns.record.missing",
          title: record.title(),
          description: existing
            ? `${record.description()} is present at Cloudflare.`
            : `${record.description()} is missing at Cloudflare.`,
          ...(existing
            ? {
                providerRecordId: existing.id,
                managed: isAppaloftManagedRecord(existing),
              }
            : {}),
        };
      }),
    });
  }

  async cleanupRecords(input: {
    zoneName?: string;
    records: readonly DnsRecordRequirementSnapshot[];
  }): Promise<Result<DnsRecordApplySnapshot, DomainError>> {
    const listed = await this.listRelevantRecords(input);
    if (listed.isErr()) return err(listed.error);
    const existingRecords = listed.value.records.map(recordFromCloudflare);
    const plan = DnsRecordPlan.create({
      ...(input.zoneName ? { zoneName: input.zoneName } : {}),
      records: [...input.records],
      existingRecords,
    });
    if (plan.isErr()) return err(plan.error);

    const effects: DnsRecordApplySnapshot["effects"] = [];
    for (const record of plan.value.records()) {
      const snapshot = record.toJSON();
      const existing = listed.value.records.find((candidate) =>
        sameDnsRecord(recordFromCloudflare(candidate), snapshot),
      );
      if (!existing) {
        effects.push({
          kind: "dns.record.cleanup.missing",
          title: record.title(),
          description: `${record.description()} is not present at Cloudflare.`,
          managed: false,
        });
        continue;
      }

      if (!isAppaloftManagedRecord(existing)) {
        effects.push({
          kind: "dns.record.cleanup.skipped",
          title: record.title(),
          description: `${record.description()} is not Appaloft-managed and was left untouched.`,
          providerRecordId: existing.id,
          managed: false,
        });
        continue;
      }

      const deleted = await this.deleteRecord({
        zoneId: listed.value.zone.id,
        recordId: existing.id,
      });
      if (deleted.isErr()) return err(deleted.error);
      effects.push({
        kind: "dns.record.cleanup.deleted",
        title: record.title(),
        description: `${record.description()} was removed from Cloudflare.`,
        providerRecordId: existing.id,
        managed: true,
      });
    }

    return ok({
      ...(input.zoneName ? { zoneName: normalizeZoneName(input.zoneName) } : {}),
      status: effects.some((effect) => effect.kind === "dns.record.cleanup.deleted")
        ? "cleaned-up"
        : "skipped",
      records: plan.value.toJSON().records,
      conflicts: plan.value.conflicts(),
      missingRecords: [],
      effects,
    });
  }

  async listZones(): Promise<Result<readonly DnsConnectorZoneSnapshot[], DomainError>> {
    const url = this.url("/zones");
    url.searchParams.set("status", "active");
    url.searchParams.set("per_page", "50");
    const response = await this.request<CloudflareListResponse<CloudflareZoneRecord>>(url);
    if (response.isErr()) return err(response.error);
    return ok(
      response.value.result.map((zone) => ({
        id: zone.id,
        name: normalizeZoneName(zone.name),
        providerKey: "cloudflare",
        ...(zone.account?.id ? { providerAccountId: zone.account.id } : {}),
      })),
    );
  }

  private async listRelevantRecords(input: {
    zoneName?: string;
    records: readonly DnsRecordRequirementSnapshot[];
  }): Promise<Result<{ zone: CloudflareZoneRecord; records: CloudflareDnsRecord[] }, DomainError>> {
    const zone = await this.resolveZone(input.zoneName);
    if (zone.isErr()) return err(zone.error);
    const names = Array.from(
      new Set(input.records.map((record) => normalizeRecordName(record.name)).filter(Boolean)),
    );
    const records: CloudflareDnsRecord[] = [];
    for (const name of names) {
      const url = this.url(`/zones/${zone.value.id}/dns_records`);
      url.searchParams.set("name", name);
      url.searchParams.set("per_page", "100");
      const response = await this.request<CloudflareListResponse<CloudflareDnsRecord>>(url);
      if (response.isErr()) return err(response.error);
      records.push(...response.value.result.filter(isSupportedCloudflareRecord));
    }
    return ok({ zone: zone.value, records });
  }

  private async resolveZone(zoneName: string | undefined): Promise<Result<CloudflareZoneRecord>> {
    const normalized = normalizeZoneName(zoneName);
    if (!normalized) {
      return err(domainError.validation("Cloudflare DNS zoneName is required"));
    }
    const url = this.url("/zones");
    url.searchParams.set("name", normalized);
    url.searchParams.set("status", "active");
    url.searchParams.set("per_page", "1");
    const response = await this.request<CloudflareListResponse<CloudflareZoneRecord>>(url);
    if (response.isErr()) return err(response.error);
    const zone = response.value.result[0];
    if (!zone) {
      return err(domainError.notFound("Cloudflare DNS zone", normalized));
    }
    return ok(zone);
  }

  private async createRecord(input: {
    zoneId: string;
    record: DnsRecordRequirementSnapshot;
  }): Promise<Result<CloudflareDnsRecord>> {
    const response = await this.request<CloudflareSingleResponse<CloudflareDnsRecord>>(
      this.url(`/zones/${input.zoneId}/dns_records`),
      {
        method: "POST",
        body: JSON.stringify({
          type: input.record.type,
          name: input.record.name,
          content: input.record.value,
          ttl: input.record.ttl ?? 1,
          ...(input.record.proxied !== undefined ? { proxied: input.record.proxied } : {}),
          comment: appaloftDnsComment,
          tags: [appaloftDnsTag],
        }),
      },
    );
    if (response.isErr()) return err(response.error);
    return ok(response.value.result);
  }

  private async deleteRecord(input: {
    zoneId: string;
    recordId: string;
  }): Promise<Result<CloudflareDnsRecord>> {
    const response = await this.request<CloudflareSingleResponse<CloudflareDnsRecord>>(
      this.url(`/zones/${input.zoneId}/dns_records/${input.recordId}`),
      { method: "DELETE" },
    );
    if (response.isErr()) return err(response.error);
    return ok(response.value.result);
  }

  private async request<T>(url: URL, init: RequestInit = {}): Promise<Result<T, DomainError>> {
    const token = await this.credentialProvider.apiToken();
    if (token.isErr()) return err(token.error);
    const response = await this.fetcher(url, {
      ...init,
      headers: {
        accept: "application/json",
        authorization: `Bearer ${token.value}`,
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return err(
        domainError.provider("Cloudflare DNS API returned a non-JSON response", {
          status: response.status,
        }),
      );
    }
    if (!response.ok) {
      return err(
        domainError.provider("Cloudflare DNS API request failed", {
          status: response.status,
        }),
      );
    }
    const apiResponse = payload as { success?: boolean; errors?: CloudflareApiError[] };
    if (apiResponse.success === false) {
      return err(
        domainError.provider("Cloudflare DNS API rejected the request", {
          providerError: providerErrorMessage(apiResponse.errors),
        }),
      );
    }
    return ok(payload as T);
  }

  private url(path: string): URL {
    return new URL(`${this.apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`);
  }
}

export class CloudflareDnsConnectorProviderAdapter implements ConnectorProviderAdapter {
  readonly connectorKey: string;
  private readonly providerTitle: string;
  private readonly recordStore: DnsConnectorProviderRecordStore;

  constructor(options: CloudflareDnsConnectorProviderAdapterOptions) {
    this.connectorKey = options.connectorKey ?? "cloudflare-dns";
    this.providerTitle = options.providerTitle ?? "Cloudflare DNS";
    this.recordStore = new CloudflareDnsRecordStore(options);
  }

  canPlan(capabilityKey: string): boolean {
    return capabilityKey === "dns.records.plan" || capabilityKey === "dns.records.apply";
  }

  async listZones(): Promise<Result<readonly DnsConnectorZoneSnapshot[], DomainError>> {
    return this.recordStore.listZones
      ? this.recordStore.listZones()
      : err(domainError.invariant("Cloudflare DNS record store cannot list zones"));
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
      capabilityKey === "dns.records.cleanup"
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
    return {
      planId: `cf_dnsplan_${stableHash({
        connectorKey: input.connectorKey,
        capabilityKey: input.capabilityKey,
        ownerRef: input.ownerRef,
        dnsRecords,
      })}`,
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
        description: "Cleanup is limited to Appaloft-managed Cloudflare DNS records.",
      },
      providerPlan: {
        kind: "dns-records",
        dnsRecords,
      },
    };
  }

  private toApplyResult(
    input: ConnectorCapabilityApplyInput,
    dnsRecords: DnsRecordApplySnapshot,
  ): ConnectorCapabilityApplyResult {
    return {
      operationId: `cf_dnsop_${stableHash({
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
}

function parseDnsPlanParameters(
  parameters: Record<string, unknown>,
): Result<{ zoneName?: string; records: DnsRecordRequirementSnapshot[] }, DomainError> {
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

function recordFromUnknown(value: unknown): Result<DnsRecordRequirementSnapshot, DomainError> {
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

function requiredString(value: unknown, label: string): Result<string, DomainError> {
  if (typeof value !== "string" || !value.trim()) {
    return err(domainError.validation(`DNS ${label} is required`));
  }
  return ok(value.trim());
}

function optionalRecordType(value: unknown): Result<DnsRecordKind, DomainError> {
  const normalized =
    typeof value === "string" && value.trim() ? value.trim().toUpperCase() : "CNAME";
  if (supportedRecordTypes.includes(normalized as DnsRecordKind)) {
    return ok(normalized as DnsRecordKind);
  }
  return err(domainError.validation(`Unsupported DNS record type ${normalized}`));
}

function optionalPurpose(value: unknown): Result<DnsRecordPurpose, DomainError> {
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

function recordFromCloudflare(record: CloudflareDnsRecord): DnsRecordRequirementSnapshot {
  return {
    name: normalizeRecordName(record.name),
    type: record.type,
    value: record.content,
    purpose: isAppaloftManagedRecord(record) ? "domain-routing" : "manual",
    ...(record.ttl !== undefined ? { ttl: record.ttl } : {}),
    ...(record.proxied !== undefined ? { proxied: record.proxied } : {}),
  };
}

function isSupportedCloudflareRecord(record: CloudflareDnsRecord): boolean {
  return supportedRecordTypes.includes(record.type);
}

function isAppaloftManagedRecord(record: CloudflareDnsRecord): boolean {
  return (
    record.comment === appaloftDnsComment ||
    Boolean(record.tags?.some((tag) => tag.toLowerCase() === appaloftDnsTag))
  );
}

function sameDnsRecord(left: DnsRecordRequirementSnapshot, right: DnsRecordRequirementSnapshot) {
  return (
    normalizeRecordName(left.name) === normalizeRecordName(right.name) &&
    left.type === right.type &&
    left.value === right.value
  );
}

function normalizeZoneName(value: string | undefined): string {
  return (value ?? "").trim().replace(/\.$/, "").toLowerCase();
}

function normalizeRecordName(value: string): string {
  return value.trim().replace(/\.$/, "").toLowerCase();
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

function providerErrorMessage(errors: CloudflareApiError[] | undefined): string {
  return (
    errors
      ?.map((error) => [error.code, error.message].filter(Boolean).join(": "))
      .filter(Boolean)
      .join("; ") || "unknown"
  );
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
