import { X509Certificate } from "node:crypto";
import {
  type CertificateHttpChallengeToken,
  type CertificateHttpChallengeTokenStore,
  type CertificateProviderIssueInput,
  type CertificateProviderIssueResult,
  type CertificateProviderPort,
  type ExecutionContext,
  type ProviderDescriptor,
} from "@appaloft/application";
import { type DomainError, err, ok, type Result } from "@appaloft/core";
import acme from "acme-client";

const providerKey = "acme";
const http01ChallengeType = "http-01";
const defaultChallengeTokenTtlMs = 10 * 60 * 1000;
const defaultDirectoryUrl = "https://acme-staging-v02.api.letsencrypt.org/directory";

type ErrorDetails = Record<string, string | number | boolean | null>;

export const acmeCertificateProvider: ProviderDescriptor = {
  key: providerKey,
  title: "ACME Certificate Provider",
  category: "infra-service",
  capabilities: ["certificate-issuance", "http-01", "acme-account", "acme-order"],
};

export interface AcmeHttpChallenge {
  domainName: string;
  type: "http-01";
  token: string;
  keyAuthorization: string;
}

export interface AcmeCertificateRequest {
  privateKeyPem: string;
  csrPem: string;
}

export interface AcmeIssuedCertificate {
  certificatePem: string;
  certificateChainPem?: string;
  expiresAt?: string;
  fingerprint?: string;
}

export interface AcmeIssueCertificateInput {
  csrPem: string;
  email: string;
  termsOfServiceAgreed: boolean;
  skipChallengeVerification: boolean;
  challengeCreate(input: AcmeHttpChallenge): Promise<void>;
  challengeRemove(input: AcmeHttpChallenge): Promise<void>;
}

export interface AcmeClientDriver {
  createCertificateRequest(input: { domainName: string }): Promise<AcmeCertificateRequest>;
  issueCertificate(input: AcmeIssueCertificateInput): Promise<AcmeIssuedCertificate>;
}

export interface AcmeCertificateProviderOptions {
  directoryUrl?: string;
  accountPrivateKeyPem: string;
  email: string;
  termsOfServiceAgreed: boolean;
  skipChallengeVerification?: boolean;
  challengeStore: CertificateHttpChallengeTokenStore;
  challengeTokenTtlMs?: number;
  now?: () => string;
  driver?: AcmeClientDriver;
}

type AcmeLibraryClient = {
  auto(input: {
    csr: string;
    email: string;
    termsOfServiceAgreed: boolean;
    skipChallengeVerification: boolean;
    challengePriority: string[];
    challengeCreateFn(
      authorization: unknown,
      challenge: unknown,
      keyAuthorization: string,
    ): Promise<void>;
    challengeRemoveFn(
      authorization: unknown,
      challenge: unknown,
      keyAuthorization: string,
    ): Promise<void>;
  }): Promise<unknown>;
};

type AcmeLibrary = {
  Client: new (input: { directoryUrl: string; accountKey: string }) => AcmeLibraryClient;
  crypto: {
    createCsr(input: { commonName: string; altNames: string[] }): Promise<[unknown, unknown]>;
  };
};

class AcmeProviderDomainError extends Error {
  constructor(readonly domainError: DomainError) {
    super(domainError.message);
  }
}

class AcmeDriverError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly phase: "challenge-preparation" | "provider-request" | "domain-validation",
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

function certificateError(input: {
  code: string;
  message: string;
  phase: "challenge-preparation" | "provider-request" | "domain-validation";
  retryable: boolean;
  details: ErrorDetails;
}): DomainError {
  return {
    code: input.code,
    category: input.phase === "challenge-preparation" ? "user" : "provider",
    message: input.message,
    retryable: input.retryable,
    details: {
      ...input.details,
      phase: input.phase,
      providerKey,
    },
  };
}

function errorDetails(input: CertificateProviderIssueInput): ErrorDetails {
  return {
    certificateId: input.certificateId,
    attemptId: input.attemptId,
    domainBindingId: input.domainBindingId,
    domainName: input.domainName,
  };
}

