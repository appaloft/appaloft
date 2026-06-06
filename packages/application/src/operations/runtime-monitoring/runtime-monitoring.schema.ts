import { z } from "zod";

import { booleanQueryParam } from "../shared-schema";

const maxSamplesWindowMs = 24 * 60 * 60 * 1000;
const maxRollupWindowMs = 14 * 24 * 60 * 60 * 1000;
const maxRollupBuckets = 720;

export const runtimeMonitoringScopeSchema = z.discriminatedUnion("kind", [
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

export const runtimeMonitoringSignalSchema = z.enum([
  "cpu",
  "memory",
  "disk",
  "inode",
  "docker",
  "network",
]);

export const runtimeMonitoringThresholdMetricSchema = z.enum([
  "containerCpuPercent",
  "loadAverage1m",
  "containerUsedBytes",
  "usedBytes",
  "attributedBytes",
  "used",
  "imageBytes",
  "buildCacheBytes",
  "containerWritableBytes",
  "rxBytes",
  "txBytes",
]);

const signalMetrics: Record<
  z.infer<typeof runtimeMonitoringSignalSchema>,
  readonly z.infer<typeof runtimeMonitoringThresholdMetricSchema>[]
> = {
  cpu: ["containerCpuPercent", "loadAverage1m"],
  memory: ["containerUsedBytes", "usedBytes"],
  disk: ["usedBytes", "attributedBytes"],
  inode: ["used"],
  docker: ["imageBytes", "buildCacheBytes", "containerWritableBytes"],
  network: ["rxBytes", "txBytes"],
};

export const runtimeMonitoringWindowSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
});

export const runtimeMonitoringBucketSchema = z.enum(["minute", "five-minute", "hour"]);

export function windowDurationMs(window: { from: string; to: string }): number {
  return Date.parse(window.to) - Date.parse(window.from);
}

export function bucketDurationMs(bucket: "minute" | "five-minute" | "hour"): number {
  switch (bucket) {
    case "minute":
      return 60 * 1000;
    case "five-minute":
      return 5 * 60 * 1000;
    case "hour":
      return 60 * 60 * 1000;
  }
}

const listRuntimeMonitoringSamplesCanonicalInputSchema = z
  .object({
    scope: runtimeMonitoringScopeSchema,
    window: runtimeMonitoringWindowSchema,
    signals: z.array(runtimeMonitoringSignalSchema).optional(),
    limit: z.number().int().min(1).max(720).default(300),
  })
  .superRefine((input, context) => {
    const duration = windowDurationMs(input.window);
    if (duration <= 0) {
      context.addIssue({
        code: "custom",
        message: "window.to must be after window.from",
        path: ["window", "to"],
      });
      return;
    }
    if (duration > maxSamplesWindowMs) {
      context.addIssue({
        code: "custom",
        message: "runtime monitoring sample windows must not exceed 24 hours",
        path: ["window"],
      });
    }
  });

const listRuntimeMonitoringSamplesDottedInputSchema = z
  .union([
    z.object({
      "scope.kind": z.literal("server"),
      "scope.serverId": z.string().min(1),
      "window.from": z.string().datetime(),
      "window.to": z.string().datetime(),
      limit: z.coerce.number().int().min(1).max(720).default(300),
    }),
    z.object({
      "scope.kind": z.literal("project"),
      "scope.projectId": z.string().min(1),
      "window.from": z.string().datetime(),
      "window.to": z.string().datetime(),
      limit: z.coerce.number().int().min(1).max(720).default(300),
    }),
    z.object({
      "scope.kind": z.literal("environment"),
      "scope.environmentId": z.string().min(1),
      "window.from": z.string().datetime(),
      "window.to": z.string().datetime(),
      limit: z.coerce.number().int().min(1).max(720).default(300),
    }),
    z.object({
      "scope.kind": z.literal("resource"),
      "scope.resourceId": z.string().min(1),
      "window.from": z.string().datetime(),
      "window.to": z.string().datetime(),
      limit: z.coerce.number().int().min(1).max(720).default(300),
    }),
    z.object({
      "scope.kind": z.literal("deployment"),
      "scope.deploymentId": z.string().min(1),
      "window.from": z.string().datetime(),
      "window.to": z.string().datetime(),
      limit: z.coerce.number().int().min(1).max(720).default(300),
    }),
  ])
  .transform((input) => {
    const window = {
      from: input["window.from"],
      to: input["window.to"],
    };
    switch (input["scope.kind"]) {
      case "server":
        return {
          scope: { kind: input["scope.kind"], serverId: input["scope.serverId"] },
          window,
          limit: input.limit,
        };
      case "project":
        return {
          scope: { kind: input["scope.kind"], projectId: input["scope.projectId"] },
          window,
          limit: input.limit,
        };
      case "environment":
        return {
          scope: { kind: input["scope.kind"], environmentId: input["scope.environmentId"] },
          window,
          limit: input.limit,
        };
      case "resource":
        return {
          scope: { kind: input["scope.kind"], resourceId: input["scope.resourceId"] },
          window,
          limit: input.limit,
        };
      case "deployment":
        return {
          scope: { kind: input["scope.kind"], deploymentId: input["scope.deploymentId"] },
          window,
          limit: input.limit,
        };
    }
  });

