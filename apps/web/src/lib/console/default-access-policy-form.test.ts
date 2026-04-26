import { describe, expect, test } from "vitest";

import { toDefaultAccessPolicyFormState } from "./default-access-policy-form";

describe("default access policy form readback", () => {
  test("[DEF-ACCESS-ENTRY-007] maps missing policy readback to the default provider form state", () => {
    expect(toDefaultAccessPolicyFormState(null)).toEqual({
      mode: "provider",
      providerKey: "sslip",
      templateRef: "",
    });
  });

  test("[DEF-ACCESS-ENTRY-007] maps persisted provider policy readback to editable form state", () => {
    expect(
      toDefaultAccessPolicyFormState({
        schemaVersion: "default-access-domain-policies.policy/v1",
        id: "dap_system",
        scope: { kind: "system" },
        mode: "provider",
        providerKey: "sslip",
        updatedAt: "2026-01-01T00:00:10.000Z",
      }),
    ).toEqual({
      mode: "provider",
      providerKey: "sslip",
      templateRef: "",
    });
  });

  test("[DEF-ACCESS-ENTRY-007] maps persisted custom-template policy readback to editable form state", () => {
    expect(
      toDefaultAccessPolicyFormState({
        schemaVersion: "default-access-domain-policies.policy/v1",
        id: "dap_server",
        scope: { kind: "deployment-target", serverId: "srv_demo" },
        mode: "custom-template",
        providerKey: "internal-dns",
        templateRef: "apps/{{resourceSlug}}",
        updatedAt: "2026-01-01T00:00:11.000Z",
      }),
    ).toEqual({
      mode: "custom-template",
      providerKey: "internal-dns",
      templateRef: "apps/{{resourceSlug}}",
    });
  });
});
