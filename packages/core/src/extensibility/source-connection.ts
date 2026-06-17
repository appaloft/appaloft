import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { ScalarValueObject } from "../shared/value-object";

export interface SourceRepositorySummarySnapshot {
  id: string;
  name: string;
  fullName: string;
  ownerLogin: string;
  private: boolean;
  defaultBranch: string;
  htmlUrl?: string;
}

export interface ProviderAppTokenLeaseSnapshot {
  providerKey: string;
  installationId: string;
  expiresAt: string;
  redacted: true;
  expired: boolean;
  permissions: string[];
  repositoryFullNames?: string[];
}

export interface SourceRepositoryAccessSnapshot {
  providerKey: string;
  installationId: string;
  accountLogin?: string;
  repositoriesSelection: "all" | "selected";
  repositories: SourceRepositorySummarySnapshot[];
  tokenLease: ProviderAppTokenLeaseSnapshot;
}

function requiredText(value: string, label: string): Result<string> {
  const normalized = value.trim();
  if (!normalized) {
    return err(domainError.validation(`${label} is required`));
  }
  return ok(normalized);
}

const sourceProviderKeyBrand: unique symbol = Symbol("SourceProviderKey");
export class SourceProviderKey extends ScalarValueObject<string> {
  private [sourceProviderKeyBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<SourceProviderKey> {
    return requiredText(value, "Source provider key").map(
      (normalized) => new SourceProviderKey(normalized.toLowerCase()),
    );
  }

  static rehydrate(value: string): SourceProviderKey {
    return new SourceProviderKey(value.trim().toLowerCase());
  }
}

export class ProviderAppTokenLease {
  private constructor(
    private readonly providerKeyValue: SourceProviderKey,
    private readonly installationIdValue: string,
    private readonly expiresAtValue: string,
    private readonly permissionsValue: string[],
    private readonly repositoryFullNamesValue: string[] | undefined,
    private readonly expiredValue: boolean,
  ) {}

  static create(
    input: Omit<ProviderAppTokenLeaseSnapshot, "redacted" | "expired"> & {
      now?: string;
    },
  ): Result<ProviderAppTokenLease> {
    const providerKey = SourceProviderKey.create(input.providerKey);
    if (providerKey.isErr()) return err(providerKey.error);
    const installationId = requiredText(input.installationId, "Provider app installation id");
    if (installationId.isErr()) return err(installationId.error);
    const expiresAt = requiredText(input.expiresAt, "Provider app token expiry");
    if (expiresAt.isErr()) return err(expiresAt.error);
    const expiresAtDate = new Date(expiresAt.value);
    if (Number.isNaN(expiresAtDate.getTime())) {
      return err(domainError.validation("Provider app token expiry must be an ISO timestamp"));
    }
    const nowDate = input.now ? new Date(input.now) : new Date();
    if (Number.isNaN(nowDate.getTime())) {
      return err(domainError.validation("Provider app token comparison time must be valid"));
    }
    const permissions = normalizeList(input.permissions);
    if (permissions.length === 0) {
      return err(domainError.validation("Provider app token permissions are required"));
    }
    const repositoryFullNames = input.repositoryFullNames
      ? normalizeList(input.repositoryFullNames)
      : undefined;

    return ok(
      new ProviderAppTokenLease(
        providerKey.value,
        installationId.value,
        expiresAtDate.toISOString(),
        permissions,
        repositoryFullNames && repositoryFullNames.length > 0 ? repositoryFullNames : undefined,
        expiresAtDate.getTime() <= nowDate.getTime(),
      ),
    );
  }

  static rehydrate(input: ProviderAppTokenLeaseSnapshot): ProviderAppTokenLease {
    return new ProviderAppTokenLease(
      SourceProviderKey.rehydrate(input.providerKey),
      input.installationId.trim(),
      new Date(input.expiresAt).toISOString(),
      normalizeList(input.permissions),
      input.repositoryFullNames ? normalizeList(input.repositoryFullNames) : undefined,
      input.expired,
    );
  }

