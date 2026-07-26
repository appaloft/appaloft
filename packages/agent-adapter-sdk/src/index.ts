import { createHash } from "node:crypto";
import { satisfies as semverSatisfies, validRange, valid as validSemver } from "semver";
import { z } from "zod";

export const agentAdapterSchemaVersion = "appaloft.agent-adapter/v1" as const;
export const agentAdapterApiVersion = "1.0.0" as const;

export const agentAdapterHostCapabilities = [
  "managed-terminal",
  "background-task",
  "native-attach",
  "headless",
  "structured-events",
  "credential-grants",
] as const;

const identifierPattern = /^[a-z][a-z0-9-]{0,62}$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const environmentVariablePattern = /^[A-Z_][A-Z0-9_]{0,127}$/;
const secretReferencePattern =
  /^(?:secret|vault|supabase-vault):\/\/[a-zA-Z0-9][a-zA-Z0-9_./:#-]{1,511}$/;
const safeHttpPathPattern = /^\/(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^?#]*$/;
const shellExecutables = new Set([
  "ash",
  "bash",
  "cmd",
  "cmd.exe",
  "dash",
  "fish",
  "ksh",
  "powershell",
  "powershell.exe",
  "pwsh",
  "sh",
  "zsh",
]);

const identifierSchema = z.string().trim().regex(identifierPattern);
const nonEmptyTextSchema = z.string().trim().min(1).max(1_000);
const versionSchema = z
  .string()
  .trim()
  .refine((value) => Boolean(validSemver(value)), "must be a valid semantic version");
const versionRangeSchema = z
  .string()
  .trim()
  .refine((value) => Boolean(validRange(value)), "must be a valid semantic version range");
const digestSchema = z.string().trim().regex(digestPattern);
const commandArgumentSchema = z
  .string()
  .min(1)
  .max(2_048)
  .refine((value) => !containsControlCharacters(value), "must not contain control characters");
const commandSchema = z.array(commandArgumentSchema).min(1).max(64);
const persistentPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(512)
  .refine((value) => {
    if (value === "/workspace") return true;
    if (!value.startsWith("/workspace/") || value.endsWith("/")) return false;
    const segments = value.slice("/workspace/".length).split("/");
    return segments.every(
      (segment) =>
        segment.length > 0 &&
        segment !== "." &&
        segment !== ".." &&
        !containsControlCharacters(segment),
    );
  }, "must be an absolute normalized path below /workspace");

const hostCapabilitySchema = z.enum(agentAdapterHostCapabilities);

const interactionModeSchema = z
  .object({
    id: identifierSchema,
    transport: z.enum(["terminal", "background-task", "native-attach", "headless"]),
    command: commandSchema,
    taskInput: z.enum(["append-argument", "stdin"]).optional(),
    eventFidelity: z.enum(["raw-pty", "line-events", "structured-events"]),
    structuredEventSchemaVersion: z.literal("appaloft.agent-event/v1").optional(),
    sessionRecovery: z.enum(["process-lifetime", "managed-run-lineage", "native-session-store"]),
  })
  .strict()
  .superRefine((mode, context) => {
    const interactive = mode.transport === "terminal" || mode.transport === "native-attach";
    const task = mode.transport === "background-task" || mode.transport === "headless";
    if (interactive && mode.eventFidelity !== "raw-pty") {
      context.addIssue({
        code: "custom",
        message: "interactive modes must preserve raw PTY fidelity",
        path: ["eventFidelity"],
      });
    }
    if (task && mode.eventFidelity === "raw-pty") {
      context.addIssue({
        code: "custom",
        message: "task modes must use bounded line or validated structured events",
        path: ["eventFidelity"],
      });
    }
    if (task && !mode.taskInput) {
      context.addIssue({
        code: "custom",
        message: "task modes require an explicit task input transport",
        path: ["taskInput"],
      });
    }
    if (interactive && mode.taskInput) {
      context.addIssue({
        code: "custom",
        message: "interactive modes do not accept managed task input",
        path: ["taskInput"],
      });
    }
    if (mode.eventFidelity === "structured-events" && !mode.structuredEventSchemaVersion) {
      context.addIssue({
        code: "custom",
        message: "structured event fidelity requires a supported event schema",
        path: ["structuredEventSchemaVersion"],
      });
    }
    if (mode.eventFidelity !== "structured-events" && mode.structuredEventSchemaVersion) {
      context.addIssue({
        code: "custom",
        message: "an event schema is valid only for structured event fidelity",
        path: ["structuredEventSchemaVersion"],
      });
    }
    const expectedRecovery = {
      terminal: "process-lifetime",
      "background-task": "managed-run-lineage",
      "native-attach": "native-session-store",
      headless: "managed-run-lineage",
    }[mode.transport];
    if (mode.sessionRecovery !== expectedRecovery) {
      context.addIssue({
        code: "custom",
        message: `${mode.transport} requires ${expectedRecovery} session recovery`,
        path: ["sessionRecovery"],
      });
    }
  });

const credentialRequirementSchema = z
  .object({
    id: identifierSchema,
    kind: z.enum(["model-api", "forge", "custom"]),
    required: z.boolean().default(true),
    purpose: nonEmptyTextSchema,
    delivery: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("process-environment"),
          variable: z.string().trim().regex(environmentVariablePattern),
        })
        .strict(),
      z
        .object({
          kind: z.literal("stdin"),
        })
        .strict(),
    ]),
  })
  .strict();

