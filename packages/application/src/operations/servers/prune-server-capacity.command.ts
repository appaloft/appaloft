import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type RuntimeTargetCapacityPruneResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ParsedPruneServerCapacityCommandInput,
  type PruneServerCapacityCommandInput,
  pruneServerCapacityCommandInputSchema,
} from "./prune-server-capacity.schema";

export {
  defaultRuntimeTargetPruneCategories,
  type ParsedPruneServerCapacityCommandInput,
  type PruneServerCapacityCommandInput,
  pruneServerCapacityCommandInputSchema,
  type RuntimeTargetPruneCategory,
  runtimeTargetPruneCategories,
  runtimeTargetPruneCategorySchema,
} from "./prune-server-capacity.schema";

export class PruneServerCapacityCommand extends Command<RuntimeTargetCapacityPruneResult> {
  constructor(public readonly input: ParsedPruneServerCapacityCommandInput) {
    super();
  }

  static create(input: PruneServerCapacityCommandInput): Result<PruneServerCapacityCommand> {
    return parseOperationInput(pruneServerCapacityCommandInputSchema, input).map(
      (parsed) => new PruneServerCapacityCommand(parsed),
    );
  }
}
