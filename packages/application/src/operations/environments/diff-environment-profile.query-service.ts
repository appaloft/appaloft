import {
  domainError,
  EnvironmentByIdSpec,
  EnvironmentId,
  err,
  ok,
  type Result,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type DomainBindingReadModel,
  type EnvironmentProfileDecisionReadModel,
  type EnvironmentProfileDiffChange,
  type EnvironmentProfileDiffEntry,
  type EnvironmentProfileDiffSummary,
  type EnvironmentReadModel,
  type EnvironmentSummary,
  type ResourceDependencyBindingReadModel,
  type ResourceReadModel,
  type ResourceSummary,
  type StorageVolumeReadModel,
} from "../../ports";
import { tokens } from "../../tokens";
import { type DiffEnvironmentProfileQueryInput } from "./diff-environment-profile.query";

@injectable()
export class DiffEnvironmentProfileQueryService {
  constructor(
    @inject(tokens.environmentReadModel)
    private readonly environmentReadModel: EnvironmentReadModel,
    @inject(tokens.resourceReadModel)
    private readonly resourceReadModel: ResourceReadModel,
    @inject(tokens.resourceDependencyBindingReadModel)
    private readonly resourceDependencyBindingReadModel: ResourceDependencyBindingReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.domainBindingReadModel, { isOptional: true })
    private readonly domainBindingReadModel?: DomainBindingReadModel,
    @inject(tokens.storageVolumeReadModel, { isOptional: true })
    private readonly storageVolumeReadModel?: StorageVolumeReadModel,
    @inject(tokens.environmentProfileDecisionReadModel, { isOptional: true })
    private readonly environmentProfileDecisionReadModel?: EnvironmentProfileDecisionReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    input: DiffEnvironmentProfileQueryInput,
  ): Promise<Result<EnvironmentProfileDiffSummary>> {
    const repositoryContext = toRepositoryContext(context);

    return safeTry(
      async function* (this: DiffEnvironmentProfileQueryService) {
        const sourceEnvironmentId = yield* EnvironmentId.create(input.environmentId);
        const targetEnvironmentId = yield* EnvironmentId.create(input.targetEnvironmentId);
        const sourceEnvironment = await this.environmentReadModel.findOne(
          repositoryContext,
          EnvironmentByIdSpec.create(sourceEnvironmentId),
        );
        if (!sourceEnvironment) {
          return err(domainError.notFound("environment", input.environmentId));
        }
        const targetEnvironment = await this.environmentReadModel.findOne(
          repositoryContext,
          EnvironmentByIdSpec.create(targetEnvironmentId),
        );
        if (!targetEnvironment) {
          return err(domainError.notFound("environment", input.targetEnvironmentId));
        }

        const sourceResources = await this.resourceReadModel.list(repositoryContext, {
          projectId: sourceEnvironment.projectId,
          environmentId: sourceEnvironment.id,
          includePreviewResources: false,
          limit: 500,
        });
        const targetResources = await this.resourceReadModel.list(repositoryContext, {
          projectId: targetEnvironment.projectId,
          environmentId: targetEnvironment.id,
          includePreviewResources: false,
          limit: 500,
        });
        const sourceResourceById = new Map(
          sourceResources.map((resource) => [resource.id, resource]),
        );
        const targetResourceById = new Map(
          targetResources.map((resource) => [resource.id, resource]),
        );

        const sourceBindings = yield* await collectDependencyBindings(
          this.resourceDependencyBindingReadModel,
          repositoryContext,
          sourceResources,
        );
        const targetBindings = yield* await collectDependencyBindings(
          this.resourceDependencyBindingReadModel,
          repositoryContext,
          targetResources,
        );
        const sourceRoutes = this.domainBindingReadModel
          ? await collectDomainRoutes(
              this.domainBindingReadModel,
              repositoryContext,
              sourceEnvironment,
              sourceResources,
            )
          : [];
        const targetRoutes = this.domainBindingReadModel
          ? await collectDomainRoutes(
              this.domainBindingReadModel,
              repositoryContext,
              targetEnvironment,
              targetResources,
            )
          : [];
        const sourceStorage = this.storageVolumeReadModel
          ? await collectStorageAttachments(
              this.storageVolumeReadModel,
              repositoryContext,
              sourceEnvironment,
              sourceResources,
            )
          : [];
        const targetStorage = this.storageVolumeReadModel
          ? await collectStorageAttachments(
              this.storageVolumeReadModel,
              repositoryContext,
              targetEnvironment,
              targetResources,
            )
          : [];
        const targetPendingDecisions = this.environmentProfileDecisionReadModel
          ? await collectPendingDecisions(
              this.environmentProfileDecisionReadModel,
              repositoryContext,
              targetEnvironment,
              targetResources,
            )
          : [];

        const entries = [
          ...diffMaps(
            "variable",
            mapVariableValues(sourceEnvironment.maskedVariables),
            mapVariableValues(targetEnvironment.maskedVariables),
          ),
          ...diffMaps("resource", mapResources(sourceResources), mapResources(targetResources)),
          ...diffMaps(
            "dependency-binding",
            mapDependencyBindings(sourceBindings, sourceResourceById),
            mapDependencyBindings(targetBindings, targetResourceById),
          ),
          ...diffMaps(
            "route",
            mapRoutes(sourceRoutes, sourceResourceById),
            mapRoutes(targetRoutes, targetResourceById),
          ),
          ...diffMaps(
            "storage",
            mapStorageAttachments(sourceStorage, sourceResourceById),
            mapStorageAttachments(targetStorage, targetResourceById),
          ),
          ...targetPendingDecisions.map(
            (decision): EnvironmentProfileDiffEntry => ({
              section: "pending-decision",
              key: `${decision.kind}:${decision.sourceId}`,
              change: "added",
              target: {
                id: decision.id,
                kind: decision.kind,
                sourceId: decision.sourceId,
                resourceId: decision.resourceId,
                decision: decision.decision,
                reason: decision.reason,
                status: decision.status,
              },
            }),
          ),
        ].filter((entry) => input.includeUnchanged || entry.change !== "unchanged");

        return ok({
          schemaVersion: "environments.diff-profile/v1" as const,
          sourceEnvironment: maskEnvironmentSummary(sourceEnvironment),
          targetEnvironment: maskEnvironmentSummary(targetEnvironment),
          entries,
          counts: countChanges(entries),
          generatedAt: this.clock.now(),
        });
      }.bind(this),
    );
  }
}

