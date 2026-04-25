import {
  DeploymentTargetUsername,
  type DomainError,
  domainError,
  err,
  ok,
  type Result,
  RotatedAt,
  type RotateSshCredentialInput,
  RotateSshCredentialSpec,
  SshCredentialByIdSpec,
  SshCredentialId,
  SshPrivateKeyText,
  SshPublicKeyText,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type SshCredentialReadModel,
  type SshCredentialRepository,
  type SshCredentialUsageReader,
  type SshCredentialUsageServerSummary,
  type SshCredentialUsageSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import {
  type RotateSshCredentialCommandInput,
  type RotateSshCredentialCommandOutput,
} from "./rotate-ssh-credential.command";

const rotateCommandName = "credentials.rotate-ssh";

function withRotateSshCredentialDetails(
  error: DomainError,
  details: Record<string, string | number | boolean | null | readonly string[]>,
): DomainError {
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      commandName: rotateCommandName,
      ...details,
    },
  };
}

function credentialNotFound(credentialId: string): DomainError {
  return withRotateSshCredentialDetails(domainError.notFound("SSH credential", credentialId), {
    phase: "credential-read",
    credentialId,
  });
}

function confirmationMismatchError(input: {
  credentialId: string;
  confirmationCredentialId: string;
}): DomainError {
  return domainError.validation("SSH credential id confirmation does not match", {
    commandName: rotateCommandName,
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
    ...domainError.infra("SSH credential could not be safely rotated", {
      commandName: rotateCommandName,
      phase: input.phase,
      credentialId: input.credentialId,
      reason: input.error instanceof Error ? input.error.message : "unknown",
    }),
    retryable: true,
  };
}

function buildUsageSummary(
  usageServers: SshCredentialUsageServerSummary[],
): SshCredentialUsageSummary {
  return {
    totalServers: usageServers.length,
    activeServers: usageServers.filter((server) => server.lifecycleStatus === "active").length,
    inactiveServers: usageServers.filter((server) => server.lifecycleStatus === "inactive").length,
    servers: usageServers,
  };
}

function usageAcknowledgementRequiredError(input: {
  credentialId: string;
  usage: SshCredentialUsageSummary;
  serverIds?: readonly string[];
}): DomainError {
  return {
    ...domainError.conflict("SSH credential rotation requires usage acknowledgement", {
      commandName: rotateCommandName,
      phase: "credential-safety-check",
      credentialId: input.credentialId,
      totalServers: input.usage.totalServers,
      activeServers: input.usage.activeServers,
      inactiveServers: input.usage.inactiveServers,
      ...(input.serverIds && input.serverIds.length > 0 ? { serverIds: input.serverIds } : {}),
    }),
    code: "credential_rotation_requires_usage_acknowledgement",
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
export class RotateSshCredentialUseCase {
  constructor(
    @inject(tokens.sshCredentialReadModel)
    private readonly readModel: SshCredentialReadModel,
    @inject(tokens.sshCredentialUsageReader)
    private readonly usageReader: SshCredentialUsageReader,
    @inject(tokens.sshCredentialRepository)
    private readonly repository: SshCredentialRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: RotateSshCredentialCommandInput,
  ): Promise<Result<RotateSshCredentialCommandOutput>> {
    const credentialIdResult = SshCredentialId.create(input.credentialId);
    if (credentialIdResult.isErr()) {
      return err(
        withRotateSshCredentialDetails(credentialIdResult.error, {
          phase: "command-validation",
          credentialId: input.credentialId,
        }),
      );
    }

    const privateKeyResult = SshPrivateKeyText.create(input.privateKey);
    if (privateKeyResult.isErr()) {
      return err(
        withRotateSshCredentialDetails(privateKeyResult.error, {
          phase: "command-validation",
          credentialId: credentialIdResult.value.value,
        }),
      );
    }

    let publicKey: SshPublicKeyText | null | undefined;
    if (input.publicKey !== undefined) {
      if (input.publicKey === null) {
        publicKey = null;
      } else {
        const publicKeyResult = SshPublicKeyText.create(input.publicKey);
        if (publicKeyResult.isErr()) {
          return err(
            withRotateSshCredentialDetails(publicKeyResult.error, {
              phase: "command-validation",
              credentialId: credentialIdResult.value.value,
            }),
          );
        }
        publicKey = publicKeyResult.value;
      }
    }

    let username: DeploymentTargetUsername | null | undefined;
    if (input.username !== undefined) {
      if (input.username === null) {
        username = null;
      } else {
        const usernameResult = DeploymentTargetUsername.create(input.username);
        if (usernameResult.isErr()) {
          return err(
            withRotateSshCredentialDetails(usernameResult.error, {
              phase: "command-validation",
              credentialId: credentialIdResult.value.value,
            }),
          );
        }
        username = usernameResult.value;
      }
    }

    const confirmationCredentialIdResult = SshCredentialId.create(input.confirmation.credentialId);
    if (confirmationCredentialIdResult.isErr()) {
      return err(
        withRotateSshCredentialDetails(confirmationCredentialIdResult.error, {
          phase: "command-validation",
          credentialId: credentialIdResult.value.value,
        }),
      );
    }

    const repositoryContext = toRepositoryContext(context);
    const credentialSpec = SshCredentialByIdSpec.create(credentialIdResult.value);

    try {
      const credential = await this.readModel.findOne(repositoryContext, credentialSpec);

      if (!credential) {
        return err(credentialNotFound(credentialIdResult.value.value));
      }
    } catch (error) {
      return err(
        credentialInfraError({
          credentialId: credentialIdResult.value.value,
          phase: "credential-read",
          error,
        }),
      );
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
    const affectedUsage = buildUsageSummary(usageResult.value);

    if (affectedUsage.totalServers > 0 && input.confirmation.acknowledgeServerUsage !== true) {
      return err(
        usageAcknowledgementRequiredError({
          credentialId: credentialIdResult.value.value,
          usage: affectedUsage,
          serverIds: affectedUsage.servers.map((server) => server.serverId),
        }),
      );
    }

    try {
      const credential = await this.repository.findOne(repositoryContext, credentialSpec);
      if (!credential) {
        return err(credentialNotFound(credentialIdResult.value.value));
      }

      const rotatedAtResult = RotatedAt.create(this.clock.now());
      if (rotatedAtResult.isErr()) {
        return err(
          withRotateSshCredentialDetails(rotatedAtResult.error, {
            phase: "credential-mutation",
            credentialId: credentialIdResult.value.value,
          }),
        );
      }

      const rotationInput: RotateSshCredentialInput = {
        privateKey: privateKeyResult.value,
        rotatedAt: rotatedAtResult.value,
      };

      if (input.publicKey !== undefined) {
        rotationInput.publicKey = publicKey ?? null;
      }

      if (input.username !== undefined) {
        rotationInput.username = username ?? null;
      }

      const rotateResult = credential.rotate(rotationInput);
      if (rotateResult.isErr()) {
        return err(
          withRotateSshCredentialDetails(rotateResult.error, {
            phase: "credential-mutation",
            credentialId: credentialIdResult.value.value,
          }),
        );
      }

      const updated = await this.repository.updateOne(
        repositoryContext,
        credential,
        RotateSshCredentialSpec.fromSshCredential(credential),
      );

      if (!updated) {
        return err(
          credentialInfraError({
            credentialId: credentialIdResult.value.value,
            phase: "credential-mutation",
            error: new Error("updateOne did not update an existing SSH credential"),
          }),
        );
      }

      const state = credential.toState();
      return ok({
        schemaVersion: "credentials.rotate-ssh/v1",
        credential: {
          id: state.id.value,
          kind: "ssh-private-key",
          usernameConfigured: Boolean(state.username),
          publicKeyConfigured: Boolean(state.publicKey),
          privateKeyConfigured: Boolean(state.privateKey),
          rotatedAt: state.rotatedAt?.value ?? rotatedAtResult.value.value,
        },
        affectedUsage,
      });
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
