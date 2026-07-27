import {
  ActiveAgentWorkspaceReferenceCount,
  AgentWorkspaceProfileCanonicalManifest,
  AgentWorkspaceProfileDefinition,
  AgentWorkspaceProfileDefinitionDigest,
  AgentWorkspaceProfileDisplayName,
  AgentWorkspaceProfileId,
  AgentWorkspaceProfileInstallation,
  AgentWorkspaceProfileInstallationId,
  AgentWorkspaceProfileVersion,
  CreatedAt,
  domainError,
  err,
  ok,
  type Result,
  UpdatedAt,
} from "@appaloft/core";
import {
  type AgentAdapterInstallationService,
  type ResolvedAgentAdapterInstallation,
} from "./agent-adapter";
import {
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "./execution-context";
import { type Clock, type IdGenerator } from "./ports";

export interface AgentWorkspaceProfileValidationIssue {
  code: string;
  path: readonly (number | string)[];
  message: string;
}

export interface ValidatedAgentWorkspaceProfile {
  manifest: unknown;
  digest: string;
  canonicalManifest: string;
  profileId: string;
  profileVersion: string;
  displayName: string;
  adapterDefinitionDigest: string;
}

export interface AgentWorkspaceProfileCompiledPlan {
  sandbox: {
    source: { kind: "template"; templateId: string };
    requestedIsolation: "container-trusted" | "gvisor" | "kata" | "microvm";
    limits: {
      cpuMillis: number;
      memoryBytes: number;
      diskBytes: number;
      maxProcesses: number;
    };
    networkPolicy:
      | { mode: "deny" }
      | {
          mode: "allowlist";
          rules: { kind: "domain"; value: string; ports: number[] }[];
        };
  };
  initialization: { id: string; argv: string[]; cwd?: string }[];
  runtime: {
    harnessKey: string;
    harnessTemplateId: string;
    declarativeHarness: Readonly<Record<string, unknown>>;
  };
  defaultPorts: {
    name: string;
    port: number;
    visibility: "private" | "organization" | "public";
    ttlSeconds: number;
  }[];
  suggestedChecks: { name: string; argv: string[]; cwd?: string }[];
  credentialRequirements: unknown[];
  pin: AgentWorkspaceProfilePin;
}

export interface AgentWorkspaceProfilePin {
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
    healthcheck?: { kind: "process" } | { kind: "http"; port: number; path: string };
  };
}

export interface AgentWorkspaceProfileValidatorCompiler {
  validate(
    manifest: unknown,
  ):
    | { ok: true; definition: ValidatedAgentWorkspaceProfile }
    | { ok: false; issues: readonly AgentWorkspaceProfileValidationIssue[] };
  compile(
    manifest: unknown,
    input: {
      profileInstallationId: string;
      adapterInstallation: ResolvedAgentAdapterInstallation;
    },
  ):
    | { ok: true; plan: AgentWorkspaceProfileCompiledPlan }
    | { ok: false; issues: readonly AgentWorkspaceProfileValidationIssue[] };
}

export interface AgentWorkspaceProfileHarnessRegistrar {
  register(descriptor: Readonly<Record<string, unknown>>): Result<void>;
}

export interface AgentWorkspaceProfileInstallationReadModel {
  installationId: string;
  definitionDigest: string;
  profileId: string;
  profileVersion: string;
  displayName: string;
  adapterDefinitionDigest: string;
  status: "disabled" | "enabled";
  installedAt: string;
  updatedAt?: string;
}

export interface AgentWorkspaceProfileRegistryRepository {
  saveDefinition(
    definition: AgentWorkspaceProfileDefinition,
  ): Promise<Result<AgentWorkspaceProfileDefinition>>;
  findDefinition(definitionDigest: string): Promise<AgentWorkspaceProfileDefinition | null>;
  saveInstallation(
    context: RepositoryContext,
    installation: AgentWorkspaceProfileInstallation,
    expectedRevision: number | null,
  ): Promise<Result<void>>;
  findInstallation(
    context: RepositoryContext,
    installationId: string,
  ): Promise<AgentWorkspaceProfileInstallation | null>;
  findInstallationByDefinition(
    context: RepositoryContext,
    definitionDigest: string,
  ): Promise<AgentWorkspaceProfileInstallation | null>;
  listInstallations(
    context: RepositoryContext,
    limit: number,
  ): Promise<AgentWorkspaceProfileInstallation[]>;
  deleteInstallation(context: RepositoryContext, installationId: string): Promise<Result<boolean>>;
}

export interface AgentWorkspaceProfileInstallationReferenceReader {
  countActiveWorkspaceReferences(
    context: RepositoryContext,
    installationId: string,
  ): Promise<number>;
}

function tenantKey(context: RepositoryContext): string {
  return context.tenant?.tenantId ?? "tenant_instance";
}

