import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type ServerDetail } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import { type ShowServerQueryInput, showServerQueryInputSchema } from "./show-server.schema";

export {
  type ShowServerQueryInput,
  showServerQueryInputSchema,
} from "./show-server.schema";

export class ShowServerQuery extends Query<ServerDetail> {
  constructor(
    public readonly serverId: string,
    public readonly includeRollups: boolean,
  ) {
    super();
  }

  static create(input: ShowServerQueryInput): Result<ShowServerQuery> {
    return parseOperationInput(showServerQueryInputSchema, input).map(
      (parsed) => new ShowServerQuery(parsed.serverId, parsed.includeRollups),
    );
  }
}
