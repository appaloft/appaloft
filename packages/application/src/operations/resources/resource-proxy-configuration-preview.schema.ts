import { z } from "zod";

export const resourceProxyConfigurationRouteScopes = [
  "planned",
  "latest",
  "deployment-snapshot",
] as const;

export const resourceProxyConfigurationPreviewQueryInputSchema = z
  .object({
    resourceId: z.string().min(1),
    deploymentId: z.string().min(1).optional(),
    routeScope: z.enum(resourceProxyConfigurationRouteScopes).default("latest"),
    includeDiagnostics: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.routeScope === "deployment-snapshot" && !value.deploymentId) {
      context.addIssue({
        code: "custom",
        path: ["deploymentId"],
        message: "deploymentId is required for deployment-snapshot proxy configuration preview",
      });
    }
  });

export type ResourceProxyConfigurationPreviewQueryInput = z.input<
  typeof resourceProxyConfigurationPreviewQueryInputSchema
>;
