import {
  DeploymentByIdSpec,
  DeploymentId,
  type DomainError,
  domainError,
  EnvironmentByIdSpec,
  EnvironmentId,
  err,
  LatestRuntimeOwningDeploymentSpec,
  ok,
  ProjectByIdSpec,
  ProjectId,
  ResourceByIdSpec,
  ResourceId,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type DeploymentReadModel,
  type DeploymentSummary,
  type EnvironmentReadModel,
  type ProjectReadModel,
  type ResourceReadModel,
  type RuntimeArtifactUsage,
  type RuntimeUsageInspection,
  type RuntimeUsageInspector,
  type RuntimeUsageInspectorInput,
  type RuntimeUsageRollup,
  type RuntimeUsageScope,
  type RuntimeUsageSourceError,
  type RuntimeUsageWarning,
} from "../../ports";
import { tokens } from "../../tokens";
import { type InspectRuntimeUsageQuery } from "./inspect-runtime-usage.query";

function withInspectRuntimeUsageDetails(
  error: DomainError,
  details: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      queryName: "runtime-usage.inspect",
      ...details,
    },
  };
}

function scopeDetails(query: InspectRuntimeUsageQuery): Record<string, string> {
  const { scope } = query.input;
  switch (scope.kind) {
    case "server":
      return { scopeKind: scope.kind, scopeId: scope.serverId };
    case "project":
      return { scopeKind: scope.kind, scopeId: scope.projectId };
    case "environment":
      return { scopeKind: scope.kind, scopeId: scope.environmentId };
    case "resource":
      return { scopeKind: scope.kind, scopeId: scope.resourceId };
    case "deployment":
      return { scopeKind: scope.kind, scopeId: scope.deploymentId };
  }
}

function scopeId(scope: RuntimeUsageScope): string {
  switch (scope.kind) {
    case "server":
      return scope.serverId;
    case "project":
      return scope.projectId;
    case "environment":
      return scope.environmentId;
    case "resource":
      return scope.resourceId;
    case "deployment":
      return scope.deploymentId;
  }
}

function missingAttributionWarning(scope: RuntimeUsageScope): RuntimeUsageWarning {
  return {
    code: "missing-metric-source",
    message:
      "Scope-specific runtime usage requires Appaloft ownership labels, deployment snapshots, runtime identity records, or workspace metadata; only server capacity context is currently available.",
    scope,
    resource: "ownership",
  };
}

function missingAttributionSourceError(scope: RuntimeUsageScope): RuntimeUsageSourceError {
  return {
    source: "read-model",
    code: "runtime_usage_scope_attribution_incomplete",
    message: `Runtime usage attribution for ${scope.kind}:${scopeId(scope)} is incomplete.`,
    retriable: false,
  };
}

function latestRuntimeOwningDeployment(
  deployments: DeploymentSummary[],
  resourceId: string,
): DeploymentSummary | undefined {
  return deployments.find(
    (deployment) =>
      deployment.resourceId === resourceId &&
      (deployment.status === "succeeded" || deployment.status === "rolled-back"),
  );
}

function uniqueStrings(input: string[]): string[] {
  return [...new Set(input)];
}

function rollupForDeployment(deployment: DeploymentSummary): RuntimeUsageRollup {
  return {
    scope: { kind: "deployment", deploymentId: deployment.id },
    ownership: "unknown",
    totals: {},
    currentDeploymentId: deployment.id,
    warnings: [missingAttributionWarning({ kind: "deployment", deploymentId: deployment.id })],
  };
}

function withEvidence(
  artifact: RuntimeArtifactUsage,
  evidence: RuntimeArtifactUsage["evidence"][number],
): RuntimeArtifactUsage["evidence"] {
  return artifact.evidence.some(
    (entry) => entry.source === evidence.source && entry.key === evidence.key,
  )
    ? artifact.evidence
    : [...artifact.evidence, evidence];
}

