import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowBlueprintInstallationQueryInput,
  type ShowBlueprintInstallationResponse,
  showBlueprintInstallationQueryInputSchema,
} from "./blueprint-catalog.schema";

export {
  type ShowBlueprintInstallationQueryInput,
  showBlueprintInstallationQueryInputSchema,
} from "./blueprint-catalog.schema";

export class ShowBlueprintInstallationQuery extends Query<ShowBlueprintInstallationResponse> {
  constructor(public readonly applicationId: string) {
    super();
  }

  static create(
    input: ShowBlueprintInstallationQueryInput,
  ): Result<ShowBlueprintInstallationQuery> {
    return parseOperationInput(showBlueprintInstallationQueryInputSchema, input).map(
      (parsed) => new ShowBlueprintInstallationQuery(parsed.applicationId),
    );
  }
}
