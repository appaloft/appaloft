import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { ScalarValueObject } from "../shared/value-object";

export interface InfrastructureServerProposalSnapshot {
  providerKey: string;
  region: string;
  size: string;
  image: string;
  recommendedServerName: string;
  osUser: string;
  sshPort: number;
  sshPublicKeyRef?: string;
  estimatedMonthlyCostUsd?: number;
  costRiskLevel: "low" | "medium" | "high";
  cleanupSupported: boolean;
  notes: string[];
  tags: string[];
}

function requiredText(value: string, label: string): Result<string> {
  const normalized = value.trim();
  if (!normalized) {
    return err(domainError.validation(`${label} is required`));
  }
  return ok(normalized);
}

const infrastructureProviderKeyBrand: unique symbol = Symbol("InfrastructureProviderKey");
export class InfrastructureProviderKey extends ScalarValueObject<string> {
  private [infrastructureProviderKeyBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<InfrastructureProviderKey> {
    return requiredText(value, "Infrastructure provider key").map(
      (normalized) => new InfrastructureProviderKey(normalized.toLowerCase()),
    );
  }

  static rehydrate(value: string): InfrastructureProviderKey {
    return new InfrastructureProviderKey(value.trim().toLowerCase());
  }
}

const infrastructureServerNameBrand: unique symbol = Symbol("InfrastructureServerName");
export class InfrastructureServerName extends ScalarValueObject<string> {
  private [infrastructureServerNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<InfrastructureServerName> {
    return requiredText(value, "Infrastructure server name").map(
      (normalized) => new InfrastructureServerName(normalized.toLowerCase()),
    );
  }

  static rehydrate(value: string): InfrastructureServerName {
    return new InfrastructureServerName(value.trim().toLowerCase());
  }
}

export class InfrastructureServerProposal {
  private constructor(
    private readonly providerKeyValue: InfrastructureProviderKey,
    private readonly regionValue: string,
    private readonly sizeValue: string,
    private readonly imageValue: string,
    private readonly recommendedServerNameValue: InfrastructureServerName,
    private readonly osUserValue: string,
    private readonly sshPortValue: number,
    private readonly costRiskLevelValue: InfrastructureServerProposalSnapshot["costRiskLevel"],
    private readonly cleanupSupportedValue: boolean,
    private readonly notesValue: string[],
    private readonly tagsValue: string[],
    private readonly sshPublicKeyRefValue?: string,
    private readonly estimatedMonthlyCostUsdValue?: number,
  ) {}

  static create(input: InfrastructureServerProposalSnapshot): Result<InfrastructureServerProposal> {
    const providerKey = InfrastructureProviderKey.create(input.providerKey);
    if (providerKey.isErr()) return err(providerKey.error);
    const region = requiredText(input.region, "Infrastructure region");
    if (region.isErr()) return err(region.error);
    const size = requiredText(input.size, "Infrastructure size");
    if (size.isErr()) return err(size.error);
    const image = requiredText(input.image, "Infrastructure image");
    if (image.isErr()) return err(image.error);
    const recommendedServerName = InfrastructureServerName.create(input.recommendedServerName);
    if (recommendedServerName.isErr()) return err(recommendedServerName.error);
    const osUser = requiredText(input.osUser, "Infrastructure OS user");
    if (osUser.isErr()) return err(osUser.error);
    if (!Number.isInteger(input.sshPort) || input.sshPort < 1 || input.sshPort > 65535) {
      return err(domainError.validation("Infrastructure SSH port must be between 1 and 65535"));
    }
    if (
      input.estimatedMonthlyCostUsd !== undefined &&
      (!Number.isFinite(input.estimatedMonthlyCostUsd) || input.estimatedMonthlyCostUsd < 0)
    ) {
      return err(domainError.validation("Infrastructure monthly cost must be non-negative"));
    }
    if (!["low", "medium", "high"].includes(input.costRiskLevel)) {
      return err(
        domainError.validation(`Unsupported infrastructure cost risk ${input.costRiskLevel}`),
      );
    }

    return ok(
      new InfrastructureServerProposal(
        providerKey.value,
        region.value,
        size.value,
        image.value,
        recommendedServerName.value,
        osUser.value,
        input.sshPort,
        input.costRiskLevel,
        input.cleanupSupported,
        [...input.notes],
        [...input.tags],
        input.sshPublicKeyRef,
        input.estimatedMonthlyCostUsd,
      ),
    );
  }

  static rehydrate(input: InfrastructureServerProposalSnapshot): InfrastructureServerProposal {
    return new InfrastructureServerProposal(
      InfrastructureProviderKey.rehydrate(input.providerKey),
      input.region,
      input.size,
      input.image,
      InfrastructureServerName.rehydrate(input.recommendedServerName),
      input.osUser,
      input.sshPort,
      input.costRiskLevel,
      input.cleanupSupported,
      [...input.notes],
      [...input.tags],
      input.sshPublicKeyRef,
      input.estimatedMonthlyCostUsd,
    );
  }

  requiresExplicitAcceptance(): boolean {
    return true;
  }

  riskLevel(): "low" | "medium" | "high" {
    return this.costRiskLevelValue;
  }

  summary(): string {
    const costSuffix =
      this.estimatedMonthlyCostUsdValue === undefined
        ? ""
        : ` at about $${this.estimatedMonthlyCostUsdValue.toFixed(2)}/month`;
    return `${this.providerKeyValue.value} ${this.sizeValue} server in ${this.regionValue}${costSuffix}.`;
  }

  title(): string {
    return `${this.recommendedServerNameValue.value} (${this.sizeValue})`;
  }

  description(): string {
    return `${this.imageValue} in ${this.regionValue}; SSH ${this.osUserValue}@<public-ip>:${this.sshPortValue}`;
  }

  toJSON(): InfrastructureServerProposalSnapshot {
    return {
      providerKey: this.providerKeyValue.value,
      region: this.regionValue,
      size: this.sizeValue,
      image: this.imageValue,
      recommendedServerName: this.recommendedServerNameValue.value,
      osUser: this.osUserValue,
      sshPort: this.sshPortValue,
      ...(this.sshPublicKeyRefValue ? { sshPublicKeyRef: this.sshPublicKeyRefValue } : {}),
      ...(this.estimatedMonthlyCostUsdValue !== undefined
        ? { estimatedMonthlyCostUsd: this.estimatedMonthlyCostUsdValue }
        : {}),
      costRiskLevel: this.costRiskLevelValue,
      cleanupSupported: this.cleanupSupportedValue,
      notes: [...this.notesValue],
      tags: [...this.tagsValue],
    };
  }
}
