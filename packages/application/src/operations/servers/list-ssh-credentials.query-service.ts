import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type SshCredentialReadModel } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class ListSshCredentialsQueryService {
  constructor(
    @inject(tokens.sshCredentialReadModel)
    private readonly readModel: SshCredentialReadModel,
  ) {}

  async execute(context: ExecutionContext): Promise<{
    items: Awaited<ReturnType<SshCredentialReadModel["list"]>>;
  }> {
    return { items: await this.readModel.list(toRepositoryContext(context)) };
  }
}