function readErrorMessage(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return String(error);
}

function safeProviderMessage(error: unknown): string {
  return readErrorMessage(error).replace(/\s+/g, " ").slice(0, 240);
}

function unsupportedChallengeError(input: CertificateProviderIssueInput): DomainError {
  return certificateError({
    code: "certificate_challenge_preparation_failed",
    message: "ACME certificate provider only supports http-01 challenges",
    phase: "challenge-preparation",
    retryable: false,
    details: {
      ...errorDetails(input),
      challengeType: input.challengeType,
    },
  });
}

function missingConfigurationError(input: CertificateProviderIssueInput): DomainError {
  return certificateError({
    code: "certificate_provider_unavailable",
    message: "ACME certificate provider is not fully configured",
    phase: "provider-request",
    retryable: true,
    details: errorDetails(input),
  });
}

function classifyAcmeError(error: unknown, input: CertificateProviderIssueInput): DomainError {
  if (error instanceof AcmeProviderDomainError) {
    return error.domainError;
  }

  if (error instanceof AcmeDriverError) {
    return certificateError({
      code: error.code,
      message: error.message,
      phase: error.phase,
      retryable: error.retryable,
      details: errorDetails(input),
    });
  }

  const providerMessage = safeProviderMessage(error);
  const normalized = providerMessage.toLowerCase();

  if (normalized.includes("rate") || normalized.includes("429")) {
    return certificateError({
      code: "certificate_rate_limited",
      message: "ACME provider rate limited the certificate request",
      phase: "provider-request",
      retryable: true,
      details: {
        ...errorDetails(input),
        providerError: providerMessage,
      },
    });
  }

  if (
    normalized.includes("challenge") ||
    normalized.includes("authorization") ||
    normalized.includes("unauthorized") ||
    normalized.includes("invalid response")
  ) {
    return certificateError({
      code: "certificate_challenge_failed",
      message: "ACME provider could not validate the HTTP-01 challenge",
      phase: "domain-validation",
      retryable: false,
      details: {
        ...errorDetails(input),
        providerError: providerMessage,
      },
    });
  }

  return certificateError({
    code: "certificate_provider_unavailable",
    message: "ACME provider request failed",
    phase: "provider-request",
    retryable: true,
    details: {
      ...errorDetails(input),
      providerError: providerMessage,
    },
  });
}

function pemText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new TextDecoder().decode(value);
  }

  if (value instanceof Uint8Array) {
    return new TextDecoder().decode(value);
  }

  return String(value);
}

function objectRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function textField(value: unknown, field: string): string | null {
  const record = objectRecord(value);
  const text = record?.[field];
  return typeof text === "string" && text.length > 0 ? text : null;
}

function readAcmeChallenge(input: {
  authorization: unknown;
  challenge: unknown;
  keyAuthorization: string;
}): AcmeHttpChallenge {
  const authorization = objectRecord(input.authorization);
  const identifier = objectRecord(authorization?.identifier);
  const domainName = textField(identifier, "value");
  const challengeType = textField(input.challenge, "type");
  const token = textField(input.challenge, "token");

  if (challengeType !== http01ChallengeType || !domainName || !token) {
    throw new AcmeDriverError(
      "ACME challenge callback did not include an http-01 domain and token",
      "certificate_challenge_preparation_failed",
      "challenge-preparation",
      false,
    );
  }

  return {
    domainName: domainName.toLowerCase(),
    type: http01ChallengeType,
    token,
    keyAuthorization: input.keyAuthorization,
  };
}

function pemBlocks(pem: string): string[] {
  return (
    pem
      .match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g)
      ?.map((block) => block.trim()) ?? []
  );
}

function resolveCertificateMetadata(issued: AcmeIssuedCertificate): Result<
  {
    leafCertificatePem: string;
    certificateChainPem?: string;
    expiresAt: string;
    fingerprint?: string;
  },
  DomainError