function artifactWithDeploymentContext(
  artifact: RuntimeArtifactUsage,
  deploymentsById: Map<string, DeploymentSummary>,
): RuntimeArtifactUsage {
  const deployment = artifact.deploymentId ? deploymentsById.get(artifact.deploymentId) : undefined;
  if (!deployment) {
    return artifact;
  }
  const runtimeIdentity =
    deployment.runtimePlan.execution.metadata?.containerName ??
    deployment.runtimePlan.execution.metadata?.["swarm.serviceName"] ??
    deployment.runtimePlan.execution.metadata?.["swarm.stackName"];
  const runtimeId = artifact.runtimeId ?? runtimeIdentity;
  const evidenceWithDeployment = withEvidence(artifact, {
    source: "deployment-snapshot",
    key: deployment.id,
  });

  return {
    ...artifact,
    projectId: artifact.projectId ?? deployment.projectId,
    environmentId: artifact.environmentId ?? deployment.environmentId,
    resourceId: artifact.resourceId ?? deployment.resourceId,
    destinationId: artifact.destinationId ?? deployment.destinationId,
    ...(runtimeId ? { runtimeId } : {}),
    ownership: "attributed",
    evidence:
      runtimeIdentity && !artifact.runtimeId
        ? [
            ...evidenceWithDeployment,
            {
              source: "runtime-identity",
              key: runtimeIdentity,
            },
          ]
        : evidenceWithDeployment,
  };
}

function artifactMatchesScope(scope: RuntimeUsageScope, artifact: RuntimeArtifactUsage): boolean {
  switch (scope.kind) {
    case "server":
      return artifact.serverId === scope.serverId;
    case "project":
      return artifact.projectId === scope.projectId;
    case "environment":
      return artifact.environmentId === scope.environmentId;
    case "resource":
      return artifact.resourceId === scope.resourceId;
    case "deployment":
      return artifact.deploymentId === scope.deploymentId;
  }
}

function totalsFromArtifacts(artifacts: RuntimeArtifactUsage[]): RuntimeUsageRollup["totals"] {
  const attributedBytes = artifacts.reduce((sum, artifact) => sum + (artifact.bytes ?? 0), 0);
  const containerWritableBytes = artifacts
    .filter(
      (artifact) => artifact.kind === "active-runtime" || artifact.kind === "rollback-candidate",
    )
    .reduce((sum, artifact) => sum + (artifact.bytes ?? 0), 0);

  return {
    ...(attributedBytes > 0 ? { disk: { attributedBytes } } : {}),
    ...(containerWritableBytes > 0 ? { docker: { containerWritableBytes } } : {}),
  };
}

function rollupOwnership(artifacts: RuntimeArtifactUsage[]): RuntimeUsageRollup["ownership"] {
  if (artifacts.length === 0) {
    return "unknown";
  }

  return artifacts.every((artifact) => artifact.ownership === "attributed")
    ? "attributed"
    : "partially-attributed";
}

function rollupForArtifacts(
  scope: RuntimeUsageScope,
  artifacts: RuntimeArtifactUsage[],
): RuntimeUsageRollup {
  const activeArtifact = artifacts.find((artifact) => artifact.kind === "active-runtime");
  return {
    scope,
    ownership: rollupOwnership(artifacts),
    totals: totalsFromArtifacts(artifacts),
    ...(activeArtifact?.deploymentId ? { currentDeploymentId: activeArtifact.deploymentId } : {}),
    ...(activeArtifact?.runtimeId ? { currentRuntimeId: activeArtifact.runtimeId } : {}),
    artifactCount: artifacts.length,
    warnings: artifacts.flatMap((artifact) => artifact.warnings),
  };
}

function groupedRollups(
  artifacts: RuntimeArtifactUsage[],
  scopeForArtifact: (artifact: RuntimeArtifactUsage) => RuntimeUsageScope | null,
): RuntimeUsageRollup[] {
  const groups = new Map<string, { scope: RuntimeUsageScope; artifacts: RuntimeArtifactUsage[] }>();
  for (const artifact of artifacts) {
    const scope = scopeForArtifact(artifact);
    if (!scope) {
      continue;
    }

    const key = `${scope.kind}:${scopeId(scope)}`;
    const group = groups.get(key) ?? { scope, artifacts: [] };
    group.artifacts.push(artifact);
    groups.set(key, group);
  }

  return [...groups.values()].map((group) => rollupForArtifacts(group.scope, group.artifacts));
}

