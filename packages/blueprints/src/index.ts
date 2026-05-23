import { basename } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

export const blueprintSchemaVersion = "appaloft.blueprint/v1" as const;
export const blueprintInstallPlanSchemaVersion = "appaloft.blueprint.install-plan/v1" as const;

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
    kind: z.enum(["postgres", "redis", "volume", "object-storage"]),
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
  })
  .strict()
  .superRefine((manifest, context) => {
    const componentIds = new Set(manifest.components.map((component) => component.id));
    const secretKeys = new Set(manifest.secrets.map((secret) => secret.key));
    const resourceIds = new Set(manifest.resources.map((resource) => resource.id));

    for (const component of manifest.components) {
      const portNames = new Set(component.ports.map((port) => port.name));
      for (const route of component.routes) {
        if (!portNames.has(route.port)) {
          context.addIssue({
            code: "custom",
            message: `route references unknown component port ${route.port}`,
            path: ["components", manifest.components.indexOf(component), "routes"],
          });
        }
      }
      for (const secretKey of component.usesSecrets) {
        if (!secretKeys.has(secretKey)) {
          context.addIssue({
            code: "custom",
            message: `component references unknown secret ${secretKey}`,
            path: ["components", manifest.components.indexOf(component), "usesSecrets"],
          });
        }
      }
      for (const resourceId of component.usesResources) {
        if (!resourceIds.has(resourceId)) {
          context.addIssue({
            code: "custom",
            message: `component references unknown resource ${resourceId}`,
            path: ["components", manifest.components.indexOf(component), "usesResources"],
          });
        }
      }
    }

    if (componentIds.size !== manifest.components.length) {
      context.addIssue({
        code: "custom",
        message: "component ids must be unique",
        path: ["components"],
      });
    }
  });

export type BlueprintManifest = z.infer<typeof blueprintManifestSchema>;
export type BlueprintComponent = BlueprintManifest["components"][number];
export type BlueprintEnvironmentProfile = NonNullable<BlueprintManifest["profiles"]>[string];
export type BlueprintParameter = BlueprintManifest["parameters"][number];
export type BlueprintSecretPlaceholder = BlueprintManifest["secrets"][number];
export type BlueprintResourceRequirement = BlueprintManifest["resources"][number];

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
  };
  readonly profile: string;
  readonly target: BlueprintInstallTarget;
  readonly operations: readonly BlueprintInstallOperation[];
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
  const profileName = input.profile ?? firstProfileName(input.manifest);
  const profile = input.manifest.profiles[profileName];
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

  const parameterIssues = validateParameterValues(input.manifest, input.parameters ?? {});
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

  for (const component of input.manifest.components) {
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
    for (const parameter of input.manifest.parameters) {
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
      const secret = input.manifest.secrets.find((candidate) => candidate.key === secretKey);
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
      const requirement = input.manifest.resources.find(
        (candidate) => candidate.id === requirementId,
      );
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
        id: input.manifest.id,
        name: input.manifest.name,
        version: input.manifest.version,
      },
      profile: profileName,
      target: input.target,
      operations,
      warnings: profile.replicas === 0 ? ["Selected profile has zero replicas."] : [],
    },
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
