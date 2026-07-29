import { domainError } from "../shared/errors";
import { IdentifierValue } from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";

const bindingIdBrand: unique symbol = Symbol("RepositoryBindingId");
export class RepositoryBindingId extends IdentifierValue {
  private [bindingIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<RepositoryBindingId> {
    const normalized = value.trim();
    return /^rbd_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(normalized)
      ? ok(new RepositoryBindingId(normalized))
      : err(domainError.validation("Repository Binding id is invalid"));
  }

  static rehydrate(value: string): RepositoryBindingId {
    return new RepositoryBindingId(value.trim());
  }
}

const identityBrand: unique symbol = Symbol("RepositoryIdentity");
export class RepositoryIdentity extends IdentifierValue {
  private [identityBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<RepositoryIdentity> {
    const normalized = value.trim();
    const slash = normalized.indexOf("/");
    const host = slash > 0 ? normalized.slice(0, slash).toLowerCase() : "";
    const path = slash > 0 ? normalized.slice(slash + 1) : "";
    if (
      !host ||
      !path.includes("/") ||
      host.includes("@") ||
      /[\s?#]/u.test(normalized) ||
      path.startsWith("/") ||
      path.endsWith("/") ||
      path.endsWith(".git")
    ) {
      return err(domainError.validation("Repository identity is invalid"));
    }
    return ok(new RepositoryIdentity(`${host}/${path}`));
  }

  static rehydrate(value: string): RepositoryIdentity {
    return new RepositoryIdentity(value.trim());
  }
}
