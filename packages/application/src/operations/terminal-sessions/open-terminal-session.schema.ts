import { z } from "zod";

function safeRelativeDirectory(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(512, `${label} is too long`)
    .refine((value) => !value.startsWith("/") && !value.includes("\0"), {
      message: `${label} must be relative`,
    })
    .refine((value) => !value.includes("://") && !/[;&|`$<>]/u.test(value), {
      message: `${label} must not contain URLs or shell fragments`,
    })
    .refine(
      (value) =>
        value
          .split("/")
          .filter((segment) => segment.length > 0)
          .every((segment) => segment !== "." && segment !== ".."),
      {
        message: `${label} must stay inside the resolved workspace`,
      },
    );
}

export const openTerminalSessionCommandInputSchema = z
  .object({
    scope: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("server"),
          serverId: z.string().trim().min(1, "Server id is required"),
        })
        .strict(),
      z
        .object({
          kind: z.literal("resource"),
          resourceId: z.string().trim().min(1, "Resource id is required"),
          deploymentId: z.string().trim().min(1, "Deployment id is required").optional(),
        })
        .strict(),
    ]),
    relativeDirectory: safeRelativeDirectory("Relative directory").optional(),
    initialRows: z.number().int().min(10).max(120).default(24),
    initialCols: z.number().int().min(20).max(320).default(80),
  })
  .strict();

export type OpenTerminalSessionCommandInput = z.input<typeof openTerminalSessionCommandInputSchema>;
export type OpenTerminalSessionCommandPayload = z.output<
  typeof openTerminalSessionCommandInputSchema
>;
export type OpenTerminalSessionScopeInput = OpenTerminalSessionCommandPayload["scope"];
