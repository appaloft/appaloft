import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const prepareServerRuntimeModeSchema = z.enum(["prepare", "repair", "upgrade"]);

export const prepareServerRuntimeCommandInputSchema = z.object({
  serverId: nonEmptyTrimmedString("Server id"),
  mode: prepareServerRuntimeModeSchema.default("prepare"),
});

export const serverRuntimePreparePhaseSchema = z.enum([
  "connectivity-before",
  "docker",
  "edge-proxy",
  "connectivity-after",
]);

export const serverRuntimePrepareStepStatusSchema = z.enum(["succeeded", "failed", "skipped"]);

const serverConnectivityCheckSchema = z.object({
  name: z.string(),
  status: z.enum(["passed", "failed", "skipped"]),
  message: z.string(),
  durationMs: z.number(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const serverRuntimePrepareStepSchema = z.object({
  phase: serverRuntimePreparePhaseSchema,
  status: serverRuntimePrepareStepStatusSchema,
  message: z.string(),
  durationMs: z.number(),
  metadata: z.record(z.string(), z.string()).optional(),
  checks: z.array(serverConnectivityCheckSchema).optional(),
});

export const prepareServerRuntimeResultSchema = z.object({
  serverId: z.string().min(1),
  status: z.enum(["ready", "failed"]),
  preparedAt: z.string(),
  steps: z.array(serverRuntimePrepareStepSchema),
});

export type PrepareServerRuntimeMode = z.output<typeof prepareServerRuntimeModeSchema>;
export type PrepareServerRuntimeCommandInput = z.input<
  typeof prepareServerRuntimeCommandInputSchema
>;
export type ParsedPrepareServerRuntimeCommandInput = z.output<
  typeof prepareServerRuntimeCommandInputSchema
>;
export type ServerRuntimePreparePhase = z.output<typeof serverRuntimePreparePhaseSchema>;
export type ServerRuntimePrepareStepStatus = z.output<typeof serverRuntimePrepareStepStatusSchema>;
export type ServerRuntimePrepareStep = z.output<typeof serverRuntimePrepareStepSchema>;
export type PrepareServerRuntimeResult = z.output<typeof prepareServerRuntimeResultSchema>;
