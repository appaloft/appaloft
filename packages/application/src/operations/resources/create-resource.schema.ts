import {
  healthCheckHttpMethods,
  healthCheckSchemes,
  resourceExposureModes,
  resourceKinds,
  resourceNetworkProtocols,
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
  gitRef: nonEmptyTrimmedString("Git ref").optional(),
  commitSha: nonEmptyTrimmedString("Git commit SHA").optional(),
  baseDirectory: nonEmptyTrimmedString("Source base directory").optional(),
  originalLocator: nonEmptyTrimmedString("Original source locator").optional(),
  repositoryId: nonEmptyTrimmedString("Repository id").optional(),
  repositoryFullName: nonEmptyTrimmedString("Repository full name").optional(),
  defaultBranch: nonEmptyTrimmedString("Default branch").optional(),
  imageName: nonEmptyTrimmedString("Docker image name").optional(),
  imageTag: nonEmptyTrimmedString("Docker image tag").optional(),
  imageDigest: nonEmptyTrimmedString("Docker image digest").optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export const createResourceRuntimeProfileInputSchema = z
  .object({
    strategy: z.enum(runtimePlanStrategies).default("auto"),
    installCommand: z.string().trim().min(1).optional(),
    buildCommand: z.string().trim().min(1).optional(),
    startCommand: z.string().trim().min(1).optional(),
    healthCheckPath: z.string().trim().min(1).optional(),
    healthCheck: z
      .object({
        enabled: z.boolean().default(true),
        type: z.literal("http").default("http"),
        intervalSeconds: z.number().int().positive().default(5),
        timeoutSeconds: z.number().int().positive().default(5),
        retries: z.number().int().positive().default(10),
        startPeriodSeconds: z.number().int().nonnegative().default(5),
        http: z
          .object({
            method: z.enum(healthCheckHttpMethods).default("GET"),
            scheme: z.enum(healthCheckSchemes).default("http"),
            host: z.string().trim().min(1).default("localhost"),
            port: z.number().int().positive().max(65535).optional(),
            path: z.string().trim().min(1).default("/"),
            expectedStatusCode: z.number().int().min(100).max(599).default(200),
            expectedResponseText: z.string().trim().min(1).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .superRefine((value, context) => {
        if (value.type === "http" && !value.http) {
          context.addIssue({
            code: "custom",
            path: ["http"],
            message: "HTTP health checks require http configuration",
          });
        }
      })
      .optional(),
  })
  .strict();

export const createResourceNetworkProfileInputSchema = z
  .object({
    internalPort: z.number().int().positive(),
    upstreamProtocol: z.enum(resourceNetworkProtocols).default("http"),
    exposureMode: z.enum(resourceExposureModes).default("reverse-proxy"),
    targetServiceName: z.string().trim().min(1).optional(),
    hostPort: z.number().int().positive().optional(),
  })
  .superRefine((value, context) => {
    if (value.hostPort && value.exposureMode !== "direct-port") {
      context.addIssue({
        code: "custom",
        path: ["hostPort"],
        message: "hostPort is valid only when exposureMode is direct-port",
      });
    }
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
  networkProfile: createResourceNetworkProfileInputSchema.optional(),
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
export type CreateResourceNetworkProfileInput = z.output<
  typeof createResourceNetworkProfileInputSchema
>;