type RepositoryContext = ReturnType<typeof toRepositoryContext>;

type DiffValue = Record<string, unknown>;

type DependencyBindingRecord = {
  id: string;
  resourceId: string;
  kind: string;
  dependencyResourceId: string;
  target: {
    targetName: string;
    scope: string;
    injectionMode: string;
  };
};

type DomainRouteRecord = {
  id: string;
  resourceId: string;
  domainName: string;
  pathPrefix: string;
  proxyKind: string;
  tlsMode: string;
  status: string;
};

type StorageAttachmentRecord = {
  storageVolumeId: string;
  storageVolumeName: string;
  storageVolumeKind: string;
  resourceId: string;
  attachmentId: string;
  destinationPath: string;
  mountMode: string;
  dataFormat?: string;
  applicationDataLabel?: string;
};

async function collectDependencyBindings(
  readModel: ResourceDependencyBindingReadModel,
  context: RepositoryContext,
  resources: ResourceSummary[],
): Promise<Result<DependencyBindingRecord[]>> {
  const bindings: DependencyBindingRecord[] = [];
  for (const resource of resources) {
    const result = await readModel.list(context, { resourceId: resource.id });
    if (result.isErr()) {
      return result;
    }
    bindings.push(
      ...result.value
        .filter((binding) => binding.status === "active")
        .map((binding) => ({
          id: binding.id,
          resourceId: binding.resourceId,
          kind: binding.kind,
          dependencyResourceId: binding.dependencyResourceId,
          target: {
            targetName: binding.target.targetName,
            scope: binding.target.scope,
            injectionMode: binding.target.injectionMode,
          },
        })),
    );
  }
  return ok(bindings);
}

async function collectDomainRoutes(
  readModel: DomainBindingReadModel,
  context: RepositoryContext,
  environment: EnvironmentSummary,
  resources: ResourceSummary[],
): Promise<DomainRouteRecord[]> {
  const routes: DomainRouteRecord[] = [];
  for (const resource of resources) {
    const bindings = await readModel.list(context, {
      projectId: environment.projectId,
      environmentId: environment.id,
      resourceId: resource.id,
      limit: 500,
    });
    routes.push(
      ...bindings.map((binding) => ({
        id: binding.id,
        resourceId: binding.resourceId,
        domainName: binding.domainName,
        pathPrefix: binding.pathPrefix,
        proxyKind: binding.proxyKind,
        tlsMode: binding.tlsMode,
        status: binding.status,
      })),
    );
  }
  return routes;
}

async function collectStorageAttachments(
  readModel: StorageVolumeReadModel,
  context: RepositoryContext,
  environment: EnvironmentSummary,
  resources: ResourceSummary[],
): Promise<StorageAttachmentRecord[]> {
  const resourceIdSet = new Set(resources.map((resource) => resource.id));
  const volumes = await readModel.list(context, {
    projectId: environment.projectId,
    environmentId: environment.id,
  });
  return volumes.flatMap((volume) =>
    volume.attachments
      .filter((attachment) => resourceIdSet.has(attachment.resourceId))
      .map((attachment) => ({
        storageVolumeId: volume.id,
        storageVolumeName: volume.name,
        storageVolumeKind: volume.kind,
        resourceId: attachment.resourceId,
        attachmentId: attachment.attachmentId,
        destinationPath: attachment.destinationPath,
        mountMode: attachment.mountMode,
        ...(attachment.dataFormat ? { dataFormat: attachment.dataFormat } : {}),
        ...(attachment.applicationDataLabel
          ? { applicationDataLabel: attachment.applicationDataLabel }
          : {}),
      })),
  );
}

