import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { ValueObject } from "../shared/value-object";

export type SandboxNetworkPolicyMode = "deny" | "allowlist";
export type SandboxNetworkRule = {
  kind: "domain" | "cidr";
  value: string;
  ports: number[];
};
export interface SandboxNetworkPolicyState {
  mode: SandboxNetworkPolicyMode;
  rules: SandboxNetworkRule[];
}

function networkError(message: string, field: string) {
  return domainError.validation(message, {
    phase: "execution-sandbox-network-policy",
    field,
  });
}

function normalizeDomain(value: string): Result<string> {
  const normalized = value.trim().toLowerCase().replace(/\.$/, "");
  if (
    !normalized ||
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      normalized,
    )
  ) {
    return err(networkError("Sandbox network domain is invalid or reserved", "rules.value"));
  }
  return ok(normalized);
}

function normalizeCidr(value: string): Result<string> {
  const normalized = value.trim();
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d|[12]\d|3[0-2])$/.exec(normalized);
  if (!match || match.slice(1, 5).some((octet) => Number(octet) > 255)) {
    return err(networkError("Sandbox network CIDR must be canonical IPv4 CIDR", "rules.value"));
  }
  const first = Number(match[1]);
  const second = Number(match[2]);
  if (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  ) {
    return err(networkError("Sandbox network CIDR targets a reserved network", "rules.value"));
  }
  return ok(normalized);
}

export class SandboxNetworkPolicy extends ValueObject<SandboxNetworkPolicyState> {
  private constructor(state: SandboxNetworkPolicyState) {
    super({
      mode: state.mode,
      rules: state.rules.map((rule) => ({ ...rule, ports: [...rule.ports] })),
    });
  }
  static defaultDeny(): SandboxNetworkPolicy {
    return new SandboxNetworkPolicy({ mode: "deny", rules: [] });
  }
  static create(input: SandboxNetworkPolicyState): Result<SandboxNetworkPolicy> {
    if (input.mode === "deny") {
      if (input.rules.length > 0) {
        return err(networkError("Deny network policy cannot contain allow rules", "rules"));
      }
      return ok(SandboxNetworkPolicy.defaultDeny());
    }
    if (input.mode !== "allowlist" || input.rules.length === 0 || input.rules.length > 128) {
      return err(networkError("Allowlist network policy requires bounded rules", "rules"));
    }

    const rules: SandboxNetworkRule[] = [];
    for (const rule of input.rules) {
      const normalizedValue =
        rule.kind === "domain" ? normalizeDomain(rule.value) : normalizeCidr(rule.value);
      if (normalizedValue.isErr()) return err(normalizedValue.error);
      const ports = [...new Set(rule.ports)].sort((left, right) => left - right);
      if (
        ports.length === 0 ||
        ports.length > 64 ||
        ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)
      ) {
        return err(networkError("Sandbox network ports are invalid", "rules.ports"));
      }
      rules.push({ kind: rule.kind, value: normalizedValue.value, ports });
    }
    return ok(new SandboxNetworkPolicy({ mode: "allowlist", rules }));
  }
  static rehydrate(state: SandboxNetworkPolicyState): SandboxNetworkPolicy {
    return new SandboxNetworkPolicy(state);
  }
  toState(): SandboxNetworkPolicyState {
    return {
      mode: this.state.mode,
      rules: this.state.rules.map((rule) => ({ ...rule, ports: [...rule.ports] })),
    };
  }
}

export type SandboxCredentialTransformation =
  | "authorization-bearer"
  | "basic-auth"
  | "header"
  | "query-parameter";
export interface SandboxCredentialGrantState {
  grantId: string;
  secretRef: string;
  destination: string;
  transformation: SandboxCredentialTransformation;
}

export class SandboxCredentialGrant extends ValueObject<SandboxCredentialGrantState> {
  private constructor(state: SandboxCredentialGrantState) {
    super(Object.freeze({ ...state }));
  }
  static create(input: SandboxCredentialGrantState): Result<SandboxCredentialGrant> {
    const grantId = input.grantId.trim();
    const secretRef = input.secretRef.trim();
    const destination = input.destination.trim().toLowerCase();
    const domain = normalizeDomain(destination);
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,159}$/.test(grantId)) {
      return err(networkError("Credential grant id is invalid", "grantId"));
    }
    if (!/^(secret|vault):\/\/[a-zA-Z0-9][a-zA-Z0-9_./:-]{1,511}$/.test(secretRef)) {
      return err(networkError("Credential grant requires a secret reference", "secretRef"));
    }
    if (domain.isErr()) return err(domain.error);
    if (
      !["authorization-bearer", "basic-auth", "header", "query-parameter"].includes(
        input.transformation,
      )
    ) {
      return err(networkError("Credential transformation is unsupported", "transformation"));
    }
    return ok(
      new SandboxCredentialGrant({
        grantId,
        secretRef,
        destination: domain.value,
        transformation: input.transformation,
      }),
    );
  }
  static rehydrate(state: SandboxCredentialGrantState): SandboxCredentialGrant {
    return new SandboxCredentialGrant(state);
  }
  toState(): SandboxCredentialGrantState {
    return { ...this.state };
  }
}
