import { describe, expect, test } from "bun:test";

import {
  configureDomainBindingRouteInputSchema,
  configureResourceNetworkInputSchema,
  createDomainBindingInputSchema,
  importCertificateInputSchema,
  issueOrRenewCertificateInputSchema,
} from "../src";

describe("public contract input schemas", () => {
  test("[OP-INPUT-STRICT-001] selected public contract mirrors reject unsupported fields", () => {
    expect(
      configureResourceNetworkInputSchema.safeParse({
        resourceId: "res_demo",
        networkProfile: {
          internalPort: 3000,
          routingMode: "custom",
        },
      }).success,
    ).toBe(false);

    for (const [schema, input] of [
      [
        createDomainBindingInputSchema,
        {
          projectId: "prj_demo",
          environmentId: "env_demo",
          resourceId: "res_demo",
          domainName: "app.example.com",
          proxyKind: "traefik",
          authentication: true,
        },
      ],
      [
        configureDomainBindingRouteInputSchema,
        { domainBindingId: "dom_demo", unknownPolicy: "replace" },
      ],
      [
        issueOrRenewCertificateInputSchema,
        { domainBindingId: "dom_demo", privateKey: "must-not-be-accepted" },
      ],
      [
        importCertificateInputSchema,
        {
          domainBindingId: "dom_demo",
          certificateChain: "certificate-chain",
          privateKey: "private-key",
          storeRawMaterial: true,
        },
      ],
    ] as const) {
      expect(schema.safeParse(input).success).toBe(false);
    }
  });
});
