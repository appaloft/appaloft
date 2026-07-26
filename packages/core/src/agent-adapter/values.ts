import { domainError } from "../shared/errors";
import { IdentifierValue } from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import { ScalarValueObject } from "../shared/value-object";

function invalid(field: string, value?: string) {
  return domainError.validation(`Agent Adapter ${field} is invalid`, {
    phase: "agent-adapter-installation-admission",
    field,
    ...(value ? { value } : {}),
  });
}

abstract class AgentAdapterTextValue extends ScalarValueObject<string> {
  protected constructor(value: string) {
    super(value);
  }

  protected static normalize(
    value: string,
    field: string,
    pattern: RegExp,
    maximumLength: number,
  ): Result<string> {
    const normalized = value.trim();
    if (
      !normalized ||
      normalized.length > maximumLength ||
      normalized.includes("\0") ||
      !pattern.test(normalized)
    ) {
      return err(invalid(field, normalized));
    }
    return ok(normalized);
  }
}

const definitionDigestBrand: unique symbol = Symbol("AgentAdapterDefinitionDigest");
export class AgentAdapterDefinitionDigest extends IdentifierValue {
  private [definitionDigestBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<AgentAdapterDefinitionDigest> {
    const normalized = value.trim();
    if (!/^sha256:[a-f0-9]{64}$/.test(normalized)) {
      return err(invalid("definitionDigest", normalized));
    }
    return ok(new AgentAdapterDefinitionDigest(normalized));
  }

  static rehydrate(value: string): AgentAdapterDefinitionDigest {
    return new AgentAdapterDefinitionDigest(value.trim());
  }
}

const installationIdBrand: unique symbol = Symbol("AgentAdapterInstallationId");
export class AgentAdapterInstallationId extends IdentifierValue {
  private [installationIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<AgentAdapterInstallationId> {
    const normalized = value.trim();
    if (!/^aai_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(normalized)) {
      return err(invalid("installationId", normalized));
    }
    return ok(new AgentAdapterInstallationId(normalized));
  }

  static rehydrate(value: string): AgentAdapterInstallationId {
    return new AgentAdapterInstallationId(value.trim());
  }
}

const adapterIdBrand: unique symbol = Symbol("AgentAdapterId");
export class AgentAdapterId extends AgentAdapterTextValue {
  private [adapterIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<AgentAdapterId> {
    return AgentAdapterTextValue.normalize(value, "adapterId", /^[a-z][a-z0-9-]{0,62}$/, 63).map(
      (normalized) => new AgentAdapterId(normalized),
    );
  }

  static rehydrate(value: string): AgentAdapterId {
    return new AgentAdapterId(value.trim());
  }
}

const adapterVersionBrand: unique symbol = Symbol("AgentAdapterVersion");
export class AgentAdapterVersion extends AgentAdapterTextValue {
  private [adapterVersionBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<AgentAdapterVersion> {
    return AgentAdapterTextValue.normalize(
      value,
      "adapterVersion",
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
      128,
    ).map((normalized) => new AgentAdapterVersion(normalized));
  }

  static rehydrate(value: string): AgentAdapterVersion {
    return new AgentAdapterVersion(value.trim());
  }
}

const displayNameBrand: unique symbol = Symbol("AgentAdapterDisplayName");
export class AgentAdapterDisplayName extends AgentAdapterTextValue {
  private [displayNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<AgentAdapterDisplayName> {
    return AgentAdapterTextValue.normalize(value, "displayName", /^.+$/u, 120).map(
      (normalized) => new AgentAdapterDisplayName(normalized),
    );
  }

  static rehydrate(value: string): AgentAdapterDisplayName {
    return new AgentAdapterDisplayName(value.trim());
  }
}

const canonicalManifestBrand: unique symbol = Symbol("AgentAdapterCanonicalManifest");
export class AgentAdapterCanonicalManifest extends AgentAdapterTextValue {
  private [canonicalManifestBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<AgentAdapterCanonicalManifest> {
    const normalized = value.trim();
    if (!normalized || normalized.length > 262_144 || normalized.includes("\0")) {
      return err(invalid("canonicalManifest"));
    }
    try {
      JSON.parse(normalized);
    } catch {
      return err(invalid("canonicalManifest"));
    }
    return ok(new AgentAdapterCanonicalManifest(normalized));
  }

  static rehydrate(value: string): AgentAdapterCanonicalManifest {
    return new AgentAdapterCanonicalManifest(value.trim());
  }
}

const installationStatusBrand: unique symbol = Symbol("AgentAdapterInstallationStatus");
export class AgentAdapterInstallationStatus extends ScalarValueObject<"disabled" | "enabled"> {
  private [installationStatusBrand]!: void;

  private constructor(value: "disabled" | "enabled") {
    super(value);
  }

  static enabled(): AgentAdapterInstallationStatus {
    return new AgentAdapterInstallationStatus("enabled");
  }

  static rehydrate(value: "disabled" | "enabled"): AgentAdapterInstallationStatus {
    return new AgentAdapterInstallationStatus(value);
  }

  disable(): AgentAdapterInstallationStatus {
    return this.isDisabled() ? this : new AgentAdapterInstallationStatus("disabled");
  }

  isEnabled(): boolean {
    return this.value === "enabled";
  }

  isDisabled(): boolean {
    return this.value === "disabled";
  }
}

const revisionBrand: unique symbol = Symbol("AgentAdapterInstallationRevision");
export class AgentAdapterInstallationRevision extends ScalarValueObject<number> {
  private [revisionBrand]!: void;

  private constructor(value: number) {
    super(value);
  }

  static initial(): AgentAdapterInstallationRevision {
    return new AgentAdapterInstallationRevision(0);
  }

  static rehydrate(value: number): AgentAdapterInstallationRevision {
    return new AgentAdapterInstallationRevision(value);
  }

  next(): AgentAdapterInstallationRevision {
    return new AgentAdapterInstallationRevision(this.value + 1);
  }
}

const activeReferenceCountBrand: unique symbol = Symbol("ActiveAgentWorkspaceReferenceCount");
export class ActiveAgentWorkspaceReferenceCount extends ScalarValueObject<number> {
  private [activeReferenceCountBrand]!: void;

  private constructor(value: number) {
    super(value);
  }

  static create(value: number): Result<ActiveAgentWorkspaceReferenceCount> {
    if (!Number.isInteger(value) || value < 0) {
      return err(invalid("activeWorkspaceReferenceCount", String(value)));
    }
    return ok(new ActiveAgentWorkspaceReferenceCount(value));
  }

  static rehydrate(value: number): ActiveAgentWorkspaceReferenceCount {
    return new ActiveAgentWorkspaceReferenceCount(value);
  }

  hasActiveReferences(): boolean {
    return this.value > 0;
  }
}
