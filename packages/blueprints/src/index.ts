import { basename } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

export const blueprintSchemaVersion = "appaloft.blueprint/v1" as const;
export const blueprintInstallPlanSchemaVersion = "appaloft.blueprint.install-plan/v1" as const;
export const blueprintUpgradePlanSchemaVersion = "appaloft.blueprint.upgrade-plan/v1" as const;
export const blueprintApplicationBundlePlanSchemaVersion =
  "appaloft.blueprint.application-bundle-plan/v1" as const;

const slugPattern = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/;
const envKeyPattern = /^[A-Z][A-Z0-9_]{0,127}$/;

const nonEmptyString = z.string().trim().min(1);
const slugSchema = z.string().trim().regex(slugPattern);
const envKeySchema = z.string().trim().regex(envKeyPattern);

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
    protocol: z.enum(["http", "tcp"]).default("http"),
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

const blueprintComponentSchema = z
  .object({
    id: slugSchema,
    name: nonEmptyString,
    kind: z.enum(["service", "worker", "static-site", "mcp-server"]),
    runtime: blueprintRuntimeSchema,
    ports: z.array(blueprintPortSchema).default([]),
    routes: z.array(blueprintRouteSchema).default([]),
    variables: z.array(blueprintVariableSchema).default([]),
    usesSecrets: z.array(envKeySchema).default([]),
    usesResources: z.array(slugSchema).default([]),
  })
  .strict();

const blueprintResourceRequirementSchema = z
  .object({
    id: slugSchema,
    kind: z.enum([
      "postgres",
      "mysql",
      "redis",
      "volume",
      "object-storage",
      "clickhouse",
      "opensearch",
    ]),
    label: nonEmptyString,
    optional: z.boolean().default(false),
  })
  .strict();

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
      parameters: manifest.parameters,
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
        secrets: variant.secrets ?? manifest.secrets,
        resources: variant.resources ?? manifest.resources,
        parameters: variant.parameters ?? manifest.parameters,
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
  readonly secrets: readonly z.infer<typeof blueprintSecretSchema>[];
  readonly resources: readonly z.infer<typeof blueprintResourceRequirementSchema>[];
  readonly parameters: readonly z.infer<typeof blueprintParameterSchema>[];
}): void {
  const componentIds = new Set(input.components.map((component) => component.id));
  const secretKeys = new Set(input.secrets.map((secret) => secret.key));
  const resourceIds = new Set(input.resources.map((resource) => resource.id));
  const parameterKeys = new Set(input.parameters.map((parameter) => parameter.key));

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
  }
}

export type BlueprintManifest = z.infer<typeof blueprintManifestSchema>;
export type BlueprintComponent = BlueprintManifest["components"][number];
export type BlueprintEnvironmentProfile = NonNullable<BlueprintManifest["profiles"]>[string];
export type BlueprintParameter = BlueprintManifest["parameters"][number];
export type BlueprintSecretPlaceholder = BlueprintManifest["secrets"][number];
export type BlueprintResourceRequirement = BlueprintManifest["resources"][number];
export type BlueprintVariant = NonNullable<BlueprintManifest["variants"]>[string];
export type BlueprintUpgradePolicy = NonNullable<BlueprintManifest["upgrade"]>;

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
  }[];
  readonly deploymentReason?: "blueprint-install";
}

export interface BlueprintApplicationBundleDependencyPlan {
  readonly requirementId: string;
  readonly kind: BlueprintResourceRequirement["kind"];
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
      readonly kind: "add-dependency" | "remove-dependency" | "change-dependency-kind";
      readonly requirementId: string;
      readonly fromKind?: BlueprintResourceRequirement["kind"];
      readonly toKind?: BlueprintResourceRequirement["kind"];
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

  for (const component of manifest.components) {
    const slug = [input.target.resourceSlugPrefix, component.id].filter(Boolean).join("-");
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
      const value = parameterValue(parameter, input.parameters ?? {});
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
        operations.push({
          kind: "bind-dependency",
          componentId: component.id,
          requirementId: requirement.id,
          requirementKind: requirement.kind,
        });
      }
    }
    operations.push({
      kind: "create-deployment",
      componentId: component.id,
      reason: "blueprint-install",
    });
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
          scope: "dependency-resource",
          bindingMode: "bind-existing-or-provisioned",
        });
        component.value.dependencyBindings.push({
          requirementId: operation.requirementId,
          requirementKind: operation.requirementKind,
        });
        relationships.push({
          kind: "component-binds-dependency",
          componentId: operation.componentId,
          requirementId: operation.requirementId,
          requirementKind: operation.requirementKind,
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
