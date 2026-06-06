import { domainError, err, type Result } from "@appaloft/core";
import { injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { type ShowBlueprintInstallationResponse } from "./blueprint-catalog.schema";
import { type ShowBlueprintInstallationQuery } from "./show-blueprint-installation.query";

export interface BlueprintInstallationQueryService {
  show(
    context: ExecutionContext,
    query: ShowBlueprintInstallationQuery,
  ): Promise<Result<ShowBlueprintInstallationResponse>>;
}

@injectable()
export class DefaultBlueprintInstallationQueryService implements BlueprintInstallationQueryService {
  async show(
    context: ExecutionContext,
    query: ShowBlueprintInstallationQuery,
  ): Promise<Result<ShowBlueprintInstallationResponse>> {
    void context;
    return err(
      domainError.infra("Blueprint installation query service is not configured", {
        applicationId: query.applicationId,
      }),
    );
  }
}
