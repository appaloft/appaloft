import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  type CertificateSummary,
  createRoutingDomainTlsFixture,
  findCertificate,
  type RoutingDomainTlsFixture,
} from "./support/routing-domain-tls-fixture";
import {
  expectCliSuccess,
  parseJson,
  runShellCli,
  startShellHttpServer,
} from "./support/shell-e2e-fixture";

type CertificateListResponse = {
  items: CertificateSummary[];
};

describe("certificates.issue-or-renew command e2e", () => {
  let fixture: RoutingDomainTlsFixture;

  beforeAll(() => {
    fixture = createRoutingDomainTlsFixture({
      appVersion: "0.1.0-certificates-command-e2e",
      prefix: "appaloft-certificates-command-",
      proxyKind: "traefik",
    });
  }, 60000);

  afterAll(() => {
    fixture?.cleanup();
  }, 60000);

  test("[ROUTE-TLS-ENTRY-013] CLI requests a certificate and CLI list observes provider-unavailable state", async () => {
    const suffix = crypto.randomUUID().slice(0, 6);
    const context = fixture.deployWorkspaceResource({
      appPort: 4900 + Math.floor(Math.random() * 100),
      suffix,
    });
    const domainName = `${suffix}.example.dev`;
    const domainBindingId = createConfirmedTlsAutoBinding({
      context,
      domainName,
      options: fixture.cliOptions,
    });

    const requested = runShellCli(
      ["certificate", "issue-or-renew", domainBindingId, "--reason", "issue"],
      fixture.cliOptions,
    );
    expectCliSuccess(requested, "request certificate through CLI");
    const certificateResult = parseJson<{ attemptId: string; certificateId: string }>(
      requested.stdout,
    );
    expect(certificateResult).toEqual({
      attemptId: expect.stringMatching(/^cat_/),
      certificateId: expect.stringMatching(/^crt_/),
    });

    expectCertificateProviderUnavailable({
      certificate: await waitForCliCertificateProviderUnavailable({
        certificateId: certificateResult.certificateId,
        domainBindingId,
        options: fixture.cliOptions,
      }),
      certificateResult,
      domainBindingId,
      domainName,
    });
  }, 90000);

  test("[ROUTE-TLS-ENTRY-014] HTTP requests a certificate and HTTP list observes provider-unavailable state", async () => {
    const suffix = crypto.randomUUID().slice(0, 6);
    const context = fixture.deployWorkspaceResource({
      appPort: 5000 + Math.floor(Math.random() * 100),
      suffix,
    });
    const domainName = `${suffix}.example.io`;
    const httpServer = await startShellHttpServer(fixture.cliOptions);

    try {
      const created = await fetch(`${httpServer.baseUrl}/api/domain-bindings`, {
        body: JSON.stringify({
          destinationId: context.destinationId,
          domainName,
          environmentId: context.environmentId,
          pathPrefix: "/",
          projectId: context.projectId,
          proxyKind: "traefik",
          resourceId: context.resourceId,
          serverId: context.serverId,
          tlsMode: "auto",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      expect(created.status).toBe(201);
      const domainBindingId = ((await created.json()) as { id: string }).id;

      const confirmed = await fetch(
        `${httpServer.baseUrl}/api/domain-bindings/${domainBindingId}/ownership-confirmations`,
        {
          body: JSON.stringify({ domainBindingId, verificationMode: "manual" }),
          headers: {
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      expect(confirmed.status).toBe(200);

      const requested = await fetch(`${httpServer.baseUrl}/api/certificates/issue-or-renew`, {
        body: JSON.stringify({
          domainBindingId,
          reason: "issue",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      expect(requested.status).toBe(202);
      const certificateResult = (await requested.json()) as {
        attemptId: string;
        certificateId: string;
      };
      expect(certificateResult).toEqual({
        attemptId: expect.stringMatching(/^cat_/),
        certificateId: expect.stringMatching(/^crt_/),
      });

      expectCertificateProviderUnavailable({
        certificate: await waitForHttpCertificateProviderUnavailable({
          baseUrl: httpServer.baseUrl,
          certificateId: certificateResult.certificateId,
          domainBindingId,
        }),
        certificateResult,
        domainBindingId,
        domainName,
      });
    } finally {
      await httpServer.stop();
    }
  }, 90000);
});

function createConfirmedTlsAutoBinding(input: {
  context: {
    destinationId: string;
    environmentId: string;
    projectId: string;
    resourceId: string;
    serverId: string;
  };
  domainName: string;
  options: RoutingDomainTlsFixture["cliOptions"];
}): string {
  const created = runShellCli(
    [
      "domain-binding",
      "create",
      input.domainName,
      "--project-id",
      input.context.projectId,
      "--environment-id",
      input.context.environmentId,
      "--resource-id",
      input.context.resourceId,
      "--server-id",
      input.context.serverId,
      "--destination-id",
      input.context.destinationId,
      "--proxy-kind",
      "traefik",
      "--tls-mode",
      "auto",
    ],
    input.options,
  );
  expectCliSuccess(created, "create TLS-auto domain binding through CLI");
  const domainBindingId = parseJson<{ id: string }>(created.stdout).id;

  const confirmed = runShellCli(
    ["domain-binding", "confirm-ownership", domainBindingId, "--verification-mode", "manual"],
    input.options,
  );
  expectCliSuccess(confirmed, "confirm TLS-auto domain ownership through CLI");

  return domainBindingId;
}

function expectCertificateProviderUnavailable(input: {
  certificate: CertificateSummary;
  certificateResult: {
    attemptId: string;
    certificateId: string;
  };
  domainBindingId: string;
  domainName: string;
}): void {
  expect(input.certificate).toEqual(
    expect.objectContaining({
      challengeType: "http-01",
      domainBindingId: input.domainBindingId,
      domainName: input.domainName,
      providerKey: "acme",
      status: "failed",
      latestAttempt: expect.objectContaining({
        errorCode: "certificate_provider_unavailable",
        failurePhase: "provider-request",
        id: input.certificateResult.attemptId,
        reason: "issue",
        retriable: true,
        status: "retry_scheduled",
      }),
    }),
  );
}

async function waitForCliCertificateProviderUnavailable(input: {
  certificateId: string;
  domainBindingId: string;
  options: RoutingDomainTlsFixture["cliOptions"];
}): Promise<CertificateSummary> {
  let lastOutput = "";

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const listed = runShellCli(
      ["certificate", "list", "--domain-binding", input.domainBindingId],
      input.options,
    );
    expectCliSuccess(listed, "list certificates through CLI");
    lastOutput = listed.stdout;
    const certificate = findCertificate({
      certificateId: input.certificateId,
      items: parseJson<CertificateListResponse>(listed.stdout).items,
    });

    if (
      certificate.status === "failed" &&
      certificate.latestAttempt?.status === "retry_scheduled"
    ) {
      return certificate;
    }

    await Bun.sleep(500);
  }

  throw new Error(
    `Timed out waiting for certificate ${input.certificateId} provider-unavailable state. Last output: ${lastOutput}`,
  );
}

async function waitForHttpCertificateProviderUnavailable(input: {
  baseUrl: string;
  certificateId: string;
  domainBindingId: string;
}): Promise<CertificateSummary> {
  let lastOutput = "";

  for (let attempt = 0; attempt < 120; attempt += 1) {
    const listed = await fetch(
      `${input.baseUrl}/api/certificates?domainBindingId=${input.domainBindingId}`,
    );
    expect(listed.ok).toBe(true);
    lastOutput = await listed.text();
    const certificate = findCertificate({
      certificateId: input.certificateId,
      items: parseJson<CertificateListResponse>(lastOutput).items,
    });

    if (
      certificate.status === "failed" &&
      certificate.latestAttempt?.status === "retry_scheduled"
    ) {
      return certificate;
    }

    await Bun.sleep(500);
  }

  throw new Error(
    `Timed out waiting for certificate ${input.certificateId} provider-unavailable state. Last output: ${lastOutput}`,
  );
}
