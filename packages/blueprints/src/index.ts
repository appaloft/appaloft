import { basename } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

export const blueprintSchemaVersion = "appaloft.blueprint/v1" as const;
export const blueprintInstallPlanSchemaVersion = "appaloft.blueprint.install-plan/v1" as const;
export const blueprintUpgradePlanSchemaVersion = "appaloft.blueprint.upgrade-plan/v1" as const;
export const blueprintApplicationBundlePlanSchemaVersion =
  "appaloft.blueprint.application-bundle-plan/v1" as const;
export const blueprintComponentRuntimeProjectionSchemaVersion =
  "appaloft.blueprint.component-runtime-projection/v1" as const;
export const blueprintComponentRuntimePlanMetadataKey =
  "appaloft.blueprint.component-runtime-plan.v1" as const;

const slugPattern = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/;
const dependencyCapabilityNamePattern = /^[a-z](?:[a-z0-9_-]{0,62}[a-z0-9])?$/;
const envKeyPattern = /^[_A-Z][_A-Z0-9]{0,127}$/;
const dependencyTemplateReferencePattern = /\$\{([a-zA-Z][a-zA-Z0-9_-]*)\}/g;

const nonEmptyString = z.string().trim().min(1);
const slugSchema = z.string().trim().regex(slugPattern);
const dependencyCapabilityNameSchema = z.string().trim().regex(dependencyCapabilityNamePattern);
const envKeySchema = z.string().trim().regex(envKeyPattern);
const versionLiteralSchema = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?$/);
const versionRangeSchema = z
  .string()
  .trim()
  .refine(isValidVersionRange, "version range must use comparator clauses such as >=15 <17");

export const blueprintDependencyKinds = [
  "postgres",
  "mongodb",
  "mysql",
  "redis",
  "volume",
  "object-storage",
  "clickhouse",
  "opensearch",
] as const;

export const blueprintDependencyEngineFamilies = [
  "postgres",
  "mongodb",
  "mysql",
  "mariadb",
  "redis",
  "volume",
  "object-storage",
  "clickhouse",
  "opensearch",
] as const;

export const blueprintDependencyOutputNames = [
  "host",
  "port",
  "database",
  "username",
  "password",
  "url",
  "endpoint",
  "bucket",
  "accessKeyId",
  "secretAccessKey",
  "mountPath",
] as const;

const blueprintDependencyKindSchema = z.enum(blueprintDependencyKinds);
const blueprintDependencyEngineFamilySchema = z.enum(blueprintDependencyEngineFamilies);
const blueprintDependencyOutputNameSchema = z.enum(blueprintDependencyOutputNames);

const blueprintParameterSchema = z
  .object({
    key: envKeySchema,
    label: nonEmptyString,
    type: z.enum(["string", "number", "boolean"]),
    required: z.boolean().default(true),
    description: nonEmptyString.optional(),
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  })
  .strict();

const blueprintSecretSchema = z
  .object({
    key: envKeySchema,
    label: nonEmptyString,
    required: z.boolean().default(true),
    description: nonEmptyString.optional(),
  })
  .strict();

const blueprintPortSchema = z
  .object({
    name: slugSchema,
    containerPort: z.number().int().min(1).max(65535),
    protocol: z.enum(["http", "tcp", "grpc"]).default("http"),
    public: z.boolean().default(true),
  })
  .strict();

const blueprintRuntimeSchema = z
  .object({
    strategy: z.enum(["container-image", "dockerfile", "workspace-commands", "static-artifact"]),
    image: nonEmptyString.optional(),
    dockerfilePath: nonEmptyString.optional(),
    buildCommand: nonEmptyString.optional(),
    startCommand: nonEmptyString.optional(),
    outputDirectory: nonEmptyString.optional(),
    command: z.array(nonEmptyString).optional(),
    version: nonEmptyString.optional(),
    versionKind: z
      .enum([
        "branch",
        "tag",
        "commit-sha",
        "image-tag",
        "image-digest",
        "content-digest",
        "release",
        "literal",
      ])
      .optional(),
  })
  .strict()
  .superRefine((runtime, context) => {
    if (runtime.strategy === "container-image" && !runtime.image) {
      context.addIssue({
        code: "custom",
        message: "container-image runtime requires image",
        path: ["image"],
      });
    }
    if (runtime.strategy === "dockerfile" && !runtime.dockerfilePath) {
      context.addIssue({
        code: "custom",
        message: "dockerfile runtime requires dockerfilePath",
        path: ["dockerfilePath"],
      });
    }
    if (runtime.strategy === "workspace-commands" && !runtime.startCommand) {
      context.addIssue({
        code: "custom",
        message: "workspace-commands runtime requires startCommand",
        path: ["startCommand"],
      });
    }
    if (runtime.strategy === "static-artifact" && !runtime.outputDirectory) {
      context.addIssue({
        code: "custom",
        message: "static-artifact runtime requires outputDirectory",
        path: ["outputDirectory"],
      });
    }
  });

const blueprintRouteSchema = z
  .object({
    port: slugSchema,
    pathPrefix: z.string().trim().min(1).default("/"),
  })
  .strict();

const blueprintVariableSchema = z
  .object({
    key: envKeySchema,
    value: z.string(),
    description: nonEmptyString.optional(),
  })
  .strict();

const blueprintPostgresExtensionCapabilitySchema = z
  .object({
    type: z.literal("postgres-extension"),
    name: dependencyCapabilityNameSchema,
    required: z.boolean().default(true),
    description: nonEmptyString.optional(),
  })
  .strict();

const blueprintRedisModuleCapabilitySchema = z
  .object({
    type: z.literal("redis-module"),
    name: dependencyCapabilityNameSchema,
    required: z.boolean().default(true),
    description: nonEmptyString.optional(),
  })
  .strict();

const blueprintDependencyCapabilitySchema = z.discriminatedUnion("type", [
  blueprintPostgresExtensionCapabilitySchema,
  blueprintRedisModuleCapabilitySchema,
]);

const blueprintDependencyEngineSchema = z
  .object({
    family: blueprintDependencyEngineFamilySchema.optional(),
    name: nonEmptyString.optional(),
    edition: nonEmptyString.optional(),
  })
  .strict();

const blueprintDependencyVersionRequirementSchema = z
  .object({
    preferred: versionLiteralSchema.optional(),
    range: versionRangeSchema.optional(),
    minimum: versionLiteralSchema.optional(),
    maximum: versionLiteralSchema.optional(),
  })
  .strict()
  .superRefine((version, context) => {
    if (!version.preferred && !version.range && !version.minimum && !version.maximum) {
      context.addIssue({
        code: "custom",
        message: "dependency version requires preferred, range, minimum, or maximum",
        path: [],
      });
    }
  });

const blueprintDependencyOutputRequirementSchema = z
  .object({
    name: blueprintDependencyOutputNameSchema,
    secret: z.boolean().optional(),
  })
  .strict();

const blueprintDependencyReadinessSchema = z
  .object({
    type: z.enum([
      "tcp",
      "http",
      "postgres",
      "redis",
      "mongodb",
      "mysql",
      "clickhouse-native",
      "clickhouse-http",
      "opensearch",
      "object-storage",
    ]),
    database: nonEmptyString.optional(),
    path: nonEmptyString.optional(),
    port: z.number().int().min(1).max(65535).optional(),
    required: z.boolean().default(true),
  })
  .strict();

const blueprintDependencyProvisioningSchema = z
  .object({
    modes: z
      .array(z.enum(["bind-existing", "provision"]))
      .min(1)
      .optional(),
    providerKeys: z.array(nonEmptyString).min(1).optional(),
    dedicatedInstance: z.boolean().optional(),
  })
  .strict();

const blueprintDependencyEnvSchema = z
  .object({
    resource: slugSchema,
    name: envKeySchema,
    valueFrom: blueprintDependencyOutputNameSchema.optional(),
    template: nonEmptyString.optional(),
    secret: z.boolean().optional(),
  })
  .strict()
  .superRefine((env, context) => {
    if ((env.valueFrom ? 1 : 0) + (env.template ? 1 : 0) !== 1) {
      context.addIssue({
        code: "custom",
        message: "dependencyEnv requires exactly one of valueFrom or template",
        path: [],
      });
    }
  });

const blueprintComponentRelationInjectEnvEffectSchema = z
  .object({
    kind: z.literal("inject-env"),
    name: envKeySchema,
    valueFrom: z.enum(["endpoint-url", "endpoint-host", "endpoint-port", "endpoint-scheme"]),
  })
  .strict();

const blueprintComponentRelationNetworkAllowEffectSchema = z
  .object({
    kind: z.literal("network-allow"),
    mode: z.literal("private").default("private"),
  })
  .strict();

const blueprintComponentRelationPrivateServiceDiscoveryEffectSchema = z
  .object({
    kind: z.literal("private-service-discovery"),
    valueFrom: z.enum(["service-name", "endpoint-host"]).default("service-name"),
  })
  .strict();

const blueprintComponentRelationOrderAfterEffectSchema = z
  .object({
    kind: z.literal("order-after"),
    readiness: z.enum(["created", "started", "healthy"]),
  })
  .strict();

const blueprintComponentRelationReadinessGateEffectSchema = z
  .object({
    kind: z.literal("readiness-gate"),
    readiness: z.enum(["started", "healthy"]),
  })
  .strict();

const blueprintComponentRelationAttachTelemetryEffectSchema = z
  .object({
    kind: z.literal("attach-telemetry"),
    signal: z.enum(["traces", "metrics", "logs"]),
    valueFrom: z.literal("endpoint-url").default("endpoint-url"),
  })
  .strict();

const blueprintComponentRelationEffectSchema = z.discriminatedUnion("kind", [
  blueprintComponentRelationInjectEnvEffectSchema,
  blueprintComponentRelationNetworkAllowEffectSchema,
  blueprintComponentRelationPrivateServiceDiscoveryEffectSchema,
  blueprintComponentRelationOrderAfterEffectSchema,
  blueprintComponentRelationReadinessGateEffectSchema,
  blueprintComponentRelationAttachTelemetryEffectSchema,
]);

const blueprintComponentRelationSchema = z
  .object({
    id: slugSchema,
    type: z.enum(["endpoint", "lifecycle", "telemetry"]),
    from: slugSchema,
    to: slugSchema,
    endpoint: slugSchema.optional(),
    required: z.boolean().default(true),
    description: nonEmptyString.optional(),
    effects: z.array(blueprintComponentRelationEffectSchema).default([]),
  })
  .strict();

