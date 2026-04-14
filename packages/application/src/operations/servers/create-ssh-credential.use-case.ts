import {
  CreatedAt,
  DeploymentTargetCredentialKindValue,
  DeploymentTargetUsername,
  ok,
  type Result,
  SshCredential,
  SshCredentialId,
  SshCredentialName,
  SshPrivateKeyText,
  SshPublicKeyText,
  safeTry,
  UpsertSshCredentialSpec,
} from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type EventBus,
  type IdGenerator,
  type SshCredentialRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type CreateSshCredentialCommandInput } from "./create-ssh-credential.command";

@injectable()
export class CreateSshCredentialUseCase {
  constructor(
    @inject(tokens.sshCredentialRepository)
    private readonly repository: SshCredentialRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: CreateSshCredentialCommandInput,
  ): Promise<Result<{ id: string }>> {
    const { clock, eventBus, idGenerator, logger, repository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const credential = yield* SshCredential.create({
        id: yield* SshCredentialId.create(idGenerator.next("sshcred")),
        name: yield* SshCredentialName.create(input.name),
        kind: yield* DeploymentTargetCredentialKindValue.create(input.kind),
        ...(input.username
          ? { username: yield* DeploymentTargetUsername.create(input.username) }
          : {}),
        ...(input.publicKey ? { publicKey: yield* SshPublicKeyText.create(input.publicKey) } : {}),
        privateKey: yield* SshPrivateKeyText.create(input.privateKey),
        createdAt: yield* CreatedAt.create(clock.now()),
      });

      await repository.upsert(
        repositoryContext,
        credential,
        UpsertSshCredentialSpec.fromSshCredential(credential),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, credential, undefined);

      return ok({ id: credential.toState().id.value });
    });
  }
}
