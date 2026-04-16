import { z } from "zod";
import { nonEmptyTrimmedString } from "../shared-schema";

export const bootstrapServerProxyReasonSchema = z.enum([
  "repair",
  "retry",
  "post-connect",
  "doctor-follow-up",
]);

export const bootstrapServerProxyCommandInputSchema = z.object({
  serverId: nonEmptyTrimmedString("Server id"),
  edgeProxyProviderKey: nonEmptyTrimmedString("Edge proxy provider key").optional(),
  attemptId: nonEmptyTrimmedString("Attempt id").optional(),
  reason: bootstrapServerProxyReasonSchema.default("repair"),
});

export const bootstrapServerProxyResultSchema = z.object({
  serverId: z.string().min(1),
  attemptId: z.string().min(1),
});

export type BootstrapServerProxyReason = z.output<typeof bootstrapServerProxyReasonSchema>;
export type BootstrapServerProxyCommandInput = z.input<
  typeof bootstrapServerProxyCommandInputSchema
>;
export type ParsedBootstrapServerProxyCommandInput = z.output<
  typeof bootstrapServerProxyCommandInputSchema
>;
export type BootstrapServerProxyResult = z.output<typeof bootstrapServerProxyResultSchema>;
