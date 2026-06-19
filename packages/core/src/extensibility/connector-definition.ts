import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { ScalarValueObject } from "../shared/value-object";

export type ConnectionCategoryKey =
  | "source"
  | "dns"
  | "infrastructure"
  | "notification"
  | "billing"
  | "identity"
  | "observability"
  | "storage";

export type CredentialGrantKind =
  | "temporary-domain-connect"
  | "limited-oauth-grant"
  | "persistent-provider-credential"
  | "provider-app-installation"
  | "manual-secret-reference";

export type ConnectorAvailabilityStatus =
  | "available"
  | "setup-required"
  | "unavailable"
  | "deferred";

export type ConnectorVisibility = "catalog" | "hidden-when-unavailable" | "internal";

export interface ConnectionCategoryDefinitionSnapshot {
  key: ConnectionCategoryKey;
  title: string;
  description: string;
}

export interface ConnectorCapabilitySnapshot {
  key: string;
  title: string;
  description?: string;
  implemented: boolean;
}

export interface CredentialGrantSnapshot {
  kind: CredentialGrantKind;
  title: string;
  storesLongLivedSecret: boolean;
  description?: string;
}

export interface ConnectorAvailabilitySnapshot {
  status: ConnectorAvailabilityStatus;
  diagnostics: {
    code: string;
    severity: "info" | "warning" | "error";
    message: string;
    documentationHref?: string;
  }[];
}

export interface ConnectorDefinitionSnapshot {
  key: string;
  title: string;
  category: ConnectionCategoryKey;
  providerKey: string;
  dnsProviderIds?: string[];
  capabilities: ConnectorCapabilitySnapshot[];
  grantKinds: CredentialGrantSnapshot[];
  availability: ConnectorAvailabilitySnapshot;
  visibility: ConnectorVisibility;
  setup?: {
    connectHref?: string;
    documentationHref?: string;
  };
}

const slugPattern = /^[a-z0-9]+(?:[.-][a-z0-9]+|-[a-z0-9]+)*$/;
const capabilityPattern = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;

function requiredText(value: string, label: string): Result<string> {
  const normalized = value.trim();
  if (!normalized) {
    return err(domainError.validation(`${label} is required`));
  }
  return ok(normalized);
}

function slugValue(value: string, label: string): Result<string> {
  return requiredText(value, label).andThen((normalized) => {
    const slug = normalized.toLowerCase();
    if (!slugPattern.test(slug)) {
      return err(
        domainError.validation(`${label} must contain lowercase letters, digits, dots, or hyphens`),
      );
    }
    return ok(slug);
  });
}

const connectorKeyBrand: unique symbol = Symbol("ConnectorKey");
export class ConnectorKey extends ScalarValueObject<string> {
  private [connectorKeyBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ConnectorKey> {
    return slugValue(value, "Connector key").map((normalized) => new ConnectorKey(normalized));
  }

  static rehydrate(value: string): ConnectorKey {
    return new ConnectorKey(value.trim().toLowerCase());
  }
}

const connectorProviderKeyBrand: unique symbol = Symbol("ConnectorProviderKey");
export class ConnectorProviderKey extends ScalarValueObject<string> {
  private [connectorProviderKeyBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ConnectorProviderKey> {
    return slugValue(value, "Connector provider key").map(
      (normalized) => new ConnectorProviderKey(normalized),
    );
  }

  static rehydrate(value: string): ConnectorProviderKey {
    return new ConnectorProviderKey(value.trim().toLowerCase());
  }
}

const connectionCapabilityKeyBrand: unique symbol = Symbol("ConnectionCapabilityKey");
export class ConnectionCapabilityKey extends ScalarValueObject<string> {
  private [connectionCapabilityKeyBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ConnectionCapabilityKey> {
    return requiredText(value, "Connection capability key").andThen((normalized) => {
      const capability = normalized.toLowerCase();
      if (!capabilityPattern.test(capability)) {
        return err(
          domainError.validation(
            "Connection capability key must contain lowercase letters, digits, dots, or hyphens",
          ),
        );
      }
      return ok(new ConnectionCapabilityKey(capability));
    });
  }

  static rehydrate(value: string): ConnectionCapabilityKey {
    return new ConnectionCapabilityKey(value.trim().toLowerCase());
  }
}

export class ConnectionCategoryValue extends ScalarValueObject<ConnectionCategoryKey> {
  private constructor(value: ConnectionCategoryKey) {
    super(value);
  }