const blueprintComponentHealthCheckSchema = z
  .object({
    enabled: z.boolean().default(true),
    type: z.literal("http").default("http"),
    intervalSeconds: z.number().int().positive().default(5),
    timeoutSeconds: z.number().int().positive().default(5),
    retries: z.number().int().positive().default(10),
    startPeriodSeconds: z.number().int().nonnegative().default(5),
    http: z
      .object({
        method: z.enum(["GET", "HEAD", "POST", "OPTIONS"]).default("GET"),
        scheme: z.enum(["http", "https"]).default("http"),
        host: nonEmptyString.default("localhost"),
        port: z.number().int().positive().max(65535).optional(),
        path: nonEmptyString.default("/"),
        expectedStatusCode: z.number().int().min(100).max(599).default(200),
        expectedResponseText: nonEmptyString.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.enabled && value.type === "http" && !value.http) {
      context.addIssue({
        code: "custom",
        path: ["http"],
        message: "HTTP health checks require http configuration",
      });
    }
  });

const blueprintComponentSchema = z
  .object({
    id: slugSchema,
    name: nonEmptyString,
    kind: z.enum(["service", "worker", "static-site", "mcp-server"]),
    runtime: blueprintRuntimeSchema,
    ports: z.array(blueprintPortSchema).default([]),
    routes: z.array(blueprintRouteSchema).default([]),
    healthCheck: blueprintComponentHealthCheckSchema.optional(),
    variables: z.array(blueprintVariableSchema).default([]),
    usesSecrets: z.array(envKeySchema).default([]),
    usesResources: z.array(slugSchema).default([]),
    dependencyEnv: z.array(blueprintDependencyEnvSchema).default([]),
  })
  .strict();

const blueprintResourceRequirementSchema = z
  .object({
    id: slugSchema,
    kind: blueprintDependencyKindSchema,
    label: nonEmptyString,
    optional: z.boolean().default(false),
    engine: blueprintDependencyEngineSchema.optional(),
    version: blueprintDependencyVersionRequirementSchema.optional(),
    capabilities: z.array(blueprintDependencyCapabilitySchema).default([]),
    outputs: z.array(blueprintDependencyOutputRequirementSchema).default([]),
    readiness: z.array(blueprintDependencyReadinessSchema).default([]),
    provisioning: blueprintDependencyProvisioningSchema.optional(),
  })
  .strict()
  .superRefine((resource, context) => {
    const engineFamily = dependencyEngineFamily(resource);
    if (!isDependencyEngineCompatible(resource.kind, engineFamily)) {
      context.addIssue({
        code: "custom",
        message: `dependency engine family ${engineFamily} is not compatible with kind ${resource.kind}`,
        path: ["engine", "family"],
      });
    }
    for (const [index, capability] of resource.capabilities.entries()) {
      if (capability.type === "postgres-extension" && resource.kind !== "postgres") {
        context.addIssue({
          code: "custom",
          message: "postgres-extension capability requires a postgres dependency resource",
          path: ["capabilities", index, "type"],
        });
      }
      if (capability.type === "redis-module" && resource.kind !== "redis") {
        context.addIssue({
          code: "custom",
          message: "redis-module capability requires a redis dependency resource",
          path: ["capabilities", index, "type"],
        });
      }
    }
    for (const [index, output] of resource.outputs.entries()) {
      if (!dependencySupportedOutputNames(resource).has(output.name)) {
        context.addIssue({
          code: "custom",
          message: `dependency output ${output.name} is not supported by kind ${resource.kind}`,
          path: ["outputs", index, "name"],
        });
      }
      if (output.secret === false && isDependencyOutputSecret(resource, output.name)) {
        context.addIssue({
          code: "custom",
          message: `dependency output ${output.name} is secret and cannot be marked non-secret`,
          path: ["outputs", index, "secret"],
        });
      }
    }
    for (const [index, readiness] of resource.readiness.entries()) {
      if (!isDependencyReadinessCompatible(resource, readiness.type)) {
        context.addIssue({
          code: "custom",
          message: `dependency readiness ${readiness.type} is not compatible with kind ${resource.kind}`,
          path: ["readiness", index, "type"],
        });
      }
    }
  });

const blueprintEnvironmentProfileSchema = z
  .object({
    label: nonEmptyString.optional(),
    description: nonEmptyString.optional(),
    replicas: z.number().int().min(0).default(1),
    variables: z.array(blueprintVariableSchema).default([]),
    routes: z.array(blueprintRouteSchema).default([]),
  })
  .strict();

const blueprintUpgradeStepSchema = z
  .object({
    from: nonEmptyString.optional(),
    to: nonEmptyString.optional(),
    classification: z.enum(["non-breaking", "potentially-breaking", "breaking"]),
    requiresManualReview: z.boolean().default(false),
    notes: nonEmptyString.optional(),
    changes: z.array(nonEmptyString).default([]),
  })
  .strict();

const blueprintUpgradePolicySchema = z
  .object({
    strategy: z
      .enum(["image-tag", "blueprint-plan", "application-managed", "manual"])
      .default("blueprint-plan"),
    destructive: z.boolean().default(false),
    instructions: nonEmptyString.optional(),
    steps: z.array(blueprintUpgradeStepSchema).default([]),
  })
  .strict();

const blueprintVariantSchema = z
  .object({
    label: nonEmptyString.optional(),
    summary: nonEmptyString.optional(),
    description: nonEmptyString.optional(),
    tags: z.array(slugSchema).default([]),
    defaultProfile: slugSchema.optional(),
    parameters: z.array(blueprintParameterSchema).optional(),
    secrets: z.array(blueprintSecretSchema).optional(),
    resources: z.array(blueprintResourceRequirementSchema).optional(),
    components: z.array(blueprintComponentSchema).min(1).optional(),
    componentRelations: z.array(blueprintComponentRelationSchema).optional(),
    profiles: z.record(slugSchema, blueprintEnvironmentProfileSchema).optional(),
    upgrade: blueprintUpgradePolicySchema.optional(),
  })
  .strict();

export const blueprintManifestSchema = z
  .object({
    schemaVersion: z.literal(blueprintSchemaVersion),
    id: slugSchema,
    name: nonEmptyString,
    version: nonEmptyString,
    summary: nonEmptyString,
    description: nonEmptyString.optional(),
    tags: z.array(slugSchema).default([]),
    parameters: z.array(blueprintParameterSchema).default([]),
    secrets: z.array(blueprintSecretSchema).default([]),
    resources: z.array(blueprintResourceRequirementSchema).default([]),
    components: z.array(blueprintComponentSchema).min(1),
    componentRelations: z.array(blueprintComponentRelationSchema).default([]),
    profiles: z.record(slugSchema, blueprintEnvironmentProfileSchema).default({}),
    defaultVariant: slugSchema.optional(),
    variants: z.record(slugSchema, blueprintVariantSchema).default({}),
    upgrade: blueprintUpgradePolicySchema.optional(),
  })
  .strict()
  .superRefine((manifest, context) => {
    validateTopologyReferences({
      context,
      path: [],
      components: manifest.components,
      secrets: manifest.secrets,
      resources: manifest.resources,
      relations: manifest.componentRelations,
      parameters: manifest.parameters,
      profiles: manifest.profiles,
    });

    if (manifest.defaultVariant && !manifest.variants[manifest.defaultVariant]) {
      context.addIssue({
        code: "custom",
        message: `defaultVariant references unknown variant ${manifest.defaultVariant}`,
        path: ["defaultVariant"],
      });
    }

    for (const [variantId, variant] of Object.entries(manifest.variants)) {
      validateTopologyReferences({
        context,
        path: ["variants", variantId],
        components: variant.components ?? manifest.components,
        relations: variant.componentRelations ?? manifest.componentRelations,
        secrets: variant.secrets ?? manifest.secrets,
        resources: variant.resources ?? manifest.resources,
        parameters: variant.parameters ?? manifest.parameters,
        profiles: variant.profiles ?? manifest.profiles,
      });

      const profiles = variant.profiles ?? manifest.profiles;
      if (variant.defaultProfile && !profiles[variant.defaultProfile]) {
        context.addIssue({
          code: "custom",
          message: `variant defaultProfile references unknown profile ${variant.defaultProfile}`,
          path: ["variants", variantId, "defaultProfile"],
        });
      }
    }
  });

export const blueprintManifestJsonSchema = z.toJSONSchema(blueprintManifestSchema, {
  io: "input",
});

function validateTopologyReferences(input: {
  readonly context: z.RefinementCtx;
  readonly path: readonly (number | string)[];
  readonly components: readonly z.infer<typeof blueprintComponentSchema>[];
  readonly relations: readonly z.infer<typeof blueprintComponentRelationSchema>[];
  readonly secrets: readonly z.infer<typeof blueprintSecretSchema>[];
  readonly resources: readonly z.infer<typeof blueprintResourceRequirementSchema>[];
  readonly parameters: readonly z.infer<typeof blueprintParameterSchema>[];
  readonly profiles: Readonly<Record<string, z.infer<typeof blueprintEnvironmentProfileSchema>>>;
}): void {
  const componentIds = new Set(input.components.map((component) => component.id));
  const secretKeys = new Set(input.secrets.map((secret) => secret.key));
  const resourceIds = new Set(input.resources.map((resource) => resource.id));
  const resourcesById = new Map(input.resources.map((resource) => [resource.id, resource]));
  const parameterKeys = new Set(input.parameters.map((parameter) => parameter.key));
  const relationIds = new Set(input.relations.map((relation) => relation.id));

  if (componentIds.size !== input.components.length) {
    input.context.addIssue({
      code: "custom",
      message: "component ids must be unique",
      path: [...input.path, "components"],
    });
  }
  if (secretKeys.size !== input.secrets.length) {
    input.context.addIssue({
      code: "custom",
      message: "secret keys must be unique",
      path: [...input.path, "secrets"],
    });
  }
  if (resourceIds.size !== input.resources.length) {
    input.context.addIssue({
      code: "custom",
      message: "resource ids must be unique",
      path: [...input.path, "resources"],
    });
  }
  if (parameterKeys.size !== input.parameters.length) {
    input.context.addIssue({
      code: "custom",
      message: "parameter keys must be unique",
      path: [...input.path, "parameters"],
    });
  }
  if (relationIds.size !== input.relations.length) {
    input.context.addIssue({
      code: "custom",
      message: "component relation ids must be unique",
      path: [...input.path, "componentRelations"],
    });
  }

  for (const component of input.components) {
    const portNames = new Set(component.ports.map((port) => port.name));
    for (const route of component.routes) {
      if (!portNames.has(route.port)) {
        input.context.addIssue({
          code: "custom",
          message: `route references unknown component port ${route.port}`,
          path: [...input.path, "components", input.components.indexOf(component), "routes"],
        });
      }
    }
    for (const secretKey of component.usesSecrets) {
      if (!secretKeys.has(secretKey)) {
        input.context.addIssue({
          code: "custom",
          message: `component references unknown secret ${secretKey}`,
          path: [...input.path, "components", input.components.indexOf(component), "usesSecrets"],
        });
      }
    }
    for (const resourceId of component.usesResources) {
      if (!resourceIds.has(resourceId)) {
        input.context.addIssue({
          code: "custom",
          message: `component references unknown resource ${resourceId}`,
          path: [...input.path, "components", input.components.indexOf(component), "usesResources"],
        });
      }
    }
    for (const [envIndex, dependencyEnv] of component.dependencyEnv.entries()) {
      const resource = resourcesById.get(dependencyEnv.resource);
      const envPath = [
        ...input.path,
        "components",
        input.components.indexOf(component),
        "dependencyEnv",
        envIndex,
      ];
      if (!resource) {
        input.context.addIssue({
          code: "custom",
          message: `dependencyEnv references unknown resource ${dependencyEnv.resource}`,
          path: [...envPath, "resource"],
        });
        continue;
      }
      if (!component.usesResources.includes(dependencyEnv.resource)) {
        input.context.addIssue({
          code: "custom",
          message: `dependencyEnv resource ${dependencyEnv.resource} must also be listed in usesResources`,
          path: [...envPath, "resource"],
        });
      }
      const supportedOutputs = dependencySupportedOutputNames(resource);
      if (dependencyEnv.valueFrom && !supportedOutputs.has(dependencyEnv.valueFrom)) {
        input.context.addIssue({
          code: "custom",
          message: `dependencyEnv valueFrom references unavailable output ${dependencyEnv.valueFrom}`,
          path: [...envPath, "valueFrom"],
        });
      }
      for (const outputName of dependencyTemplateOutputNames(dependencyEnv.template)) {
        if (!supportedOutputs.has(outputName)) {
          input.context.addIssue({
            code: "custom",
            message: `dependencyEnv template references unavailable output ${outputName}`,
            path: [...envPath, "template"],
          });
        }
      }
    }
  }

  validateComponentRelations(input, componentIds, resourceIds, parameterKeys);
}

function validateComponentRelations(
  input: {
    readonly context: z.RefinementCtx;
    readonly path: readonly (number | string)[];
    readonly components: readonly z.infer<typeof blueprintComponentSchema>[];
    readonly relations: readonly z.infer<typeof blueprintComponentRelationSchema>[];
    readonly profiles: Readonly<Record<string, z.infer<typeof blueprintEnvironmentProfileSchema>>>;
  },
  componentIds: ReadonlySet<string>,
  resourceIds: ReadonlySet<string>,
  parameterKeys: ReadonlySet<string>,
): void {
  const componentsById = new Map(input.components.map((component) => [component.id, component]));
  const profileVariableKeys = new Set(
    Object.values(input.profiles).flatMap((profile) =>
      profile.variables.map((variable) => variable.key),
    ),
  );
  const injectedEnvByComponent = new Map<string, Set<string>>();

  for (const [index, relation] of input.relations.entries()) {
    const relationPath = [...input.path, "componentRelations", index];
    const fromComponent = componentsById.get(relation.from);
    const toComponent = componentsById.get(relation.to);

    if (resourceIds.has(relation.from)) {
      input.context.addIssue({
        code: "custom",
        message: `component relation ${relation.id} from references dependency resource ${relation.from}; use component dependency binding for resources`,
        path: [...relationPath, "from"],
      });
    } else if (!componentIds.has(relation.from)) {
      input.context.addIssue({
        code: "custom",
        message: `component relation ${relation.id} references unknown from component ${relation.from}`,
        path: [...relationPath, "from"],
      });
    }

    if (resourceIds.has(relation.to)) {
      input.context.addIssue({
        code: "custom",
        message: `component relation ${relation.id} to references dependency resource ${relation.to}; use component dependency binding for resources`,
        path: [...relationPath, "to"],
      });
    } else if (!componentIds.has(relation.to)) {
      input.context.addIssue({
        code: "custom",
        message: `component relation ${relation.id} references unknown to component ${relation.to}`,
        path: [...relationPath, "to"],
      });
    }

    if (relation.type === "endpoint" && !relation.endpoint) {
      input.context.addIssue({
        code: "custom",
        message: `endpoint component relation ${relation.id} requires endpoint`,
        path: [...relationPath, "endpoint"],
      });
    }

    if (relation.endpoint && toComponent) {
      const providerPortNames = new Set(toComponent.ports.map((port) => port.name));
      if (!providerPortNames.has(relation.endpoint)) {
        input.context.addIssue({
          code: "custom",
          message: `component relation ${relation.id} references unknown provider endpoint ${relation.endpoint}`,
          path: [...relationPath, "endpoint"],
        });
      }
    }

    const outputs = new Set(componentRelationOutputs(relation));
    for (const [effectIndex, effect] of relation.effects.entries()) {
      const effectPath = [...relationPath, "effects", effectIndex];
      validateComponentRelationEffect(input.context, effectPath, relation, effect, outputs);

      if (effect.kind === "inject-env") {
        const componentVariableKeys = new Set(
          fromComponent?.variables.map((variable) => variable.key),
        );
        if (
          componentVariableKeys.has(effect.name) ||
          profileVariableKeys.has(effect.name) ||
          parameterKeys.has(effect.name)
        ) {
          input.context.addIssue({
            code: "custom",
            message: `component relation ${relation.id} inject-env duplicates existing variable ${effect.name}`,
            path: [...effectPath, "name"],
          });
        }

        const injectedNames = injectedEnvByComponent.get(relation.from) ?? new Set<string>();
        if (injectedNames.has(effect.name)) {
          input.context.addIssue({
            code: "custom",
            message: `component relation ${relation.id} inject-env duplicates relation variable ${effect.name}`,
            path: [...effectPath, "name"],
          });
        }
        injectedNames.add(effect.name);
        injectedEnvByComponent.set(relation.from, injectedNames);
      }
    }
  }

  const topology = new BlueprintComponentRelationGraph({
    components: input.components,
    relations: input.relations,
  }).topologicalSort();
  if (!topology.ok) {
    input.context.addIssue({
      code: "custom",
      message: `required lifecycle component relations form a startup cycle: ${topology.error.cycle.join(" -> ")}`,
      path: [...input.path, "componentRelations"],
    });
  }
}

function validateComponentRelationEffect(
  context: z.RefinementCtx,
  path: readonly (number | string)[],
  relation: z.infer<typeof blueprintComponentRelationSchema>,
  effect: z.infer<typeof blueprintComponentRelationEffectSchema>,
  outputs: ReadonlySet<string>,
): void {
  if (
    (effect.kind === "order-after" || effect.kind === "readiness-gate") &&
    relation.type !== "lifecycle"
  ) {
    context.addIssue({
      code: "custom",
      message: `${effect.kind} effect requires a lifecycle component relation`,
      path: [...path, "kind"],
    });
  }

  if (effect.kind === "attach-telemetry" && relation.type !== "telemetry") {
    context.addIssue({
      code: "custom",
      message: "attach-telemetry effect requires a telemetry component relation",
      path: [...path, "kind"],
    });
  }

  const valueFrom = componentRelationEffectValueFrom(effect);
  if (valueFrom && !outputs.has(valueFrom)) {
    context.addIssue({
      code: "custom",
      message: `component relation effect references unavailable output ${valueFrom}`,
      path: [...path, "valueFrom"],
    });
  }
}

function componentRelationEffectValueFrom(
  effect: z.infer<typeof blueprintComponentRelationEffectSchema>,
): string | undefined {
  switch (effect.kind) {
    case "inject-env":
    case "private-service-discovery":
    case "attach-telemetry":
      return effect.valueFrom;
    case "network-allow":
    case "order-after":
    case "readiness-gate":
      return undefined;
  }
}

function componentRelationOutputs(
  relation: z.infer<typeof blueprintComponentRelationSchema>,
): readonly BlueprintComponentRelationOutput[] {
  const outputs = new Set<BlueprintComponentRelationOutput>(["service-name"]);
  if (relation.endpoint) {
    outputs.add("endpoint-url");
    outputs.add("endpoint-host");
    outputs.add("endpoint-port");
    outputs.add("endpoint-scheme");
  }
  if (relation.type === "lifecycle") {
    outputs.add("readiness-state");
  }
  return [...outputs];
}

function isValidVersionRange(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  const tokenPattern = /^(?:>=|<=|>|<|=|\^|~)?\d+(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?$/;
  return trimmed.split(/\s+/).every((token) => tokenPattern.test(token));
}

function dependencyEngineFamily(
  resource: Pick<BlueprintResourceRequirement, "kind" | "engine">,
): BlueprintDependencyEngineFamily {
  return resource.engine?.family ?? resource.kind;
}

function isDependencyEngineCompatible(
  kind: BlueprintDependencyKind,
  family: BlueprintDependencyEngineFamily,
): boolean {
  if (kind === "mysql") {
    return family === "mysql" || family === "mariadb";
  }
  return kind === family;
}

function dependencySupportedOutputNames(
  resource: Pick<BlueprintResourceRequirement, "kind" | "engine">,
): ReadonlySet<BlueprintDependencyOutputName> {
  const engineFamily = dependencyEngineFamily(resource);
  switch (engineFamily) {
    case "postgres":
    case "mongodb":
    case "mysql":
    case "mariadb":
    case "clickhouse":
      return new Set(["host", "port", "database", "username", "password", "url"]);
    case "redis":
    case "opensearch":
      return new Set(["host", "port", "username", "password", "url"]);
    case "object-storage":
      return new Set(["endpoint", "bucket", "accessKeyId", "secretAccessKey", "url"]);
    case "volume":
      return new Set(["mountPath"]);
  }
}

function defaultDependencyOutputs(
  resource: Pick<BlueprintResourceRequirement, "kind" | "engine" | "outputs">,
): readonly BlueprintDependencyOutputRequirement[] {
  if (resource.outputs.length > 0) {
    return resource.outputs.map((output) => ({
      name: output.name,
      secret: output.secret ?? isDependencyOutputSecret(resource, output.name),
    }));
  }
  return [...dependencySupportedOutputNames(resource)].map((name) => ({
    name,
    secret: isDependencyOutputSecret(resource, name),
  }));
}

function isDependencyOutputSecret(
  resource: Pick<BlueprintResourceRequirement, "kind" | "engine">,
  output: BlueprintDependencyOutputName,
): boolean {
  const engineFamily = dependencyEngineFamily(resource);
  if (output === "password" || output === "secretAccessKey" || output === "accessKeyId") {
    return true;
  }
  if (output === "username") {
    return engineFamily !== "redis";
  }
  return output === "url" && engineFamily !== "volume";
}

function isDependencyReadinessCompatible(
  resource: Pick<BlueprintResourceRequirement, "kind" | "engine">,
  readinessType: BlueprintDependencyReadinessRequirement["type"],
): boolean {
  const engineFamily = dependencyEngineFamily(resource);
  if (readinessType === "tcp" || readinessType === "http") {
    return engineFamily !== "volume";
  }
  if (engineFamily === "mysql" || engineFamily === "mariadb") {
    return readinessType === "mysql";
  }
  if (engineFamily === "clickhouse") {
    return readinessType === "clickhouse-native" || readinessType === "clickhouse-http";
  }
  return readinessType === engineFamily;
}

function dependencyTemplateOutputNames(
  template: string | undefined,
): readonly BlueprintDependencyOutputName[] {
  if (!template) {
    return [];
  }
  const outputs: BlueprintDependencyOutputName[] = [];
  for (const match of template.matchAll(dependencyTemplateReferencePattern)) {
    const name = match[1];
    if (isDependencyOutputName(name)) {
      outputs.push(name);
    } else {
      outputs.push(name as BlueprintDependencyOutputName);
    }
  }
  return outputs;
}

function isDependencyOutputName(value: string | undefined): value is BlueprintDependencyOutputName {
  return Boolean(
    value && blueprintDependencyOutputNames.includes(value as BlueprintDependencyOutputName),
  );
}

function dependencyEnvSecret(
  resource: Pick<BlueprintResourceRequirement, "kind" | "engine">,
  env: BlueprintDependencyEnvRequirement,
): boolean {
  if (env.secret === true) {
    return true;
  }
  if (env.valueFrom) {
    return isDependencyOutputSecret(resource, env.valueFrom);
  }
  return dependencyTemplateOutputNames(env.template).some((output) =>
    isDependencyOutputSecret(resource, output),
  );
}

function dependencyEnvOutputNames(env: BlueprintDependencyEnvRequirement): readonly string[] {
  return env.valueFrom ? [env.valueFrom] : dependencyTemplateOutputNames(env.template);
}

export type BlueprintManifest = z.infer<typeof blueprintManifestSchema>;
export type BlueprintComponent = BlueprintManifest["components"][number];
export type BlueprintEnvironmentProfile = NonNullable<BlueprintManifest["profiles"]>[string];
export type BlueprintParameter = BlueprintManifest["parameters"][number];
export type BlueprintSecretPlaceholder = BlueprintManifest["secrets"][number];
export type BlueprintResourceRequirement = BlueprintManifest["resources"][number];
export type BlueprintDependencyKind = BlueprintResourceRequirement["kind"];
export type BlueprintDependencyEngine = NonNullable<BlueprintResourceRequirement["engine"]>;
export type BlueprintDependencyEngineFamily = (typeof blueprintDependencyEngineFamilies)[number];
export type BlueprintDependencyVersionRequirement = NonNullable<
  BlueprintResourceRequirement["version"]
>;
export type BlueprintDependencyCapability = BlueprintResourceRequirement["capabilities"][number];
export type BlueprintDependencyOutputName = (typeof blueprintDependencyOutputNames)[number];
export type BlueprintDependencyOutputRequirement = BlueprintResourceRequirement["outputs"][number];
export type BlueprintDependencyReadinessRequirement =
  BlueprintResourceRequirement["readiness"][number];
export type BlueprintDependencyProvisioningConstraints = NonNullable<
  BlueprintResourceRequirement["provisioning"]
>;
export type BlueprintDependencyEnvRequirement = BlueprintComponent["dependencyEnv"][number];
export type BlueprintComponentRelation = BlueprintManifest["componentRelations"][number];
export type BlueprintComponentRelationType = BlueprintComponentRelation["type"];
export type BlueprintComponentRelationEffect = BlueprintComponentRelation["effects"][number];
export type BlueprintComponentRelationOutput =
  | "endpoint-url"
  | "endpoint-host"
  | "endpoint-port"
  | "endpoint-scheme"
  | "service-name"
  | "readiness-state";
export type BlueprintVariant = NonNullable<BlueprintManifest["variants"]>[string];
export type BlueprintUpgradePolicy = NonNullable<BlueprintManifest["upgrade"]>;

export interface BlueprintComponentRelationTopologyEdge {
  readonly relationId: string;
  readonly beforeComponentId: string;
  readonly afterComponentId: string;
  readonly readiness: "created" | "started" | "healthy";
}

export interface BlueprintComponentRelationTopologyDescription {
  readonly rule: typeof BlueprintComponentRelationGraph.topologicalSortDescription;
  readonly relationDirection: "from-consumer-to-provider";
  readonly sortedComponentIds: readonly string[];
  readonly requiredLifecycleEdges: readonly BlueprintComponentRelationTopologyEdge[];
  readonly optionalLifecycleEdges: readonly BlueprintComponentRelationTopologyEdge[];
}

export type BlueprintComponentRelationTopologyResult =
  | {
      readonly ok: true;
      readonly value: BlueprintComponentRelationTopologyDescription;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "required_lifecycle_cycle";
        readonly cycle: readonly string[];
        readonly relationIds: readonly string[];
      };
    };

export class BlueprintComponentRelationGraph {
  static readonly topologicalSortDescription =
    "Topological sort orders provider components before consumer components for required lifecycle relations; relation direction remains from consumer/dependent to provider/dependency.";

  private readonly components: readonly BlueprintComponent[];
  private readonly relations: readonly BlueprintComponentRelation[];

  constructor(input: {
    readonly components: readonly BlueprintComponent[];
    readonly relations: readonly BlueprintComponentRelation[];
  }) {
    this.components = input.components;
    this.relations = input.relations;
  }

  topologicalSort(): BlueprintComponentRelationTopologyResult {
    const componentOrder = new Map(
      this.components.map((component, index) => [component.id, index]),
    );
    const indegree = new Map(this.components.map((component) => [component.id, 0]));
    const adjacency = new Map<string, BlueprintComponentRelationTopologyEdge[]>(
      this.components.map((component) => [component.id, []]),
    );
    const requiredLifecycleEdges = this.requiredLifecycleEdges();
    const optionalLifecycleEdges = this.optionalLifecycleEdges();

    for (const edge of requiredLifecycleEdges) {
      adjacency.get(edge.beforeComponentId)?.push(edge);
      indegree.set(edge.afterComponentId, (indegree.get(edge.afterComponentId) ?? 0) + 1);
    }

    const ready = this.components
      .map((component) => component.id)
      .filter((componentId) => indegree.get(componentId) === 0)
      .sort((left, right) => (componentOrder.get(left) ?? 0) - (componentOrder.get(right) ?? 0));
    const sortedComponentIds: string[] = [];

    while (ready.length > 0) {
      const componentId = ready.shift();
      if (!componentId) break;
      sortedComponentIds.push(componentId);

      const outgoing = adjacency.get(componentId) ?? [];
      for (const edge of outgoing) {
        const nextIndegree = (indegree.get(edge.afterComponentId) ?? 0) - 1;
        indegree.set(edge.afterComponentId, nextIndegree);
        if (nextIndegree === 0) {
          ready.push(edge.afterComponentId);
          ready.sort(
            (left, right) => (componentOrder.get(left) ?? 0) - (componentOrder.get(right) ?? 0),
          );
        }
      }
    }

    if (sortedComponentIds.length !== this.components.length) {
      const cycle = this.components
        .map((component) => component.id)
        .filter((componentId) => (indegree.get(componentId) ?? 0) > 0);
      const cycleIds = new Set(cycle);
      const relationIds = requiredLifecycleEdges
        .filter(
          (edge) => cycleIds.has(edge.beforeComponentId) && cycleIds.has(edge.afterComponentId),
        )
        .map((edge) => edge.relationId);
      return {
        ok: false,
        error: {
          code: "required_lifecycle_cycle",
          cycle,
          relationIds,
        },
      };
    }

    return {
      ok: true,
      value: {
        rule: BlueprintComponentRelationGraph.topologicalSortDescription,
        relationDirection: "from-consumer-to-provider",
        sortedComponentIds,
        requiredLifecycleEdges,
        optionalLifecycleEdges,
      },
    };
  }

  describeTopologicalSort(): string {
    const sorted = this.topologicalSort();
    if (!sorted.ok) {
      return `${BlueprintComponentRelationGraph.topologicalSortDescription} Required lifecycle cycle: ${sorted.error.cycle.join(" -> ")}.`;
    }
    const order = sorted.value.sortedComponentIds.join(" -> ");
    return `${BlueprintComponentRelationGraph.topologicalSortDescription} Current required lifecycle order: ${order}.`;
  }

  requiredLifecycleEdges(): readonly BlueprintComponentRelationTopologyEdge[] {
    return this.lifecycleEdges({ required: true });
  }

  optionalLifecycleEdges(): readonly BlueprintComponentRelationTopologyEdge[] {
    return this.lifecycleEdges({ required: false });
  }

  relationOutputs(
    relation: BlueprintComponentRelation,
  ): readonly BlueprintComponentRelationOutput[] {
    return componentRelationOutputs(relation);
  }

  private lifecycleEdges(input: {
    readonly required: boolean;
  }): readonly BlueprintComponentRelationTopologyEdge[] {
    const edges: BlueprintComponentRelationTopologyEdge[] = [];
    for (const relation of this.relations) {
      if (relation.type !== "lifecycle" || relation.required !== input.required) {
        continue;
      }
      for (const effect of relation.effects) {
        if (effect.kind !== "order-after" && effect.kind !== "readiness-gate") {
          continue;
        }
        edges.push({
          relationId: relation.id,
          beforeComponentId: relation.to,
          afterComponentId: relation.from,
          readiness: effect.readiness,
        });
      }
    }
    return edges;
  }
}

export interface BlueprintIssue {
  readonly path: readonly (number | string)[];
  readonly message: string;
}

export type BlueprintResult<T> =
  | {
      readonly ok: true;
      readonly value: T;
    }
  | {
      readonly ok: false;
      readonly issues: readonly BlueprintIssue[];
    };

export type BlueprintManifestFormat = "json" | "yaml";

export interface LoadBlueprintManifestInput {
  readonly content: string;
  readonly format?: BlueprintManifestFormat;
  readonly path?: string;
}

export interface BlueprintRegistryEntry {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly summary: string;
  readonly sourcePath: string;
  readonly tags: readonly string[];
  readonly defaultVariant?: string;
  readonly variants: readonly {
    readonly id: string;
    readonly label?: string;
    readonly summary?: string;
  }[];
}

export interface BlueprintRegistry {
  list(): Promise<readonly BlueprintRegistryEntry[]>;
  resolve(id: string): Promise<BlueprintResult<BlueprintManifest>>;
}

export interface LocalFileBlueprintRegistryOptions {
  readonly files: readonly string[];
  readTextFile?(path: string): Promise<string>;
}

export interface BlueprintInstallTarget {
  readonly projectName: string;
  readonly environmentName: string;
  readonly resourceSlugPrefix?: string;
}

export interface CreateBlueprintInstallPlanInput {
  readonly manifest: BlueprintManifest;
  readonly variant?: string;
  readonly profile?: string;
  readonly parameters?: Readonly<Record<string, string | number | boolean>>;
  readonly target: BlueprintInstallTarget;
}

export type BlueprintInstallOperation =
  | {
      readonly kind: "create-project";
      readonly projectName: string;
    }
  | {
      readonly kind: "create-environment";
      readonly environmentName: string;
      readonly profile: string;
    }
  | {
      readonly kind: "create-resource";
      readonly componentId: string;
      readonly componentKind: BlueprintComponent["kind"];
      readonly name: string;
      readonly slug: string;
    }
  | {
      readonly kind: "configure-runtime";
      readonly componentId: string;
      readonly runtime: BlueprintComponent["runtime"];
    }
  | {
      readonly kind: "configure-network";
      readonly componentId: string;
      readonly ports: readonly BlueprintComponent["ports"][number][];
    }
  | {
      readonly kind: "configure-access";
      readonly componentId: string;
      readonly routes: readonly BlueprintRoutePlan[];
    }
  | {
      readonly kind: "set-variable";
      readonly componentId: string;
      readonly key: string;
      readonly valueSource: "literal" | "parameter";
      readonly value: string | number | boolean;
    }
  | {
      readonly kind: "create-secret-reference";
      readonly componentId: string;
      readonly key: string;
      readonly required: boolean;
    }
  | {
      readonly kind: "bind-dependency";
      readonly componentId: string;
      readonly requirementId: string;
      readonly requirementKind: BlueprintResourceRequirement["kind"];
      readonly engine: BlueprintDependencyEngine;
      readonly version?: BlueprintDependencyVersionRequirement;
      readonly capabilities: readonly BlueprintDependencyCapability[];
      readonly outputs: readonly BlueprintDependencyOutputRequirement[];
      readonly readiness: readonly BlueprintDependencyReadinessRequirement[];
      readonly provisioning?: BlueprintDependencyProvisioningConstraints;
      readonly env: readonly BlueprintDependencyEnvPlan[];
    }
  | {
      readonly kind: "configure-component-link";
      readonly relationId: string;
      readonly relationType: BlueprintComponentRelationType;
      readonly fromComponentId: string;
      readonly toComponentId: string;
      readonly endpoint?: string;
      readonly required: boolean;
      readonly effects: readonly BlueprintComponentRelationEffect[];
      readonly outputs: readonly BlueprintComponentRelationOutput[];
    }
  | {
      readonly kind: "create-deployment";
      readonly componentId: string;
      readonly reason: "blueprint-install";
    };

export interface BlueprintRoutePlan {
  readonly port: string;
  readonly pathPrefix: string;
}

export interface BlueprintDependencyEnvPlan {
  readonly resourceId: string;
  readonly name: string;
  readonly valueFrom?: BlueprintDependencyOutputName;
  readonly template?: string;
  readonly outputNames: readonly string[];
  readonly secret: boolean;
}

export interface BlueprintInstallPlan {
  readonly schemaVersion: typeof blueprintInstallPlanSchemaVersion;
  readonly createsExternalResources: false;
  readonly blueprint: {
    readonly id: string;
    readonly name: string;
    readonly version: string;
    readonly variant?: string;
  };
  readonly profile: string;
  readonly target: BlueprintInstallTarget;
  readonly operations: readonly BlueprintInstallOperation[];
  readonly warnings: readonly string[];
}

export interface CreateBlueprintApplicationBundlePlanInput {
  readonly plan: BlueprintInstallPlan;
}

export interface BlueprintApplicationBundleIdentity {
  readonly blueprintId: string;
  readonly blueprintName: string;
  readonly blueprintVersion: string;
  readonly blueprintVariant?: string;
  readonly projectName: string;
  readonly environmentName: string;
  readonly profile: string;
}

export interface BlueprintApplicationBundleComponentPlan {
  readonly componentId: string;
  readonly name: string;
  readonly kind: BlueprintComponent["kind"];
  readonly resourceSlug: string;
  readonly runtime?: BlueprintComponent["runtime"];
  readonly ports: readonly BlueprintComponent["ports"][number][];
  readonly routes: readonly BlueprintRoutePlan[];
  readonly variables: readonly {
    readonly key: string;
    readonly valueSource: "literal" | "parameter";
    readonly value: string | number | boolean;
  }[];
  readonly secretReferences: readonly {
    readonly key: string;
    readonly required: boolean;
  }[];
  readonly dependencyBindings: readonly {
    readonly requirementId: string;
    readonly requirementKind: BlueprintResourceRequirement["kind"];
    readonly engine: BlueprintDependencyEngine;
    readonly version?: BlueprintDependencyVersionRequirement;
    readonly capabilities: readonly BlueprintDependencyCapability[];
    readonly outputs: readonly BlueprintDependencyOutputRequirement[];
    readonly readiness: readonly BlueprintDependencyReadinessRequirement[];
    readonly provisioning?: BlueprintDependencyProvisioningConstraints;
    readonly env: readonly BlueprintDependencyEnvPlan[];
  }[];
  readonly deploymentReason?: "blueprint-install";
}

export interface BlueprintApplicationBundleDependencyPlan {
  readonly requirementId: string;
  readonly kind: BlueprintResourceRequirement["kind"];
  readonly engine: BlueprintDependencyEngine;
  readonly version?: BlueprintDependencyVersionRequirement;
  readonly capabilities: readonly BlueprintDependencyCapability[];
  readonly outputs: readonly BlueprintDependencyOutputRequirement[];
  readonly readiness: readonly BlueprintDependencyReadinessRequirement[];
  readonly provisioning?: BlueprintDependencyProvisioningConstraints;
  readonly scope: "dependency-resource";
  readonly bindingMode: "bind-existing-or-provisioned";
}

export type BlueprintApplicationBundleRelationship =
  | {
      readonly kind: "application-contains-component";
      readonly componentId: string;
    }
  | {
      readonly kind: "component-deploys-as-resource";
      readonly componentId: string;
      readonly resourceSlug: string;
    }
  | {
      readonly kind: "component-binds-dependency";
      readonly componentId: string;
      readonly requirementId: string;
      readonly requirementKind: BlueprintResourceRequirement["kind"];
      readonly engine: BlueprintDependencyEngine;
      readonly version?: BlueprintDependencyVersionRequirement;
      readonly capabilities: readonly BlueprintDependencyCapability[];
      readonly outputs: readonly BlueprintDependencyOutputRequirement[];
      readonly readiness: readonly BlueprintDependencyReadinessRequirement[];
      readonly provisioning?: BlueprintDependencyProvisioningConstraints;
      readonly env: readonly BlueprintDependencyEnvPlan[];
    }
  | {
      readonly kind: "component-links-component";
      readonly relationId: string;
      readonly relationType: BlueprintComponentRelationType;
      readonly fromComponentId: string;
      readonly toComponentId: string;
      readonly endpoint?: string;
      readonly required: boolean;
      readonly effects: readonly BlueprintComponentRelationEffect[];
    };

export interface BlueprintApplicationBundlePlan {
  readonly schemaVersion: typeof blueprintApplicationBundlePlanSchemaVersion;
  readonly createsExternalResources: false;
  readonly application: BlueprintApplicationBundleIdentity;
  readonly components: readonly BlueprintApplicationBundleComponentPlan[];
  readonly dependencies: readonly BlueprintApplicationBundleDependencyPlan[];
  readonly relationships: readonly BlueprintApplicationBundleRelationship[];
  readonly execution: {
    readonly mode: "dry-run-only";
    readonly requiredFollowUp: "accepted-install-command";
  };
  readonly warnings: readonly string[];
}

export interface BlueprintApplicationBundlePlanError {
  readonly code: "missing_component_resource" | "duplicate_component_resource";
  readonly message: string;
  readonly componentId?: string;
}

export type BlueprintApplicationBundlePlanResult =
  | { readonly ok: true; readonly value: BlueprintApplicationBundlePlan }
  | { readonly ok: false; readonly error: BlueprintApplicationBundlePlanError };

export interface BlueprintComponentRuntimeInjectedEnv {
  readonly relationId: string;
  readonly relationType: BlueprintComponentRelationType;
  readonly providerComponentId: string;
  readonly endpoint?: string;
  readonly name: string;
  readonly valueFrom: "endpoint-url" | "endpoint-host" | "endpoint-port" | "endpoint-scheme";
  readonly value: string;
  readonly required: boolean;
}

export interface BlueprintComponentRuntimeServiceDiscovery {
  readonly relationId: string;
  readonly providerComponentId: string;
  readonly serviceName: string;
  readonly host: string;
  readonly endpoint?: string;
  readonly port?: number;
  readonly scheme?: "http" | "tcp" | "grpc";
  readonly required: boolean;
}

export interface BlueprintComponentRuntimeNetworkAllow {
  readonly relationId: string;
  readonly providerComponentId: string;
  readonly mode: "private";
  readonly networkName: string;
  readonly required: boolean;
}

export interface BlueprintComponentRuntimeReadinessGate {
  readonly relationId: string;
  readonly providerComponentId: string;
  readonly providerServiceName: string;
  readonly kind: "order-after" | "readiness-gate";
  readonly readiness: "created" | "started" | "healthy";
  readonly required: boolean;
}

export interface BlueprintComponentRuntimeTelemetryAttachment {
  readonly relationId: string;
  readonly providerComponentId: string;
  readonly providerServiceName: string;
  readonly signal: "traces" | "metrics" | "logs";
  readonly endpoint?: string;
  readonly endpointUrl: string;
  readonly required: boolean;
}

export interface BlueprintComponentRuntimeDependencyEnv {
  readonly dependencyRequirementId: string;
  readonly name: string;
  readonly valueFrom?: BlueprintDependencyOutputName;
  readonly template?: string;
  readonly outputNames: readonly string[];
  readonly secret: boolean;
  readonly bindingRef: {
    readonly kind: "dependency-output";
    readonly requirementId: string;
  };
}

export interface BlueprintComponentRuntimeDependencyReadinessGate {
  readonly dependencyRequirementId: string;
  readonly kind: BlueprintDependencyKind;
  readonly engine: BlueprintDependencyEngine;
  readonly readiness: BlueprintDependencyReadinessRequirement;
  readonly required: boolean;
}

export interface BlueprintComponentRuntimePlan {
  readonly componentId: string;
  readonly serviceName: string;
  readonly networkName: string;
  readonly dependencyEnv: readonly BlueprintComponentRuntimeDependencyEnv[];
  readonly dependencyReadinessGates: readonly BlueprintComponentRuntimeDependencyReadinessGate[];
  readonly injectedEnv: readonly BlueprintComponentRuntimeInjectedEnv[];
  readonly serviceDiscovery: readonly BlueprintComponentRuntimeServiceDiscovery[];
  readonly networkAllows: readonly BlueprintComponentRuntimeNetworkAllow[];
  readonly readinessGates: readonly BlueprintComponentRuntimeReadinessGate[];
  readonly telemetryAttachments: readonly BlueprintComponentRuntimeTelemetryAttachment[];
}

export interface BlueprintComponentRuntimeProjection {
  readonly schemaVersion: typeof blueprintComponentRuntimeProjectionSchemaVersion;
  readonly application: BlueprintApplicationBundleIdentity;
  readonly components: readonly BlueprintComponentRuntimePlan[];
  readonly warnings: readonly string[];
}

export interface CreateBlueprintComponentRuntimeProjectionInput {
  readonly applicationBundle: BlueprintApplicationBundlePlan;
  readonly componentServiceNames?: Readonly<Record<string, string>>;
  readonly networkName?: string;
}

export type BlueprintUpgradeClassification = "non-breaking" | "potentially-breaking" | "breaking";

export interface CreateBlueprintUpgradePlanInput {
  readonly currentManifest: BlueprintManifest;
  readonly targetManifest: BlueprintManifest;
  readonly currentVariant?: string;
  readonly targetVariant?: string;
  readonly currentProfile?: string;
  readonly targetProfile?: string;
  readonly preserveUserConfiguration?: boolean;
}

export type BlueprintUpgradeOperation =
  | {
      readonly kind: "review-upgrade-policy";
      readonly strategy: BlueprintUpgradePolicy["strategy"];
      readonly classification: BlueprintUpgradeClassification;
      readonly requiresManualReview: boolean;
      readonly changes: readonly string[];
    }
  | {
      readonly kind: "change-blueprint-version";
      readonly fromVersion: string;
      readonly toVersion: string;
      readonly classification: BlueprintUpgradeClassification;
    }
  | {
      readonly kind: "change-variant";
      readonly fromVariant?: string;
      readonly toVariant?: string;
      readonly classification: BlueprintUpgradeClassification;
    }
  | {
      readonly kind: "change-profile";
      readonly fromProfile?: string;
      readonly toProfile?: string;
      readonly classification: BlueprintUpgradeClassification;
    }
  | {
      readonly kind: "change-runtime";
      readonly componentId: string;
      readonly fromRuntime?: BlueprintComponent["runtime"];
      readonly toRuntime?: BlueprintComponent["runtime"];
      readonly classification: BlueprintUpgradeClassification;
    }
  | {
      readonly kind: "change-network";
      readonly componentId: string;
      readonly classification: BlueprintUpgradeClassification;
    }
  | {
      readonly kind: "add-component" | "remove-component";
      readonly componentId: string;
      readonly classification: BlueprintUpgradeClassification;
    }
  | {
      readonly kind:
        | "add-dependency"
        | "remove-dependency"
        | "change-dependency-kind"
        | "change-dependency-compatibility"
        | "change-dependency-capabilities"
        | "change-dependency-contract";
      readonly requirementId: string;
      readonly fromKind?: BlueprintResourceRequirement["kind"];
      readonly toKind?: BlueprintResourceRequirement["kind"];
      readonly fromVersion?: BlueprintDependencyVersionRequirement;
      readonly toVersion?: BlueprintDependencyVersionRequirement;
      readonly fromCapabilities?: readonly BlueprintDependencyCapability[];
      readonly toCapabilities?: readonly BlueprintDependencyCapability[];
      readonly fromDependency?: BlueprintResourceRequirement;
      readonly toDependency?: BlueprintResourceRequirement;
      readonly classification: BlueprintUpgradeClassification;
    }
  | {
      readonly kind:
        | "add-component-relation"
        | "remove-component-relation"
        | "change-component-relation";
      readonly relationId: string;
      readonly classification: BlueprintUpgradeClassification;
    }
  | {
      readonly kind: "add-secret" | "remove-secret";
      readonly key: string;
      readonly required: boolean;
      readonly classification: BlueprintUpgradeClassification;
    }
  | {
      readonly kind: "add-parameter" | "remove-parameter";
      readonly key: string;
      readonly required: boolean;
      readonly classification: BlueprintUpgradeClassification;
    }
  | {
      readonly kind: "review-user-configuration";
      readonly classification: BlueprintUpgradeClassification;
      readonly changes: readonly string[];
    };

export interface BlueprintUpgradePlan {
  readonly schemaVersion: typeof blueprintUpgradePlanSchemaVersion;
  readonly createsExternalResources: false;
  readonly blueprint: {
    readonly id: string;
    readonly fromVersion: string;
    readonly toVersion: string;
    readonly fromVariant?: string;
    readonly toVariant?: string;
  };
  readonly classification: BlueprintUpgradeClassification;
  readonly destructive: boolean;
  readonly requiresManualReview: boolean;
  readonly operations: readonly BlueprintUpgradeOperation[];
  readonly warnings: readonly string[];
}

export function validateBlueprintManifest(value: unknown): BlueprintResult<BlueprintManifest> {
  const parsed = blueprintManifestSchema.safeParse(value);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }
  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.filter((segment): segment is string | number => typeof segment !== "symbol"),
      message: issue.message,
    })),
  };
}

