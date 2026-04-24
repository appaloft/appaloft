import {
  type DomainError,
  domainError,
  err,
  ok,
  type Result,
  SshCredentialByIdSpec,
  SshCredentialId,
  UnusedSshCredentialByIdSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type SshCredentialReadModel,
  type SshCredentialRepository,
  type SshCredentialSummary,
  type SshCredentialUsageReader,
  type SshCredentialUsageServerSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import { type DeleteSshCredentialCommandInput } from "./delete-ssh-credential.command";

const deleteCommandName = "credentials.delete-ssh";

interface DeleteSshCredentialUsage {
  totalServers: number;
  activeServers: number;
  inactiveServers: number;
}

function withDeleteSshCredentialDetails(
  error: DomainError,
  details: Record<string, string | number | boolean | null | readonly string[]>,
): DomainError {
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      commandName: deleteCommandName,
      ...details,
    },
  };
}

function credentialNotFound(credentialId: string): DomainError {
  return withDeleteSshCredentialDetails(domainError.notFound("SSH credential", credentialId), {
    phase: "credential-read",
    credentialId,
  });
}

function confirmationMismatchError(input: {
  credentialId: string;
  confirmationCredentialId: string;
}): DomainError {
  return domainError.validation("SSH credential id confirmation does not match", {
    commandName: deleteCommandName,
    phase: "command-validation",
    credentialId: input.credentialId,
    expectedCredentialId: input.credentialId,
    actualCredentialId: input.confirmationCredentialId,
  });
}

function credentialInfraError(input: {
  credentialId: string;
  phase: "credential-read" | "credential-usage-read" | "credential-mutation";
  error: unknown;
}): DomainError {
  return {
    ...domainError.infra("SSH credential could not be safely deleted", {
      commandName: deleteCommandName,
      phase: input.phase,
      credentialId: input.credentialId,
      reason: input.error instanceof Error ? input.error.message : "unknown",
    }),
    retryable: true,
  };
}

function buildUsageSummary(
  usageServers: SshCredentialUsageServerSummary[],
): DeleteSshCredentialUsage {
  return {
    totalServers: usageServers.length,
    activeServers: usageServers.filter((server) => server.lifecycleStatus === "active").length,
    inactiveServers: usageServers.filter((server) => server.lifecycleStatus === "inactive").length,
  };
}

function credentialInUseError(input: {
  credentialId: string;
  usage: DeleteSshCredentialUsage;
  serverIds?: readonly string[];
}): DomainError {
  return {
    ...domainError.conflict("SSH credential is still used by visible servers", {
      commandName: deleteCommandName,
      phase: "credential-safety-check",
      credentialId: input.credentialId,
      totalServers: input.usage.totalServers,
      activeServers: input.usage.activeServers,
      inactiveServers: input.usage.inactiveServers,
      ...(input.serverIds && input.serverIds.length > 0 ? { serverIds: input.serverIds } : {}),
    }),
    code: "credential_in_use",
  };
}

async function readUsageServers(input: {
  usageReader: SshCredentialUsageReader;
  context: ReturnType<typeof toRepositoryContext>;
  credentialId: string;
}): Promise<Result<SshCredentialUsageServerSummary[]>> {
  try {
    return ok(await input.usageReader.listByCredentialId(input.context, input.credentialId));
  } catch (error) {
    return err(
      credentialInfraError({
        credentialId: input.credentialId,
        phase: "credential-usage-read",
        error,
      }),
    );
  }
}

@injectable()
export class DeleteSshCredentialUseCase {
  constructor(
    @inject(tokens.sshCredentialReadModel)
    private readonly readModel: SshCredentialReadModel,
    @inject(tokens.sshCredentialUsageReader)
    private readonly usageReader: SshCredentialUsageReader,
    @inject(tokens.sshCredentialRepository)
    private readonly repository: SshCredentialRepository,
  ) {}

  async execute(
    context: ExecutionContext,
    input: DeleteSshCredentialCommandInput,
  ): Promise<Result<{ id: string }>> {
    const credentialIdResult = SshCredentialId.create(input.credentialId);
    if (credentialIdResult.isErr()) {
      return err(
        withDeleteSshCredentialDetails(credentialIdResult.error, {
          phase: "command-validation",
          credentialId: input.credentialId,
        }),
      );
    }

    const confirmationCredentialIdResult = SshCredentialId.create(input.confirmation.credentialId);
    if (confirmationCredentialIdResult.isErr()) {
      return err(
        withDeleteSshCredentialDetails(confirmationCredentialIdResult.error, {
          phase: "command-validation",
          credentialId: credentialIdResult.value.value,
        }),
      );
    }

    const repositoryContext = toRepositoryContext(context);
    const credentialSpec = SshCredentialByIdSpec.create(credentialIdResult.value);
    const unusedCredentialSpec = UnusedSshCredentialByIdSpec.create(credentialIdResult.value);

    let credential: SshCredentialSummary | null;
    try {
      credential = await this.readModel.findOne(repositoryContext, credentialSpec);
    } catch (error) {
      return err(
        credentialInfraError({
          credentialId: credentialIdResult.value.value,
          phase: "credential-read",
          error,
        }),
      );
    }

    if (!credential) {
      return err(credentialNotFound(credentialIdResult.value.value));
    }

    if (!confirmationCredentialIdResult.value.equals(credentialIdResult.value)) {
      return err(
        confirmationMismatchError({
          credentialId: credentialIdResult.value.value,
          confirmationCredentialId: confirmationCredentialIdResult.value.value,
        }),
      );
    }

    const usageResult = await readUsageServers({
      usageReader: this.usageReader,
      context: repositoryContext,
      credentialId: credentialIdResult.value.value,
    });
    if (usageResult.isErr()) {
      return err(usageResult.error);
    }
    const usageServers = usageResult.value;

    if (usageServers.length > 0) {
      return err(
        credentialInUseError({
          credentialId: credentialIdResult.value.value,
          usage: buildUsageSummary(usageServers),
          serverIds: usageServers.map((server) => server.serverId),
        }),
      );
    }

    try {
      const deleted = await this.repository.deleteOne(repositoryContext, unusedCredentialSpec);

      if (deleted) {
        return ok({ id: credentialIdResult.value.value });
      }

      const postDeleteUsageResult = await readUsageServers({
        usageReader: this.usageReader,
        context: repositoryContext,
        credentialId: credentialIdResult.value.value,
      });
      if (postDeleteUsageResult.isErr()) {
        return err(postDeleteUsageResult.error);
      }
      if (postDeleteUsageResult.value.length > 0) {
        return err(
          credentialInUseError({
            credentialId: credentialIdResult.value.value,
            usage: buildUsageSummary(postDeleteUsageResult.value),
            serverIds: postDeleteUsageResult.value.map((server) => server.serverId),
          }),
        );
      }

      const postDeleteCredential = await this.readModel.findOne(repositoryContext, credentialSpec);
      if (!postDeleteCredential) {
        return err(credentialNotFound(credentialIdResult.value.value));
      }

      return err(
        credentialInfraError({
          credentialId: credentialIdResult.value.value,
          phase: "credential-mutation",
          error: new Error("deleteOne did not remove an existing unused SSH credential"),
        }),
      );
    } catch (error) {
      return err(
        credentialInfraError({
          credentialId: credentialIdResult.value.value,
          phase: "credential-mutation",
          error,
        }),
      );
    }
  }
}