> {
  const blocks = pemBlocks(issued.certificatePem);
  const leafCertificatePem = blocks[0] ?? issued.certificatePem;
  const certificateChainPem =
    issued.certificateChainPem ?? (blocks.length > 1 ? blocks.slice(1).join("\n") : undefined);

  if (issued.expiresAt) {
    return ok({
      leafCertificatePem,
      ...(certificateChainPem ? { certificateChainPem } : {}),
      expiresAt: issued.expiresAt,
      ...(issued.fingerprint ? { fingerprint: issued.fingerprint } : {}),
    });
  }

  try {
    const certificate = new X509Certificate(leafCertificatePem);
    return ok({
      leafCertificatePem,
      ...(certificateChainPem ? { certificateChainPem } : {}),
      expiresAt: new Date(certificate.validTo).toISOString(),
      fingerprint: issued.fingerprint ?? certificate.fingerprint256,
    });
  } catch {
    return err(
      certificateError({
        code: "certificate_provider_unavailable",
        message: "ACME provider returned certificate material without parseable expiry",
        phase: "provider-request",
        retryable: true,
        details: {
          providerKey,
        },
      }),
    );
  }
}

export class AcmeClientCertificateDriver implements AcmeClientDriver {
  private readonly acmeLibrary = acme as unknown as AcmeLibrary;

  constructor(
    private readonly options: {
      directoryUrl: string;
      accountPrivateKeyPem: string;
    },
  ) {}

  async createCertificateRequest(input: { domainName: string }): Promise<AcmeCertificateRequest> {
    const [privateKey, csr] = await this.acmeLibrary.crypto.createCsr({
      commonName: input.domainName,
      altNames: [input.domainName],
    });

    return {
      privateKeyPem: pemText(privateKey),
      csrPem: pemText(csr),
    };
  }

  async issueCertificate(input: AcmeIssueCertificateInput): Promise<AcmeIssuedCertificate> {
    const client = new this.acmeLibrary.Client({
      directoryUrl: this.options.directoryUrl,
      accountKey: this.options.accountPrivateKeyPem,
    });
    const certificate = await client.auto({
      csr: input.csrPem,
      email: input.email,
      termsOfServiceAgreed: input.termsOfServiceAgreed,
      skipChallengeVerification: input.skipChallengeVerification,
      challengePriority: [http01ChallengeType],
      challengeCreateFn: async (authorization, challenge, keyAuthorization) => {
        await input.challengeCreate(
          readAcmeChallenge({ authorization, challenge, keyAuthorization }),
        );
      },
      challengeRemoveFn: async (authorization, challenge, keyAuthorization) => {
        await input.challengeRemove(
          readAcmeChallenge({ authorization, challenge, keyAuthorization }),
        );
      },
    });

    return {
      certificatePem: pemText(certificate),
    };
  }
}

export class AcmeCertificateProvider implements CertificateProviderPort {
  private readonly directoryUrl: string;
  private readonly challengeTokenTtlMs: number;
  private readonly now: () => string;
  private readonly driver: AcmeClientDriver;

  constructor(private readonly options: AcmeCertificateProviderOptions) {
    this.directoryUrl = options.directoryUrl ?? defaultDirectoryUrl;
    this.challengeTokenTtlMs = options.challengeTokenTtlMs ?? defaultChallengeTokenTtlMs;
    this.now = options.now ?? (() => new Date().toISOString());
    this.driver =
      options.driver ??
      new AcmeClientCertificateDriver({
        directoryUrl: this.directoryUrl,
        accountPrivateKeyPem: options.accountPrivateKeyPem,
      });
  }