export function loadBlueprintManifest(
  input: LoadBlueprintManifestInput,
): BlueprintResult<BlueprintManifest> {
  const format = input.format ?? inferBlueprintManifestFormat(input.path);
  let parsed: unknown;

  try {
    parsed = format === "json" ? JSON.parse(input.content) : parseYaml(input.content);
  } catch (error) {
    return {
      ok: false,
      issues: [
        {
          path: [],
          message: error instanceof Error ? error.message : "Unable to parse Blueprint manifest",
        },
      ],
    };
  }

  return validateBlueprintManifest(parsed);
}

export function resolveBlueprintVariantManifest(input: {
  readonly manifest: BlueprintManifest;
  readonly variant?: string;
}): BlueprintResult<BlueprintManifest> {
  const variantId = input.variant ?? input.manifest.defaultVariant;
  if (!variantId) {
    return { ok: true, value: input.manifest };
  }

  const variant = input.manifest.variants[variantId];
  if (!variant) {
    return {
      ok: false,
      issues: [
        {
          path: ["variant"],
          message: `Unknown Blueprint variant: ${variantId}`,
        },
      ],
    };
  }

  return {
    ok: true,
    value: {
      ...input.manifest,
      summary: variant.summary ?? input.manifest.summary,
      description: variant.description ?? input.manifest.description,
      tags: [...new Set([...input.manifest.tags, ...variant.tags])],
      parameters: variant.parameters ?? input.manifest.parameters,
      secrets: variant.secrets ?? input.manifest.secrets,
      resources: variant.resources ?? input.manifest.resources,
      components: variant.components ?? input.manifest.components,
      componentRelations: variant.componentRelations ?? input.manifest.componentRelations,
      profiles: variant.profiles ?? input.manifest.profiles,
      defaultVariant: variantId,
      upgrade: variant.upgrade ?? input.manifest.upgrade,
    },
  };
}

