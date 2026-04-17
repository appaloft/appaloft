import { ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { CommandHandler, type CommandHandlerContract } from "../../cqrs";
import { type ExecutionContext } from "../../execution-context";
import { tokens } from "../../tokens";
import { DbMigrateCommand } from "./db-migrate.command";
import { type DbMigrateUseCase } from "./db-migrate.use-case";

@CommandHandler(DbMigrateCommand)
@injectable()
export class DbMigrateCommandHandler
  implements CommandHandlerContract<DbMigrateCommand, { executed: string[] }>
{
  constructor(
    @inject(tokens.dbMigrateUseCase)
    private readonly useCase: DbMigrateUseCase,
  ) {}

  async handle(
    context: ExecutionContext,
    command: DbMigrateCommand,
  ): Promise<Result<{ executed: string[] }>> {
    void command;
    return ok(await this.useCase.execute(context));
  }
}
