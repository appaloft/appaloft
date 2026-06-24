import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

const maxHealthHistoryWindowMs = 14 * 24 * 60 * 60 * 1000;

const booleanInput = (defaultValue: boolean) =>
  z
    .union([
      z.boolean(),
      z.literal("true").transform(() => true),
      z.literal("false").transform(() => false),
    ])
    .default(defaultValue);

export const resourceHealthQueryInputSchema = z
  .object({
    resourceId: nonEmptyTrimmedString("Resource id").optional(),
    previewEnvironmentId: nonEmptyTrimmedString("Preview environment id").optional(),
    mode: z.enum(["cached", "live"]).default("cached"),
    includeChecks: booleanInput(true),
    includePublicAccessProbe: booleanInput(false),
    includeRuntimeProbe: booleanInput(false),
  })
  .superRefine((input, context) => {
    if (input.resourceId || input.previewEnvironmentId) {
      return;
    }

    context.addIssue({
      code: "custom",
      message: "Either resourceId or previewEnvironmentId is required",
      path: ["resourceId"],
    });
  });

const resourceHealthHistoryCanonicalInputSchema = z
  .object({
    resourceId: nonEmptyTrimmedString("Resource id"),
    window: z.object({
      from: z.string().datetime(),
      to: z.string().datetime(),
    }),
    limit: z.number().int().min(1).max(720).default(200),
  })
  .superRefine((input, context) => {
    const durationMs = Date.parse(input.window.to) - Date.parse(input.window.from);
    if (durationMs <= 0) {
      context.addIssue({
        code: "custom",
        message: "window.to must be after window.from",
        path: ["window", "to"],
      });
      return;
    }
    if (durationMs > maxHealthHistoryWindowMs) {
      context.addIssue({
        code: "custom",
        message: "resource health history windows must not exceed 14 days",
        path: ["window"],
      });
    }
  });

const resourceHealthHistoryDottedInputSchema = z
  .object({
    resourceId: nonEmptyTrimmedString("Resource id"),
    "window.from": z.string().datetime(),
    "window.to": z.string().datetime(),
    limit: z.coerce.number().int().min(1).max(720).default(200),
  })
  .transform((input) => ({
    resourceId: input.resourceId,
    window: {
      from: input["window.from"],
      to: input["window.to"],
    },
    limit: input.limit,
  }));

export const resourceHealthHistoryQueryInputSchema = z
  .union([resourceHealthHistoryCanonicalInputSchema, resourceHealthHistoryDottedInputSchema])
  .superRefine((input, context) => {
    const durationMs = Date.parse(input.window.to) - Date.parse(input.window.from);
    if (durationMs <= 0) {
      context.addIssue({
        code: "custom",
        message: "window.to must be after window.from",
        path: ["window", "to"],
      });
      return;
    }
    if (durationMs > maxHealthHistoryWindowMs) {
      context.addIssue({
        code: "custom",
        message: "resource health history windows must not exceed 14 days",
        path: ["window"],
      });
    }
  });

export type ResourceHealthQueryInput = z.input<typeof resourceHealthQueryInputSchema>;
export type ResourceHealthQueryParsedInput = z.output<typeof resourceHealthQueryInputSchema>;
export type ResourceHealthHistoryQueryInput = z.input<typeof resourceHealthHistoryQueryInputSchema>;
export type ResourceHealthHistoryQueryParsedInput = z.output<
  typeof resourceHealthHistoryQueryInputSchema
>;
