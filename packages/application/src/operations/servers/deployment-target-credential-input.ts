import {
  DeploymentTargetCredentialKindValue,
  type DeploymentTargetCredentialState,
  DeploymentTargetUsername,
  domainError,
  err,
  ok,
  type Result,
  SshCredentialByIdSpec,
  SshCredentialId,
  SshPrivateKeyText,
  SshPublicKeyText,
  safeTry,
} from "@yundu/core";

import { type RepositoryContext } from "../../execution-context";
import { type SshCredentialRepository } from "../../ports";
import { type ConfigureServerCredentialCommandInput } from "./configure-server-credential.command";

export async function resolveDeploymentTargetCredentialState(input: {
  credential: ConfigureServerCredentialCommandInput["credential"];
  repositoryContext: RepositoryContext;
  sshCredentialRepository: SshCredentialRepository;
}): Promise<Result<DeploymentTargetCredentialState>> {
  const { credential, repositoryContext, sshCredentialRepository } = input;

  return safeTry(async function* () {
    if (credential.kind === "stored-ssh-private-key") {
      const credentialId = yield* SshCredentialId.create(credential.credentialId);
      const storedCredential = await sshCredentialRepository.findOne(
        repositoryContext,
        SshCredentialByIdSpec.create(credentialId),
      );

      if (!storedCredential) {
        return err(domainError.notFound("ssh credential", credential.credentialId));
      }

      const storedState = storedCredential.toState();
      const username = credential.username
        ? yield* DeploymentTargetUsername.create(credential.username)
        : storedState.username;

      return ok({
        kind: yield* DeploymentTargetCredentialKindValue.create("ssh-private-key"),
        credentialId,
        ...(username ? { username } : {}),
        ...(storedState.publicKey ? { publicKey: storedState.publicKey } : {}),
        privateKey: storedState.privateKey,
      });
    }

    return ok({
      kind: yield* DeploymentTargetCredentialKindValue.create(credential.kind),
      ...(credential.username
        ? { username: yield* DeploymentTargetUsername.create(credential.username) }
        : {}),
      ...(credential.kind === "ssh-private-key" && credential.publicKey
        ? { publicKey: yield* SshPublicKeyText.create(credential.publicKey) }
        : {}),
      ...(credential.kind === "ssh-private-key"
        ? { privateKey: yield* SshPrivateKeyText.create(credential.privateKey) }
        : {}),
    });
  });
}
