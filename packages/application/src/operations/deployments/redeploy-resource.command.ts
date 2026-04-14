import { type Result } from "@yundu/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type RedeployResourceCommandInput,
  redeployResourceCommandInputSchema,
} from "./redeploy-resource.schema";

export {
  type RedeployResourceCommandInput,
  redeployResourceCommandInputSchema,
} from "./redeploy-resource.schema";

export class RedeployResourceCommand extends Command<{ id: string }> {
  constructor(
    public readonly resourceId: string,
    public readonly force: boolean,
  ) {
    super();
  }

  static create(input: RedeployResourceCommandInput): Result<RedeployResourceCommand> {
    return parseOperationInput(redeployResourceCommandInputSchema, input).map(
      (parsed) => new RedeployResourceCommand(parsed.resourceId, parsed.force ?? false),
    );
  }
}
