import { domainError, err, type Result } from "@appaloft/core";
import { injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { type AcceptBlueprintInstallCommand } from "./accept-blueprint-install.command";
import { type AcceptBlueprintInstallCommandResponse } from "./blueprint-catalog.schema";

export interface BlueprintInstallCommandService {
  accept(
    context: ExecutionContext,
    command: AcceptBlueprintInstallCommand,
  ): Promise<Result<AcceptBlueprintInstallCommandResponse>>;
}

@injectable()
export class DefaultBlueprintInstallCommandService implements BlueprintInstallCommandService {
  async accept(
    context: ExecutionContext,
    command: AcceptBlueprintInstallCommand,
  ): Promise<Result<AcceptBlueprintInstallCommandResponse>> {
    void context;
    return err(
      domainError.infra("Blueprint install command service is not configured", {
        slug: command.slug,
      }),
    );
  }
}
