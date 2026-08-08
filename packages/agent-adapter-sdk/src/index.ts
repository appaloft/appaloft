import { createHash } from "node:crypto";
import { satisfies as semverSatisfies, validRange, valid as validSemver } from "semver";
import { z } from "zod";

export const agentAdapterSchemaVersion = "appaloft.agent-adapter/v1" as const;
export const agentAdapterApiVersion = "1.0.0" as const;
export const agentWorkspaceProfileSchemaVersion = "appaloft.agent-workspace-profile/v1" as const;

export const agentAdapterHostCapabilities = [
  "managed-terminal",
  "background-task",
  "native-attach",
  "headless",
  "structured-events",
  "credential-grants",
] as const;

const identifierPattern = /^[a-z][a-z0-9-]{0,62}$/;
const sandboxTemplateIdentifierPattern = /^[a-z][a-z0-9_-]{0,127}$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const environmentVariablePattern = /^[A-Z_][A-Z0-9_]{0,127}$/;
const connectionReferencePattern = /^[A-Za-z][A-Za-z0-9_.:-]{0,159}$/;
const safeHttpPathPattern = /^\/(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^?#]*$/;
const domainNamePattern =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
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
const sandboxTemplateIdentifierSchema = z.string().trim().regex(sandboxTemplateIdentifierPattern);
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
    clientHandoff: z.enum(["local-client-exec", "display-only"]).optional(),
    serverPort: z.number().int().min(1).max(65_535).optional(),
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
    if (mode.transport !== "native-attach" && mode.clientHandoff) {
      context.addIssue({
        code: "custom",
        message: "client handoff is only valid for native-attach modes",
        path: ["clientHandoff"],
      });
    }
    if (mode.transport === "native-attach" && mode.serverPort === undefined) {
      context.addIssue({
        code: "custom",
        message: "native-attach modes require a scoped server port",
        path: ["serverPort"],
      });
    }
    if (mode.transport !== "native-attach" && mode.serverPort !== undefined) {
      context.addIssue({
        code: "custom",
        message: "server port is only valid for native-attach modes",
        path: ["serverPort"],
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
    connectionReference: z.string().trim().regex(connectionReferencePattern),
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
            id: sandboxTemplateIdentifierSchema,
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
    start: commandSchema.optional(),
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
    if (manifest.start) {
      const executable = manifest.start[0] ?? "";
      const executableName = executable.split("/").at(-1)?.toLowerCase() ?? "";
      if (shellExecutables.has(executableName)) {
        context.addIssue({
          code: "custom",
          message: "declarative Adapter start must not invoke a shell interpreter",
          path: ["start", 0],
        });
      } else if (!runtimeIds.has(executable)) {
        context.addIssue({
          code: "custom",
          message: "start executable must match a declared runtime requirement id",
          path: ["start", 0],
        });
      }
    }
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
    const nativeModes = manifest.interactionModes.filter(
      (mode) => mode.transport === "native-attach",
    );
    if (nativeModes.length > 0) {
      if (!manifest.start) {
        context.addIssue({
          code: "custom",
          message: "native attach requires a declarative Runtime start command",
          path: ["start"],
        });
      }
      if (manifest.healthcheck?.kind !== "http") {
        context.addIssue({
          code: "custom",
          message: "native attach requires an HTTP Runtime healthcheck",
          path: ["healthcheck"],
        });
      } else {
        const healthcheckPort = manifest.healthcheck.port;
        if (
          nativeModes.every(
            (mode) =>
              typeof mode.serverPort === "number" &&
              mode.serverPort >= 1 &&
              mode.serverPort <= 65_535,
          ) &&
          nativeModes.some((mode) => mode.serverPort !== healthcheckPort)
        ) {
          context.addIssue({
            code: "custom",
            message: "native attach serverPort must match the Runtime healthcheck port",
            path: ["healthcheck", "port"],
          });
        }
      }
    }
  });

const sandboxLimitsSchema = z
  .object({
    cpuMillis: z.number().int().min(100).max(64_000),
    memoryBytes: z.number().int().min(134_217_728).max(274_877_906_944),
    diskBytes: z.number().int().min(1_073_741_824).max(2_199_023_255_552),
    maxProcesses: z.number().int().min(1).max(4_096),
  })
  .strict();

const sandboxNetworkPolicySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("deny") }).strict(),
  z
    .object({
      mode: z.literal("allowlist"),
      rules: z
        .array(
          z
            .object({
              kind: z.literal("domain"),
              value: z.string().trim().toLowerCase().regex(domainNamePattern),
              ports: z.array(z.number().int().min(1).max(65_535)).min(1).max(32),
            })
            .strict()
            .superRefine((rule, context) => {
              addDuplicateNumberIssues(rule.ports, ["ports"], "network ports", context);
            }),
        )
        .max(64),
    })
    .strict(),
]);