function cloneDefinition(
  definition: AgentWorkspaceProfileDefinition,
): AgentWorkspaceProfileDefinition {
  return AgentWorkspaceProfileDefinition.rehydrate(definition.toState());
}

function cloneInstallation(
  installation: AgentWorkspaceProfileInstallation,
): AgentWorkspaceProfileInstallation {
  return AgentWorkspaceProfileInstallation.rehydrate(installation.toState());
}

export class InMemoryAgentWorkspaceProfileRegistryRepository
  implements AgentWorkspaceProfileRegistryRepository
{
  private readonly definitions = new Map<string, AgentWorkspaceProfileDefinition>();
  private readonly installations = new Map<string, AgentWorkspaceProfileInstallation>();

  private installationKey(context: RepositoryContext, installationId: string): string {
    return `${tenantKey(context)}:${installationId}`;
  }

  async saveDefinition(
    definition: AgentWorkspaceProfileDefinition,
  ): Promise<Result<AgentWorkspaceProfileDefinition>> {
    const digest = definition.id.value;
    const existing = this.definitions.get(digest);
    if (existing) {
      if (
        !existing.matchesCanonicalManifest(definition.toState().canonicalManifest) ||
        !existing.toState().profileId.equals(definition.toState().profileId) ||
        !existing.toState().profileVersion.equals(definition.toState().profileVersion)
      ) {
        return err(
          domainError.conflict("Agent Workspace Profile definition digest collision", {
            definitionDigest: digest,
          }),
        );
      }
      return ok(cloneDefinition(existing));
    }
    this.definitions.set(digest, cloneDefinition(definition));
    return ok(cloneDefinition(definition));
  }

  async findDefinition(definitionDigest: string): Promise<AgentWorkspaceProfileDefinition | null> {
    const found = this.definitions.get(definitionDigest);
    return found ? cloneDefinition(found) : null;
  }

  async saveInstallation(
    context: RepositoryContext,
    installation: AgentWorkspaceProfileInstallation,
    expectedRevision: number | null,
  ): Promise<Result<void>> {
    const key = this.installationKey(context, installation.id.value);
    const current = this.installations.get(key);
    if (
      expectedRevision === null
        ? current !== undefined
        : current?.toState().revision.value !== expectedRevision
    ) {
      return err(
        domainError.conflict("Agent Workspace Profile installation changed concurrently", {
          installationId: installation.id.value,
          expectedRevision,
        }),
      );
    }
    this.installations.set(key, cloneInstallation(installation));
    return ok(undefined);
  }

  async findInstallation(
    context: RepositoryContext,
    installationId: string,
  ): Promise<AgentWorkspaceProfileInstallation | null> {
    const found = this.installations.get(this.installationKey(context, installationId));
    return found ? cloneInstallation(found) : null;
  }

  async findInstallationByDefinition(
    context: RepositoryContext,
    definitionDigest: string,
  ): Promise<AgentWorkspaceProfileInstallation | null> {
    const prefix = `${tenantKey(context)}:`;
    const found = [...this.installations.entries()].find(
      ([key, installation]) =>
        key.startsWith(prefix) &&
        installation.toState().definitionDigest.value === definitionDigest,
    )?.[1];
    return found ? cloneInstallation(found) : null;
  }

  async listInstallations(
    context: RepositoryContext,
    limit: number,
  ): Promise<AgentWorkspaceProfileInstallation[]> {
    const prefix = `${tenantKey(context)}:`;
    return [...this.installations.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, installation]) => cloneInstallation(installation))
      .sort((left, right) =>
        right.toState().installedAt.value.localeCompare(left.toState().installedAt.value),
      )
      .slice(0, Math.max(1, Math.min(limit, 200)));
  }

  async deleteInstallation(
    context: RepositoryContext,
    installationId: string,
  ): Promise<Result<boolean>> {
    return ok(this.installations.delete(this.installationKey(context, installationId)));
  }
}

export interface AgentWorkspaceProfileInstallationServiceDependencies {
  repository: AgentWorkspaceProfileRegistryRepository;
  referenceReader: AgentWorkspaceProfileInstallationReferenceReader;
  adapterService: AgentAdapterInstallationService;
  validatorCompiler: AgentWorkspaceProfileValidatorCompiler;
  harnessRegistrar: AgentWorkspaceProfileHarnessRegistrar;
  clock: Clock;
  idGenerator: IdGenerator;
}

export class AgentWorkspaceProfileInstallationService {
  constructor(
    private readonly dependencies: AgentWorkspaceProfileInstallationServiceDependencies,
  ) {}

