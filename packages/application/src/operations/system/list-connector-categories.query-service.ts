import { type ConnectionCategoryDefinitionSnapshot } from "@appaloft/core";
import { injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import { listConnectionCategoryDefinitions } from "../../extensibility/connector-registry";

@injectable()
export class ListConnectorCategoriesQueryService {
  async execute(
    context: ExecutionContext,
  ): Promise<{ items: ConnectionCategoryDefinitionSnapshot[] }> {
    void context;
    return { items: listConnectionCategoryDefinitions() };
  }
}
