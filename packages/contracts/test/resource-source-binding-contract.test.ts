import { describe, expect, test } from "bun:test";

import { resourceSourceBindingInputSchema } from "../src";

describe("resource source binding contract", () => {
  test("[K8S-HELM-013] requires typed Helm configuration for Helm chart sources", () => {
    expect(
      resourceSourceBindingInputSchema.safeParse({
        kind: "helm-chart",
        locator: "oci://registry.example.com/charts/storefront",
      }).success,
    ).toBe(false);

    expect(
      resourceSourceBindingInputSchema.safeParse({
        kind: "helm-chart",
        locator: "oci://registry.example.com/charts/storefront",
        helmChart: { version: "1.7.3" },
      }),
    ).toMatchObject({
      success: true,
      data: {
        helmChart: {
          version: "1.7.3",
          valuesSecretReferences: [],
          hookPolicy: "disabled",
          timeoutSeconds: 300,
        },
      },
    });
  });

  test("[K8S-HELM-013] rejects Helm configuration on non-Helm sources", () => {
    expect(
      resourceSourceBindingInputSchema.safeParse({
        kind: "docker-image",
        locator: "ghcr.io/acme/storefront:1.7.3",
        helmChart: { version: "1.7.3" },
      }).success,
    ).toBe(false);
  });
});
