import {
  ActiveAgentWorkspaceReferenceCount,
  AgentAdapterCanonicalManifest,
  AgentAdapterDefinition,
  AgentAdapterDefinitionDigest,
  AgentAdapterDisplayName,
  AgentAdapterId,
  AgentAdapterInstallation,
  AgentAdapterInstallationId,
  AgentAdapterVersion,
  CreatedAt,
  domainError,
  err,
  ok,
  type Result,
  UpdatedAt,
} from "@appaloft/core";
import {
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "./execution-context";
import { type Clock, type IdGenerator } from "./ports";

export interface AgentAdapterManifestValidationIssue {
  code: string;
  path: readonly (number | string)[];
  message: string;
}

export interface ValidatedAgentAdapterManifest {
  manifest: unknown;
  digest: string;
  canonicalManifest: string;
  adapterId: string;
  adapterVersion: string;
  displayName: string;
  compatibility: {
    status: "compatible" | "unchecked";
    unavailableOptionalCapabilities: string[];
  };
}

export interface AgentAdapterManifestValidator {
  validate(
    manifest: unknown,
    mode: "admission" | "stored-read",
  ):
    | { ok: true; definition: ValidatedAgentAdapterManifest }
    | { ok: false; issues: readonly AgentAdapterManifestValidationIssue[] };
}

export interface AgentAdapterInstallationReadModel {
  installationId: string;
  definitionDigest: string;
  adapterId: string;
  adapterVersion: string;
  displayName: string;
  status: "disabled" | "enabled";
  compatibility: {
    status: "compatible" | "unchecked";
    unavailableOptionalCapabilities: string[];
  };
  installedAt: string;
  updatedAt?: string;
}

export interface AgentAdapterRegistryRepository {
  saveDefinition(definition: AgentAdapterDefinition): Promise<Result<AgentAdapterDefinition>>;
  findDefinition(definitionDigest: string): Promise<AgentAdapterDefinition | null>;
  saveInstallation(
    context: RepositoryContext,
    installation: AgentAdapterInstallation,
    expectedRevision: number | null,
  ): Promise<Result<void>>;
  findInstallation(
    context: RepositoryContext,
    installationId: string,
  ): Promise<AgentAdapterInstallation | null>;
  findInstallationByDefinition(
    context: RepositoryContext,
    definitionDigest: string,
  ): Promise<AgentAdapterInstallation | null>;
  listInstallations(context: RepositoryContext, limit: number): Promise<AgentAdapterInstallation[]>;
  deleteInstallation(context: RepositoryContext, installationId: string): Promise<Result<boolean>>;
}

export interface AgentAdapterInstallationReferenceReader {
  countActiveWorkspaceReferences(
    context: RepositoryContext,
    installationId: string,
  ): Promise<number>;
}

function tenantKey(context: RepositoryContext): string {
  return context.tenant?.tenantId ?? "tenant_instance";
}

function cloneDefinition(definition: AgentAdapterDefinition): AgentAdapterDefinition {
  return AgentAdapterDefinition.rehydrate(definition.toState());
}

function cloneInstallation(installation: AgentAdapterInstallation): AgentAdapterInstallation {
  return AgentAdapterInstallation.rehydrate(installation.toState());
}

export class InMemoryAgentAdapterRegistryRepository implements AgentAdapterRegistryRepository {
  private readonly definitions = new Map<string, AgentAdapterDefinition>();
  private readonly installations = new Map<string, AgentAdapterInstallation>();

  private installationKey(context: RepositoryContext, installationId: string): string {
    return `${tenantKey(context)}:${installationId}`;
  }

  definitionCount(): number {
    return this.definitions.size;
  }

  async saveDefinition(
    definition: AgentAdapterDefinition,
  ): Promise<Result<AgentAdapterDefinition>> {
    const digest = definition.id.value;
    const existing = this.definitions.get(digest);
    if (existing) {
      if (
        !existing.matchesCanonicalManifest(definition.toState().canonicalManifest) ||
        !existing.toState().adapterId.equals(definition.toState().adapterId) ||
        !existing.toState().adapterVersion.equals(definition.toState().adapterVersion)
      ) {
        return err(
          domainError.conflict("Agent Adapter definition digest collision", {
            definitionDigest: digest,
          }),
        );
      }
      return ok(cloneDefinition(existing));
    }
    this.definitions.set(digest, cloneDefinition(definition));
    return ok(cloneDefinition(definition));
  }

  async findDefinition(definitionDigest: string): Promise<AgentAdapterDefinition | null> {
    const found = this.definitions.get(definitionDigest);
    return found ? cloneDefinition(found) : null;
  }

  async saveInstallation(
    context: RepositoryContext,
    installation: AgentAdapterInstallation,
    expectedRevision: number | null,
  ): Promise<Result<void>> {
    const key = this.installationKey(context, installation.id.value);
    const current = this.installations.get(key);
    if (expectedRevision === null) {
      if (current) {
        return err(
          domainError.conflict("Agent Adapter installation already exists", {
            installationId: installation.id.value,
          }),
        );
      }
    } else if (!current || current.toState().revision.value !== expectedRevision) {
      return err(
        domainError.conflict("Agent Adapter installation changed concurrently", {
          installationId: installation.id.value,
          expectedRevision,
          revision: current?.toState().revision.value ?? -1,
        }),
      );
    }
    this.installations.set(key, cloneInstallation(installation));
    return ok(undefined);
  }

  async findInstallation(
    context: RepositoryContext,
    installationId: string,
  ): Promise<AgentAdapterInstallation | null> {
    const found = this.installations.get(this.installationKey(context, installationId));
    return found ? cloneInstallation(found) : null;
  }

  async findInstallationByDefinition(
    context: RepositoryContext,
    definitionDigest: string,
  ): Promise<AgentAdapterInstallation | null> {
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
  ): Promise<AgentAdapterInstallation[]> {
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

export interface AgentAdapterInstallationServiceDependencies {
  repository: AgentAdapterRegistryRepository;
  referenceReader: AgentAdapterInstallationReferenceReader;
  clock: Clock;
  idGenerator: IdGenerator;
  manifestValidator: AgentAdapterManifestValidator;
}

export class AgentAdapterInstallationService {
  constructor(private readonly dependencies: AgentAdapterInstallationServiceDependencies) {}

  validate(input: { manifest: unknown }): Result<{
    manifest: unknown;
    definitionDigest: string;
    compatibility: AgentAdapterInstallationReadModel["compatibility"];
  }> {
    const validated = this.dependencies.manifestValidator.validate(input.manifest, "admission");
    if (!validated.ok) {
      return err(
        domainError.validation("Agent Adapter manifest validation failed", {
          issues: validated.issues.map(
            (issue) => `${issue.code}:${issue.path.join(".")}:${issue.message}`,
          ),
        }),
      );
    }
    return ok({
      manifest: validated.definition.manifest,
      definitionDigest: validated.definition.digest,
      compatibility: validated.definition.compatibility,
    });
  }

  async install(
    context: ExecutionContext,
    input: { manifest: unknown },
  ): Promise<Result<AgentAdapterInstallationReadModel>> {
    const validated = this.dependencies.manifestValidator.validate(input.manifest, "admission");
    if (!validated.ok) {
      return err(
        domainError.validation("Agent Adapter manifest validation failed", {
          issues: validated.issues.map(
            (issue) => `${issue.code}:${issue.path.join(".")}:${issue.message}`,
          ),
        }),
      );
    }

    const registeredAt = CreatedAt.create(this.dependencies.clock.now());
    const definitionDigest = AgentAdapterDefinitionDigest.create(validated.definition.digest);
    const adapterId = AgentAdapterId.create(validated.definition.adapterId);
    const adapterVersion = AgentAdapterVersion.create(validated.definition.adapterVersion);
    const displayName = AgentAdapterDisplayName.create(validated.definition.displayName);
    const canonicalManifest = AgentAdapterCanonicalManifest.create(
      validated.definition.canonicalManifest,
    );
    if (registeredAt.isErr()) return err(registeredAt.error);
    if (definitionDigest.isErr()) return err(definitionDigest.error);
    if (adapterId.isErr()) return err(adapterId.error);
    if (adapterVersion.isErr()) return err(adapterVersion.error);
    if (displayName.isErr()) return err(displayName.error);
    if (canonicalManifest.isErr()) return err(canonicalManifest.error);

    const definition = AgentAdapterDefinition.register({
      id: definitionDigest.value,
      adapterId: adapterId.value,
      adapterVersion: adapterVersion.value,
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
    if (existing) {
      return this.readModel(existing, savedDefinition.value);
    }

    const installationId = AgentAdapterInstallationId.create(
      this.dependencies.idGenerator.next("aai"),
    );
    if (installationId.isErr()) return err(installationId.error);
    const installation = AgentAdapterInstallation.install({
      id: installationId.value,
      definitionDigest: definitionDigest.value,
      adapterId: adapterId.value,
      adapterVersion: adapterVersion.value,
      installedAt: registeredAt.value,
    });
    if (installation.isErr()) return err(installation.error);
    const saved = await this.dependencies.repository.saveInstallation(
      repositoryContext,
      installation.value,
      null,
    );
    if (saved.isErr()) {
      const concurrentlyInstalled = await this.dependencies.repository.findInstallationByDefinition(
        repositoryContext,
        definitionDigest.value.value,
      );
      if (concurrentlyInstalled) {
        return this.readModel(concurrentlyInstalled, savedDefinition.value);
      }
      return err(saved.error);
    }
    return this.readModel(installation.value, savedDefinition.value);
  }

  async list(
    context: ExecutionContext,
    input: { limit?: number } = {},
  ): Promise<Result<AgentAdapterInstallationReadModel[]>> {
    const repositoryContext = toRepositoryContext(context);
    const installations = await this.dependencies.repository.listInstallations(
      repositoryContext,
      input.limit ?? 100,
    );
    const readbacks: AgentAdapterInstallationReadModel[] = [];
    for (const installation of installations) {
      const definition = await this.dependencies.repository.findDefinition(
        installation.toState().definitionDigest.value,
      );
      if (!definition) {
        return err(
          domainError.invariant("Agent Adapter installation definition is missing", {
            installationId: installation.id.value,
            definitionDigest: installation.toState().definitionDigest.value,
          }),
        );
      }
      const readback = this.readModel(installation, definition);
      if (readback.isErr()) return err(readback.error);
      readbacks.push(readback.value);
    }
    return ok(readbacks);
  }

  async show(
    context: ExecutionContext,
    installationId: string,
  ): Promise<Result<AgentAdapterInstallationReadModel>> {
    const found = await this.findInstallationWithDefinition(context, installationId);
    if (found.isErr()) return err(found.error);
    return this.readModel(found.value.installation, found.value.definition);
  }

  async disable(
    context: ExecutionContext,
    installationId: string,
  ): Promise<Result<AgentAdapterInstallationReadModel>> {
    const found = await this.findInstallationWithDefinition(context, installationId);
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
    const activeReferenceCount = ActiveAgentWorkspaceReferenceCount.create(
      await this.dependencies.referenceReader.countActiveWorkspaceReferences(
        repositoryContext,
        installationId,
      ),
    );
    if (activeReferenceCount.isErr()) return err(activeReferenceCount.error);
    const allowed = installation.assertCanUninstall(activeReferenceCount.value);
    if (allowed.isErr()) return err(allowed.error);
    const deleted = await this.dependencies.repository.deleteInstallation(
      repositoryContext,
      installationId,
    );
    if (deleted.isErr()) return err(deleted.error);
    return ok({ installationId, uninstalled: deleted.value });
  }

  async resolveForNewWorkspace(
    context: ExecutionContext,
    installationId: string,
  ): Promise<Result<AgentAdapterInstallationReadModel>> {
    const found = await this.findInstallationWithDefinition(context, installationId);
    if (found.isErr()) return err(found.error);
    const available = found.value.installation.assertAvailableForNewWorkspace();
    if (available.isErr()) return err(available.error);
    return this.readModel(found.value.installation, found.value.definition);
  }

  private async findInstallationWithDefinition(
    context: ExecutionContext,
    installationId: string,
  ): Promise<
    Result<{
      installation: AgentAdapterInstallation;
      definition: AgentAdapterDefinition;
    }>
  > {
    const installation = await this.dependencies.repository.findInstallation(
      toRepositoryContext(context),
      installationId,
    );
    if (!installation) {
      return err(domainError.notFound("AgentAdapterInstallation", installationId));
    }
    const definition = await this.dependencies.repository.findDefinition(
      installation.toState().definitionDigest.value,
    );
    if (!definition) {
      return err(
        domainError.invariant("Agent Adapter installation definition is missing", {
          installationId,
          definitionDigest: installation.toState().definitionDigest.value,
        }),
      );
    }
    return ok({ installation, definition });
  }

  private readModel(
    installation: AgentAdapterInstallation,
    definition: AgentAdapterDefinition,
  ): Result<AgentAdapterInstallationReadModel> {
    const state = installation.toState();
    const definitionState = definition.toState();
    let storedManifest: unknown;
    try {
      storedManifest = JSON.parse(definitionState.canonicalManifest.value);
    } catch {
      return err(
        domainError.invariant("Stored Agent Adapter definition manifest is invalid JSON", {
          installationId: installation.id.value,
          definitionDigest: definition.id.value,
        }),
      );
    }
    const admissionValidation = this.dependencies.manifestValidator.validate(
      storedManifest,
      "admission",
    );
    const structuralValidation = admissionValidation.ok
      ? admissionValidation
      : this.dependencies.manifestValidator.validate(storedManifest, "stored-read");
    if (!structuralValidation.ok) {
      return err(
        domainError.invariant("Stored Agent Adapter definition is invalid", {
          installationId: installation.id.value,
          definitionDigest: definition.id.value,
          issues: structuralValidation.issues.map((issue) => issue.code),
        }),
      );
    }
    return ok({
      installationId: state.id.value,
      definitionDigest: state.definitionDigest.value,
      adapterId: state.adapterId.value,
      adapterVersion: state.adapterVersion.value,
      displayName: definitionState.displayName.value,
      status: state.status.value,
      compatibility: admissionValidation.ok
        ? admissionValidation.definition.compatibility
        : structuralValidation.definition.compatibility,
      installedAt: state.installedAt.value,
      ...(state.updatedAt ? { updatedAt: state.updatedAt.value } : {}),
    });
  }
}