const boundedWorkspaceCommandSchema = z
  .object({
    id: identifierSchema,
    argv: commandSchema,
    workingDirectory: persistentPathSchema.optional(),
  })
  .strict()
  .superRefine((command, context) => {
    const executableName = (command.argv[0] ?? "").split("/").at(-1)?.toLowerCase() ?? "";
    if (shellExecutables.has(executableName)) {
      context.addIssue({
        code: "custom",
        message: "Profile commands must not invoke a shell interpreter",
        path: ["argv", 0],
      });
    }
  });

export const agentWorkspaceProfileSchema = z
  .object({
    schemaVersion: z.literal(agentWorkspaceProfileSchemaVersion),
    id: identifierSchema,
    displayName: z.string().trim().min(1).max(120),
    version: versionSchema,
    description: nonEmptyTextSchema.optional(),
    adapter: z
      .object({
        id: identifierSchema,
        version: versionSchema,
        digest: digestSchema,
        interactiveModeId: identifierSchema.optional(),
        taskModeId: identifierSchema,
      })
      .strict(),
    harnessTemplateId: z
      .string()
      .trim()
      .regex(/^[A-Za-z][A-Za-z0-9_-]{0,127}$/),
    sandbox: z
      .object({
        template: z
          .object({
            id: sandboxTemplateIdentifierSchema,
            version: versionSchema,
            digest: digestSchema,
          })
          .strict(),
        requestedIsolation: z.enum(["container-trusted", "gvisor", "kata", "microvm"]),
        limits: sandboxLimitsSchema,
        networkPolicy: sandboxNetworkPolicySchema.default({ mode: "deny" }),
      })
      .strict(),
    workingDirectory: persistentPathSchema.default("/workspace"),
    initialization: z.array(boundedWorkspaceCommandSchema).max(32).default([]),
    defaultPorts: z
      .array(
        z
          .object({
            name: identifierSchema,
            port: z.number().int().min(1).max(65_535),
            visibility: z.enum(["private", "organization", "public"]).default("private"),
            ttlSeconds: z.number().int().min(60).max(604_800),
          })
          .strict(),
      )
      .max(32)
      .default([]),
    preview: z
      .object({
        portName: identifierSchema,
        start: boundedWorkspaceCommandSchema,
      })
      .strict()
      .optional(),
    persistentPaths: z.array(persistentPathSchema).max(64).default([]),
    suggestedChecks: z
      .array(
        z
          .object({
            name: z.string().trim().min(1).max(120),
            argv: commandSchema,
            workingDirectory: persistentPathSchema.optional(),
          })
          .strict()
          .superRefine((check, context) => {
            const executableName = (check.argv[0] ?? "").split("/").at(-1)?.toLowerCase() ?? "";
            if (shellExecutables.has(executableName)) {
              context.addIssue({
                code: "custom",
                message: "Profile checks must not invoke a shell interpreter",
                path: ["argv", 0],
              });
            }
          }),
      )
      .max(32)
      .default([]),
  })
  .strict()
  .superRefine((profile, context) => {
    addDuplicateIssues(
      profile.initialization.map((step) => step.id),
      ["initialization"],
      "initialization ids",
      context,
    );
    addDuplicateIssues(
      profile.defaultPorts.map((port) => port.name),
      ["defaultPorts"],
      "default port names",
      context,
    );
    addDuplicateNumberIssues(
      profile.defaultPorts.map((port) => port.port),
      ["defaultPorts"],
      "default ports",
      context,
      "port",
    );
    if (
      profile.preview &&
      !profile.defaultPorts.some((port) => port.name === profile.preview?.portName)
    ) {
      context.addIssue({
        code: "custom",
        message: "Preview portName must reference one default port",
        path: ["preview", "portName"],
      });
    }
    addDuplicateIssues(profile.persistentPaths, ["persistentPaths"], "persistent paths", context);
  });

