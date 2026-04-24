import {
  type DomainError,
  domainError,
  err,
  ok,
  type Result,
  SshCredentialByIdSpec,
  SshCredentialId,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type SshCredentialDetail,
  type SshCredentialReadModel,
  type SshCredentialSummary,
  type SshCredentialUsageReader,
  type SshCredentialUsageServerSummary,
  type SshCredentialUsageSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ShowSshCredentialQuery } from "./show-ssh-credential.query";

function withShowSshCredentialDetails(
  error: DomainError,
  details: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      queryName: "credentials.show",
      ...details,
    },
  };
}

function credentialReadNotFound(credentialId: string): DomainError {
  return withShowSshCredentialDetails(domainError.notFound("SSH credential", credentialId), {
    phase: "credential-read",
    credentialId,
  });
}

function credentialReadInfraError(
  credentialId: string,
  phase: "credential-read" | "credential-usage-read",
  error: unknown,
): DomainError {
  return {
    ...domainError.infra("SSH credential detail could not be assembled", {
      queryName: "credentials.show",
      phase,
      credentialId,
      reason: error instanceof Error ? error.message : "unknown",
    }),
    retryable: true,
  };
}

function buildUsage(servers: SshCredentialUsageServerSummary[]): SshCredentialUsageSummary {
  return {
    totalServers: servers.length,
    activeServers: servers.filter((server) => server.lifecycleStatus === "active").length,
    inactiveServers: servers.filter((server) => server.lifecycleStatus === "inactive").length,
    servers,
  };
}

function maskCredential(credential: SshCredentialSummary): SshCredentialSummary {
  return {
    id: credential.id,
    name: credential.name,
    kind: credential.kind,
    ...(credential.username ? { username: credential.username } : {}),
    publicKeyConfigured: credential.publicKeyConfigured,
    privateKeyConfigured: credential.privateKeyConfigured,
    createdAt: credential.createdAt,
  };
}

@injectable()
export class ShowSshCredentialQueryService {
  constructor(
    @inject(tokens.sshCredentialReadModel)
    private readonly readModel: SshCredentialReadModel,
    @inject(tokens.sshCredentialUsageReader)
    private readonly usageReader: SshCredentialUsageReader,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ShowSshCredentialQuery,
  ): Promise<Result<SshCredentialDetail>> {
    const credentialIdResult = SshCredentialId.create(query.credentialId);
    if (credentialIdResult.isErr()) {
      return err(
        withShowSshCredentialDetails(credentialIdResult.error, {
          phase: "query-validation",
          credentialId: query.credentialId,
        }),
      );
    }

    const repositoryContext = toRepositoryContext(context);

    try {
      const credential = await this.readModel.findOne(
        repositoryContext,
        SshCredentialByIdSpec.create(credentialIdResult.value),
      );

      if (!credential) {
        return err(credentialReadNotFound(query.credentialId));
      }

      if (!query.includeUsage) {
        return ok({
          schemaVersion: "credentials.show/v1",
          credential: maskCredential(credential),
          generatedAt: this.clock.now(),
        });
      }

      try {
        const usageServers = await this.usageReader.listByCredentialId(
          repositoryContext,
          query.credentialId,
        );

        return ok({
          schemaVersion: "credentials.show/v1",
          credential: maskCredential(credential),
          usage: buildUsage(usageServers),
          generatedAt: this.clock.now(),
        });
      } catch (error) {
        return err(credentialReadInfraError(query.credentialId, "credential-usage-read", error));
      }
    } catch (error) {
      return err(credentialReadInfraError(query.credentialId, "credential-read", error));
    }
  }
}