export const listRuntimeMonitoringSamplesQueryInputSchema = z
  .union([
    listRuntimeMonitoringSamplesCanonicalInputSchema,
    listRuntimeMonitoringSamplesDottedInputSchema,
  ])
  .superRefine((input, context) => {
    const duration = windowDurationMs(input.window);
    if (duration <= 0) {
      context.addIssue({
        code: "custom",
        message: "window.to must be after window.from",
        path: ["window", "to"],
      });
      return;
    }
    if (duration > maxSamplesWindowMs) {
      context.addIssue({
        code: "custom",
        message: "runtime monitoring sample windows must not exceed 24 hours",
        path: ["window"],
      });
    }
  });

const runtimeMonitoringRollupCanonicalInputSchema = z
  .object({
    scope: runtimeMonitoringScopeSchema,
    window: runtimeMonitoringWindowSchema,
    bucket: runtimeMonitoringBucketSchema,
    signals: z.array(runtimeMonitoringSignalSchema).optional(),
    includeDeploymentMarkers: booleanQueryParam(true),
    includeTopContributors: booleanQueryParam(true),
  })
  .superRefine((input, context) => {
    const duration = windowDurationMs(input.window);
    if (duration <= 0) {
      context.addIssue({
        code: "custom",
        message: "window.to must be after window.from",
        path: ["window", "to"],
      });
      return;
    }
    if (duration > maxRollupWindowMs) {
      context.addIssue({
        code: "custom",
        message: "runtime monitoring rollup windows must not exceed 14 days",
        path: ["window"],
      });
    }
    const bucketCount = Math.ceil(duration / bucketDurationMs(input.bucket));
    if (bucketCount > maxRollupBuckets) {
      context.addIssue({
        code: "custom",
        message: "runtime monitoring rollups must not return more than 720 buckets",
        path: ["bucket"],
      });
    }
  });