function attributedInspectionFromArtifacts(input: {
  scope: RuntimeUsageScope;
  attributionArtifacts: RuntimeArtifactUsage[];
  responseArtifacts: RuntimeArtifactUsage[];
  serverInspections: RuntimeUsageInspection[];
  serverErrors: DomainError[];
  includeWarnings: boolean;
  expectedDeployments: DeploymentSummary[];
}): RuntimeUsageInspection {
  const generatedAt = input.serverInspections[0]?.generatedAt ?? new Date().toISOString();
  const observedAt = input.serverInspections[0]?.observedAt;
  const expectedDeploymentIds = new Set(
    input.expectedDeployments.map((deployment) => deployment.id),
  );
  const attributedDeploymentIds = new Set(
    input.attributionArtifacts
      .map((artifact) => artifact.deploymentId)
      .filter((deploymentId): deploymentId is string => Boolean(deploymentId)),
  );
  const missingExpectedDeployment = [...expectedDeploymentIds].some(
    (deploymentId) => !attributedDeploymentIds.has(deploymentId),
  );
  const serverSourceErrors = input.serverInspections.flatMap(
    (inspection) => inspection.sourceErrors,
  );
  const serverWarnings = input.serverInspections.flatMap((inspection) => inspection.warnings);
  const serverErrorSources = input.serverErrors.map((error) => ({
    source: "runtime-target" as const,
    code: error.code,
    message: error.message,
    retriable: error.category !== "user",
  }));

  return {
    schemaVersion: "runtime-usage.inspect/v1",
    scope: input.scope,
    generatedAt,
    ...(observedAt ? { observedAt } : {}),
    freshness: input.serverInspections.some((inspection) => inspection.freshness === "live")
      ? "live"
      : "unknown",
    partial:
      missingExpectedDeployment ||
      input.serverErrors.length > 0 ||
      input.serverInspections.some((inspection) => inspection.partial),
    totals: totalsFromArtifacts(input.attributionArtifacts),
    byProject: groupedRollups(input.attributionArtifacts, (artifact) =>
      artifact.projectId ? { kind: "project", projectId: artifact.projectId } : null,
    ),
    byEnvironment: groupedRollups(input.attributionArtifacts, (artifact) =>
      artifact.environmentId
        ? { kind: "environment", environmentId: artifact.environmentId }
        : null,
    ),
    byResource: groupedRollups(input.attributionArtifacts, (artifact) =>
      artifact.resourceId ? { kind: "resource", resourceId: artifact.resourceId } : null,
    ),
    byDeployment: groupedRollups(input.attributionArtifacts, (artifact) =>
      artifact.deploymentId ? { kind: "deployment", deploymentId: artifact.deploymentId } : null,
    ),
    artifacts: input.responseArtifacts,
    warnings: input.includeWarnings
      ? [
          ...(missingExpectedDeployment ? [missingAttributionWarning(input.scope)] : []),
          ...serverWarnings,
          ...input.attributionArtifacts.flatMap((artifact) => artifact.warnings),
        ]
      : [],
    sourceErrors: input.includeWarnings
      ? [
          ...(missingExpectedDeployment ? [missingAttributionSourceError(input.scope)] : []),
          ...serverSourceErrors,
          ...serverErrorSources,
        ]
      : [],
  };
}

interface ResolvedRuntimeUsageScope {
  scope: RuntimeUsageScope;
  deployments: DeploymentSummary[];
}

