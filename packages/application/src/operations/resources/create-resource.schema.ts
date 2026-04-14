import {
  resourceKinds,
  resourceServiceKinds,
  runtimePlanStrategies,
  sourceKinds,
} from "@yundu/core";
import { z } from "zod";

import { nonEmptyTrimmedString } from "../shared-schema";

export const createResourceServiceInputSchema = z.object({
  name: nonEmptyTrimmedString("Resource service name"),
  kind: z.enum(resourceServiceKinds),
});

export const createResourceSourceBindingInputSchema = z.object({
  kind: z.enum(sourceKinds),
  locator: nonEmptyTrimmedString("Source locator"),
  displayName: nonEmptyTrimmedString("Source display name").optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const createResourceRuntimeProfileInputSchema = z.object({
  strategy: z.enum(runtimePlanStrategies).default("auto"),
  installCommand: z.string().trim().min(1).optional(),
  buildCommand: z.string().trim().min(1).optional(),
  startCommand: z.string().trim().min(1).optional(),
  port: z.number().int().positive().optional(),
  healthCheckPath: z.string().trim().min(1).optional(),
});

export const createResourceCommandInputSchema = z.object({
  projectId: nonEmptyTrimmedString("Project id"),
  environmentId: nonEmptyTrimmedString("Environment id"),
  destinationId: nonEmptyTrimmedString("Destination id").optional(),
  name: nonEmptyTrimmedString("Resource name"),
  kind: z.enum(resourceKinds).default("application"),
  description: nonEmptyTrimmedString("Resource description").optional(),
  services: z.array(createResourceServiceInputSchema).optional(),
  source: createResourceSourceBindingInputSchema.optional(),
  runtimeProfile: createResourceRuntimeProfileInputSchema.optional(),
});

export type CreateResourceCommandInput = z.input<typeof createResourceCommandInputSchema>;
export type CreateResourceCommandPayload = z.output<typeof createResourceCommandInputSchema>;
export type CreateResourceServiceInput = z.output<typeof createResourceServiceInputSchema>;
export type CreateResourceSourceBindingInput = z.output<
  typeof createResourceSourceBindingInputSchema
>;
export type CreateResourceRuntimeProfileInput = z.output<
  typeof createResourceRuntimeProfileInputSchema
>;