export const agentAdapterCredentialReferenceSchema = z
  .object({
    requirementId: identifierSchema,
    secretRef: z.string().trim().regex(secretReferencePattern),
  })
  .strict();

const healthcheckSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("process") }).strict(),
  z
    .object({
      kind: z.literal("http"),
      port: z.number().int().min(1).max(65_535),
      path: z
        .string()
        .trim()
        .regex(safeHttpPathPattern)
        .refine(
          (value) => !containsControlCharacters(value),
          "must not contain control characters",
        ),
    })
    .strict(),
]);

export const agentAdapterManifestSchema = z
  .object({
    schemaVersion: z.literal(agentAdapterSchemaVersion),
    id: identifierSchema,
    displayName: z.string().trim().min(1).max(120),
    version: versionSchema,
    description: nonEmptyTextSchema.optional(),
    kind: z.literal("declarative"),
    requirements: z
      .object({
        adapterApi: versionRangeSchema,
        sandboxTemplate: z
          .object({
            id: identifierSchema,
            version: versionRangeSchema,
            digest: digestSchema,
          })
          .strict(),
        runtimes: z
          .array(
            z
              .object({
                id: identifierSchema,
                version: versionRangeSchema,
              })
              .strict(),
          )
          .max(32)
          .default([]),
        capabilities: z
          .object({
            required: z.array(hostCapabilitySchema).max(32).default([]),
            optional: z.array(hostCapabilitySchema).max(32).default([]),
          })
          .strict()
          .default({ required: [], optional: [] }),
      })
      .strict(),
    interactionModes: z.array(interactionModeSchema).min(1).max(16),
    persistentPaths: z.array(persistentPathSchema).max(64).default([]),
    healthcheck: healthcheckSchema.optional(),
    credentials: z.array(credentialRequirementSchema).max(32).default([]),
  })
  .strict()
  .superRefine((manifest, context) => {
    addDuplicateIssues(
      manifest.interactionModes.map((mode) => mode.id),
      ["interactionModes"],
      "interaction mode ids",
      context,
    );
    addDuplicateIssues(
      manifest.requirements.runtimes.map((runtime) => runtime.id),
      ["requirements", "runtimes"],
      "runtime requirement ids",
      context,
    );
    addDuplicateIssues(
      manifest.credentials.map((credential) => credential.id),
      ["credentials"],
      "credential requirement ids",
      context,
    );
    addDuplicateIssues(manifest.persistentPaths, ["persistentPaths"], "persistent paths", context);
    addDuplicateIssues(
      manifest.requirements.capabilities.required,
      ["requirements", "capabilities", "required"],
      "required capabilities",
      context,
    );
    addDuplicateIssues(
      manifest.requirements.capabilities.optional,
      ["requirements", "capabilities", "optional"],
      "optional capabilities",
      context,
    );
    const required = new Set(manifest.requirements.capabilities.required);
    for (const [index, capability] of manifest.requirements.capabilities.optional.entries()) {
      if (!required.has(capability)) continue;
      context.addIssue({
        code: "custom",
        message: "a capability cannot be both required and optional",
        path: ["requirements", "capabilities", "optional", index],
      });
    }
    const runtimeIds = new Set(manifest.requirements.runtimes.map((runtime) => runtime.id));
    for (const [index, mode] of manifest.interactionModes.entries()) {
      const executable = mode.command[0] ?? "";
      const executableName = executable.split("/").at(-1)?.toLowerCase() ?? "";
      if (shellExecutables.has(executableName)) {
        context.addIssue({
          code: "custom",
          message: "declarative Adapter modes must not invoke a shell interpreter",
          path: ["interactionModes", index, "command", 0],
        });
        continue;
      }
      if (!runtimeIds.has(executable)) {
        context.addIssue({
          code: "custom",
          message: "command executable must match a declared runtime requirement id",
          path: ["interactionModes", index, "command", 0],
        });
      }
    }
  });