@injectable()
export class RuntimeUsageInspectionQueryService {
  constructor(
    @inject(tokens.runtimeUsageInspector)
    private readonly runtimeUsageInspector: RuntimeUsageInspector,
    @inject(tokens.projectReadModel)
    private readonly projectReadModel: ProjectReadModel,
    @inject(tokens.environmentReadModel)
    private readonly environmentReadModel: EnvironmentReadModel,
    @inject(tokens.resourceReadModel)
    private readonly resourceReadModel: ResourceReadModel,
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    query: InspectRuntimeUsageQuery,
  ): Promise<Result<RuntimeUsageInspection>> {
    try {
      if (query.input.scope.kind === "server") {
        return await this.runtimeUsageInspector.inspect(context, query.input);
      }

      const resolved = await this.resolveNonServerScope(context, query.input.scope);
      if (resolved.isErr()) {
        return err(resolved.error);
      }

      return ok(await this.inspectResolvedScope(context, query.input, resolved.value));
    } catch (error) {
      return err(
        withInspectRuntimeUsageDetails(
          domainError.infra("Runtime usage inspection could not be assembled"),
          {
            phase: "runtime-usage-inspection",
            ...scopeDetails(query),
            reason: error instanceof Error ? error.message : "unknown",
          },
        ),
      );
    }
  }

  private async resolveNonServerScope(
    context: ExecutionContext,
    scope: Exclude<RuntimeUsageScope, { kind: "server" }>,
  ): Promise<Result<ResolvedRuntimeUsageScope>> {
    const repositoryContext = toRepositoryContext(context);

    switch (scope.kind) {
      case "project": {
        const projectId = ProjectId.rehydrate(scope.projectId);
        const project = await this.projectReadModel.findOne(
          repositoryContext,
          ProjectByIdSpec.create(projectId),
        );
        if (!project) {
          return err(domainError.notFound("project", scope.projectId));
        }

        const resources = await this.resourceReadModel.list(repositoryContext, {
          projectId: scope.projectId,
        });
        const deployments = await this.deploymentReadModel.list(repositoryContext, {
          projectId: scope.projectId,
        });
        const currentDeployments = resources
          .map((resource) => latestRuntimeOwningDeployment(deployments, resource.id))
          .filter((deployment): deployment is DeploymentSummary => Boolean(deployment));

        return ok({ scope, deployments: currentDeployments });
      }
      case "environment": {
        const environmentId = EnvironmentId.rehydrate(scope.environmentId);
        const environment = await this.environmentReadModel.findOne(
          repositoryContext,
          EnvironmentByIdSpec.create(environmentId),
        );
        if (!environment) {
          return err(domainError.notFound("environment", scope.environmentId));
        }

        const resources = await this.resourceReadModel.list(repositoryContext, {
          projectId: environment.projectId,
          environmentId: scope.environmentId,
        });
        const deployments = await this.deploymentReadModel.list(repositoryContext, {
          projectId: environment.projectId,
        });
        const currentDeployments = resources
          .map((resource) => latestRuntimeOwningDeployment(deployments, resource.id))
          .filter((deployment): deployment is DeploymentSummary => Boolean(deployment));

        return ok({ scope, deployments: currentDeployments });
      }
      case "resource": {
        const resourceId = ResourceId.rehydrate(scope.resourceId);
        const resource = await this.resourceReadModel.findOne(
          repositoryContext,
          ResourceByIdSpec.create(resourceId),
        );
        if (!resource) {
          return err(domainError.notFound("resource", scope.resourceId));
        }

        const deployment = await this.deploymentReadModel.findOne(
          repositoryContext,
          LatestRuntimeOwningDeploymentSpec.forResource(resourceId),
        );

        return ok({ scope, deployments: deployment ? [deployment] : [] });
      }
      case "deployment": {
        const deployment = await this.deploymentReadModel.findOne(
          repositoryContext,
          DeploymentByIdSpec.create(DeploymentId.rehydrate(scope.deploymentId)),
        );
        if (!deployment) {
          return err(domainError.notFound("deployment", scope.deploymentId));
        }

        return ok({ scope, deployments: [deployment] });
      }
    }
  }