  static create(value: string): Result<ConnectionCategoryValue> {
    if (connectionCategoryKeys.includes(value as ConnectionCategoryKey)) {
      return ok(new ConnectionCategoryValue(value as ConnectionCategoryKey));
    }
    return err(domainError.validation(`Unknown connection category ${value}`));
  }

  static rehydrate(value: ConnectionCategoryKey): ConnectionCategoryValue {
    return new ConnectionCategoryValue(value);
  }

  isDns(): boolean {
    return this.value === "dns";
  }

  isBilling(): boolean {
    return this.value === "billing";
  }
}

export class CredentialGrantKindValue extends ScalarValueObject<CredentialGrantKind> {
  private constructor(value: CredentialGrantKind) {
    super(value);
  }

  static create(value: string): Result<CredentialGrantKindValue> {
    if (credentialGrantKinds.includes(value as CredentialGrantKind)) {
      return ok(new CredentialGrantKindValue(value as CredentialGrantKind));
    }
    return err(domainError.validation(`Unknown credential grant kind ${value}`));
  }

  static rehydrate(value: CredentialGrantKind): CredentialGrantKindValue {
    return new CredentialGrantKindValue(value);
  }

  storesReusableSecret(): boolean {
    return this.value === "persistent-provider-credential";
  }

  isTemporary(): boolean {
    return this.value === "temporary-domain-connect";
  }
}

export class ConnectorAvailabilityValue {
  private constructor(private readonly snapshot: ConnectorAvailabilitySnapshot) {}

  static create(snapshot: ConnectorAvailabilitySnapshot): Result<ConnectorAvailabilityValue> {
    if (!connectorAvailabilityStatuses.includes(snapshot.status)) {
      return err(domainError.validation(`Unknown connector availability ${snapshot.status}`));
    }
    return ok(
      new ConnectorAvailabilityValue({ ...snapshot, diagnostics: [...snapshot.diagnostics] }),
    );
  }

  static available(message = "Connector is available."): ConnectorAvailabilityValue {
    return new ConnectorAvailabilityValue({
      status: "available",
      diagnostics: [{ code: "connector.available", severity: "info", message }],
    });
  }

  static setupRequired(message: string): ConnectorAvailabilityValue {
    return new ConnectorAvailabilityValue({
      status: "setup-required",
      diagnostics: [{ code: "connector.setup_required", severity: "warning", message }],
    });
  }

  static unavailable(code: string, message: string): ConnectorAvailabilityValue {
    return new ConnectorAvailabilityValue({
      status: "unavailable",
      diagnostics: [{ code, severity: "warning", message }],
    });
  }

  static deferred(message: string): ConnectorAvailabilityValue {
    return new ConnectorAvailabilityValue({
      status: "deferred",
      diagnostics: [{ code: "connector.deferred", severity: "info", message }],
    });
  }

  isActionable(): boolean {
    return this.snapshot.status === "available" || this.snapshot.status === "setup-required";
  }

  isUnavailableLike(): boolean {
    return this.snapshot.status === "unavailable" || this.snapshot.status === "deferred";
  }

  toJSON(): ConnectorAvailabilitySnapshot {
    return { ...this.snapshot, diagnostics: [...this.snapshot.diagnostics] };
  }
}

export class ConnectorCapabilityDefinition {
  private constructor(private readonly snapshot: ConnectorCapabilitySnapshot) {}

