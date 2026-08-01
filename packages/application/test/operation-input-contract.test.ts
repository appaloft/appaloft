import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { ConfigureResourceNetworkCommand } from "../src/messages";
import {
  configureDomainBindingRouteCommandInputSchema,
  configureResourceNetworkCommandInputSchema,
  confirmDomainBindingOwnershipCommandInputSchema,
  createDomainBindingCommandInputSchema,
  deleteCertificateCommandInputSchema,
  deleteDomainBindingCommandInputSchema,
  importCertificateCommandInputSchema,
  issueOrRenewCertificateCommandInputSchema,
  retryCertificateCommandInputSchema,
  retryDomainBindingVerificationCommandInputSchema,
  revokeCertificateCommandInputSchema,
} from "../src/schemas";

const selectedCommandInputs = [
  {
    key: "resources.configure-network",
    schema: configureResourceNetworkCommandInputSchema,
    input: {
      resourceId: "res_demo",
      networkProfile: {
        internalPort: 3000,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
      },
    },
  },
  {
    key: "domain-bindings.create",
    schema: createDomainBindingCommandInputSchema,
    input: {
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      domainName: "app.example.com",
      proxyKind: "traefik",
    },
  },
  {
    key: "domain-bindings.configure-route",
    schema: configureDomainBindingRouteCommandInputSchema,
    input: { domainBindingId: "dom_demo" },
  },
  {
    key: "domain-bindings.confirm-ownership",
    schema: confirmDomainBindingOwnershipCommandInputSchema,
    input: { domainBindingId: "dom_demo" },
  },
  {
    key: "domain-bindings.delete",
    schema: deleteDomainBindingCommandInputSchema,
    input: {
      domainBindingId: "dom_demo",
      confirmation: { domainBindingId: "dom_demo" },
    },
  },
  {
    key: "domain-bindings.retry-verification",
    schema: retryDomainBindingVerificationCommandInputSchema,
    input: { domainBindingId: "dom_demo" },
  },
  {
    key: "certificates.issue-or-renew",
    schema: issueOrRenewCertificateCommandInputSchema,
    input: { domainBindingId: "dom_demo" },
  },
  {
    key: "certificates.import",
    schema: importCertificateCommandInputSchema,
    input: {
      domainBindingId: "dom_demo",
      certificateChain: "certificate-chain",
      privateKey: "private-key",
    },
  },
  {
    key: "certificates.retry",
    schema: retryCertificateCommandInputSchema,
    input: { certificateId: "cert_demo" },
  },
  {
    key: "certificates.revoke",
    schema: revokeCertificateCommandInputSchema,
    input: { certificateId: "cert_demo" },
  },
  {
    key: "certificates.delete",
    schema: deleteCertificateCommandInputSchema,
    input: {
      certificateId: "cert_demo",
      confirmation: { certificateId: "cert_demo" },
    },
  },
] as const;

describe("public operation input contract", () => {
  test("[OP-INPUT-STRICT-001] selected deployment-critical commands reject unknown fields", () => {
    for (const entry of selectedCommandInputs) {
      expect(
        entry.schema.safeParse({ ...entry.input, unsupportedIntent: true }).success,
        `${entry.key} rejects unknown top-level fields`,
      ).toBe(false);
    }

    expect(
      configureResourceNetworkCommandInputSchema.safeParse({
        resourceId: "res_demo",
        networkProfile: {
          internalPort: 3000,
          upstreamProtocol: "http",
          exposureMode: "reverse-proxy",
          routingMode: "custom",
        },
      }).success,
    ).toBe(false);

    expect(
      deleteDomainBindingCommandInputSchema.safeParse({
        domainBindingId: "dom_demo",
        confirmation: { domainBindingId: "dom_demo", force: true },
      }).success,
    ).toBe(false);

    expect(
      deleteCertificateCommandInputSchema.safeParse({
        certificateId: "cert_demo",
        confirmation: { certificateId: "cert_demo", revoke: true },
      }).success,
    ).toBe(false);
  });

  test("[OP-INPUT-ERROR-002] shared parsing returns complete privacy-safe issue details", () => {
    const secretValue = "secret-that-must-not-leak";
    const result = ConfigureResourceNetworkCommand.create({
      resourceId: "res_demo",
      networkProfile: {
        internalPort: 3000,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
        routingMode: "custom",
      },
      authentication: { privateKey: secretValue },
      domains: ["app.example.com"],
    } as never);

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error.code).toBe("validation_error");
    expect(error.details?.phase).toBe("command-validation");
    expect(error.details?.validationIssueCodes).toEqual([
      "unsupported_field",
      "unsupported_field",
      "unsupported_field",
    ]);
    expect(error.details?.validationIssuePaths).toEqual([
      "networkProfile.routingMode",
      "authentication",
      "domains",
    ]);
    expect(error.details?.validationIssueMessages).toEqual([
      "Unsupported field: networkProfile.routingMode",
      "Unsupported field: authentication",
      "Unsupported field: domains",
    ]);
    expect(JSON.stringify(error)).not.toContain(secretValue);
  });
});
