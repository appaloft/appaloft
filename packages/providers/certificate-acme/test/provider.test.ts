import { describe, expect, test } from "bun:test";
import {
  type CertificateHttpChallengeToken,
  type CertificateHttpChallengeTokenStore,
  createExecutionContext,
  type ExecutionContext,
} from "@yundu/application";
import { ok, type Result } from "@yundu/core";
import {
  AcmeCertificateProvider,
  type AcmeClientDriver,
  type AcmeHttpChallenge,
  acmeCertificateProvider,
} from "../src";

class MemoryChallengeStore implements CertificateHttpChallengeTokenStore {
  readonly published: CertificateHttpChallengeToken[] = [];
  readonly removed: Array<{ domainName: string; token: string }> = [];
  private readonly tokens = new Map<string, CertificateHttpChallengeToken>();

  async publish(
    _context: ExecutionContext,
    token: CertificateHttpChallengeToken,
  ): Promise<Result<CertificateHttpChallengeToken>> {
    this.published.push(token);
    this.tokens.set(this.key(token.domainName, token.token), token);
    return ok(token);
  }

  async find(
    _context: ExecutionContext,
    input: { token: string; domainName: string },
  ): Promise<Result<CertificateHttpChallengeToken | null>> {
    return ok(this.tokens.get(this.key(input.domainName, input.token)) ?? null);
  }

  async remove(
    _context: ExecutionContext,
    input: { token: string; domainName: string },
  ): Promise<Result<void>> {
    this.removed.push(input);
    this.tokens.delete(this.key(input.domainName, input.token));
    return ok(undefined);
  }

  private key(domainName: string, token: string): string {
    return `${domainName}:${token}`;
  }
}

class FakeAcmeDriver implements AcmeClientDriver {
  createCalls = 0;
  issueCalls = 0;

  async createCertificateRequest(): Promise<{ privateKeyPem: string; csrPem: string }> {
    this.createCalls += 1;
    return {
      privateKeyPem: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
      csrPem: "-----BEGIN CERTIFICATE REQUEST-----\nfake\n-----END CERTIFICATE REQUEST-----",
    };
  }

  async issueCertificate(input: {
    challengeCreate(challenge: AcmeHttpChallenge): Promise<void>;
    challengeRemove(challenge: AcmeHttpChallenge): Promise<void>;
  }): Promise<{
    certificatePem: string;
    expiresAt: string;
    fingerprint: string;
  }> {
    this.issueCalls += 1;
    const challenge: AcmeHttpChallenge = {
      domainName: "app.example.com",
      type: "http-01",
      token: "token-123",
      keyAuthorization: "token-123.thumbprint",
    };
    await input.challengeCreate(challenge);
    await input.challengeRemove(challenge);

    return {
      certificatePem: "-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----",
      expiresAt: "2026-07-01T00:00:00.000Z",
      fingerprint: "sha256:fingerprint",
    };
  }
}

const issueInput = {
  certificateId: "crt_test",
  domainBindingId: "dmb_test",
  domainName: "app.example.com",
  attemptId: "cat_test",
  reason: "issue" as const,
  providerKey: "acme",
  challengeType: "http-01",
  requestedAt: "2026-04-16T00:00:00.000Z",
};

const context = createExecutionContext({
  entrypoint: "system",
  requestId: "req_test",
});

describe("ACME certificate provider", () => {
  test("[ROUTE-TLS-PROVIDER-001] exports an infra-service provider descriptor", () => {
    expect(acmeCertificateProvider).toEqual({
      key: "acme",
      title: "ACME Certificate Provider",
      category: "infra-service",
      capabilities: ["certificate-issuance", "http-01", "acme-account", "acme-order"],
    });
  });

  test("[ROUTE-TLS-PROVIDER-002] publishes and removes HTTP-01 challenges around issuance", async () => {
    const challengeStore = new MemoryChallengeStore();
    const driver = new FakeAcmeDriver();
    const provider = new AcmeCertificateProvider({
      accountPrivateKeyPem: "-----BEGIN PRIVATE KEY-----\naccount\n-----END PRIVATE KEY-----",
      email: "ops@example.com",
      termsOfServiceAgreed: true,
      challengeStore,
      driver,
      now: () => "2026-04-16T00:00:00.000Z",
    });

    const result = await provider.issue(context, issueInput);

    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap()).toEqual({
      certificateId: "crt_test",
      domainBindingId: "dmb_test",
      domainName: "app.example.com",
      attemptId: "cat_test",
      providerKey: "acme",
      issuedAt: "2026-04-16T00:00:00.000Z",
      expiresAt: "2026-07-01T00:00:00.000Z",
      fingerprint: "sha256:fingerprint",
      certificatePem: "-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----",
      privateKeyPem: "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
    });
    expect(driver.createCalls).toBe(1);
    expect(driver.issueCalls).toBe(1);
    expect(challengeStore.published).toEqual([
      expect.objectContaining({
        domainName: "app.example.com",
        token: "token-123",
        keyAuthorization: "token-123.thumbprint",
        certificateId: "crt_test",
        attemptId: "cat_test",
        providerKey: "acme",
      }),
    ]);
    expect(challengeStore.removed).toEqual([
      {
        domainName: "app.example.com",
        token: "token-123",
      },
    ]);
  });

  test("[ROUTE-TLS-PROVIDER-003] rejects unsupported challenge types before driver calls", async () => {
    const challengeStore = new MemoryChallengeStore();
    const driver = new FakeAcmeDriver();
    const provider = new AcmeCertificateProvider({
      accountPrivateKeyPem: "-----BEGIN PRIVATE KEY-----\naccount\n-----END PRIVATE KEY-----",
      email: "ops@example.com",
      termsOfServiceAgreed: true,
      challengeStore,
      driver,
    });

    const result = await provider.issue(context, {
      ...issueInput,
      challengeType: "dns-01",
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "certificate_challenge_preparation_failed",
      retryable: false,
      details: {
        phase: "challenge-preparation",
        providerKey: "acme",
        challengeType: "dns-01",
      },
    });
    expect(driver.createCalls).toBe(0);
    expect(driver.issueCalls).toBe(0);
  });
});
