import { edgeProxyKinds, edgeProxyStatuses } from "@appaloft/core";
import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const configureServerEdgeProxyCommandInputSchema = z.object({
  serverId: nonEmptyTrimmedString("Server id"),
  proxyKind: z.enum(edgeProxyKinds),
  idempotencyKey: nonEmptyTrimmedString("Idempotency key").optional(),
});

export const configureServerEdgeProxyResultSchema = z.object({
  id: z.string().min(1),
  edgeProxy: z.object({
    kind: z.enum(edgeProxyKinds),
    status: z.enum(edgeProxyStatuses),
  }),
});

export type ConfigureServerEdgeProxyCommandInput = z.input<
  typeof configureServerEdgeProxyCommandInputSchema
>;
export type ConfigureServerEdgeProxyCommandPayload = z.output<
  typeof configureServerEdgeProxyCommandInputSchema
>;
export type ConfigureServerEdgeProxyResult = z.output<typeof configureServerEdgeProxyResultSchema>;