  static create(input: ConnectorCapabilitySnapshot): Result<ConnectorCapabilityDefinition> {
    return ConnectionCapabilityKey.create(input.key).andThen((key) =>
      requiredText(input.title, "Connection capability title").map(
        (title) =>
          new ConnectorCapabilityDefinition({
            ...input,
            key: key.value,
            title,
          }),
      ),
    );
  }

  static rehydrate(input: ConnectorCapabilitySnapshot): ConnectorCapabilityDefinition {
    return new ConnectorCapabilityDefinition(input);
  }

  matches(key: ConnectionCapabilityKey): boolean {
    return this.snapshot.key === key.value;
  }

  isImplemented(): boolean {
    return this.snapshot.implemented;
  }

  toJSON(): ConnectorCapabilitySnapshot {
    return { ...this.snapshot };
  }
}

export class CredentialGrantDefinition {
  private constructor(private readonly snapshot: CredentialGrantSnapshot) {}

  static create(input: CredentialGrantSnapshot): Result<CredentialGrantDefinition> {
    return CredentialGrantKindValue.create(input.kind).andThen((kind) =>
      requiredText(input.title, "Credential grant title").map(
        (title) =>
          new CredentialGrantDefinition({
            ...input,
            kind: kind.value,
            title,
          }),
      ),
    );
  }

  static rehydrate(input: CredentialGrantSnapshot): CredentialGrantDefinition {
    return new CredentialGrantDefinition(input);
  }

  storesReusableSecret(): boolean {
    return CredentialGrantKindValue.rehydrate(this.snapshot.kind).storesReusableSecret();
  }

  toJSON(): CredentialGrantSnapshot {
    return { ...this.snapshot };
  }
}

export class ConnectorDefinition {
  private constructor(
    private readonly keyValue: ConnectorKey,
    private readonly titleValue: string,
    private readonly categoryValue: ConnectionCategoryValue,
    private readonly providerKeyValue: ConnectorProviderKey,
    private readonly capabilityValues: ConnectorCapabilityDefinition[],
    private readonly grantKindValues: CredentialGrantDefinition[],
    private readonly availabilityValue: ConnectorAvailabilityValue,
    private readonly visibilityValue: ConnectorVisibility,
    private readonly dnsProviderIdsValue: string[],
    private readonly setupValue?: ConnectorDefinitionSnapshot["setup"],
  ) {}

  static create(input: ConnectorDefinitionSnapshot): Result<ConnectorDefinition> {
    const key = ConnectorKey.create(input.key);
    if (key.isErr()) return err(key.error);
    const title = requiredText(input.title, "Connector title");
    if (title.isErr()) return err(title.error);
    const category = ConnectionCategoryValue.create(input.category);
    if (category.isErr()) return err(category.error);
    const providerKey = ConnectorProviderKey.create(input.providerKey);
    if (providerKey.isErr()) return err(providerKey.error);
    const availability = ConnectorAvailabilityValue.create(input.availability);
    if (availability.isErr()) return err(availability.error);

    const capabilities: ConnectorCapabilityDefinition[] = [];
    for (const capabilityInput of input.capabilities) {
      const capability = ConnectorCapabilityDefinition.create(capabilityInput);
      if (capability.isErr()) return err(capability.error);
      capabilities.push(capability.value);
    }

    const grants: CredentialGrantDefinition[] = [];
    for (const grantInput of input.grantKinds) {
      const grant = CredentialGrantDefinition.create(grantInput);
      if (grant.isErr()) return err(grant.error);
      grants.push(grant.value);
    }

    return ok(
      new ConnectorDefinition(
        key.value,
        title.value,
        category.value,
        providerKey.value,
        capabilities,
        grants,
        availability.value,
        input.visibility,
        [...(input.dnsProviderIds ?? [])],
        input.setup,
      ),
    );
  }