  async issue(
    context: ExecutionContext,
    input: CertificateProviderIssueInput,
  ): Promise<Result<CertificateProviderIssueResult, DomainError>> {
    if (input.providerKey !== providerKey) {
      return err(missingConfigurationError(input));
    }

    if (input.challengeType !== http01ChallengeType) {
      return err(unsupportedChallengeError(input));
    }

    if (
      !this.options.accountPrivateKeyPem.trim() ||
      !this.options.email.trim() ||
      !this.options.termsOfServiceAgreed
    ) {
      return err(missingConfigurationError(input));
    }

    const publishedChallenges = new Map<string, AcmeHttpChallenge>();

    try {
      const certificateRequest = await this.driver.createCertificateRequest({
        domainName: input.domainName,
      });
      const issued = await this.driver.issueCertificate({
        csrPem: certificateRequest.csrPem,
        email: this.options.email,
        termsOfServiceAgreed: this.options.termsOfServiceAgreed,
        skipChallengeVerification: this.options.skipChallengeVerification ?? false,
        challengeCreate: async (challenge) => {
          await this.publishChallenge(context, input, challenge);
          publishedChallenges.set(this.challengeKey(challenge), challenge);
        },
        challengeRemove: async (challenge) => {
          await this.removeChallenge(context, input, challenge);
          publishedChallenges.delete(this.challengeKey(challenge));
        },
      });
      const metadata = resolveCertificateMetadata(issued);

      if (metadata.isErr()) {
        return err({
          ...metadata.error,
          details: {
            ...errorDetails(input),
            ...(metadata.error.details ?? {}),
          },
        });
      }

      const resolvedMetadata = metadata.value;
      return ok({
        certificateId: input.certificateId,
        domainBindingId: input.domainBindingId,
        domainName: input.domainName,
        attemptId: input.attemptId,
        providerKey,
        issuedAt: this.now(),
        expiresAt: resolvedMetadata.expiresAt,
        ...(resolvedMetadata.fingerprint ? { fingerprint: resolvedMetadata.fingerprint } : {}),
        certificatePem: resolvedMetadata.leafCertificatePem,
        privateKeyPem: certificateRequest.privateKeyPem,
        ...(resolvedMetadata.certificateChainPem
          ? { certificateChainPem: resolvedMetadata.certificateChainPem }
          : {}),
      });
    } catch (error) {
      return err(classifyAcmeError(error, input));
    } finally {
      await this.cleanupChallenges(context, [...publishedChallenges.values()]);
    }
  }

  private async publishChallenge(
    context: ExecutionContext,
    input: CertificateProviderIssueInput,
    challenge: AcmeHttpChallenge,
  ): Promise<void> {
    const publishedAt = this.now();
    const expiresAt = new Date(Date.parse(publishedAt) + this.challengeTokenTtlMs).toISOString();
    const token: CertificateHttpChallengeToken = {
      domainName: challenge.domainName,
      token: challenge.token,
      keyAuthorization: challenge.keyAuthorization,
      publishedAt,
      expiresAt,
      certificateId: input.certificateId,
      attemptId: input.attemptId,
      providerKey,
    };
    const result = await this.options.challengeStore.publish(context, token);

    if (result.isErr()) {
      throw new AcmeProviderDomainError(result.error);
    }
  }

  private async removeChallenge(
    context: ExecutionContext,
    input: CertificateProviderIssueInput,
    challenge: AcmeHttpChallenge,
  ): Promise<void> {
    const result = await this.options.challengeStore.remove(context, {
      domainName: challenge.domainName,
      token: challenge.token,
    });

    if (result.isErr()) {
      throw new AcmeProviderDomainError({
        ...result.error,
        details: {
          ...errorDetails(input),
          ...(result.error.details ?? {}),
        },
      });
    }
  }

  private async cleanupChallenges(
    context: ExecutionContext,
    challenges: AcmeHttpChallenge[],
  ): Promise<void> {
    for (const challenge of challenges) {
      await this.options.challengeStore.remove(context, {
        domainName: challenge.domainName,
        token: challenge.token,
      });
    }
  }

  private challengeKey(challenge: AcmeHttpChallenge): string {
    return `${challenge.domainName}:${challenge.token}`;
  }
}