  validate(input: { manifest: unknown }): Result<{
    manifest: unknown;
    definitionDigest: string;
  }> {
    const validated = this.dependencies.validatorCompiler.validate(input.manifest);
    if (!validated.ok) return this.validationError(validated.issues);
    return ok({
      manifest: validated.definition.manifest,
      definitionDigest: validated.definition.digest,
    });
  }

  async install(
    context: ExecutionContext,
    input: { manifest: unknown },
  ): Promise<Result<AgentWorkspaceProfileInstallationReadModel>> {
    const validated = this.dependencies.validatorCompiler.validate(input.manifest);
    if (!validated.ok) return this.validationError(validated.issues);
    const registeredAt = CreatedAt.create(this.dependencies.clock.now());
    const definitionDigest = AgentWorkspaceProfileDefinitionDigest.create(
      validated.definition.digest,
    );
    const profileId = AgentWorkspaceProfileId.create(validated.definition.profileId);
    const profileVersion = AgentWorkspaceProfileVersion.create(validated.definition.profileVersion);
    const displayName = AgentWorkspaceProfileDisplayName.create(validated.definition.displayName);
    const canonicalManifest = AgentWorkspaceProfileCanonicalManifest.create(
      validated.definition.canonicalManifest,
    );
    if (registeredAt.isErr()) return err(registeredAt.error);
    if (definitionDigest.isErr()) return err(definitionDigest.error);
    if (profileId.isErr()) return err(profileId.error);
    if (profileVersion.isErr()) return err(profileVersion.error);
    if (displayName.isErr()) return err(displayName.error);
    if (canonicalManifest.isErr()) return err(canonicalManifest.error);

    const definition = AgentWorkspaceProfileDefinition.register({
      id: definitionDigest.value,
      profileId: profileId.value,
      profileVersion: profileVersion.value,
      displayName: displayName.value,
      canonicalManifest: canonicalManifest.value,
      registeredAt: registeredAt.value,
    });
    if (definition.isErr()) return err(definition.error);
    const savedDefinition = await this.dependencies.repository.saveDefinition(definition.value);
    if (savedDefinition.isErr()) return err(savedDefinition.error);
    const repositoryContext = toRepositoryContext(context);
    const existing = await this.dependencies.repository.findInstallationByDefinition(
      repositoryContext,
      definitionDigest.value.value,
    );
    if (existing) return this.readModel(existing, savedDefinition.value);

    const installationId = AgentWorkspaceProfileInstallationId.create(
      this.dependencies.idGenerator.next("awpi"),
    );
    if (installationId.isErr()) return err(installationId.error);
    const installation = AgentWorkspaceProfileInstallation.install({
      id: installationId.value,
      definitionDigest: definitionDigest.value,
      profileId: profileId.value,
      profileVersion: profileVersion.value,
      installedAt: registeredAt.value,
    });
    if (installation.isErr()) return err(installation.error);
    const saved = await this.dependencies.repository.saveInstallation(
      repositoryContext,
      installation.value,
      null,
    );
    if (saved.isErr()) return err(saved.error);
    return this.readModel(installation.value, savedDefinition.value);
  }

  async list(
    context: ExecutionContext,
    input: { limit?: number } = {},
  ): Promise<Result<AgentWorkspaceProfileInstallationReadModel[]>> {
    const installations = await this.dependencies.repository.listInstallations(
      toRepositoryContext(context),
      input.limit ?? 100,
    );
    const items: AgentWorkspaceProfileInstallationReadModel[] = [];
    for (const installation of installations) {
      const definition = await this.dependencies.repository.findDefinition(
        installation.toState().definitionDigest.value,
      );
      if (!definition) {
        return err(domainError.invariant("Agent Workspace Profile definition is missing"));
      }
      const item = this.readModel(installation, definition);
      if (item.isErr()) return err(item.error);
      items.push(item.value);
    }
    return ok(items);
  }

  async show(
    context: ExecutionContext,
    installationId: string,
  ): Promise<Result<AgentWorkspaceProfileInstallationReadModel>> {
    const found = await this.findWithDefinition(context, installationId);
    if (found.isErr()) return err(found.error);
    return this.readModel(found.value.installation, found.value.definition);
  }

  async disable(
    context: ExecutionContext,
    installationId: string,
  ): Promise<Result<AgentWorkspaceProfileInstallationReadModel>> {
    const found = await this.findWithDefinition(context, installationId);
    if (found.isErr()) return err(found.error);
    const expectedRevision = found.value.installation.toState().revision.value;
    const at = UpdatedAt.create(this.dependencies.clock.now());
    if (at.isErr()) return err(at.error);
    const disabled = found.value.installation.disable(at.value);
    if (disabled.isErr()) return err(disabled.error);
    const saved = await this.dependencies.repository.saveInstallation(
      toRepositoryContext(context),
      found.value.installation,
      expectedRevision,
    );
    if (saved.isErr()) return err(saved.error);
    return this.readModel(found.value.installation, found.value.definition);
  }

