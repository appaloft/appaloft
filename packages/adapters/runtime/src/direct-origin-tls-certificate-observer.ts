import { X509Certificate } from "node:crypto";
import { connect } from "node:tls";

import {
  type ExecutionContext,
  type RepositoryContext,
  type ServerRepository,
  type TlsCertificateObservation,
  type TlsCertificateObservationInput,
  type TlsCertificateObserver,
  toRepositoryContext,
} from "@appaloft/application";
import {
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  type DomainError,
  domainError,
  err,
  ok,
  type Result,
} from "@appaloft/core";

export interface DirectOriginTlsProbeInput {
  host: string;
  port: number;
  serverName: string;
  timeoutMs: number;
}

export type DirectOriginTlsProbe = (
  input: DirectOriginTlsProbeInput,
) => Promise<Result<TlsCertificateObservation, DomainError>>;

function dnsNames(subjectAlternativeName: string | undefined): string[] {
  return (subjectAlternativeName?.match(/DNS:([^,\n]+)/g) ?? []).map((item) =>
    item.slice("DNS:".length).trim().toLowerCase(),
  );
}

export const probeDirectOriginTls: DirectOriginTlsProbe = async (input) =>
  new Promise((resolve) => {
    let settled = false;
    const finish = (result: Result<TlsCertificateObservation, DomainError>): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    const socket = connect({
      host: input.host,
      port: input.port,
      servername: input.serverName,
      rejectUnauthorized: false,
    });
    socket.setTimeout(input.timeoutMs);
    socket.once("secureConnect", () => {
      try {
        const peer = socket.getPeerCertificate(true);
        if (!peer.raw) {
          finish(
            err(
              domainError.certificateRouteReconciliationFailed(
                "Direct-origin TLS probe did not receive a peer certificate",
                { phase: "tls-certificate-proof" },
              ),
            ),
          );
          return;
        }
        const certificate = new X509Certificate(peer.raw);
        finish(
          ok({
            fingerprint: certificate.fingerprint256,
            subjectAlternativeNames: dnsNames(certificate.subjectAltName),
            notBefore: new Date(certificate.validFrom).toISOString(),
            expiresAt: new Date(certificate.validTo).toISOString(),
          }),
        );
      } catch {
        finish(
          err(
            domainError.certificateRouteReconciliationFailed(
              "Direct-origin TLS certificate proof could not be parsed",
              { phase: "tls-certificate-proof" },
            ),
          ),
        );
      }
    });
    socket.once("timeout", () =>
      finish(
        err(
          domainError.certificateRouteReconciliationFailed(
            "Direct-origin TLS certificate proof timed out",
            { phase: "tls-certificate-proof", retryable: true },
          ),
        ),
      ),
    );
    socket.once("error", () =>
      finish(
        err(
          domainError.certificateRouteReconciliationFailed(
            "Direct-origin TLS certificate proof failed",
            { phase: "tls-certificate-proof", retryable: true },
          ),
        ),
      ),
    );
  });

export class DirectOriginTlsCertificateObserver implements TlsCertificateObserver {
  constructor(
    private readonly servers: ServerRepository,
    private readonly probe: DirectOriginTlsProbe = probeDirectOriginTls,
    private readonly options: {
      httpsPort?: number;
      timeoutMs?: number;
      maxAttempts?: number;
      retryIntervalMs?: number;
    } = {},
  ) {}

  async observe(
    context: ExecutionContext,
    input: TlsCertificateObservationInput,
  ): Promise<Result<TlsCertificateObservation, DomainError>> {
    if (!input.serverId) {
      return err(
        domainError.certificateRouteReconciliationFailed(
          "Direct-origin TLS proof requires a deployment target",
          { phase: "tls-certificate-proof" },
        ),
      );
    }
    const serverId = DeploymentTargetId.create(input.serverId);
    if (serverId.isErr()) return err(serverId.error);
    const repositoryContext: RepositoryContext = toRepositoryContext(context);
    const server = await this.servers.findOne(
      repositoryContext,
      DeploymentTargetByIdSpec.create(serverId.value),
    );
    if (!server) {
      return err(domainError.notFound("Deployment target", input.serverId));
    }
    const state = server.toState();
    const normalizeFingerprint = (value: string) => value.replaceAll(":", "").toLowerCase();
    const expectedFingerprint = normalizeFingerprint(input.expectedFingerprint);
    const maxAttempts = Math.max(1, this.options.maxAttempts ?? 20);
    let lastResult: Result<TlsCertificateObservation, DomainError> | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      lastResult = await this.probe({
        host: state.host.value,
        port: this.options.httpsPort ?? 443,
        serverName: input.serverName,
        timeoutMs: this.options.timeoutMs ?? 10_000,
      });
      if (
        lastResult.isOk() &&
        normalizeFingerprint(lastResult.value.fingerprint) === expectedFingerprint
      ) {
        return lastResult;
      }
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, this.options.retryIntervalMs ?? 250));
      }
    }
    return (
      lastResult ??
      err(
        domainError.certificateRouteReconciliationFailed(
          "Direct-origin TLS certificate proof did not converge",
          { phase: "tls-certificate-proof", retryable: true },
        ),
      )
    );
  }
}
