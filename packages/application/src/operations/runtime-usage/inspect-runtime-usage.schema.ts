import { z } from "zod";

import { booleanQueryParam } from "../shared-schema";

const runtimeUsageScopeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("server"),
    serverId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("project"),
    projectId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("environment"),
    environmentId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("resource"),
    resourceId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("deployment"),
    deploymentId: z.string().min(1),
  }),
]);

const inspectRuntimeUsageOptionsSchema = {
  mode: z.literal("current").default("current"),
  includeArtifacts: booleanQueryParam(true),
  includeWarnings: booleanQueryParam(true),
};

const canonicalInspectRuntimeUsageQueryInputSchema = z.object({
  scope: runtimeUsageScopeSchema,
});

const canonicalInspectRuntimeUsageQueryInputWithOptionsSchema =
  canonicalInspectRuntimeUsageQueryInputSchema.extend(inspectRuntimeUsageOptionsSchema);

const flatInspectRuntimeUsageQueryInputSchema = z
  .discriminatedUnion("scopeKind", [
    z.object({
      scopeKind: z.literal("server"),
      serverId: z.string().min(1),
      ...inspectRuntimeUsageOptionsSchema,
    }),
    z.object({
      scopeKind: z.literal("project"),
      projectId: z.string().min(1),
      ...inspectRuntimeUsageOptionsSchema,
    }),
    z.object({
      scopeKind: z.literal("environment"),
      environmentId: z.string().min(1),
      ...inspectRuntimeUsageOptionsSchema,
    }),
    z.object({
      scopeKind: z.literal("resource"),
      resourceId: z.string().min(1),
      ...inspectRuntimeUsageOptionsSchema,
    }),
    z.object({
      scopeKind: z.literal("deployment"),
      deploymentId: z.string().min(1),
      ...inspectRuntimeUsageOptionsSchema,
    }),
  ])
  .transform((input) => {
    switch (input.scopeKind) {
      case "server":
        return {
          scope: { kind: input.scopeKind, serverId: input.serverId },
          mode: input.mode,
          includeArtifacts: input.includeArtifacts,
          includeWarnings: input.includeWarnings,
        };
      case "project":
        return {
          scope: { kind: input.scopeKind, projectId: input.projectId },
          mode: input.mode,
          includeArtifacts: input.includeArtifacts,
          includeWarnings: input.includeWarnings,
        };
      case "environment":
        return {
          scope: { kind: input.scopeKind, environmentId: input.environmentId },
          mode: input.mode,
          includeArtifacts: input.includeArtifacts,
          includeWarnings: input.includeWarnings,
        };
      case "resource":
        return {
          scope: { kind: input.scopeKind, resourceId: input.resourceId },
          mode: input.mode,
          includeArtifacts: input.includeArtifacts,
          includeWarnings: input.includeWarnings,
        };
      case "deployment":
        return {
          scope: { kind: input.scopeKind, deploymentId: input.deploymentId },
          mode: input.mode,
          includeArtifacts: input.includeArtifacts,
          includeWarnings: input.includeWarnings,
        };
    }
  });

const dottedInspectRuntimeUsageQueryInputSchema = z
  .union([
    z.object({
      "scope.kind": z.literal("server"),
      "scope.serverId": z.string().min(1),
      ...inspectRuntimeUsageOptionsSchema,
    }),
    z.object({
      "scope.kind": z.literal("project"),
      "scope.projectId": z.string().min(1),
      ...inspectRuntimeUsageOptionsSchema,
    }),
    z.object({
      "scope.kind": z.literal("environment"),
      "scope.environmentId": z.string().min(1),
      ...inspectRuntimeUsageOptionsSchema,
    }),
    z.object({
      "scope.kind": z.literal("resource"),
      "scope.resourceId": z.string().min(1),
      ...inspectRuntimeUsageOptionsSchema,
    }),
    z.object({
      "scope.kind": z.literal("deployment"),
      "scope.deploymentId": z.string().min(1),
      ...inspectRuntimeUsageOptionsSchema,
    }),
  ])
  .transform((input) => {
    switch (input["scope.kind"]) {
      case "server":
        return {
          scope: { kind: input["scope.kind"], serverId: input["scope.serverId"] },
          mode: input.mode,
          includeArtifacts: input.includeArtifacts,
          includeWarnings: input.includeWarnings,
        };
      case "project":
        return {
          scope: { kind: input["scope.kind"], projectId: input["scope.projectId"] },
          mode: input.mode,
          includeArtifacts: input.includeArtifacts,
          includeWarnings: input.includeWarnings,
        };
      case "environment":
        return {
          scope: { kind: input["scope.kind"], environmentId: input["scope.environmentId"] },
          mode: input.mode,
          includeArtifacts: input.includeArtifacts,
          includeWarnings: input.includeWarnings,
        };
      case "resource":
        return {
          scope: { kind: input["scope.kind"], resourceId: input["scope.resourceId"] },
          mode: input.mode,
          includeArtifacts: input.includeArtifacts,
          includeWarnings: input.includeWarnings,
        };
      case "deployment":
        return {
          scope: { kind: input["scope.kind"], deploymentId: input["scope.deploymentId"] },
          mode: input.mode,
          includeArtifacts: input.includeArtifacts,
          includeWarnings: input.includeWarnings,
        };
    }
  });

export const inspectRuntimeUsageQueryInputSchema = z.union([
  canonicalInspectRuntimeUsageQueryInputWithOptionsSchema,
  flatInspectRuntimeUsageQueryInputSchema,
  dottedInspectRuntimeUsageQueryInputSchema,
]);

export type InspectRuntimeUsageQueryInput = z.input<typeof inspectRuntimeUsageQueryInputSchema>;
export type ParsedInspectRuntimeUsageQueryInput = z.output<
  typeof inspectRuntimeUsageQueryInputSchema
>;