  async uninstall(
    context: ExecutionContext,
    installationId: string,
  ): Promise<Result<{ installationId: string; uninstalled: boolean }>> {
    const repositoryContext = toRepositoryContext(context);
    const installation = await this.dependencies.repository.findInstallation(
      repositoryContext,
      installationId,
    );
    if (!installation) return ok({ installationId, uninstalled: false });
    const references = ActiveAgentWorkspaceReferenceCount.create(
      await this.dependencies.referenceReader.countActiveWorkspaceReferences(
        repositoryContext,
        installationId,
      ),
    );
    if (references.isErr()) return err(references.error);
    const allowed = installation.assertCanUninstall(references.value);
    if (allowed.isErr()) return err(allowed.error);
    const deleted = await this.dependencies.repository.deleteInstallation(
      repositoryContext,
      installationId,
    );
    if (deleted.isErr()) return err(deleted.error);
    return ok({ installationId, uninstalled: deleted.value });
  }

  async compileForNewWorkspace(
    context: ExecutionContext,
    installationId: string,
  ): Promise<Result<AgentWorkspaceProfileCompiledPlan>> {
    const found = await this.findWithDefinition(context, installationId);
    if (found.isErr()) return err(found.error);
    const available = found.value.installation.assertAvailableForNewWorkspace();
    if (available.isErr()) return err(available.error);
    const validated = this.validateStored(found.value.definition, installationId);
    if (validated.isErr()) return err(validated.error);
    const adapter = await this.dependencies.adapterService.resolveDefinitionForNewWorkspace(
      context,
      validated.value.adapterDefinitionDigest,
    );
    if (adapter.isErr()) return err(adapter.error);
    const compiled = this.dependencies.validatorCompiler.compile(validated.value.manifest, {
      profileInstallationId: installationId,
      adapterInstallation: adapter.value,
    });
    if (!compiled.ok) return this.validationError(compiled.issues);
    const registered = this.dependencies.harnessRegistrar.register(
      compiled.plan.runtime.declarativeHarness,
    );
    if (registered.isErr()) return err(registered.error);
    return ok(compiled.plan);
  }

  private validationError<T>(issues: readonly AgentWorkspaceProfileValidationIssue[]): Result<T> {
    return err(
      domainError.validation("Agent Workspace Profile validation failed", {
        issues: issues.map((issue) => `${issue.code}:${issue.path.join(".")}:${issue.message}`),
      }),
    );
  }

  private async findWithDefinition(
    context: ExecutionContext,
    installationId: string,
  ): Promise<
    Result<{
      installation: AgentWorkspaceProfileInstallation;
      definition: AgentWorkspaceProfileDefinition;
    }>
  > {
    const installation = await this.dependencies.repository.findInstallation(
      toRepositoryContext(context),
      installationId,
    );
    if (!installation) {
      return err(domainError.notFound("AgentWorkspaceProfileInstallation", installationId));
    }
    const definition = await this.dependencies.repository.findDefinition(
      installation.toState().definitionDigest.value,
    );
    if (!definition) {
      return err(domainError.invariant("Agent Workspace Profile definition is missing"));
    }
    return ok({ installation, definition });
  }

  private validateStored(
    definition: AgentWorkspaceProfileDefinition,
    installationId: string,
  ): Result<ValidatedAgentWorkspaceProfile> {
    let manifest: unknown;
    try {
      manifest = JSON.parse(definition.toState().canonicalManifest.value);
    } catch {
      return err(
        domainError.invariant("Stored Agent Workspace Profile is invalid JSON", {
          installationId,
        }),
      );
    }
    const validated = this.dependencies.validatorCompiler.validate(manifest);
    if (!validated.ok) {
      return err(
        domainError.invariant("Stored Agent Workspace Profile is invalid", {
          installationId,
          issues: validated.issues.map((issue) => issue.code),
        }),
      );
    }
    return ok(validated.definition);
  }

  private readModel(
    installation: AgentWorkspaceProfileInstallation,
    definition: AgentWorkspaceProfileDefinition,
  ): Result<AgentWorkspaceProfileInstallationReadModel> {
    const validated = this.validateStored(definition, installation.id.value);
    if (validated.isErr()) return err(validated.error);
    const state = installation.toState();
    const definitionState = definition.toState();
    return ok({
      installationId: state.id.value,
      definitionDigest: state.definitionDigest.value,
      profileId: state.profileId.value,
      profileVersion: state.profileVersion.value,
      displayName: definitionState.displayName.value,
      adapterDefinitionDigest: validated.value.adapterDefinitionDigest,
      status: state.status.value,
      installedAt: state.installedAt.value,
      ...(state.updatedAt ? { updatedAt: state.updatedAt.value } : {}),
    });
  }
}