export type AgentAdapterManifest = z.infer<typeof agentAdapterManifestSchema>;
export type AgentAdapterHostCapability = (typeof agentAdapterHostCapabilities)[number];
export type AgentAdapterCredentialReference = z.infer<typeof agentAdapterCredentialReferenceSchema>;
export interface ResolvedAgentAdapterCredentialBinding {
  requirementId: string;
  kind: AgentAdapterManifest["credentials"][number]["kind"];
  purpose: string;
  delivery: AgentAdapterManifest["credentials"][number]["delivery"];
  secretRef: string;
}

export type AgentAdapterCredentialBindingIssueCode =
  | "invalid_adapter_manifest"
  | "invalid_credential_binding"
  | "unknown_credential_requirement"
  | "duplicate_credential_binding"
  | "missing_required_credential"
  | "ambiguous_stdin_credential_bindings";

export interface AgentAdapterCredentialBindingIssue {
  code: AgentAdapterCredentialBindingIssueCode;
  message: string;
  path?: (string | number)[];
  requirementId?: string;
}

export type AgentAdapterCredentialBindingResult =
  | {
      ok: true;
      bindings: ResolvedAgentAdapterCredentialBinding[];
    }
  | {
      ok: false;
      issues: AgentAdapterCredentialBindingIssue[];
    };

export interface AgentAdapterCompatibilityEnvironment {
  adapterApiVersion?: string;
  availableCapabilities?: readonly AgentAdapterHostCapability[];
  sandboxTemplates?: readonly {
    id: string;
    version: string;
    digest: string;
  }[];
  runtimes?: readonly {
    id: string;
    version: string;
  }[];
}

export type AgentAdapterValidationIssueCode =
  | "invalid_manifest"
  | "incompatible_adapter_api"
  | "missing_required_capability"
  | "missing_sandbox_template"
  | "sandbox_template_digest_mismatch"
  | "incompatible_sandbox_template_version"
  | "missing_runtime"
  | "incompatible_runtime_version";

export interface AgentAdapterValidationIssue {
  code: AgentAdapterValidationIssueCode;
  path: (string | number)[];
  message: string;
}

export interface ValidatedAgentAdapterDefinition {
  manifest: AgentAdapterManifest;
  digest: `sha256:${string}`;
  canonicalManifest: string;
  compatibility: {
    status: "compatible" | "unchecked";
    unavailableOptionalCapabilities: AgentAdapterHostCapability[];
  };
}

