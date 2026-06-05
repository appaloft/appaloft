import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowBlueprintQueryInput,
  type ShowBlueprintResponse,
  showBlueprintQueryInputSchema,
} from "./blueprint-catalog.schema";

export {
  type ShowBlueprintQueryInput,
  showBlueprintQueryInputSchema,
} from "./blueprint-catalog.schema";

export class ShowBlueprintQuery extends Query<ShowBlueprintResponse> {
  constructor(public readonly slug: string) {
    super();
  }

  static create(input: ShowBlueprintQueryInput): Result<ShowBlueprintQuery> {
    return parseOperationInput(showBlueprintQueryInputSchema, input).map(
      (parsed) => new ShowBlueprintQuery(parsed.slug),
    );
  }
}