export class LocalFileBlueprintRegistry implements BlueprintRegistry {
  private readonly files: readonly string[];
  private readonly readTextFile: (path: string) => Promise<string>;

  constructor(options: LocalFileBlueprintRegistryOptions) {
    this.files = options.files;
    this.readTextFile = options.readTextFile ?? ((path) => Bun.file(path).text());
  }

  async list(): Promise<readonly BlueprintRegistryEntry[]> {
    const entries: BlueprintRegistryEntry[] = [];

    for (const file of this.files) {
      const loaded = await this.loadFile(file);
      if (loaded.ok) {
        entries.push(toRegistryEntry(loaded.value, file));
      }
    }

    return entries.sort((left, right) => left.id.localeCompare(right.id));
  }

  async resolve(id: string): Promise<BlueprintResult<BlueprintManifest>> {
    const issues: BlueprintIssue[] = [];

    for (const file of this.files) {
      const loaded = await this.loadFile(file);
      if (!loaded.ok) {
        issues.push(...loaded.issues);
        continue;
      }
      if (loaded.value.id === id) {
        return loaded;
      }
    }

    return {
      ok: false,
      issues: [
        ...issues,
        {
          path: ["id"],
          message: `Blueprint not found: ${id}`,
        },
      ],
    };
  }

  private async loadFile(file: string): Promise<BlueprintResult<BlueprintManifest>> {
    const content = await this.readTextFile(file);
    return loadBlueprintManifest({
      content,
      path: file,
    });
  }
}