const runtimeMonitoringRollupDottedInputSchema = z
  .union([
    z.object({
      "scope.kind": z.literal("server"),
      "scope.serverId": z.string().min(1),
      "window.from": z.string().datetime(),
      "window.to": z.string().datetime(),
      bucket: runtimeMonitoringBucketSchema,
      includeDeploymentMarkers: booleanQueryParam(true),
      includeTopContributors: booleanQueryParam(true),
    }),
    z.object({
      "scope.kind": z.literal("project"),
      "scope.projectId": z.string().min(1),
      "window.from": z.string().datetime(),
      "window.to": z.string().datetime(),
      bucket: runtimeMonitoringBucketSchema,
      includeDeploymentMarkers: booleanQueryParam(true),
      includeTopContributors: booleanQueryParam(true),
    }),
    z.object({
      "scope.kind": z.literal("environment"),
      "scope.environmentId": z.string().min(1),
      "window.from": z.string().datetime(),
      "window.to": z.string().datetime(),
      bucket: runtimeMonitoringBucketSchema,
      includeDeploymentMarkers: booleanQueryParam(true),
      includeTopContributors: booleanQueryParam(true),
    }),
    z.object({
      "scope.kind": z.literal("resource"),
      "scope.resourceId": z.string().min(1),
      "window.from": z.string().datetime(),
      "window.to": z.string().datetime(),
      bucket: runtimeMonitoringBucketSchema,
      includeDeploymentMarkers: booleanQueryParam(true),
      includeTopContributors: booleanQueryParam(true),
    }),
    z.object({
      "scope.kind": z.literal("deployment"),
      "scope.deploymentId": z.string().min(1),
      "window.from": z.string().datetime(),
      "window.to": z.string().datetime(),
      bucket: runtimeMonitoringBucketSchema,
      includeDeploymentMarkers: booleanQueryParam(true),
      includeTopContributors: booleanQueryParam(true),
    }),
  ])
  .transform((input) => {
    const window = {
      from: input["window.from"],
      to: input["window.to"],
    };
    const common = {
      window,
      bucket: input.bucket,
      includeDeploymentMarkers: input.includeDeploymentMarkers,
      includeTopContributors: input.includeTopContributors,
    };
    switch (input["scope.kind"]) {
      case "server":
        return {
          scope: { kind: input["scope.kind"], serverId: input["scope.serverId"] },
          ...common,
        };
      case "project":
        return {
          scope: { kind: input["scope.kind"], projectId: input["scope.projectId"] },
          ...common,
        };
      case "environment":
        return {
          scope: { kind: input["scope.kind"], environmentId: input["scope.environmentId"] },
          ...common,
        };
      case "resource":
        return {
          scope: { kind: input["scope.kind"], resourceId: input["scope.resourceId"] },
          ...common,
        };
      case "deployment":
        return {
          scope: { kind: input["scope.kind"], deploymentId: input["scope.deploymentId"] },
          ...common,
        };
    }
  });

export const runtimeMonitoringRollupQueryInputSchema = z
  .union([runtimeMonitoringRollupCanonicalInputSchema, runtimeMonitoringRollupDottedInputSchema])
  .superRefine((input, context) => {
    const duration = windowDurationMs(input.window);
    if (duration <= 0) {
      context.addIssue({
        code: "custom",
        message: "window.to must be after window.from",
        path: ["window", "to"],
      });
      return;
    }
    if (duration > maxRollupWindowMs) {
      context.addIssue({
        code: "custom",
        message: "runtime monitoring rollup windows must not exceed 14 days",
        path: ["window"],
      });
    }
    const bucketCount = Math.ceil(duration / bucketDurationMs(input.bucket));
    if (bucketCount > maxRollupBuckets) {
      context.addIssue({
        code: "custom",
        message: "runtime monitoring rollups must not return more than 720 buckets",
        path: ["bucket"],
      });
    }
  });

const runtimeMonitoringThresholdRuleInputSchema = z
  .object({
    ruleId: z.string().min(1).optional(),
    signal: runtimeMonitoringSignalSchema,
    metric: runtimeMonitoringThresholdMetricSchema,
    warning: z.number().finite().nonnegative().optional(),
    critical: z.number().finite().nonnegative().optional(),
    comparator: z.literal("greater-than-or-equal").default("greater-than-or-equal"),
  })
  .superRefine((input, context) => {
    if (input.warning === undefined && input.critical === undefined) {
      context.addIssue({
        code: "custom",
        message: "threshold rules require warning or critical",
        path: ["warning"],
      });
    }
    if (
      input.warning !== undefined &&
      input.critical !== undefined &&
      input.critical < input.warning
    ) {
      context.addIssue({
        code: "custom",
        message: "critical threshold must be greater than or equal to warning",
        path: ["critical"],
      });
    }
    if (!signalMetrics[input.signal].includes(input.metric)) {
      context.addIssue({
        code: "custom",
        message: "threshold metric must match signal",
        path: ["metric"],
      });
    }
  });

export const configureRuntimeMonitoringThresholdsCommandInputSchema = z.object({
  policyId: z.string().min(1).optional(),
  scope: runtimeMonitoringScopeSchema,
  rules: z.array(runtimeMonitoringThresholdRuleInputSchema).min(1),
  enabled: z.boolean().default(true),
  idempotencyKey: z.string().min(1).optional(),
});

const showRuntimeMonitoringThresholdsCanonicalInputSchema = z.object({
  scope: runtimeMonitoringScopeSchema,
  policyId: z.string().min(1).optional(),
  window: runtimeMonitoringWindowSchema.optional(),
});