  private async inspectResolvedScope(
    context: ExecutionContext,
    input: RuntimeUsageInspectorInput,
    resolved: ResolvedRuntimeUsageScope,
  ): Promise<RuntimeUsageInspection> {
    const serverIds = uniqueStrings(resolved.deployments.map((deployment) => deployment.serverId));
    const serverResults = await Promise.all(
      serverIds.map((serverId) =>
        this.runtimeUsageInspector.inspect(context, {
          ...input,
          scope: { kind: "server", serverId },
          includeArtifacts: true,
          collectionProfile: "attribution",
        }),
      ),
    );
    const serverInspections: RuntimeUsageInspection[] = [];
    const serverErrors: DomainError[] = [];
    for (const result of serverResults) {
      if (result.isOk()) {
        serverInspections.push(result.value);
        continue;
      }

      serverErrors.push(result.error);
    }
    const deploymentsById = new Map(
      resolved.deployments.map((deployment) => [deployment.id, deployment]),
    );
    const attributedArtifacts = serverInspections
      .flatMap((inspection) => inspection.artifacts)
      .map((artifact) => artifactWithDeploymentContext(artifact, deploymentsById))
      .filter((artifact) => artifactMatchesScope(resolved.scope, artifact));
    if (attributedArtifacts.length > 0) {
      return attributedInspectionFromArtifacts({
        scope: resolved.scope,
        attributionArtifacts: attributedArtifacts,
        responseArtifacts: input.includeArtifacts ? attributedArtifacts : [],
        serverInspections,
        serverErrors,
        includeWarnings: input.includeWarnings,
        expectedDeployments: resolved.deployments,
      });
    }

    const generatedAt = serverInspections[0]?.generatedAt ?? new Date().toISOString();
    const observedAt = serverInspections[0]?.observedAt;
    const warning = missingAttributionWarning(resolved.scope);
    const sourceError = missingAttributionSourceError(resolved.scope);
    const sourceErrors: RuntimeUsageSourceError[] = [
      sourceError,
      ...serverInspections.flatMap((inspection) => inspection.sourceErrors),
      ...serverErrors.map((error) => ({
        source: "runtime-target" as const,
        code: error.code,
        message: error.message,
        retriable: error.category !== "user",
      })),
    ];
    const capacityWarnings = serverInspections.flatMap((inspection) => inspection.warnings);
    const deploymentRollups = resolved.deployments.map(rollupForDeployment);
    const resourceRollups = resolved.deployments.map((deployment) => ({
      scope: { kind: "resource" as const, resourceId: deployment.resourceId },
      ownership: "unknown" as const,
      totals: {},
      currentDeploymentId: deployment.id,
      warnings: [
        missingAttributionWarning({ kind: "resource", resourceId: deployment.resourceId }),
      ],
    }));

    return {
      schemaVersion: "runtime-usage.inspect/v1",
      scope: resolved.scope,
      generatedAt,
      ...(observedAt ? { observedAt } : {}),
      freshness: serverInspections.some((inspection) => inspection.freshness === "live")
        ? "live"
        : "unknown",
      partial: true,
      totals: {},
      byProject:
        resolved.scope.kind === "project"
          ? [
              {
                scope: resolved.scope,
                ownership: "unknown",
                totals: {},
                warnings: [warning],
              },
            ]
          : [],
      byEnvironment:
        resolved.scope.kind === "environment"
          ? [
              {
                scope: resolved.scope,
                ownership: "unknown",
                totals: {},
                warnings: [warning],
              },
            ]
          : [],
      byResource:
        resolved.scope.kind === "resource"
          ? [
              {
                scope: resolved.scope,
                ownership: "unknown",
                totals: {},
                ...(resolved.deployments[0]?.id
                  ? { currentDeploymentId: resolved.deployments[0].id }
                  : {}),
                warnings: [warning],
              },
            ]
          : resourceRollups,
      byDeployment:
        resolved.scope.kind === "deployment"
          ? [
              {
                scope: resolved.scope,
                ownership: "unknown",
                totals: {},
                ...(resolved.deployments[0]?.id
                  ? { currentDeploymentId: resolved.deployments[0].id }
                  : {}),
                warnings: [warning],
              },
            ]
          : deploymentRollups,
      artifacts: [],
      warnings: input.includeWarnings ? [warning, ...capacityWarnings] : [],
      sourceErrors: input.includeWarnings ? sourceErrors : [],
    };
  }
}