export function createBlueprintInstallPlan(
  input: CreateBlueprintInstallPlanInput,
): BlueprintResult<BlueprintInstallPlan> {
  const variantId = input.variant ?? input.manifest.defaultVariant;
  const resolvedManifest = resolveBlueprintVariantManifest({
    manifest: input.manifest,
    ...(input.variant ? { variant: input.variant } : {}),
  });
  if (!resolvedManifest.ok) {
    return resolvedManifest;
  }

  const manifest = resolvedManifest.value;
  const variantDefaultProfile = variantId
    ? input.manifest.variants[variantId]?.defaultProfile
    : undefined;
  const profileName = input.profile ?? variantDefaultProfile ?? firstProfileName(manifest);
  const profile = manifest.profiles[profileName];
  if (!profile) {
    return {
      ok: false,
      issues: [
        {
          path: ["profile"],
          message: `Unknown Blueprint profile: ${profileName}`,
        },
      ],
    };
  }

  const parameterIssues = validateParameterValues(manifest, input.parameters ?? {});
  if (parameterIssues.length > 0) {
    return { ok: false, issues: parameterIssues };
  }

  const operations: BlueprintInstallOperation[] = [
    {
      kind: "create-project",
      projectName: input.target.projectName,
    },
    {
      kind: "create-environment",
      environmentName: input.target.environmentName,
      profile: profileName,
    },
  ];

  if (manifest.componentRelations.length === 0) {
    for (const component of manifest.components) {
      appendComponentSetupOperations(operations, {
        component,
        manifest,
        profile,
        parameters: input.parameters ?? {},
        resourceSlugPrefix: input.target.resourceSlugPrefix,
      });
      operations.push({
        kind: "create-deployment",
        componentId: component.id,
        reason: "blueprint-install",
      });
    }
  } else {
    const graph = new BlueprintComponentRelationGraph({
      components: manifest.components,
      relations: manifest.componentRelations,
    });
    const topology = graph.topologicalSort();
    if (!topology.ok) {
      return {
        ok: false,
        issues: [
          {
            path: ["componentRelations"],
            message: `Required lifecycle component relations form a startup cycle: ${topology.error.cycle.join(" -> ")}`,
          },
        ],
      };
    }

    const componentsById = byId(manifest.components);
    const sortedComponents = topology.value.sortedComponentIds
      .map((componentId) => componentsById.get(componentId))
      .filter((component): component is BlueprintComponent => Boolean(component));

    for (const component of sortedComponents) {
      appendComponentSetupOperations(operations, {
        component,
        manifest,
        profile,
        parameters: input.parameters ?? {},
        resourceSlugPrefix: input.target.resourceSlugPrefix,
      });
    }
    for (const relation of manifest.componentRelations) {
      operations.push({
        kind: "configure-component-link",
        relationId: relation.id,
        relationType: relation.type,
        fromComponentId: relation.from,
        toComponentId: relation.to,
        ...(relation.endpoint ? { endpoint: relation.endpoint } : {}),
        required: relation.required,
        effects: relation.effects,
        outputs: graph.relationOutputs(relation),
      });
    }
    for (const component of sortedComponents) {
      operations.push({
        kind: "create-deployment",
        componentId: component.id,
        reason: "blueprint-install",
      });
    }
  }

  return {
    ok: true,
    value: {
      schemaVersion: blueprintInstallPlanSchemaVersion,
      createsExternalResources: false,
      blueprint: {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        ...(manifest.defaultVariant ? { variant: manifest.defaultVariant } : {}),
      },
      profile: profileName,
      target: input.target,
      operations,
      warnings: profile.replicas === 0 ? ["Selected profile has zero replicas."] : [],
    },
  };
}