const showRuntimeMonitoringThresholdsDottedInputSchema = z
  .union([
    z.object({
      "scope.kind": z.literal("server"),
      "scope.serverId": z.string().min(1),
      "window.from": z.string().datetime().optional(),
      "window.to": z.string().datetime().optional(),
      policyId: z.string().min(1).optional(),
    }),
    z.object({
      "scope.kind": z.literal("project"),
      "scope.projectId": z.string().min(1),
      "window.from": z.string().datetime().optional(),
      "window.to": z.string().datetime().optional(),
      policyId: z.string().min(1).optional(),
    }),
    z.object({
      "scope.kind": z.literal("environment"),
      "scope.environmentId": z.string().min(1),
      "window.from": z.string().datetime().optional(),
      "window.to": z.string().datetime().optional(),
      policyId: z.string().min(1).optional(),
    }),
    z.object({
      "scope.kind": z.literal("resource"),
      "scope.resourceId": z.string().min(1),
      "window.from": z.string().datetime().optional(),
      "window.to": z.string().datetime().optional(),
      policyId: z.string().min(1).optional(),
    }),
    z.object({
      "scope.kind": z.literal("deployment"),
      "scope.deploymentId": z.string().min(1),
      "window.from": z.string().datetime().optional(),
      "window.to": z.string().datetime().optional(),
      policyId: z.string().min(1).optional(),
    }),
  ])
  .superRefine((input, context) => {
    if (Boolean(input["window.from"]) !== Boolean(input["window.to"])) {
      context.addIssue({
        code: "custom",
        message: "window.from and window.to must be provided together",
        path: ["window"],
      });
    }
  })
  .transform((input) => {
    const window =
      input["window.from"] && input["window.to"]
        ? {
            from: input["window.from"],
            to: input["window.to"],
          }
        : undefined;
    const common = {
      ...(input.policyId ? { policyId: input.policyId } : {}),
      ...(window ? { window } : {}),
    };
    switch (input["scope.kind"]) {
      case "server":
        return {
          scope: { kind: input["scope.kind"], serverId: input["scope.serverId"] },
          ...common,
        };
      case "project":
        return {
          scope: { kind: input["scope.kind"], projectId: input["scope.projectId"] },
          ...common,
        };
      case "environment":
        return {
          scope: { kind: input["scope.kind"], environmentId: input["scope.environmentId"] },
          ...common,
        };
      case "resource":
        return {
          scope: { kind: input["scope.kind"], resourceId: input["scope.resourceId"] },
          ...common,
        };
      case "deployment":
        return {
          scope: { kind: input["scope.kind"], deploymentId: input["scope.deploymentId"] },
          ...common,
        };
    }
  });

export const showRuntimeMonitoringThresholdsQueryInputSchema = z.union([
  showRuntimeMonitoringThresholdsCanonicalInputSchema,
  showRuntimeMonitoringThresholdsDottedInputSchema,
]);

export type ListRuntimeMonitoringSamplesQueryInput = z.input<
  typeof listRuntimeMonitoringSamplesQueryInputSchema
>;
export type ParsedListRuntimeMonitoringSamplesQueryInput = z.output<
  typeof listRuntimeMonitoringSamplesQueryInputSchema
>;
export type RuntimeMonitoringRollupQueryInput = z.input<
  typeof runtimeMonitoringRollupQueryInputSchema
>;
export type ParsedRuntimeMonitoringRollupQueryInput = z.output<
  typeof runtimeMonitoringRollupQueryInputSchema
>;
export type ConfigureRuntimeMonitoringThresholdsCommandInput = z.input<
  typeof configureRuntimeMonitoringThresholdsCommandInputSchema
>;
export type ConfigureRuntimeMonitoringThresholdsCommandPayload = z.output<
  typeof configureRuntimeMonitoringThresholdsCommandInputSchema
>;
export type ShowRuntimeMonitoringThresholdsQueryInput = z.input<
  typeof showRuntimeMonitoringThresholdsQueryInputSchema
>;
export type ParsedShowRuntimeMonitoringThresholdsQueryInput = z.output<
  typeof showRuntimeMonitoringThresholdsQueryInputSchema
>;