export type AgentAdapterManifest = z.infer<typeof agentAdapterManifestSchema>;
export type AgentAdapterHostCapability = (typeof agentAdapterHostCapabilities)[number];
export type AgentAdapterCredentialReference = z.infer<typeof agentAdapterCredentialReferenceSchema>;
export interface ResolvedAgentAdapterCredentialBinding {
  requirementId: string;
  kind: AgentAdapterManifest["credentials"][number]["kind"];
  purpose: string;
  delivery: AgentAdapterManifest["credentials"][number]["delivery"];
  connectionReference: string;
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

export type AgentWorkspaceProfile = z.infer<typeof agentWorkspaceProfileSchema>;

export interface ValidatedAgentWorkspaceProfileDefinition {
  manifest: AgentWorkspaceProfile;
  digest: `sha256:${string}`;
  canonicalManifest: string;
}

export interface AgentWorkspaceProfileValidationIssue {
  code: "invalid_profile";
  path: (string | number)[];
  message: string;
}

export type AgentWorkspaceProfileValidationResult =
  | {
      ok: true;
      definition: ValidatedAgentWorkspaceProfileDefinition;
    }
  | {
      ok: false;
      issues: AgentWorkspaceProfileValidationIssue[];
    };

export type AgentWorkspaceProfileCompileIssueCode =
  | "invalid_profile"
  | "profile_installation_disabled"
  | "adapter_installation_disabled"
  | "adapter_definition_digest_mismatch"
  | "adapter_identity_mismatch"
  | "missing_interaction_mode"
  | "invalid_interaction_mode"
  | "missing_required_capability"
  | "missing_sandbox_template"
  | "missing_preview_port"
  | "sandbox_template_digest_mismatch"
  | "sandbox_template_version_mismatch"
  | "adapter_template_requirement_mismatch";

export interface AgentWorkspaceProfileCompileIssue {
  code: AgentWorkspaceProfileCompileIssueCode;
  message: string;
  path?: (string | number)[];
}

export interface AgentWorkspaceProfileCompileEnvironment {
  profileInstallationId: string;
  profileInstallationStatus?: "disabled" | "enabled";
  adapterInstallationId: string;
  adapterInstallationStatus?: "disabled" | "enabled";
  adapterDefinition: ValidatedAgentAdapterDefinition;
  availableCapabilities: readonly AgentAdapterHostCapability[];
  sandboxTemplates: readonly {
    id: string;
    version: string;
    digest: string;
  }[];
}

export interface CompiledAgentWorkspaceProfilePlan {
  sandbox: {
    source: { kind: "template"; templateId: string };
    requestedIsolation: AgentWorkspaceProfile["sandbox"]["requestedIsolation"];
    limits: AgentWorkspaceProfile["sandbox"]["limits"];
    networkPolicy: AgentWorkspaceProfile["sandbox"]["networkPolicy"];
  };
  initialization: {
    id: string;
    argv: string[];
    cwd?: string;
  }[];
  runtime: {
    harnessKey: string;
    harnessTemplateId: string;
    declarativeHarness: {
      key: string;
      templateId: string;
      sandboxTemplateId: string;
      version: string;
      templateDigest: string;
      cwd?: string;
      run: {
        argv: string[];
        taskInput: "append-argument" | "stdin";
      };
      start?: { argv: string[] };
      attach?: {
        transport: "managed-terminal" | "native-attach";
        command: string[];
        sessionRecovery: "managed-run-lineage" | "native-session-store";
        clientHandoff: "local-client-exec" | "display-only";
        serverPort?: number;
      };
      persistentPaths: string[];
      healthcheck?: NonNullable<AgentAdapterManifest["healthcheck"]>;
    };
  };
  defaultPorts: {
    name: string;
    port: number;
    visibility: "private" | "organization" | "public";
    ttlSeconds: number;
  }[];
  preview?: {
    startArgv: string[];
    cwd?: string;
    port: number;
    visibility: "private" | "organization" | "public";
    ttlSeconds: number;
  };
  suggestedChecks: {
    name: string;
    argv: string[];
    cwd?: string;
  }[];
  credentialRequirements: AgentAdapterManifest["credentials"];
  pin: {
    profileInstallationId: string;
    profileDefinitionDigest: string;
    profileId: string;
    profileVersion: string;
    adapterInstallationId: string;
    adapterDefinitionDigest: string;
    adapterId: string;
    adapterVersion: string;
    harnessKey: string;
    harnessTemplateId: string;
    sandboxTemplateId: string;
    sandboxTemplateVersion: string;
    sandboxTemplateDigest: string;
    capabilities: {
      taskMode: boolean;
      interactive: boolean;
      backgroundRuns: boolean;
      nativeSession: boolean;
      persistentPaths: string[];
      healthcheck?: NonNullable<AgentAdapterManifest["healthcheck"]>;
    };
  };
}

export type AgentWorkspaceProfileCompileResult =
  | { ok: true; plan: CompiledAgentWorkspaceProfilePlan }
  | { ok: false; issues: AgentWorkspaceProfileCompileIssue[] };

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

export function validateAgentWorkspaceProfile(
  input: unknown,
): AgentWorkspaceProfileValidationResult {
  const parsed = agentWorkspaceProfileSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        code: "invalid_profile",
        path: issue.path.filter(
          (part): part is string | number => typeof part === "string" || typeof part === "number",
        ),
        message: issue.message,
      })),
    };
  }
  const canonicalManifest = canonicalJson(parsed.data);
  return {
    ok: true,
    definition: {
      manifest: parsed.data,
      canonicalManifest,
      digest: `sha256:${createHash("sha256").update(canonicalManifest).digest("hex")}`,
    },
  };
}