function appendComponentSetupOperations(
  operations: BlueprintInstallOperation[],
  input: {
    readonly component: BlueprintComponent;
    readonly manifest: BlueprintManifest;
    readonly profile: BlueprintEnvironmentProfile;
    readonly parameters: Readonly<Record<string, string | number | boolean>>;
    readonly resourceSlugPrefix: string | undefined;
  },
): void {
  const { component, manifest, profile, parameters, resourceSlugPrefix } = input;
  const slug = [resourceSlugPrefix, component.id].filter(Boolean).join("-");
  operations.push({
    kind: "create-resource",
    componentId: component.id,
    componentKind: component.kind,
    name: component.name,
    slug,
  });
  operations.push({
    kind: "configure-runtime",
    componentId: component.id,
    runtime: component.runtime,
  });
  if (component.ports.length > 0) {
    operations.push({
      kind: "configure-network",
      componentId: component.id,
      ports: component.ports,
    });
  }
  const routes = [...component.routes, ...profile.routes];
  if (routes.length > 0) {
    operations.push({
      kind: "configure-access",
      componentId: component.id,
      routes,
    });
  }
  for (const variable of [...profile.variables, ...component.variables]) {
    operations.push({
      kind: "set-variable",
      componentId: component.id,
      key: variable.key,
      valueSource: "literal",
      value: variable.value,
    });
  }
  for (const parameter of manifest.parameters) {
    const value = parameterValue(parameter, parameters);
    operations.push({
      kind: "set-variable",
      componentId: component.id,
      key: parameter.key,
      valueSource: "parameter",
      value,
    });
  }
  for (const secretKey of component.usesSecrets) {
    const secret = manifest.secrets.find((candidate) => candidate.key === secretKey);
    if (secret) {
      operations.push({
        kind: "create-secret-reference",
        componentId: component.id,
        key: secret.key,
        required: secret.required,
      });
    }
  }
  for (const requirementId of component.usesResources) {
    const requirement = manifest.resources.find((candidate) => candidate.id === requirementId);
    if (requirement) {
      const env = component.dependencyEnv
        .filter((dependencyEnv) => dependencyEnv.resource === requirement.id)
        .map((dependencyEnv) => ({
          resourceId: requirement.id,
          name: dependencyEnv.name,
          ...(dependencyEnv.valueFrom ? { valueFrom: dependencyEnv.valueFrom } : {}),
          ...(dependencyEnv.template ? { template: dependencyEnv.template } : {}),
          outputNames: dependencyEnvOutputNames(dependencyEnv),
          secret: dependencyEnvSecret(requirement, dependencyEnv),
        }));
      operations.push({
        kind: "bind-dependency",
        componentId: component.id,
        requirementId: requirement.id,
        requirementKind: requirement.kind,
        engine: { family: dependencyEngineFamily(requirement), ...(requirement.engine ?? {}) },
        ...(requirement.version ? { version: requirement.version } : {}),
        capabilities: requirement.capabilities,
        outputs: defaultDependencyOutputs(requirement),
        readiness: requirement.readiness,
        ...(requirement.provisioning ? { provisioning: requirement.provisioning } : {}),
        env,
      });
    }
  }
}

type MutableBlueprintApplicationBundleComponentPlan = {
  componentId: string;
  name: string;
  kind: BlueprintComponent["kind"];
  resourceSlug: string;
  runtime?: BlueprintComponent["runtime"];
  ports: BlueprintComponent["ports"][number][];
  routes: BlueprintRoutePlan[];
  variables: {
    readonly key: string;
    readonly valueSource: "literal" | "parameter";
    readonly value: string | number | boolean;
  }[];
  secretReferences: { readonly key: string; readonly required: boolean }[];
  dependencyBindings: {
    readonly requirementId: string;
    readonly requirementKind: BlueprintResourceRequirement["kind"];
    readonly engine: BlueprintDependencyEngine;
    readonly version?: BlueprintDependencyVersionRequirement;
    readonly capabilities: readonly BlueprintDependencyCapability[];
    readonly outputs: readonly BlueprintDependencyOutputRequirement[];
    readonly readiness: readonly BlueprintDependencyReadinessRequirement[];
    readonly provisioning?: BlueprintDependencyProvisioningConstraints;
    readonly env: readonly BlueprintDependencyEnvPlan[];
  }[];
  deploymentReason?: "blueprint-install";
};

export function createBlueprintApplicationBundlePlan(
  input: CreateBlueprintApplicationBundlePlanInput,
): BlueprintApplicationBundlePlanResult {
  const components = new Map<string, MutableBlueprintApplicationBundleComponentPlan>();
  const dependencies = new Map<string, BlueprintApplicationBundleDependencyPlan>();
  const relationships: BlueprintApplicationBundleRelationship[] = [];

  for (const operation of input.plan.operations) {
    switch (operation.kind) {
      case "create-resource": {
        if (components.has(operation.componentId)) {
          return duplicateApplicationBundleComponentResource(operation.componentId);
        }

        const component: MutableBlueprintApplicationBundleComponentPlan = {
          componentId: operation.componentId,
          name: operation.name,
          kind: operation.componentKind,
          resourceSlug: operation.slug,
          ports: [],
          routes: [],
          variables: [],
          secretReferences: [],
          dependencyBindings: [],
        };
        components.set(operation.componentId, component);
        relationships.push({
          kind: "application-contains-component",
          componentId: operation.componentId,
        });
        relationships.push({
          kind: "component-deploys-as-resource",
          componentId: operation.componentId,
          resourceSlug: operation.slug,
        });
        break;
      }
      case "configure-runtime": {
        const component = requireApplicationBundleComponent(operation, components);
        if (!component.ok) return component;
        component.value.runtime = operation.runtime;
        break;
      }
      case "configure-network": {
        const component = requireApplicationBundleComponent(operation, components);
        if (!component.ok) return component;
        component.value.ports.push(...operation.ports);
        break;
      }
      case "configure-access": {
        const component = requireApplicationBundleComponent(operation, components);
        if (!component.ok) return component;
        component.value.routes.push(...operation.routes);
        break;
      }
      case "set-variable": {
        const component = requireApplicationBundleComponent(operation, components);
        if (!component.ok) return component;
        component.value.variables.push({
          key: operation.key,
          valueSource: operation.valueSource,
          value: operation.value,
        });
        break;
      }
      case "create-secret-reference": {
        const component = requireApplicationBundleComponent(operation, components);
        if (!component.ok) return component;
        component.value.secretReferences.push({
          key: operation.key,
          required: operation.required,
        });
        break;
      }
      case "bind-dependency": {
        const component = requireApplicationBundleComponent(operation, components);
        if (!component.ok) return component;
        dependencies.set(operation.requirementId, {
          requirementId: operation.requirementId,
          kind: operation.requirementKind,
          engine: operation.engine,
          ...(operation.version ? { version: operation.version } : {}),
          capabilities: operation.capabilities,
          outputs: operation.outputs,
          readiness: operation.readiness,
          ...(operation.provisioning ? { provisioning: operation.provisioning } : {}),
          scope: "dependency-resource",
          bindingMode: "bind-existing-or-provisioned",
        });
        component.value.dependencyBindings.push({
          requirementId: operation.requirementId,
          requirementKind: operation.requirementKind,
          engine: operation.engine,
          ...(operation.version ? { version: operation.version } : {}),
          capabilities: operation.capabilities,
          outputs: operation.outputs,
          readiness: operation.readiness,
          ...(operation.provisioning ? { provisioning: operation.provisioning } : {}),
          env: operation.env,
        });
        relationships.push({
          kind: "component-binds-dependency",
          componentId: operation.componentId,
          requirementId: operation.requirementId,
          requirementKind: operation.requirementKind,
          engine: operation.engine,
          ...(operation.version ? { version: operation.version } : {}),
          capabilities: operation.capabilities,
          outputs: operation.outputs,
          readiness: operation.readiness,
          ...(operation.provisioning ? { provisioning: operation.provisioning } : {}),
          env: operation.env,
        });
        break;
      }
      case "configure-component-link": {
        const fromComponent = components.get(operation.fromComponentId);
        const toComponent = components.get(operation.toComponentId);
        if (!fromComponent) {
          return missingApplicationBundleComponentResource(operation.fromComponentId);
        }
        if (!toComponent) {
          return missingApplicationBundleComponentResource(operation.toComponentId);
        }
        relationships.push({
          kind: "component-links-component",
          relationId: operation.relationId,
          relationType: operation.relationType,
          fromComponentId: operation.fromComponentId,
          toComponentId: operation.toComponentId,
          ...(operation.endpoint ? { endpoint: operation.endpoint } : {}),
          required: operation.required,
          effects: operation.effects,
        });
        break;
      }
      case "create-deployment": {
        const component = requireApplicationBundleComponent(operation, components);
        if (!component.ok) return component;
        component.value.deploymentReason = operation.reason;
        break;
      }
      case "create-project":
      case "create-environment":
        break;
    }
  }

  return {
    ok: true,
    value: {
      schemaVersion: blueprintApplicationBundlePlanSchemaVersion,
      createsExternalResources: false,
      application: {
        blueprintId: input.plan.blueprint.id,
        blueprintName: input.plan.blueprint.name,
        blueprintVersion: input.plan.blueprint.version,
        ...(input.plan.blueprint.variant ? { blueprintVariant: input.plan.blueprint.variant } : {}),
        projectName: input.plan.target.projectName,
        environmentName: input.plan.target.environmentName,
        profile: input.plan.profile,
      },
      components: [...components.values()].map((component) => ({
        ...component,
        ports: [...component.ports],
        routes: [...component.routes],
        variables: [...component.variables],
        secretReferences: [...component.secretReferences],
        dependencyBindings: [...component.dependencyBindings],
      })),
      dependencies: [...dependencies.values()],
      relationships,
      execution: {
        mode: "dry-run-only",
        requiredFollowUp: "accepted-install-command",
      },
      warnings: [
        ...input.plan.warnings,
        "This plan groups Blueprint components into one application bundle; execution remains an explicit accepted install command.",
      ],
    },
  };
}

const defaultComponentRuntimeNetworkName = "appaloft-component-private";

type ComponentLinkBundleRelationship = Extract<
  BlueprintApplicationBundleRelationship,
  { readonly kind: "component-links-component" }
>;

type MutableBlueprintComponentRuntimePlan = {
  componentId: string;
  serviceName: string;
  networkName: string;
  dependencyEnv: BlueprintComponentRuntimeDependencyEnv[];
  dependencyReadinessGates: BlueprintComponentRuntimeDependencyReadinessGate[];
  injectedEnv: BlueprintComponentRuntimeInjectedEnv[];
  serviceDiscovery: BlueprintComponentRuntimeServiceDiscovery[];
  networkAllows: BlueprintComponentRuntimeNetworkAllow[];
  readinessGates: BlueprintComponentRuntimeReadinessGate[];
  telemetryAttachments: BlueprintComponentRuntimeTelemetryAttachment[];
};

const blueprintComponentRuntimeInjectedEnvSchema = z
  .object({
    relationId: z.string(),
    relationType: z.enum(["endpoint", "lifecycle", "telemetry"]),
    providerComponentId: z.string(),
    endpoint: z.string().optional(),
    name: z.string(),
    valueFrom: z.enum(["endpoint-url", "endpoint-host", "endpoint-port", "endpoint-scheme"]),
    value: z.string(),
    required: z.boolean(),
  })
  .strict();

const blueprintComponentRuntimeServiceDiscoverySchema = z
  .object({
    relationId: z.string(),
    providerComponentId: z.string(),
    serviceName: z.string(),
    host: z.string(),
    endpoint: z.string().optional(),
    port: z.number().int().min(1).max(65535).optional(),
    scheme: z.enum(["http", "tcp", "grpc"]).optional(),
    required: z.boolean(),
  })
  .strict();

const blueprintComponentRuntimeNetworkAllowSchema = z
  .object({
    relationId: z.string(),
    providerComponentId: z.string(),
    mode: z.literal("private"),
    networkName: z.string(),
    required: z.boolean(),
  })
  .strict();

const blueprintComponentRuntimeReadinessGateSchema = z
  .object({
    relationId: z.string(),
    providerComponentId: z.string(),
    providerServiceName: z.string(),
    kind: z.enum(["order-after", "readiness-gate"]),
    readiness: z.enum(["created", "started", "healthy"]),
    required: z.boolean(),
  })
  .strict();

const blueprintComponentRuntimeTelemetryAttachmentSchema = z
  .object({
    relationId: z.string(),
    providerComponentId: z.string(),
    providerServiceName: z.string(),
    signal: z.enum(["traces", "metrics", "logs"]),
    endpoint: z.string().optional(),
    endpointUrl: z.string(),
    required: z.boolean(),
  })
  .strict();