  static rehydrate(input: ConnectorDefinitionSnapshot): ConnectorDefinition {
    return new ConnectorDefinition(
      ConnectorKey.rehydrate(input.key),
      input.title,
      ConnectionCategoryValue.rehydrate(input.category),
      ConnectorProviderKey.rehydrate(input.providerKey),
      input.capabilities.map(ConnectorCapabilityDefinition.rehydrate),
      input.grantKinds.map(CredentialGrantDefinition.rehydrate),
      ConnectorAvailabilityValue.create(input.availability)._unsafeUnwrap(),
      input.visibility,
      [...(input.dnsProviderIds ?? [])],
      input.setup,
    );
  }

  key(): ConnectorKey {
    return this.keyValue;
  }

  category(): ConnectionCategoryValue {
    return this.categoryValue;
  }

  availability(): ConnectorAvailabilityValue {
    return this.availabilityValue;
  }

  supportsCapability(capabilityKey: ConnectionCapabilityKey): boolean {
    return this.capabilityValues.some(
      (capability) => capability.matches(capabilityKey) && capability.isImplemented(),
    );
  }

  storesReusableSecret(): boolean {
    return this.grantKindValues.some((grant) => grant.storesReusableSecret());
  }

  shouldShowInCatalog(input: { includeUnavailable: boolean }): boolean {
    if (this.visibilityValue === "internal") {
      return false;
    }
    if (input.includeUnavailable) {
      return true;
    }
    if (
      this.visibilityValue === "hidden-when-unavailable" &&
      this.availabilityValue.isUnavailableLike()
    ) {
      return false;
    }
    return true;
  }

  toJSON(): ConnectorDefinitionSnapshot {
    return {
      key: this.keyValue.value,
      title: this.titleValue,
      category: this.categoryValue.value,
      providerKey: this.providerKeyValue.value,
      ...(this.dnsProviderIdsValue.length ? { dnsProviderIds: [...this.dnsProviderIdsValue] } : {}),
      capabilities: this.capabilityValues.map((capability) => capability.toJSON()),
      grantKinds: this.grantKindValues.map((grant) => grant.toJSON()),
      availability: this.availabilityValue.toJSON(),
      visibility: this.visibilityValue,
      ...(this.setupValue ? { setup: { ...this.setupValue } } : {}),
    };
  }
}

export const connectionCategoryKeys = [
  "source",
  "dns",
  "infrastructure",
  "notification",
  "billing",
  "identity",
  "observability",
  "storage",
] as const satisfies readonly ConnectionCategoryKey[];

export const credentialGrantKinds = [
  "temporary-domain-connect",
  "limited-oauth-grant",
  "persistent-provider-credential",
  "provider-app-installation",
  "manual-secret-reference",
] as const satisfies readonly CredentialGrantKind[];

export const connectorAvailabilityStatuses = [
  "available",
  "setup-required",
  "unavailable",
  "deferred",
] as const satisfies readonly ConnectorAvailabilityStatus[];

export const connectionCategoryDefinitions: readonly ConnectionCategoryDefinitionSnapshot[] = [
  {
    key: "source",
    title: "Source",
    description: "Repository, source event, deployment status, and source metadata access.",
  },
  {
    key: "dns",
    title: "DNS",
    description: "Domain verification, routing records, record cleanup, and DNS readback.",
  },
  {
    key: "infrastructure",
    title: "Infrastructure",
    description: "External server or infrastructure onboarding into Appaloft deployment targets.",
  },
  {
    key: "notification",
    title: "Notification",
    description: "Deployment, resource, and workflow notification destinations.",
  },
  {
    key: "billing",
    title: "Billing",
    description: "Downstream billing adapter connections; billing ledgers are not domain facts.",
  },
  {
    key: "identity",
    title: "Identity",
    description: "Sign-in and organization identity provider configuration.",
  },
  {
    key: "observability",
    title: "Observability",
    description: "Logs, metrics, traces, and alerting provider connections.",
  },
  {
    key: "storage",
    title: "Storage",
    description: "Object storage, backup, artifact, and volume-related provider connections.",
  },
];
