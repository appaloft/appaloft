import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ListBlueprintsQueryInput,
  type ListBlueprintsResponse,
  listBlueprintsQueryInputSchema,
} from "./blueprint-catalog.schema";

export {
  type ListBlueprintsQueryInput,
  listBlueprintsQueryInputSchema,
} from "./blueprint-catalog.schema";

export class ListBlueprintsQuery extends Query<ListBlueprintsResponse> {
  static create(input?: ListBlueprintsQueryInput): Result<ListBlueprintsQuery> {
    return parseOperationInput(listBlueprintsQueryInputSchema, input ?? {}).map(
      () => new ListBlueprintsQuery(),
    );
  }
}