const blueprintComponentRuntimeDependencyEnvSchema = z
  .object({
    dependencyRequirementId: z.string(),
    name: z.string(),
    valueFrom: blueprintDependencyOutputNameSchema.optional(),
    template: z.string().optional(),
    outputNames: z.array(z.string()),
    secret: z.boolean(),
    bindingRef: z
      .object({
        kind: z.literal("dependency-output"),
        requirementId: z.string(),
      })
      .strict(),
  })
  .strict();

const blueprintComponentRuntimeDependencyReadinessGateSchema = z
  .object({
    dependencyRequirementId: z.string(),
    kind: blueprintDependencyKindSchema,
    engine: z
      .object({
        family: blueprintDependencyEngineFamilySchema,
        name: z.string().optional(),
        edition: z.string().optional(),
      })
      .strict(),
    readiness: blueprintDependencyReadinessSchema,
    required: z.boolean(),
  })
  .strict();

const blueprintComponentRuntimePlanSchema = z
  .object({
    componentId: z.string(),
    serviceName: z.string(),
    networkName: z.string(),
    dependencyEnv: z.array(blueprintComponentRuntimeDependencyEnvSchema).default([]),
    dependencyReadinessGates: z
      .array(blueprintComponentRuntimeDependencyReadinessGateSchema)
      .default([]),
    injectedEnv: z.array(blueprintComponentRuntimeInjectedEnvSchema),
    serviceDiscovery: z.array(blueprintComponentRuntimeServiceDiscoverySchema),
    networkAllows: z.array(blueprintComponentRuntimeNetworkAllowSchema),
    readinessGates: z.array(blueprintComponentRuntimeReadinessGateSchema),
    telemetryAttachments: z.array(blueprintComponentRuntimeTelemetryAttachmentSchema),
  })
  .strict();

export function createBlueprintComponentRuntimeProjection(
  input: CreateBlueprintComponentRuntimeProjectionInput,
): BlueprintComponentRuntimeProjection {
  const networkName = input.networkName ?? defaultComponentRuntimeNetworkName;
  const componentPlans = new Map<string, MutableBlueprintComponentRuntimePlan>();
  const componentsById = new Map(
    input.applicationBundle.components.map((component) => [component.componentId, component]),
  );
  const warnings: string[] = [];

  for (const component of input.applicationBundle.components) {
    componentPlans.set(component.componentId, {
      componentId: component.componentId,
      serviceName:
        input.componentServiceNames?.[component.componentId] ??
        component.resourceSlug ??
        component.componentId,
      networkName,
      dependencyEnv: [],
      dependencyReadinessGates: [],
      injectedEnv: [],
      serviceDiscovery: [],
      networkAllows: [],
      readinessGates: [],
      telemetryAttachments: [],
    });
  }

  for (const relationship of input.applicationBundle.relationships) {
    if (relationship.kind !== "component-links-component") {
      continue;
    }

    const consumerPlan = componentPlans.get(relationship.fromComponentId);
    const providerPlan = componentPlans.get(relationship.toComponentId);
    const providerComponent = componentsById.get(relationship.toComponentId);
    if (!consumerPlan || !providerPlan || !providerComponent) {
      warnings.push(
        `component relation ${relationship.relationId} references an unavailable component`,
      );
      continue;
    }

    appendRuntimeRelationEffects({
      relationship,
      consumerPlan,
      providerPlan,
      providerComponent,
      networkName,
      warnings,
    });
  }

  for (const component of input.applicationBundle.components) {
    const plan = componentPlans.get(component.componentId);
    if (!plan) {
      continue;
    }
    for (const binding of component.dependencyBindings) {
      for (const env of binding.env ?? []) {
        plan.dependencyEnv.push({
          dependencyRequirementId: binding.requirementId,
          name: env.name,
          ...(env.valueFrom ? { valueFrom: env.valueFrom } : {}),
          ...(env.template ? { template: env.template } : {}),
          outputNames: env.outputNames,
          secret: env.secret,
          bindingRef: {
            kind: "dependency-output",
            requirementId: binding.requirementId,
          },
        });
      }
      for (const readiness of binding.readiness ?? []) {
        plan.dependencyReadinessGates.push({
          dependencyRequirementId: binding.requirementId,
          kind: binding.requirementKind,
          engine: binding.engine,
          readiness,
          required: readiness.required,
        });
      }
    }
  }

  return {
    schemaVersion: blueprintComponentRuntimeProjectionSchemaVersion,
    application: input.applicationBundle.application,
    components: [...componentPlans.values()].map((plan) => ({
      componentId: plan.componentId,
      serviceName: plan.serviceName,
      networkName: plan.networkName,
      dependencyEnv: sortByDependencyAndName(plan.dependencyEnv),
      dependencyReadinessGates: sortByDependencyAndReadiness(plan.dependencyReadinessGates),
      injectedEnv: sortByRelationAndName(plan.injectedEnv),
      serviceDiscovery: sortByRelationAndProvider(plan.serviceDiscovery),
      networkAllows: sortByRelationAndProvider(plan.networkAllows),
      readinessGates: sortByRelationAndProvider(plan.readinessGates),
      telemetryAttachments: sortByRelationAndProvider(plan.telemetryAttachments),
    })),
    warnings,
  };
}

export function blueprintComponentRuntimePlanToMetadata(
  plan: BlueprintComponentRuntimePlan,
): Record<string, string> {
  return {
    [blueprintComponentRuntimePlanMetadataKey]: JSON.stringify(plan),
  };
}

export function blueprintComponentRuntimePlanFromMetadata(
  metadata: Readonly<Record<string, string>> | undefined,
): BlueprintComponentRuntimePlan | undefined {
  const raw = metadata?.[blueprintComponentRuntimePlanMetadataKey];
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw);
    const result = blueprintComponentRuntimePlanSchema.safeParse(parsed);
    return result.success ? (result.data as BlueprintComponentRuntimePlan) : undefined;
  } catch {
    return undefined;
  }
}

function appendRuntimeRelationEffects(input: {
  readonly relationship: ComponentLinkBundleRelationship;
  readonly consumerPlan: MutableBlueprintComponentRuntimePlan;
  readonly providerPlan: MutableBlueprintComponentRuntimePlan;
  readonly providerComponent: BlueprintApplicationBundleComponentPlan;
  readonly networkName: string;
  readonly warnings: string[];
}): void {
  const { relationship, consumerPlan, providerPlan, providerComponent, networkName, warnings } =
    input;
  const endpointPort = relationship.endpoint
    ? providerComponent.ports.find((port) => port.name === relationship.endpoint)
    : undefined;
  const context = {
    relationship,
    providerServiceName: providerPlan.serviceName,
    endpointPort,
  };

  for (const effect of relationship.effects) {
    switch (effect.kind) {
      case "inject-env": {
        const value = runtimeRelationOutput(effect.valueFrom, context);
        if (value === undefined) {
          warnings.push(
            `component relation ${relationship.relationId} could not resolve ${effect.valueFrom}`,
          );
          continue;
        }
        consumerPlan.injectedEnv.push({
          relationId: relationship.relationId,
          relationType: relationship.relationType,
          providerComponentId: relationship.toComponentId,
          ...(relationship.endpoint ? { endpoint: relationship.endpoint } : {}),
          name: effect.name,
          valueFrom: effect.valueFrom,
          value,
          required: relationship.required,
        });
        break;
      }
      case "private-service-discovery": {
        const host = runtimeRelationOutput(effect.valueFrom, context) ?? providerPlan.serviceName;
        consumerPlan.serviceDiscovery.push({
          relationId: relationship.relationId,
          providerComponentId: relationship.toComponentId,
          serviceName: providerPlan.serviceName,
          host,
          ...(relationship.endpoint ? { endpoint: relationship.endpoint } : {}),
          ...(endpointPort
            ? { port: endpointPort.containerPort, scheme: endpointPort.protocol }
            : {}),
          required: relationship.required,
        });
        break;
      }
      case "network-allow":
        consumerPlan.networkAllows.push({
          relationId: relationship.relationId,
          providerComponentId: relationship.toComponentId,
          mode: effect.mode,
          networkName,
          required: relationship.required,
        });
        break;
      case "order-after":
      case "readiness-gate":
        consumerPlan.readinessGates.push({
          relationId: relationship.relationId,
          providerComponentId: relationship.toComponentId,
          providerServiceName: providerPlan.serviceName,
          kind: effect.kind,
          readiness: effect.readiness,
          required: relationship.required,
        });
        break;
      case "attach-telemetry": {
        const endpointUrl = runtimeRelationOutput(effect.valueFrom, context);
        if (!endpointUrl) {
          warnings.push(
            `component relation ${relationship.relationId} could not resolve telemetry endpoint`,
          );
          continue;
        }
        consumerPlan.telemetryAttachments.push({
          relationId: relationship.relationId,
          providerComponentId: relationship.toComponentId,
          providerServiceName: providerPlan.serviceName,
          signal: effect.signal,
          ...(relationship.endpoint ? { endpoint: relationship.endpoint } : {}),
          endpointUrl,
          required: relationship.required,
        });
        break;
      }
    }
  }
}

function runtimeRelationOutput(
  output: BlueprintComponentRelationOutput,
  context: {
    readonly relationship: ComponentLinkBundleRelationship;
    readonly providerServiceName: string;
    readonly endpointPort: BlueprintComponent["ports"][number] | undefined;
  },
): string | undefined {
  switch (output) {
    case "service-name":
      return context.providerServiceName;
    case "endpoint-host":
      return context.providerServiceName;
    case "endpoint-port":
      return context.endpointPort ? String(context.endpointPort.containerPort) : undefined;
    case "endpoint-scheme":
      return context.endpointPort?.protocol;
    case "endpoint-url":
      return context.endpointPort
        ? `${context.endpointPort.protocol}://${context.providerServiceName}:${context.endpointPort.containerPort}`
        : undefined;
    case "readiness-state":
      return undefined;
  }
}

function sortByRelationAndName<T extends { readonly relationId: string; readonly name: string }>(
  values: readonly T[],
): readonly T[] {
  return [...values].sort((left, right) => {
    const relationOrder = left.relationId.localeCompare(right.relationId);
    return relationOrder === 0 ? left.name.localeCompare(right.name) : relationOrder;
  });
}

function sortByRelationAndProvider<
  T extends { readonly relationId: string; readonly providerComponentId: string },
>(values: readonly T[]): readonly T[] {
  return [...values].sort((left, right) => {
    const relationOrder = left.relationId.localeCompare(right.relationId);
    return relationOrder === 0
      ? left.providerComponentId.localeCompare(right.providerComponentId)
      : relationOrder;
  });
}

function sortByDependencyAndName<
  T extends { readonly dependencyRequirementId: string; readonly name: string },
>(values: readonly T[]): readonly T[] {
  return [...values].sort((left, right) => {
    const dependencyOrder = left.dependencyRequirementId.localeCompare(
      right.dependencyRequirementId,
    );
    return dependencyOrder === 0 ? left.name.localeCompare(right.name) : dependencyOrder;
  });
}

function sortByDependencyAndReadiness<
  T extends {
    readonly dependencyRequirementId: string;
    readonly readiness: { readonly type: string };
  },
>(values: readonly T[]): readonly T[] {
  return [...values].sort((left, right) => {
    const dependencyOrder = left.dependencyRequirementId.localeCompare(
      right.dependencyRequirementId,
    );
    return dependencyOrder === 0
      ? left.readiness.type.localeCompare(right.readiness.type)
      : dependencyOrder;
  });
}