export type AgentAdapterValidationResult =
  | {
      ok: true;
      definition: ValidatedAgentAdapterDefinition;
    }
  | {
      ok: false;
      issues: AgentAdapterValidationIssue[];
    };

export function validateAgentAdapterManifest(
  input: unknown,
  environment: AgentAdapterCompatibilityEnvironment = {},
): AgentAdapterValidationResult {
  const parsed = agentAdapterManifestSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        code: "invalid_manifest",
        path: issue.path.filter(
          (part): part is string | number => typeof part === "string" || typeof part === "number",
        ),
        message: issue.message,
      })),
    };
  }

  const manifest = parsed.data;
  const compatibilityIssues: AgentAdapterValidationIssue[] = [];
  const hostApiVersion = environment.adapterApiVersion ?? agentAdapterApiVersion;
  if (
    !validSemver(hostApiVersion) ||
    !semverSatisfies(hostApiVersion, manifest.requirements.adapterApi, {
      includePrerelease: true,
    })
  ) {
    compatibilityIssues.push({
      code: "incompatible_adapter_api",
      path: ["requirements", "adapterApi"],
      message: `Adapter requires ${manifest.requirements.adapterApi}, host provides ${hostApiVersion}`,
    });
  }

  const availableCapabilitySet = environment.availableCapabilities
    ? new Set(environment.availableCapabilities)
    : undefined;
  if (availableCapabilitySet) {
    const missingRequired = manifest.requirements.capabilities.required.filter(
      (capability) => !availableCapabilitySet.has(capability),
    );
    if (missingRequired.length > 0) {
      compatibilityIssues.push({
        code: "missing_required_capability",
        path: ["requirements", "capabilities", "required"],
        message: `Host is missing required capabilities: ${missingRequired.join(", ")}`,
      });
    }
  }

  if (environment.sandboxTemplates) {
    const template = environment.sandboxTemplates.find(
      (candidate) => candidate.id === manifest.requirements.sandboxTemplate.id,
    );
    if (!template) {
      compatibilityIssues.push({
        code: "missing_sandbox_template",
        path: ["requirements", "sandboxTemplate", "id"],
        message: `Sandbox Template ${manifest.requirements.sandboxTemplate.id} is unavailable`,
      });
    } else {
      if (template.digest !== manifest.requirements.sandboxTemplate.digest) {
        compatibilityIssues.push({
          code: "sandbox_template_digest_mismatch",
          path: ["requirements", "sandboxTemplate", "digest"],
          message: "Sandbox Template digest does not match the pinned requirement",
        });
      }
      if (
        !validSemver(template.version) ||
        !semverSatisfies(template.version, manifest.requirements.sandboxTemplate.version, {
          includePrerelease: true,
        })
      ) {
        compatibilityIssues.push({
          code: "incompatible_sandbox_template_version",
          path: ["requirements", "sandboxTemplate", "version"],
          message: `Sandbox Template requires ${manifest.requirements.sandboxTemplate.version}, host provides ${template.version}`,
        });
      }
    }
  }

  if (environment.runtimes) {
    for (const [index, requirement] of manifest.requirements.runtimes.entries()) {
      const runtime = environment.runtimes.find((candidate) => candidate.id === requirement.id);
      if (!runtime) {
        compatibilityIssues.push({
          code: "missing_runtime",
          path: ["requirements", "runtimes", index, "id"],
          message: `Runtime ${requirement.id} is unavailable`,
        });
        continue;
      }
      if (
        !validSemver(runtime.version) ||
        !semverSatisfies(runtime.version, requirement.version, {
          includePrerelease: true,
        })
      ) {
        compatibilityIssues.push({
          code: "incompatible_runtime_version",
          path: ["requirements", "runtimes", index, "version"],
          message: `Runtime ${requirement.id} requires ${requirement.version}, host provides ${runtime.version}`,
        });
      }
    }
  }

  if (compatibilityIssues.length > 0) {
    return { ok: false, issues: compatibilityIssues };
  }

  const unavailableOptionalCapabilities = availableCapabilitySet
    ? manifest.requirements.capabilities.optional.filter(
        (capability) => !availableCapabilitySet.has(capability),
      )
    : [];
  const fullyChecked =
    environment.availableCapabilities !== undefined &&
    environment.sandboxTemplates !== undefined &&
    environment.runtimes !== undefined;
  return {
    ok: true,
    definition: {
      manifest,
      canonicalManifest: canonicalJson(manifest),
      digest: `sha256:${createHash("sha256").update(canonicalJson(manifest)).digest("hex")}`,
      compatibility: {
        status: fullyChecked ? "compatible" : "unchecked",
        unavailableOptionalCapabilities,
      },
    },
  };
}

