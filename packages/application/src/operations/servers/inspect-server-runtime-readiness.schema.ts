import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const inspectServerRuntimeReadinessQueryInputSchema = z
  .object({
    serverId: nonEmptyTrimmedString("Server id"),
  })
  .strict();

export const runtimeTargetReadinessCheckSchema = z
  .object({
    capability: z.enum([
      "api-reachability",
      "version",
      "authorization",
      "namespace-isolation",
      "routing",
      "storage",
    ]),
    status: z.enum(["ready", "blocked", "unsupported"]),
    reasonCode: z.string().trim().min(1).optional(),
    message: z.string().trim().min(1).optional(),
  })
  .strict();

export const inspectServerRuntimeReadinessResultSchema = z
  .object({
    schemaVersion: z.literal("servers.runtime-readiness/v1"),
    serverId: z.string().trim().min(1),
    targetKind: z.literal("orchestrator-cluster"),
    status: z.enum(["ready", "blocked"]),
    checks: z.array(runtimeTargetReadinessCheckSchema),
    checkedAt: z.string().datetime(),
  })
  .strict();

export type InspectServerRuntimeReadinessQueryInput = z.input<
  typeof inspectServerRuntimeReadinessQueryInputSchema
>;
