import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type AuthBootstrapStatus, type AuthBootstrapStatusReader } from "../../ports";
import { tokens } from "../../tokens";

@injectable()
export class GetAuthBootstrapStatusQueryService {
  constructor(
    @inject(tokens.authBootstrapStatusReader)
    private readonly statusReader: AuthBootstrapStatusReader,
  ) {}

  execute(context: ExecutionContext): Promise<Result<AuthBootstrapStatus>> {
    return this.statusReader.getStatus(toRepositoryContext(context));
  }
}