export function resolveAgentAdapterCredentialBindings(
  manifestInput: unknown,
  referencesInput: unknown,
): AgentAdapterCredentialBindingResult {
  const manifest = agentAdapterManifestSchema.safeParse(manifestInput);
  if (!manifest.success) {
    return {
      ok: false,
      issues: manifest.error.issues.map((issue) => ({
        code: "invalid_adapter_manifest",
        message: issue.message,
        path: issue.path.filter(
          (part): part is string | number => typeof part === "string" || typeof part === "number",
        ),
      })),
    };
  }
  const references = z
    .array(agentAdapterCredentialReferenceSchema)
    .max(32)
    .safeParse(referencesInput);
  if (!references.success) {
    return {
      ok: false,
      issues: references.error.issues.map((issue) => ({
        code: "invalid_credential_binding",
        message: issue.message,
        path: issue.path.filter(
          (part): part is string | number => typeof part === "string" || typeof part === "number",
        ),
      })),
    };
  }

  const requirements = new Map(
    manifest.data.credentials.map((requirement) => [requirement.id, requirement] as const),
  );
  const referencesByRequirement = new Map<string, AgentAdapterCredentialReference>();
  const issues: AgentAdapterCredentialBindingIssue[] = [];
  for (const reference of references.data) {
    if (!requirements.has(reference.requirementId)) {
      issues.push({
        code: "unknown_credential_requirement",
        message: `Credential requirement ${reference.requirementId} is not declared by the Adapter`,
        requirementId: reference.requirementId,
      });
      continue;
    }
    if (referencesByRequirement.has(reference.requirementId)) {
      issues.push({
        code: "duplicate_credential_binding",
        message: `Credential requirement ${reference.requirementId} is bound more than once`,
        requirementId: reference.requirementId,
      });
      continue;
    }
    referencesByRequirement.set(reference.requirementId, reference);
  }
  for (const requirement of manifest.data.credentials) {
    if (requirement.required && !referencesByRequirement.has(requirement.id)) {
      issues.push({
        code: "missing_required_credential",
        message: `Credential requirement ${requirement.id} requires a secret reference`,
        requirementId: requirement.id,
      });
    }
  }

  const bindings = manifest.data.credentials.flatMap((requirement) => {
    const reference = referencesByRequirement.get(requirement.id);
    return reference
      ? [
          {
            requirementId: requirement.id,
            kind: requirement.kind,
            purpose: requirement.purpose,
            delivery: requirement.delivery,
            secretRef: reference.secretRef,
          },
        ]
      : [];
  });
  if (bindings.filter((binding) => binding.delivery.kind === "stdin").length > 1) {
    issues.push({
      code: "ambiguous_stdin_credential_bindings",
      message: "Only one credential may use stdin delivery for an Adapter process",
    });
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, bindings };
}

function addDuplicateIssues(
  values: readonly string[],
  path: (string | number)[],
  label: string,
  context: z.core.$RefinementCtx<unknown>,
): void {
  const seen = new Set<string>();
  for (const [index, value] of values.entries()) {
    if (!seen.has(value)) {
      seen.add(value);
      continue;
    }
    context.addIssue({
      code: "custom",
      message: `${label} must be unique`,
      path: [...path, index],
    });
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function containsControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint < 32 || codePoint === 127)) return true;
  }
  return false;
}
