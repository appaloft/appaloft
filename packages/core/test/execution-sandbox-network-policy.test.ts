import { describe, expect, test } from "bun:test";
import { SandboxCredentialGrant, SandboxNetworkPolicy } from "../src";

describe("SandboxNetworkPolicy", () => {
  test("[SBX-NET-001] defaults to deny and normalizes explicit destinations", () => {
    const policy = SandboxNetworkPolicy.create({
      mode: "allowlist",
      rules: [
        { kind: "domain", value: "API.EXAMPLE.COM", ports: [443, 443] },
        { kind: "cidr", value: "203.0.113.0/24", ports: [443] },
      ],
    })._unsafeUnwrap();

    expect(SandboxNetworkPolicy.defaultDeny().toState()).toEqual({ mode: "deny", rules: [] });
    expect(policy.toState().rules[0]).toEqual({
      kind: "domain",
      value: "api.example.com",
      ports: [443],
    });
    expect(
      SandboxNetworkPolicy.create({
        mode: "allowlist",
        rules: [{ kind: "domain", value: "localhost", ports: [80] }],
      }).isErr(),
    ).toBe(true);
  });

  test("[SBX-SECRET-001] credential grants bind references to destinations", () => {
    const grant = SandboxCredentialGrant.create({
      grantId: "grant_openai",
      secretRef: "secret://openai/api-key",
      destination: "api.openai.com",
      transformation: "authorization-bearer",
    })._unsafeUnwrap();

    expect(grant.toState()).toEqual({
      grantId: "grant_openai",
      secretRef: "secret://openai/api-key",
      destination: "api.openai.com",
      transformation: "authorization-bearer",
    });
    expect(JSON.stringify(grant.toState())).not.toContain("sk-");
    expect(
      SandboxCredentialGrant.create({
        grantId: "grant_bad",
        secretRef: "sk-plaintext",
        destination: "api.openai.com",
        transformation: "authorization-bearer",
      }).isErr(),
    ).toBe(true);
  });
});