export function createBlueprintUpgradePlan(
  input: CreateBlueprintUpgradePlanInput,
): BlueprintResult<BlueprintUpgradePlan> {
  if (input.currentManifest.id !== input.targetManifest.id) {
    return {
      ok: false,
      issues: [
        {
          path: ["targetManifest", "id"],
          message: `Blueprint id mismatch: ${input.currentManifest.id} cannot upgrade to ${input.targetManifest.id}`,
        },
      ],
    };
  }

  const currentResolved = resolveBlueprintVariantManifest({
    manifest: input.currentManifest,
    ...(input.currentVariant ? { variant: input.currentVariant } : {}),
  });
  if (!currentResolved.ok) {
    return currentResolved;
  }

  const targetResolved = resolveBlueprintVariantManifest({
    manifest: input.targetManifest,
    ...(input.targetVariant ? { variant: input.targetVariant } : {}),
  });
  if (!targetResolved.ok) {
    return targetResolved;
  }

  const currentManifest = currentResolved.value;
  const targetManifest = targetResolved.value;
  const currentVariant = input.currentVariant ?? input.currentManifest.defaultVariant;
  const targetVariant = input.targetVariant ?? input.targetManifest.defaultVariant;
  const operations: BlueprintUpgradeOperation[] = [];

  const policy = targetManifest.upgrade;
  if (policy) {
    const classification = classifyUpgradePolicy(policy);
    operations.push({
      kind: "review-upgrade-policy",
      strategy: policy.strategy,
      classification,
      requiresManualReview:
        policy.destructive || policy.steps.some((step) => step.requiresManualReview),
      changes: policy.steps.flatMap((step) => step.changes),
    });
  }

  if (input.currentManifest.version !== input.targetManifest.version) {
    operations.push({
      kind: "change-blueprint-version",
      fromVersion: input.currentManifest.version,
      toVersion: input.targetManifest.version,
      classification: "non-breaking",
    });
  }

  if (currentVariant !== targetVariant) {
    operations.push({
      kind: "change-variant",
      ...(currentVariant ? { fromVariant: currentVariant } : {}),
      ...(targetVariant ? { toVariant: targetVariant } : {}),
      classification: "potentially-breaking",
    });
  }

  if (input.currentProfile !== input.targetProfile) {
    operations.push({
      kind: "change-profile",
      ...(input.currentProfile ? { fromProfile: input.currentProfile } : {}),
      ...(input.targetProfile ? { toProfile: input.targetProfile } : {}),
      classification: "potentially-breaking",
    });
  }

  operations.push(...diffComponents(currentManifest, targetManifest));
  operations.push(...diffComponentRelations(currentManifest, targetManifest));
  operations.push(...diffResources(currentManifest, targetManifest));
  operations.push(...diffSecrets(currentManifest, targetManifest));
  operations.push(...diffParameters(currentManifest, targetManifest));

  if (input.preserveUserConfiguration !== false) {
    operations.push({
      kind: "review-user-configuration",
      classification: "potentially-breaking",
      changes: [
        "Dry-run upgrade planning does not overwrite user-owned environment variables.",
        "Dry-run upgrade planning does not replace dependency bindings without an explicit update command.",
      ],
    });
  }

  const classification = maxClassification(operations.map((operation) => operation.classification));
  const destructive = Boolean(policy?.destructive) || classification === "breaking";

  return {
    ok: true,
    value: {
      schemaVersion: blueprintUpgradePlanSchemaVersion,
      createsExternalResources: false,
      blueprint: {
        id: input.targetManifest.id,
        fromVersion: input.currentManifest.version,
        toVersion: input.targetManifest.version,
        ...(currentVariant ? { fromVariant: currentVariant } : {}),
        ...(targetVariant ? { toVariant: targetVariant } : {}),
      },
      classification,
      destructive,
      requiresManualReview:
        destructive ||
        classification !== "non-breaking" ||
        Boolean(policy?.steps.some((step) => step.requiresManualReview)),
      operations,
      warnings:
        input.preserveUserConfiguration === false
          ? []
          : [
              "User-owned env vars, secrets, and dependency bindings require explicit review before execution.",
            ],
    },
  };
}

function classifyUpgradePolicy(policy: BlueprintUpgradePolicy): BlueprintUpgradeClassification {
  if (policy.destructive) {
    return "breaking";
  }
  return maxClassification(policy.steps.map((step) => step.classification));
}

function maxClassification(
  classifications: readonly BlueprintUpgradeClassification[],
): BlueprintUpgradeClassification {
  const ranks: Record<BlueprintUpgradeClassification, number> = {
    "non-breaking": 0,
    "potentially-breaking": 1,
    breaking: 2,
  };
  return classifications.reduce<BlueprintUpgradeClassification>(
    (current, candidate) => (ranks[candidate] > ranks[current] ? candidate : current),
    "non-breaking",
  );
}

function requireApplicationBundleComponent(
  operation: Extract<BlueprintInstallOperation, { readonly componentId: string }>,
  components: ReadonlyMap<string, MutableBlueprintApplicationBundleComponentPlan>,
):
  | { readonly ok: true; readonly value: MutableBlueprintApplicationBundleComponentPlan }
  | { readonly ok: false; readonly error: BlueprintApplicationBundlePlanError } {
  const component = components.get(operation.componentId);
  if (!component) {
    return {
      ok: false,
      error: {
        code: "missing_component_resource",
        message: "Blueprint install plan operation references a component before create-resource.",
        componentId: operation.componentId,
      },
    };
  }
  return { ok: true, value: component };
}

function duplicateApplicationBundleComponentResource(
  componentId: string,
): BlueprintApplicationBundlePlanResult {
  return {
    ok: false,
    error: {
      code: "duplicate_component_resource",
      message:
        "Blueprint install plan contains duplicate create-resource operations for a component.",
      componentId,
    },
  };
}

function missingApplicationBundleComponentResource(
  componentId: string,
): BlueprintApplicationBundlePlanResult {
  return {
    ok: false,
    error: {
      code: "missing_component_resource",
      message: "Blueprint application bundle relationship references an unknown component.",
      componentId,
    },
  };
}

function diffComponents(
  currentManifest: BlueprintManifest,
  targetManifest: BlueprintManifest,
): readonly BlueprintUpgradeOperation[] {
  const operations: BlueprintUpgradeOperation[] = [];
  const currentById = byId(currentManifest.components);
  const targetById = byId(targetManifest.components);

  for (const component of targetManifest.components) {
    const current = currentById.get(component.id);
    if (!current) {
      operations.push({
        kind: "add-component",
        componentId: component.id,
        classification: "potentially-breaking",
      });
      continue;
    }
    if (fingerprint(current.runtime) !== fingerprint(component.runtime)) {
      operations.push({
        kind: "change-runtime",
        componentId: component.id,
        fromRuntime: current.runtime,
        toRuntime: component.runtime,
        classification: "potentially-breaking",
      });
    }
    if (
      fingerprint(current.ports) !== fingerprint(component.ports) ||
      fingerprint(current.routes) !== fingerprint(component.routes)
    ) {
      operations.push({
        kind: "change-network",
        componentId: component.id,
        classification: "potentially-breaking",
      });
    }
  }

  for (const component of currentManifest.components) {
    if (!targetById.has(component.id)) {
      operations.push({
        kind: "remove-component",
        componentId: component.id,
        classification: "breaking",
      });
    }
  }

  return operations;
}

function diffComponentRelations(
  currentManifest: BlueprintManifest,
  targetManifest: BlueprintManifest,
): readonly BlueprintUpgradeOperation[] {
  const operations: BlueprintUpgradeOperation[] = [];
  const currentById = byId(currentManifest.componentRelations);
  const targetById = byId(targetManifest.componentRelations);

  for (const relation of targetManifest.componentRelations) {
    const current = currentById.get(relation.id);
    if (!current) {
      operations.push({
        kind: "add-component-relation",
        relationId: relation.id,
        classification: relation.required ? "potentially-breaking" : "non-breaking",
      });
      continue;
    }
    if (fingerprint(current) !== fingerprint(relation)) {
      operations.push({
        kind: "change-component-relation",
        relationId: relation.id,
        classification:
          current.required || relation.required ? "potentially-breaking" : "non-breaking",
      });
    }
  }

  for (const relation of currentManifest.componentRelations) {
    if (!targetById.has(relation.id)) {
      operations.push({
        kind: "remove-component-relation",
        relationId: relation.id,
        classification: relation.required ? "potentially-breaking" : "non-breaking",
      });
    }
  }

  return operations;
}

function diffResources(
  currentManifest: BlueprintManifest,
  targetManifest: BlueprintManifest,
): readonly BlueprintUpgradeOperation[] {
  const operations: BlueprintUpgradeOperation[] = [];
  const currentById = byId(currentManifest.resources);
  const targetById = byId(targetManifest.resources);

  for (const resource of targetManifest.resources) {
    const current = currentById.get(resource.id);
    if (!current) {
      operations.push({
        kind: "add-dependency",
        requirementId: resource.id,
        toKind: resource.kind,
        classification: "potentially-breaking",
      });
      continue;
    }
    if (current.kind !== resource.kind) {
      operations.push({
        kind: "change-dependency-kind",
        requirementId: resource.id,
        fromKind: current.kind,
        toKind: resource.kind,
        classification: "breaking",
      });
      continue;
    }
    if (fingerprint(current.version) !== fingerprint(resource.version)) {
      operations.push({
        kind: "change-dependency-compatibility",
        requirementId: resource.id,
        ...(current.version ? { fromVersion: current.version } : {}),
        ...(resource.version ? { toVersion: resource.version } : {}),
        classification: "potentially-breaking",
      });
    }
    if (fingerprint(current.capabilities) !== fingerprint(resource.capabilities)) {
      operations.push({
        kind: "change-dependency-capabilities",
        requirementId: resource.id,
        fromCapabilities: current.capabilities,
        toCapabilities: resource.capabilities,
        classification: "potentially-breaking",
      });
    }
    if (
      fingerprint(dependencyContractFingerprint(current)) !==
      fingerprint(dependencyContractFingerprint(resource))
    ) {
      operations.push({
        kind: "change-dependency-contract",
        requirementId: resource.id,
        fromDependency: current,
        toDependency: resource,
        classification: "potentially-breaking",
      });
    }
  }

  for (const resource of currentManifest.resources) {
    if (!targetById.has(resource.id)) {
      operations.push({
        kind: "remove-dependency",
        requirementId: resource.id,
        fromKind: resource.kind,
        classification: "breaking",
      });
    }
  }

  return operations;
}

function diffSecrets(
  currentManifest: BlueprintManifest,
  targetManifest: BlueprintManifest,
): readonly BlueprintUpgradeOperation[] {
  const operations: BlueprintUpgradeOperation[] = [];
  const currentByKey = byKey(currentManifest.secrets);
  const targetByKey = byKey(targetManifest.secrets);

  for (const secret of targetManifest.secrets) {
    if (!currentByKey.has(secret.key)) {
      operations.push({
        kind: "add-secret",
        key: secret.key,
        required: secret.required,
        classification: secret.required ? "potentially-breaking" : "non-breaking",
      });
    }
  }

  for (const secret of currentManifest.secrets) {
    if (!targetByKey.has(secret.key)) {
      operations.push({
        kind: "remove-secret",
        key: secret.key,
        required: secret.required,
        classification: "breaking",
      });
    }
  }

  return operations;
}

function diffParameters(
  currentManifest: BlueprintManifest,
  targetManifest: BlueprintManifest,
): readonly BlueprintUpgradeOperation[] {
  const operations: BlueprintUpgradeOperation[] = [];
  const currentByKey = byKey(currentManifest.parameters);
  const targetByKey = byKey(targetManifest.parameters);

  for (const parameter of targetManifest.parameters) {
    if (!currentByKey.has(parameter.key)) {
      operations.push({
        kind: "add-parameter",
        key: parameter.key,
        required: parameter.required,
        classification: parameter.required ? "potentially-breaking" : "non-breaking",
      });
    }
  }

  for (const parameter of currentManifest.parameters) {
    if (!targetByKey.has(parameter.key)) {
      operations.push({
        kind: "remove-parameter",
        key: parameter.key,
        required: parameter.required,
        classification: "breaking",
      });
    }
  }

  return operations;
}

function byId<T extends { readonly id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function byKey<T extends { readonly key: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.key, item]));
}

function fingerprint(value: unknown): string {
  return JSON.stringify(value);
}

function dependencyContractFingerprint(resource: BlueprintResourceRequirement): unknown {
  return {
    engine: { family: dependencyEngineFamily(resource), ...(resource.engine ?? {}) },
    version: resource.version,
    outputs: defaultDependencyOutputs(resource),
    readiness: resource.readiness,
    provisioning: resource.provisioning,
  };
}

function toRegistryEntry(manifest: BlueprintManifest, sourcePath: string): BlueprintRegistryEntry {
  return {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    summary: manifest.summary,
    sourcePath,
    tags: manifest.tags,
    ...(manifest.defaultVariant ? { defaultVariant: manifest.defaultVariant } : {}),
    variants: Object.entries(manifest.variants).map(([id, variant]) => ({
      id,
      ...(variant.label ? { label: variant.label } : {}),
      ...(variant.summary ? { summary: variant.summary } : {}),
    })),
  };
}

function inferBlueprintManifestFormat(path: string | undefined): BlueprintManifestFormat {
  const name = path ? basename(path).toLowerCase() : "";
  if (name.endsWith(".json")) {
    return "json";
  }
  return "yaml";
}

function firstProfileName(manifest: BlueprintManifest): string {
  return Object.keys(manifest.profiles).sort()[0] ?? "production";
}

function validateParameterValues(
  manifest: BlueprintManifest,
  values: Readonly<Record<string, string | number | boolean>>,
): readonly BlueprintIssue[] {
  const issues: BlueprintIssue[] = [];
  for (const parameter of manifest.parameters) {
    if (
      parameter.required &&
      values[parameter.key] === undefined &&
      parameter.default === undefined
    ) {
      issues.push({
        path: ["parameters", parameter.key],
        message: `Missing required Blueprint parameter ${parameter.key}`,
      });
    }
    const value = values[parameter.key] ?? parameter.default;
    if (value !== undefined && typeof value !== parameter.type) {
      issues.push({
        path: ["parameters", parameter.key],
        message: `Blueprint parameter ${parameter.key} must be ${parameter.type}`,
      });
    }
  }
  return issues;
}

function parameterValue(
  parameter: BlueprintParameter,
  values: Readonly<Record<string, string | number | boolean>>,
): string | number | boolean {
  const value = values[parameter.key] ?? parameter.default;
  if (value === undefined) {
    return "";
  }
  return value;
}
