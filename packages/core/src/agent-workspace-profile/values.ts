import { domainError } from "../shared/errors";
import { IdentifierValue } from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import { ScalarValueObject } from "../shared/value-object";

function invalid(field: string, value?: string) {
  return domainError.validation(`Agent Workspace Profile ${field} is invalid`, {
    phase: "agent-workspace-profile-installation-admission",
    field,
    ...(value ? { value } : {}),
  });
}

abstract class ProfileTextValue extends ScalarValueObject<string> {
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

const definitionDigestBrand: unique symbol = Symbol("AgentWorkspaceProfileDefinitionDigest");
export class AgentWorkspaceProfileDefinitionDigest extends IdentifierValue {
  private [definitionDigestBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<AgentWorkspaceProfileDefinitionDigest> {
    const normalized = value.trim();
    if (!/^sha256:[a-f0-9]{64}$/.test(normalized)) {
      return err(invalid("definitionDigest", normalized));
    }
    return ok(new AgentWorkspaceProfileDefinitionDigest(normalized));
  }

  static rehydrate(value: string): AgentWorkspaceProfileDefinitionDigest {
    return new AgentWorkspaceProfileDefinitionDigest(value.trim());
  }
}

const installationIdBrand: unique symbol = Symbol("AgentWorkspaceProfileInstallationId");
export class AgentWorkspaceProfileInstallationId extends IdentifierValue {
  private [installationIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<AgentWorkspaceProfileInstallationId> {
    const normalized = value.trim();
    if (!/^awpi_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(normalized)) {
      return err(invalid("installationId", normalized));
    }
    return ok(new AgentWorkspaceProfileInstallationId(normalized));
  }

  static rehydrate(value: string): AgentWorkspaceProfileInstallationId {
    return new AgentWorkspaceProfileInstallationId(value.trim());
  }
}

const profileIdBrand: unique symbol = Symbol("AgentWorkspaceProfileId");
export class AgentWorkspaceProfileId extends ProfileTextValue {
  private [profileIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<AgentWorkspaceProfileId> {
    return ProfileTextValue.normalize(value, "profileId", /^[a-z][a-z0-9-]{0,62}$/, 63).map(
      (normalized) => new AgentWorkspaceProfileId(normalized),
    );
  }

  static rehydrate(value: string): AgentWorkspaceProfileId {
    return new AgentWorkspaceProfileId(value.trim());
  }
}

const profileVersionBrand: unique symbol = Symbol("AgentWorkspaceProfileVersion");
export class AgentWorkspaceProfileVersion extends ProfileTextValue {
  private [profileVersionBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<AgentWorkspaceProfileVersion> {
    return ProfileTextValue.normalize(
      value,
      "profileVersion",
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
      128,
    ).map((normalized) => new AgentWorkspaceProfileVersion(normalized));
  }

  static rehydrate(value: string): AgentWorkspaceProfileVersion {
    return new AgentWorkspaceProfileVersion(value.trim());
  }
}

const displayNameBrand: unique symbol = Symbol("AgentWorkspaceProfileDisplayName");
export class AgentWorkspaceProfileDisplayName extends ProfileTextValue {
  private [displayNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<AgentWorkspaceProfileDisplayName> {
    return ProfileTextValue.normalize(value, "displayName", /^.+$/u, 120).map(
      (normalized) => new AgentWorkspaceProfileDisplayName(normalized),
    );
  }

  static rehydrate(value: string): AgentWorkspaceProfileDisplayName {
    return new AgentWorkspaceProfileDisplayName(value.trim());
  }
}

const canonicalManifestBrand: unique symbol = Symbol("AgentWorkspaceProfileCanonicalManifest");
export class AgentWorkspaceProfileCanonicalManifest extends ProfileTextValue {
  private [canonicalManifestBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<AgentWorkspaceProfileCanonicalManifest> {
    const normalized = value.trim();
    if (!normalized || normalized.length > 262_144 || normalized.includes("\0")) {
      return err(invalid("canonicalManifest"));
    }
    try {
      JSON.parse(normalized);
    } catch {
      return err(invalid("canonicalManifest"));
    }
    return ok(new AgentWorkspaceProfileCanonicalManifest(normalized));
  }

  static rehydrate(value: string): AgentWorkspaceProfileCanonicalManifest {
    return new AgentWorkspaceProfileCanonicalManifest(value.trim());
  }
}

const installationStatusBrand: unique symbol = Symbol("AgentWorkspaceProfileInstallationStatus");
export class AgentWorkspaceProfileInstallationStatus extends ScalarValueObject<
  "disabled" | "enabled"
> {
  private [installationStatusBrand]!: void;

  private constructor(value: "disabled" | "enabled") {
    super(value);
  }

  static enabled(): AgentWorkspaceProfileInstallationStatus {
    return new AgentWorkspaceProfileInstallationStatus("enabled");
  }

  static rehydrate(value: "disabled" | "enabled"): AgentWorkspaceProfileInstallationStatus {
    return new AgentWorkspaceProfileInstallationStatus(value);
  }

  disable(): AgentWorkspaceProfileInstallationStatus {
    return this.isDisabled() ? this : new AgentWorkspaceProfileInstallationStatus("disabled");
  }

  isEnabled(): boolean {
    return this.value === "enabled";
  }

  isDisabled(): boolean {
    return this.value === "disabled";
  }
}

const revisionBrand: unique symbol = Symbol("AgentWorkspaceProfileInstallationRevision");
export class AgentWorkspaceProfileInstallationRevision extends ScalarValueObject<number> {
  private [revisionBrand]!: void;

  private constructor(value: number) {
    super(value);
  }

  static initial(): AgentWorkspaceProfileInstallationRevision {
    return new AgentWorkspaceProfileInstallationRevision(0);
  }

  static rehydrate(value: number): AgentWorkspaceProfileInstallationRevision {
    return new AgentWorkspaceProfileInstallationRevision(value);
  }

  next(): AgentWorkspaceProfileInstallationRevision {
    return new AgentWorkspaceProfileInstallationRevision(this.value + 1);
  }
}
