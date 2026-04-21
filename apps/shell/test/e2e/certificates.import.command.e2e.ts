import "reflect-metadata";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  type CertificateSummary,
  createRoutingDomainTlsFixture,
  findCertificate,
  findDomainBinding,
  type RoutingDomainTlsFixture,
} from "./support/routing-domain-tls-fixture";
import {
  expectCliSuccess,
  fixturePath,
  parseJson,
  runShellCli,
  startShellHttpServer,
} from "./support/shell-e2e-fixture";

type CertificateListResponse = {
  items: CertificateSummary[];
};

type CertificateSecretRow = {
  ref: string;
  source: string;
  kind: string;
  certificate_id: string;
  attempt_id: string;
};

const certificateChainFixture = fixturePath("manual-certificate.crt");
const privateKeyFixture = fixturePath("manual-certificate.key");

describe("certificates.import command e2e", () => {
  let fixture: RoutingDomainTlsFixture;

  beforeAll(() => {
    fixture = createRoutingDomainTlsFixture({
      appVersion: "0.1.0-certificates-import-command-e2e",
      prefix: "appaloft-certificates-import-command-",
      proxyKind: "traefik",
    });
  }, 60000);

  afterAll(() => {
    fixture?.cleanup();
  }, 60000);

  test("[CERT-IMPORT-ENTRY-001][CERT-IMPORT-EVT-001] CLI imports a manual certificate and the binding becomes ready", async () => {
    const suffix = crypto.randomUUID().slice(0, 6);
    const context = fixture.deployWorkspaceResource({
      appPort: 5200 + Math.floor(Math.random() * 100),
      suffix,
    });
    const domainBindingId = createConfirmedManualBinding({
      context,
      domainName: "manual.example.test",
      options: fixture.cliOptions,
    });

    const imported = runShellCli(
      [
        "certificate",
        "import",
        domainBindingId,
        "--chain-file",
        certificateChainFixture,
        "--key-file",
        privateKeyFixture,
      ],
      fixture.cliOptions,
    );
    expectCliSuccess(imported, "import manual certificate through CLI");
    const certificateResult = parseJson<{ attemptId: string; certificateId: string }>(
      imported.stdout,
    );
    expect(certificateResult).toEqual({
      attemptId: expect.stringMatching(/^cat_/),
      certificateId: expect.stringMatching(/^crt_/),
    });

    const listed = runShellCli(["certificate", "list", "--domain-binding", domainBindingId], {
      ...fixture.cliOptions,
    });
    expectCliSuccess(listed, "list imported certificates through CLI");
    const certificate = findCertificate({
      certificateId: certificateResult.certificateId,
      items: parseJson<CertificateListResponse>(listed.stdout).items,
    });

    expectImportedCertificate({
      certificate,
      domainBindingId,
      domainName: "manual.example.test",
      attemptId: certificateResult.attemptId,
    });
    await expectImportedSecretsPersisted(
      fixture.cliOptions.pgliteDataDir,
      certificateResult.certificateId,
      certificateResult.attemptId,
    );

    const bindings = runShellCli(["domain-binding", "list", "--resource", context.resourceId], {
      ...fixture.cliOptions,
    });
    expectCliSuccess(bindings, "list domain bindings after manual import");
    expect(
      findDomainBinding({
        domainBindingId,
        items: parseJson<{
          items: Array<{
            id: string;
            domainName: string;
            resourceId: string;
            status: string;
            verificationAttemptCount: number;
          }>;
        }>(bindings.stdout).items,
      }).status,
    ).toBe("ready");
  }, 90000);

  test("[CERT-IMPORT-ENTRY-002][CERT-IMPORT-EVT-001] HTTP imports a manual certificate and the binding becomes ready", async () => {
    const suffix = crypto.randomUUID().slice(0, 6);
    const context = fixture.deployWorkspaceResource({
      appPort: 5300 + Math.floor(Math.random() * 100),
      suffix,
    });
    const httpServer = await startShellHttpServer(fixture.cliOptions);
    const certificateChain = await Bun.file(certificateChainFixture).text();
    const privateKey = await Bun.file(privateKeyFixture).text();

    try {
      const created = await fetch(`${httpServer.baseUrl}/api/domain-bindings`, {
        body: JSON.stringify({
          destinationId: context.destinationId,
          domainName: "api.manual.example.test",
          environmentId: context.environmentId,
          pathPrefix: "/",
          projectId: context.projectId,
          proxyKind: "traefik",
          resourceId: context.resourceId,
          serverId: context.serverId,
          tlsMode: "auto",
          certificatePolicy: "manual",
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

      const imported = await fetch(`${httpServer.baseUrl}/api/certificates/import`, {
        body: JSON.stringify({
          domainBindingId,
          certificateChain,
          privateKey,
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      expect(imported.status).toBe(200);
      const certificateResult = (await imported.json()) as {
        attemptId: string;
        certificateId: string;
      };
      expect(certificateResult).toEqual({
        attemptId: expect.stringMatching(/^cat_/),
        certificateId: expect.stringMatching(/^crt_/),
      });

      const listed = await fetch(
        `${httpServer.baseUrl}/api/certificates?domainBindingId=${domainBindingId}`,
      );
      expect(listed.status).toBe(200);
      const certificate = findCertificate({
        certificateId: certificateResult.certificateId,
        items: ((await listed.json()) as CertificateListResponse).items,
      });

      expectImportedCertificate({
        certificate,
        domainBindingId,
        domainName: "api.manual.example.test",
        attemptId: certificateResult.attemptId,
      });

      const bindings = await fetch(
        `${httpServer.baseUrl}/api/domain-bindings?resourceId=${context.resourceId}`,
      );
      expect(bindings.status).toBe(200);
      expect(
        findDomainBinding({
          domainBindingId,
          items: (
            (await bindings.json()) as {
              items: Array<{
                id: string;
                domainName: string;
                resourceId: string;
                status: string;
                verificationAttemptCount: number;
              }>;
            }
          ).items,
        }).status,
      ).toBe("ready");
    } finally {
      await httpServer.stop();
    }
  }, 90000);
});

async function expectImportedSecretsPersisted(
  pgliteDataDir: string,
  certificateId: string,
  attemptId: string,
): Promise<void> {
  const { createDatabase } = await import("@appaloft/persistence-pg");
  const database = await createDatabase({
    driver: "pglite",
    pgliteDataDir,
  });

  try {
    const rows = await database.db
      .selectFrom("certificate_secrets")
      .select(["ref", "source", "kind", "certificate_id", "attempt_id"])
      .where("certificate_id", "=", certificateId)
      .orderBy("kind")
      .execute();

    expect(rows as CertificateSecretRow[]).toEqual([
      {
        ref: `appaloft+pg://certificate/${certificateId}/${attemptId}/certificate-chain`,
        source: "imported",
        kind: "certificate-chain",
        certificate_id: certificateId,
        attempt_id: attemptId,
      },
      {
        ref: `appaloft+pg://certificate/${certificateId}/${attemptId}/private-key`,
        source: "imported",
        kind: "private-key",
        certificate_id: certificateId,
        attempt_id: attemptId,
      },
    ]);
  } finally {
    await database.close();
  }
}

function createConfirmedManualBinding(input: {
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
      "--certificate-policy",
      "manual",
    ],
    input.options,
  );
  expectCliSuccess(created, "create manual-policy domain binding through CLI");
  const domainBindingId = parseJson<{ id: string }>(created.stdout).id;

  const confirmed = runShellCli(
    ["domain-binding", "confirm-ownership", domainBindingId, "--verification-mode", "manual"],
    input.options,
  );
  expectCliSuccess(confirmed, "confirm manual-policy domain ownership through CLI");

  return domainBindingId;
}

function expectImportedCertificate(input: {
  certificate: CertificateSummary;
  domainBindingId: string;
  domainName: string;
  attemptId: string;
}): void {
  expect(input.certificate).toEqual(
    expect.objectContaining({
      challengeType: "manual-import",
      domainBindingId: input.domainBindingId,
      domainName: input.domainName,
      source: "imported",
      providerKey: "manual-import",
      status: "active",
      keyAlgorithm: "rsa",
      issuer: expect.stringContaining("manual.example.test"),
      subjectAlternativeNames: ["manual.example.test", "api.manual.example.test"],
      latestAttempt: expect.objectContaining({
        id: input.attemptId,
        reason: "issue",
        status: "issued",
      }),
    }),
  );
  expect(input.certificate.notBefore).toBe("2026-04-21T03:33:32.000Z");
  expect(input.certificate.expiresAt).toBe("2027-04-21T03:33:32.000Z");
  expect(input.certificate.fingerprint).toMatch(/^([A-F0-9]{2}:){31}[A-F0-9]{2}$/);
}
