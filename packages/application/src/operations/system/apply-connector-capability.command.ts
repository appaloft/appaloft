import { ConnectionCapabilityKey, ConnectorKey, err, ok, type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type ConnectorCapabilityApplyResult } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ApplyConnectorCapabilityCommandInput,
  applyConnectorCapabilityCommandInputSchema,
} from "./connections.schema";

export {
  type ApplyConnectorCapabilityCommandInput,
  applyConnectorCapabilityCommandInputSchema,
} from "./connections.schema";

export class ApplyConnectorCapabilityCommand extends Command<ConnectorCapabilityApplyResult> {
  constructor(readonly input: ApplyConnectorCapabilityCommandInput) {
    super();
  }

  static create(
    input: ApplyConnectorCapabilityCommandInput,
  ): Result<ApplyConnectorCapabilityCommand> {
    const parsed = parseOperationInput(applyConnectorCapabilityCommandInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const connectorKey = ConnectorKey.create(parsed.value.connectorKey);
    if (connectorKey.isErr()) return err(connectorKey.error);
    const capabilityKey = ConnectionCapabilityKey.create(parsed.value.capabilityKey);
    if (capabilityKey.isErr()) return err(capabilityKey.error);

    return ok(
      new ApplyConnectorCapabilityCommand({
        ...parsed.value,
        connectorKey: connectorKey.value.value,
        capabilityKey: capabilityKey.value.value,
      }),
    );
  }
}