async function collectPendingDecisions(
  readModel: EnvironmentProfileDecisionReadModel,
  context: RepositoryContext,
  environment: EnvironmentSummary,
  resources: ResourceSummary[],
) {
  const environmentDecisions = await readModel.listPending(context, {
    environmentId: environment.id,
  });
  const resourceDecisions = await Promise.all(
    resources.map((resource) =>
      readModel.listPending(context, {
        environmentId: environment.id,
        resourceId: resource.id,
      }),
    ),
  );
  return [...environmentDecisions, ...resourceDecisions.flat()];
}

function mapVariableValues(
  variables: EnvironmentSummary["maskedVariables"],
): Map<string, DiffValue> {
  return new Map(
    variables.map((variable) => [
      `${variable.scope}:${variable.exposure}:${variable.key}`,
      {
        key: variable.key,
        scope: variable.scope,
        exposure: variable.exposure,
        kind: variable.kind,
        isSecret: variable.isSecret,
        maskedValue: variable.isSecret ? "****" : variable.value,
      },
    ]),
  );
}

function maskEnvironmentSummary(environment: EnvironmentSummary): EnvironmentSummary {
  return {
    ...environment,
    maskedVariables: environment.maskedVariables.map((variable) => ({
      ...variable,
      value: variable.isSecret ? "****" : variable.value,
    })),
  };
}

function mapResources(resources: ResourceSummary[]): Map<string, DiffValue> {
  return new Map(
    resources.map((resource) => [
      resource.slug,
      {
        name: resource.name,
        slug: resource.slug,
        kind: resource.kind,
        services: resource.services,
        networkProfile: resource.networkProfile,
        accessProfile: resource.accessProfile,
      },
    ]),
  );
}

function mapDependencyBindings(
  bindings: DependencyBindingRecord[],
  resourcesById: Map<string, ResourceSummary>,
): Map<string, DiffValue> {
  return new Map(
    bindings.map((binding) => {
      const resource = resourcesById.get(binding.resourceId);
      const resourceKey = resource?.slug ?? binding.resourceId;
      return [
        `${resourceKey}:${binding.kind}:${binding.target.scope}:${binding.target.targetName}`,
        {
          resourceSlug: resource?.slug,
          kind: binding.kind,
          targetName: binding.target.targetName,
          scope: binding.target.scope,
          injectionMode: binding.target.injectionMode,
        },
      ];
    }),
  );
}

function mapRoutes(
  routes: DomainRouteRecord[],
  resourcesById: Map<string, ResourceSummary>,
): Map<string, DiffValue> {
  return new Map(
    routes.map((route) => {
      const resource = resourcesById.get(route.resourceId);
      const resourceKey = resource?.slug ?? route.resourceId;
      return [
        `${resourceKey}:${route.domainName}:${route.pathPrefix}`,
        {
          resourceSlug: resource?.slug,
          domainName: route.domainName,
          pathPrefix: route.pathPrefix,
          proxyKind: route.proxyKind,
          tlsMode: route.tlsMode,
          status: route.status,
        },
      ];
    }),
  );
}

function mapStorageAttachments(
  attachments: StorageAttachmentRecord[],
  resourcesById: Map<string, ResourceSummary>,
): Map<string, DiffValue> {
  return new Map(
    attachments.map((attachment) => {
      const resource = resourcesById.get(attachment.resourceId);
      const resourceKey = resource?.slug ?? attachment.resourceId;
      return [
        `${resourceKey}:${attachment.destinationPath}`,
        {
          storageVolumeName: attachment.storageVolumeName,
          storageVolumeKind: attachment.storageVolumeKind,
          resourceSlug: resource?.slug,
          destinationPath: attachment.destinationPath,
          mountMode: attachment.mountMode,
          dataFormat: attachment.dataFormat,
          applicationDataLabel: attachment.applicationDataLabel,
        },
      ];
    }),
  );
}

function diffMaps(
  section: EnvironmentProfileDiffEntry["section"],
  source: Map<string, DiffValue>,
  target: Map<string, DiffValue>,
): EnvironmentProfileDiffEntry[] {
  const keys = Array.from(new Set([...source.keys(), ...target.keys()])).sort();
  return keys.map((key) => {
    const sourceValue = source.get(key);
    const targetValue = target.get(key);
    if (!sourceValue) {
      return { section, key, change: "added", target: targetValue as DiffValue };
    }
    if (!targetValue) {
      return { section, key, change: "removed", source: sourceValue };
    }
    const change: EnvironmentProfileDiffChange = sameValue(sourceValue, targetValue)
      ? "unchanged"
      : "changed";
    return { section, key, change, source: sourceValue, target: targetValue };
  });
}

function sameValue(left: DiffValue, right: DiffValue): boolean {
  return JSON.stringify(sortValue(left)) === JSON.stringify(sortValue(right));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, sortValue(entryValue)]),
    );
  }
  return value;
}

function countChanges(
  entries: EnvironmentProfileDiffEntry[],
): EnvironmentProfileDiffSummary["counts"] {
  return entries.reduce(
    (counts, entry) => ({
      ...counts,
      [entry.change]: counts[entry.change] + 1,
    }),
    { added: 0, removed: 0, changed: 0, unchanged: 0 },
  );
}
