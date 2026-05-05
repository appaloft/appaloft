import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ShowDependencyResourceBackupResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowDependencyResourceBackupQueryInput,
  showDependencyResourceBackupQueryInputSchema,
} from "./show-dependency-resource-backup.schema";

export {
  type ShowDependencyResourceBackupQueryInput,
  showDependencyResourceBackupQueryInputSchema,
};

export class ShowDependencyResourceBackupQuery extends Query<ShowDependencyResourceBackupResult> {
  constructor(public readonly backupId: string) {
    super();
  }

  static create(
    input: ShowDependencyResourceBackupQueryInput,
  ): Result<ShowDependencyResourceBackupQuery> {
    return parseOperationInput(showDependencyResourceBackupQueryInputSchema, input).map(
      (parsed) => new ShowDependencyResourceBackupQuery(parsed.backupId),
    );
  }
}