export function compileAgentWorkspaceProfile(
  profileInput: unknown,
  environment: AgentWorkspaceProfileCompileEnvironment,
): AgentWorkspaceProfileCompileResult {
  const profileValidation = validateAgentWorkspaceProfile(profileInput);
  if (!profileValidation.ok) return profileValidation;
  const profile = profileValidation.definition.manifest;
  const adapter = environment.adapterDefinition;
  const issues: AgentWorkspaceProfileCompileIssue[] = [];

  if (environment.profileInstallationStatus === "disabled") {
    issues.push({
      code: "profile_installation_disabled",
      message: "Agent Workspace Profile installation is disabled",
    });
  }
  if (environment.adapterInstallationStatus === "disabled") {
    issues.push({
      code: "adapter_installation_disabled",
      message: "Agent Adapter installation is disabled",
    });
  }
  if (adapter.digest !== profile.adapter.digest) {
    issues.push({
      code: "adapter_definition_digest_mismatch",
      message: "Agent Adapter definition digest does not match the Profile pin",
      path: ["adapter", "digest"],
    });
  }
  if (
    adapter.manifest.id !== profile.adapter.id ||
    adapter.manifest.version !== profile.adapter.version
  ) {
    issues.push({
      code: "adapter_identity_mismatch",
      message: "Agent Adapter id or version does not match the Profile pin",
      path: ["adapter"],
    });
  }

  const availableCapabilities = new Set(environment.availableCapabilities);
  const missingCapabilities = adapter.manifest.requirements.capabilities.required.filter(
    (capability) => !availableCapabilities.has(capability),
  );
  if (missingCapabilities.length > 0) {
    issues.push({
      code: "missing_required_capability",
      message: `Host is missing required capabilities: ${missingCapabilities.join(", ")}`,
      path: ["adapter", "capabilities"],
    });
  }

  const template = environment.sandboxTemplates.find(
    (candidate) => candidate.id === profile.sandbox.template.id,
  );
  if (!template) {
    issues.push({
      code: "missing_sandbox_template",
      message: `Sandbox Template ${profile.sandbox.template.id} is unavailable`,
      path: ["sandbox", "template", "id"],
    });
  } else {
    if (template.digest !== profile.sandbox.template.digest) {
      issues.push({
        code: "sandbox_template_digest_mismatch",
        message: "Sandbox Template digest does not match the Profile pin",
        path: ["sandbox", "template", "digest"],
      });
    }
    if (template.version !== profile.sandbox.template.version) {
      issues.push({
        code: "sandbox_template_version_mismatch",
        message: "Sandbox Template version does not match the Profile pin",
        path: ["sandbox", "template", "version"],
      });
    }
  }
  if (
    adapter.manifest.requirements.sandboxTemplate.id !== profile.sandbox.template.id ||
    adapter.manifest.requirements.sandboxTemplate.digest !== profile.sandbox.template.digest ||
    !semverSatisfies(
      profile.sandbox.template.version,
      adapter.manifest.requirements.sandboxTemplate.version,
      { includePrerelease: true },
    )
  ) {
    issues.push({
      code: "adapter_template_requirement_mismatch",
      message: "Profile Sandbox Template does not satisfy the pinned Adapter requirement",
      path: ["sandbox", "template"],
    });
  }

  const taskMode = adapter.manifest.interactionModes.find(
    (mode) => mode.id === profile.adapter.taskModeId,
  );
  if (!taskMode) {
    issues.push({
      code: "missing_interaction_mode",
      message: `Adapter task mode ${profile.adapter.taskModeId} is unavailable`,
      path: ["adapter", "taskModeId"],
    });
  } else if (taskMode.transport !== "background-task" && taskMode.transport !== "headless") {
    issues.push({
      code: "invalid_interaction_mode",
      message: "Profile task mode must use background-task or headless transport",
      path: ["adapter", "taskModeId"],
    });
  } else if (taskMode.taskInput !== "append-argument") {
    issues.push({
      code: "invalid_interaction_mode",
      message: "V1 declarative Profile task modes require append-argument task input",
      path: ["adapter", "taskModeId"],
    });
  }

  const interactiveMode = profile.adapter.interactiveModeId
    ? adapter.manifest.interactionModes.find(
        (mode) => mode.id === profile.adapter.interactiveModeId,
      )
    : undefined;
  if (profile.adapter.interactiveModeId && !interactiveMode) {
    issues.push({
      code: "missing_interaction_mode",
      message: `Adapter interactive mode ${profile.adapter.interactiveModeId} is unavailable`,
      path: ["adapter", "interactiveModeId"],
    });
  } else if (
    interactiveMode &&
    interactiveMode.transport !== "terminal" &&
    interactiveMode.transport !== "native-attach"
  ) {
    issues.push({
      code: "invalid_interaction_mode",
      message: "Profile interactive mode must use terminal or native-attach transport",
      path: ["adapter", "interactiveModeId"],
    });
  }
  if (issues.length > 0 || !taskMode) return { ok: false, issues };

  const workingDirectory = workspaceRelativePath(profile.workingDirectory);
  const persistentPaths = [
    ...new Set([...adapter.manifest.persistentPaths, ...profile.persistentPaths]),
  ].sort();
  const harnessKey = `declarative-${profile.id}-${profileValidation.definition.digest.slice(7, 19)}`;
  const capabilities = {
    taskMode: true,
    interactive: interactiveMode !== undefined,
    backgroundRuns: true,
    nativeSession: interactiveMode?.transport === "native-attach",
    persistentPaths,
    ...(adapter.manifest.healthcheck ? { healthcheck: adapter.manifest.healthcheck } : {}),
  };
  const attach = interactiveMode
    ? {
        transport:
          interactiveMode.transport === "native-attach"
            ? ("native-attach" as const)
            : ("managed-terminal" as const),
        command: [...interactiveMode.command],
        sessionRecovery:
          interactiveMode.transport === "native-attach"
            ? ("native-session-store" as const)
            : ("managed-run-lineage" as const),
        clientHandoff:
          interactiveMode.transport === "native-attach"
            ? (interactiveMode.clientHandoff ?? "display-only")
            : ("display-only" as const),
        ...(interactiveMode.transport === "native-attach" &&
        interactiveMode.serverPort !== undefined
          ? { serverPort: interactiveMode.serverPort }
          : {}),
      }
    : undefined;
  let preview: CompiledAgentWorkspaceProfilePlan["preview"];
  if (profile.preview) {
    const port = profile.defaultPorts.find(
      (candidate) => candidate.name === profile.preview?.portName,
    );
    if (!port) {
      return {
        ok: false,
        issues: [
          {
            code: "missing_preview_port",
            message: "Preview portName must reference one default port",
            path: ["preview", "portName"],
          },
        ],
      };
    }
    const cwd = workspaceRelativePath(
      profile.preview.start.workingDirectory ?? profile.workingDirectory,
    );
    preview = {
      startArgv: [...profile.preview.start.argv],
      ...(cwd ? { cwd } : {}),
      port: port.port,
      visibility: port.visibility,
      ttlSeconds: port.ttlSeconds,
    };
  }

  return {
    ok: true,
    plan: {
      sandbox: {
        source: { kind: "template", templateId: profile.sandbox.template.id },
        requestedIsolation: profile.sandbox.requestedIsolation,
        limits: { ...profile.sandbox.limits },
        networkPolicy:
          profile.sandbox.networkPolicy.mode === "deny"
            ? { mode: "deny" }
            : {
                mode: "allowlist",
                rules: profile.sandbox.networkPolicy.rules.map((rule) => ({
                  kind: "domain" as const,
                  value: rule.value,
                  ports: [...rule.ports],
                })),
              },
      },
      initialization: profile.initialization.map((step) => {
        const cwd = workspaceRelativePath(step.workingDirectory ?? profile.workingDirectory);
        return {
          id: step.id,
          argv: [...step.argv],
          ...(cwd ? { cwd } : {}),
        };
      }),
      runtime: {
        harnessKey,
        harnessTemplateId: profile.harnessTemplateId,
        declarativeHarness: {
          key: harnessKey,
          templateId: profile.harnessTemplateId,
          sandboxTemplateId: profile.sandbox.template.id,
          version: profile.adapter.version,
          templateDigest: profile.sandbox.template.digest,
          ...(workingDirectory ? { cwd: workingDirectory } : {}),
          run: {
            argv: [...taskMode.command],
            taskInput: taskMode.taskInput ?? "append-argument",
          },
          ...(adapter.manifest.start ? { start: { argv: [...adapter.manifest.start] } } : {}),
          ...(attach ? { attach } : {}),
          persistentPaths,
          ...(adapter.manifest.healthcheck ? { healthcheck: adapter.manifest.healthcheck } : {}),
        },
      },
      defaultPorts: profile.defaultPorts.map((port) => ({ ...port })),
      ...(preview ? { preview } : {}),
      suggestedChecks: profile.suggestedChecks.map((check) => {
        const cwd = workspaceRelativePath(check.workingDirectory ?? profile.workingDirectory);
        return {
          name: check.name,
          argv: [...check.argv],
          ...(cwd ? { cwd } : {}),
        };
      }),
      credentialRequirements: adapter.manifest.credentials.map((requirement) => ({
        ...requirement,
        delivery: { ...requirement.delivery },
      })),
      pin: {
        profileInstallationId: environment.profileInstallationId,
        profileDefinitionDigest: profileValidation.definition.digest,
        profileId: profile.id,
        profileVersion: profile.version,
        adapterInstallationId: environment.adapterInstallationId,
        adapterDefinitionDigest: adapter.digest,
        adapterId: adapter.manifest.id,
        adapterVersion: adapter.manifest.version,
        harnessKey,
        harnessTemplateId: profile.harnessTemplateId,
        sandboxTemplateId: profile.sandbox.template.id,
        sandboxTemplateVersion: profile.sandbox.template.version,
        sandboxTemplateDigest: profile.sandbox.template.digest,
        capabilities,
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
        message: `Credential requirement ${requirement.id} requires a Connection reference`,
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
            connectionReference: reference.connectionReference,
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

function addDuplicateNumberIssues(
  values: readonly number[],
  path: (string | number)[],
  label: string,
  context: z.core.$RefinementCtx<unknown>,
  field?: string,
): void {
  const seen = new Set<number>();
  for (const [index, value] of values.entries()) {
    if (!seen.has(value)) {
      seen.add(value);
      continue;
    }
    context.addIssue({
      code: "custom",
      message: `${label} must be unique`,
      path: [...path, index, ...(field ? [field] : [])],
    });
  }
}

function workspaceRelativePath(value: string): string | undefined {
  return value === "/workspace" ? undefined : value.slice("/workspace/".length);
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