  narrow(input: {
    permissions?: readonly string[];
    repositoryFullNames?: readonly string[];
    now?: string;
  }): Result<ProviderAppTokenLease> {
    return ProviderAppTokenLease.create({
      providerKey: this.providerKeyValue.value,
      installationId: this.installationIdValue,
      expiresAt: this.expiresAtValue,
      permissions: input.permissions
        ? intersectList(this.permissionsValue, input.permissions)
        : this.permissionsValue,
      ...(input.repositoryFullNames
        ? {
            repositoryFullNames: intersectList(
              this.repositoryFullNamesValue,
              input.repositoryFullNames,
            ),
          }
        : this.repositoryFullNamesValue
          ? { repositoryFullNames: this.repositoryFullNamesValue }
          : {}),
      ...(input.now ? { now: input.now } : {}),
    });
  }

  isExpired(): boolean {
    return this.expiredValue;
  }

  toJSON(): ProviderAppTokenLeaseSnapshot {
    return {
      providerKey: this.providerKeyValue.value,
      installationId: this.installationIdValue,
      expiresAt: this.expiresAtValue,
      redacted: true,
      expired: this.expiredValue,
      permissions: [...this.permissionsValue],
      ...(this.repositoryFullNamesValue
        ? { repositoryFullNames: [...this.repositoryFullNamesValue] }
        : {}),
    };
  }
}

export class SourceRepositoryAccess {
  private constructor(
    private readonly providerKeyValue: SourceProviderKey,
    private readonly installationIdValue: string,
    private readonly repositoriesSelectionValue: SourceRepositoryAccessSnapshot["repositoriesSelection"],
    private readonly repositoriesValue: SourceRepositorySummarySnapshot[],
    private readonly tokenLeaseValue: ProviderAppTokenLease,
    private readonly accountLoginValue?: string,
  ) {}

  static create(input: SourceRepositoryAccessSnapshot): Result<SourceRepositoryAccess> {
    const providerKey = SourceProviderKey.create(input.providerKey);
    if (providerKey.isErr()) return err(providerKey.error);
    const installationId = requiredText(input.installationId, "Source installation id");
    if (installationId.isErr()) return err(installationId.error);
    if (!["all", "selected"].includes(input.repositoriesSelection)) {
      return err(
        domainError.validation(
          `Unsupported source repository selection ${input.repositoriesSelection}`,
        ),
      );
    }
    const tokenLease = ProviderAppTokenLease.rehydrate(input.tokenLease);

    return ok(
      new SourceRepositoryAccess(
        providerKey.value,
        installationId.value,
        input.repositoriesSelection,
        input.repositories.map(sanitizeRepository),
        tokenLease,
        input.accountLogin?.trim() || undefined,
      ),
    );
  }

  repositoryCount(): number {
    return this.repositoriesValue.length;
  }

  toJSON(): SourceRepositoryAccessSnapshot {
    return {
      providerKey: this.providerKeyValue.value,
      installationId: this.installationIdValue,
      ...(this.accountLoginValue ? { accountLogin: this.accountLoginValue } : {}),
      repositoriesSelection: this.repositoriesSelectionValue,
      repositories: this.repositoriesValue.map((repository) => ({ ...repository })),
      tokenLease: this.tokenLeaseValue.toJSON(),
    };
  }
}

function normalizeList(values: readonly string[] | undefined): string[] {
  return [
    ...new Set(
      (values ?? [])
        .map((value) => value.trim())
        .filter(Boolean)
        .sort(),
    ),
  ];
}

function intersectList(
  current: readonly string[] | undefined,
  requested: readonly string[],
): string[] {
  const currentValues = normalizeList(current);
  const requestedValues = new Set(normalizeList(requested));
  if (currentValues.length === 0) {
    return [...requestedValues].sort();
  }
  return currentValues.filter((value) => requestedValues.has(value));
}

function sanitizeRepository(
  repository: SourceRepositorySummarySnapshot,
): SourceRepositorySummarySnapshot {
  return {
    id: repository.id.trim(),
    name: repository.name.trim(),
    fullName: repository.fullName.trim(),
    ownerLogin: repository.ownerLogin.trim(),
    private: repository.private,
    defaultBranch: repository.defaultBranch.trim() || "main",
    ...(repository.htmlUrl?.trim() ? { htmlUrl: repository.htmlUrl.trim() } : {}),
  };
}
