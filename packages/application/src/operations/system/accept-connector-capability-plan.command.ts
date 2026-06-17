import { type AcceptedConnectionCapabilityPlanSnapshot, type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type AcceptConnectorCapabilityPlanCommandInput,
  acceptConnectorCapabilityPlanCommandInputSchema,
} from "./connections.schema";

export {
  type AcceptConnectorCapabilityPlanCommandInput,
  acceptConnectorCapabilityPlanCommandInputSchema,
} from "./connections.schema";

export class AcceptConnectorCapabilityPlanCommand extends Command<AcceptedConnectionCapabilityPlanSnapshot> {
  constructor(readonly input: AcceptConnectorCapabilityPlanCommandInput) {
    super();
  }

  static create(
    input: AcceptConnectorCapabilityPlanCommandInput,
  ): Result<AcceptConnectorCapabilityPlanCommand> {
    return parseOperationInput(acceptConnectorCapabilityPlanCommandInputSchema, input).map(
      (parsed) => new AcceptConnectorCapabilityPlanCommand(parsed),
    );
  }
}
