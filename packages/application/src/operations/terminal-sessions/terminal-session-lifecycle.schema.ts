import { z } from "zod";

const terminalSessionLimitSchema = z
  .union([
    z.number().int().positive().max(200),
    z
      .string()
      .trim()
      .regex(/^\d+$/)
      .transform((value) => Number(value))
      .pipe(z.number().int().positive().max(200)),
  ])
  .optional();

export const listTerminalSessionsQueryInputSchema = z.object({
  scope: z.enum(["server", "resource", "sandbox"]).optional(),
  serverId: z.string().trim().min(1).optional(),
  resourceId: z.string().trim().min(1).optional(),
  deploymentId: z.string().trim().min(1).optional(),
  sandboxId: z.string().trim().min(1).optional(),
  limit: terminalSessionLimitSchema,
});

export const showTerminalSessionQueryInputSchema = z.object({
  sessionId: z.string().trim().min(1),
});

export const closeTerminalSessionCommandInputSchema = z.object({
  sessionId: z.string().trim().min(1),
});

export const expireTerminalSessionsCommandInputSchema = z.object({
  olderThan: z.string().datetime({ offset: true }).optional(),
  limit: terminalSessionLimitSchema,
});

export type ListTerminalSessionsQueryInput = z.input<typeof listTerminalSessionsQueryInputSchema>;
export type ShowTerminalSessionQueryInput = z.input<typeof showTerminalSessionQueryInputSchema>;
export type CloseTerminalSessionCommandInput = z.input<
  typeof closeTerminalSessionCommandInputSchema
>;
export type ExpireTerminalSessionsCommandInput = z.input<
  typeof expireTerminalSessionsCommandInputSchema
>;
