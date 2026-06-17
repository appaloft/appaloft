import { ConnectionCapabilityKey, ConnectorKey, err, ok, type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { type ConnectorCapabilityPlanPreview } from "../../ports";

export const connectorCapabilityPlanInputSchema = z.object({
  connectorKey: z.string(),
  capabilityKey: z.string(),
  ownerRef: z
    .object({
      scope: z.enum(["account", "organization", "project", "environment", "resource", "operator"]),
      id: z.string(),
    })
    .optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
});

export type ConnectorCapabilityPlanQueryInput = z.infer<typeof connectorCapabilityPlanInputSchema>;

export class PlanConnectorCapabilityQuery extends Query<ConnectorCapabilityPlanPreview> {
  constructor(readonly input: ConnectorCapabilityPlanQueryInput) {
    super();
  }

  static create(input: ConnectorCapabilityPlanQueryInput): Result<PlanConnectorCapabilityQuery> {
    const connectorKey = ConnectorKey.create(input.connectorKey);
    if (connectorKey.isErr()) return err(connectorKey.error);
    const capabilityKey = ConnectionCapabilityKey.create(input.capabilityKey);
    if (capabilityKey.isErr()) return err(capabilityKey.error);

    return ok(
      new PlanConnectorCapabilityQuery({
        ...input,
        connectorKey: connectorKey.value.value,
        capabilityKey: capabilityKey.value.value,
      }),
    );
  }
}
