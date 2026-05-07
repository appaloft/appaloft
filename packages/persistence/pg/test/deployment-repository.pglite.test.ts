import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "@appaloft/application";
import {
  BuildStrategyKindValue,
  CreatedAt,
  Deployment,
  DeploymentByIdSpec,
  DeploymentDependencyBindingSnapshotReadinessValue,
  DeploymentDependencyRuntimeSecretRef,
  DeploymentId,
  DeploymentTarget,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DeploymentTargetName,
  DeploymentTriggerKindValue,
  Destination,
  DestinationId,
  DestinationKindValue,
  DestinationName,
  DetectSummary,
  DisplayNameText,
  Environment,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  EnvironmentSnapshotId,
  ExecutionResult,
  ExecutionStatusValue,
  ExecutionStrategyKindValue,
  ExitCode,
  FinishedAt,
  GeneratedAt,
  HostAddress,
  ImageReference,
  PackagingModeValue,
  PlanStepText,
  PortNumber,
  Project,
  ProjectId,
  ProjectName,
  ProviderKey,
  Resource,
  ResourceBindingId,
  ResourceBindingScopeValue,
  ResourceBindingTargetName,
  ResourceExposureModeValue,
  ResourceId,
  ResourceInjectionModeValue,
  ResourceInstanceId,
  ResourceInstanceKindValue,
  ResourceKindValue,
  ResourceName,
  ResourceNetworkProtocolValue,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  StartedAt,
  TargetKindValue,
  UpsertDeploymentSpec,
  UpsertDeploymentTargetSpec,
  UpsertDestinationSpec,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceSpec,
} from "@appaloft/core";

function createRepositoryContext(): RepositoryContext {
  return toRepositoryContext(
    createExecutionContext({
      entrypoint: "system",
      requestId: "req_deployment_repo_test",
      tracer: {
        startActiveSpan(_name, _options, callback) {
          return Promise.resolve(
            callback({
              addEvent() {},
              recordError() {},
              setAttribute() {},
              setAttributes() {},
              setStatus() {},
            }),
          );
        },
      },
    }),
  );
}

function createDeploymentRecord(input: {
  id: string;
  createdAt: string;
  status: "planned" | "succeeded";
  includeDependencyBindingReference?: boolean;
  targetKind?: TargetKindValue;
  targetProviderKey?: ProviderKey;
  executionMetadata?: Record<string, string>;
  supersedesDeploymentId?: string;
  triggerKind?: DeploymentTriggerKindValue;
  sourceDeploymentId?: string;
  rollbackCandidateDeploymentId?: string;
}): Deployment {
  const targetKind = input.targetKind ?? TargetKindValue.rehydrate("single-server");
  const targetProviderKey = input.targetProviderKey ?? ProviderKey.rehydrate("generic-ssh");
  const environment = Environment.create({
    id: EnvironmentId.rehydrate("env_repo"),
    projectId: ProjectId.rehydrate("prj_repo"),
    name: EnvironmentName.rehydrate("production"),
    kind: EnvironmentKindValue.rehydrate("production"),
    createdAt: CreatedAt.rehydrate(input.createdAt),
  })._unsafeUnwrap();

  const deployment = Deployment.create({
    id: DeploymentId.rehydrate(input.id),
    projectId: ProjectId.rehydrate("prj_repo"),
    serverId: DeploymentTargetId.rehydrate("srv_repo"),
    destinationId: DestinationId.rehydrate("dst_repo"),
    environmentId: EnvironmentId.rehydrate("env_repo"),
    resourceId: ResourceId.rehydrate("res_repo"),
    runtimePlan: RuntimePlan.rehydrate({
      id: RuntimePlanId.rehydrate(`plan_${input.id}`),
      source: SourceDescriptor.rehydrate({
        kind: SourceKindValue.rehydrate("local-folder"),
        locator: SourceLocator.rehydrate("."),
        displayName: DisplayNameText.rehydrate("workspace"),
      }),
      buildStrategy: BuildStrategyKindValue.rehydrate("dockerfile"),
      packagingMode: PackagingModeValue.rehydrate("all-in-one-docker"),
      execution: RuntimeExecutionPlan.rehydrate({
        kind: ExecutionStrategyKindValue.rehydrate("docker-container"),
        image: ImageReference.rehydrate("demo:test"),
        port: PortNumber.rehydrate(3000),
      }),
      target: DeploymentTargetDescriptor.rehydrate({
        kind: targetKind,
        providerKey: targetProviderKey,
        serverIds: [DeploymentTargetId.rehydrate("srv_repo")],
      }),
      detectSummary: DetectSummary.rehydrate("pglite deployment repository test"),
      steps: [
        PlanStepText.rehydrate("package"),
        PlanStepText.rehydrate("deploy"),
        PlanStepText.rehydrate("verify"),
      ],
      generatedAt: GeneratedAt.rehydrate(input.createdAt),
    }),
    environmentSnapshot: environment.materializeSnapshot({
      snapshotId: EnvironmentSnapshotId.rehydrate(`snap_${input.id}`),
      createdAt: GeneratedAt.rehydrate(input.createdAt),
    }),
    ...(input.includeDependencyBindingReference
      ? {
          dependencyBindingReferences: [
            {
              bindingId: ResourceBindingId.rehydrate("rbd_pg"),
              dependencyResourceId: ResourceInstanceId.rehydrate("rsi_pg"),
              kind: ResourceInstanceKindValue.rehydrate("postgres"),
              targetName: ResourceBindingTargetName.rehydrate("DATABASE_URL"),
              scope: ResourceBindingScopeValue.rehydrate("runtime-only"),
              injectionMode: ResourceInjectionModeValue.rehydrate("env"),
              runtimeSecretRef: DeploymentDependencyRuntimeSecretRef.rehydrate(
                "appaloft://dependency-resources/rsi_pg/connection",
              ),
              snapshotReadiness: DeploymentDependencyBindingSnapshotReadinessValue.ready(),
            },
          ],
        }
      : {}),
    createdAt: CreatedAt.rehydrate(input.createdAt),
    ...(input.triggerKind ? { triggerKind: input.triggerKind } : {}),
    ...(input.sourceDeploymentId
      ? { sourceDeploymentId: DeploymentId.rehydrate(input.sourceDeploymentId) }
      : {}),
    ...(input.rollbackCandidateDeploymentId
      ? {
          rollbackCandidateDeploymentId: DeploymentId.rehydrate(
            input.rollbackCandidateDeploymentId,
          ),
        }
      : {}),
    ...(input.supersedesDeploymentId
      ? { supersedesDeploymentId: DeploymentId.rehydrate(input.supersedesDeploymentId) }
      : {}),
  })._unsafeUnwrap();

  deployment.markPlanning(StartedAt.rehydrate(input.createdAt))._unsafeUnwrap();
  deployment.markPlanned(StartedAt.rehydrate(input.createdAt))._unsafeUnwrap();

  if (input.status === "succeeded") {
    deployment.start(StartedAt.rehydrate(input.createdAt))._unsafeUnwrap();
    deployment
      .applyExecutionResult(
        FinishedAt.rehydrate("2026-01-01T00:10:00.000Z"),
        ExecutionResult.rehydrate({
          exitCode: ExitCode.rehydrate(0),
          status: ExecutionStatusValue.rehydrate("succeeded"),
          retryable: false,
          logs: [],
          ...(input.executionMetadata ? { metadata: input.executionMetadata } : {}),
        }),
      )
      ._unsafeUnwrap();
  }

  return deployment;
}

describe("pglite deployment repository", () => {
  test("enforces one active deployment per resource and round-trips superseded deployment identity", async () => {
    const context = createRepositoryContext();
    const {
      createDatabase,
      createMigrator,
      PgDeploymentRepository,
      PgDeploymentReadModel,
      PgDestinationRepository,
      PgEnvironmentRepository,
      PgProjectRepository,
      PgResourceRepository,
      PgServerRepository,
    } = await import("../src/index");
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-deployment-repo-"));
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: workspaceDir,
    });
    const migrator = createMigrator(database.db);
    await migrator.migrateToLatest();

    const projectRepository = new PgProjectRepository(database.db);
    const serverRepository = new PgServerRepository(database.db);
    const destinationRepository = new PgDestinationRepository(database.db);
    const environmentRepository = new PgEnvironmentRepository(database.db);
    const resourceRepository = new PgResourceRepository(database.db);
    const deploymentRepository = new PgDeploymentRepository(database.db);
    const deploymentReadModel = new PgDeploymentReadModel(database.db);

    const project = Project.create({
      id: ProjectId.rehydrate("prj_repo"),
      name: ProjectName.rehydrate("Repo Test"),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();
    const server = DeploymentTarget.register({
      id: DeploymentTargetId.rehydrate("srv_repo"),
      name: DeploymentTargetName.rehydrate("repo-server"),
      host: HostAddress.rehydrate("127.0.0.1"),
      port: PortNumber.rehydrate(22),
      providerKey: ProviderKey.rehydrate("generic-ssh"),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();
    const destination = Destination.register({
      id: DestinationId.rehydrate("dst_repo"),
      serverId: DeploymentTargetId.rehydrate("srv_repo"),
      name: DestinationName.rehydrate("default"),
      kind: DestinationKindValue.rehydrate("generic"),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();
    const environment = Environment.create({
      id: EnvironmentId.rehydrate("env_repo"),
      projectId: ProjectId.rehydrate("prj_repo"),
      name: EnvironmentName.rehydrate("production"),
      kind: EnvironmentKindValue.rehydrate("production"),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();
    const resource = Resource.create({
      id: ResourceId.rehydrate("res_repo"),
      projectId: ProjectId.rehydrate("prj_repo"),
      environmentId: EnvironmentId.rehydrate("env_repo"),
      destinationId: DestinationId.rehydrate("dst_repo"),
      name: ResourceName.rehydrate("web"),
      kind: ResourceKindValue.rehydrate("application"),
      networkProfile: {
        internalPort: PortNumber.rehydrate(3000),
        upstreamProtocol: ResourceNetworkProtocolValue.rehydrate("http"),
        exposureMode: ResourceExposureModeValue.rehydrate("reverse-proxy"),
      },
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();

    await projectRepository.upsert(context, project, UpsertProjectSpec.fromProject(project));
    await serverRepository.upsert(
      context,
      server,
      UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
    );
    await destinationRepository.upsert(
      context,
      destination,
      UpsertDestinationSpec.fromDestination(destination),
    );
    await environmentRepository.upsert(
      context,
      environment,
      UpsertEnvironmentSpec.fromEnvironment(environment),
    );
    await resourceRepository.upsert(context, resource, UpsertResourceSpec.fromResource(resource));

    const previousDeployment = createDeploymentRecord({
      id: "dep_prev",
      createdAt: "2026-01-01T00:00:01.000Z",
      status: "succeeded",
    });
    const previousAdmit = await deploymentRepository.insertOne(
      context,
      previousDeployment,
      UpsertDeploymentSpec.fromDeployment(previousDeployment),
    );
    expect(previousAdmit.isOk()).toBe(true);

    const activeDeployment = createDeploymentRecord({
      id: "dep_active",
      createdAt: "2026-01-01T00:00:02.000Z",
      status: "planned",
      includeDependencyBindingReference: true,
      triggerKind: DeploymentTriggerKindValue.rollback(),
      sourceDeploymentId: "dep_failed",
      rollbackCandidateDeploymentId: "dep_prev",
      supersedesDeploymentId: "dep_prev",
    });
    const firstAdmit = await deploymentRepository.insertOne(
      context,
      activeDeployment,
      UpsertDeploymentSpec.fromDeployment(activeDeployment),
    );
    expect(firstAdmit.isOk()).toBe(true);

    const competingDeployment = createDeploymentRecord({
      id: "dep_competing",
      createdAt: "2026-01-01T00:00:03.000Z",
      status: "planned",
      supersedesDeploymentId: "dep_prev",
    });
    const secondAdmit = await deploymentRepository.insertOne(
      context,
      competingDeployment,
      UpsertDeploymentSpec.fromDeployment(competingDeployment),
    );
    expect(secondAdmit.isErr()).toBe(true);
    if (secondAdmit.isErr()) {
      expect(secondAdmit.error.code).toBe("conflict");
      expect(secondAdmit.error.details).toMatchObject({
        aggregateRoot: "deployment",
        constraint: "deployments_active_resource_unique",
        resourceId: "res_repo",
        deploymentId: "dep_active",
        status: "planned",
      });
    }

    const storedDeployment = await deploymentRepository.findOne(
      context,
      DeploymentByIdSpec.create(DeploymentId.rehydrate("dep_active")),
    );
    expect(storedDeployment?.toState().triggerKind).toEqual(DeploymentTriggerKindValue.rollback());
    expect(storedDeployment?.toState().sourceDeploymentId?.value).toBe("dep_failed");
    expect(storedDeployment?.toState().rollbackCandidateDeploymentId?.value).toBe("dep_prev");
    expect(storedDeployment?.toState().supersedesDeploymentId?.value).toBe("dep_prev");
    expect(storedDeployment?.toState().dependencyBindingReferences[0]).toMatchObject({
      bindingId: ResourceBindingId.rehydrate("rbd_pg"),
      dependencyResourceId: ResourceInstanceId.rehydrate("rsi_pg"),
      kind: ResourceInstanceKindValue.rehydrate("postgres"),
      targetName: ResourceBindingTargetName.rehydrate("DATABASE_URL"),
      scope: ResourceBindingScopeValue.rehydrate("runtime-only"),
      injectionMode: ResourceInjectionModeValue.rehydrate("env"),
      runtimeSecretRef: DeploymentDependencyRuntimeSecretRef.rehydrate(
        "appaloft://dependency-resources/rsi_pg/connection",
      ),
      snapshotReadiness: DeploymentDependencyBindingSnapshotReadinessValue.ready(),
    });
    const storedSummary = await deploymentReadModel.findOne(
      context,
      DeploymentByIdSpec.create(DeploymentId.rehydrate("dep_active")),
    );
    expect(storedSummary?.dependencyBindingReferences).toEqual([
      {
        bindingId: "rbd_pg",
        dependencyResourceId: "rsi_pg",
        kind: "postgres",
        targetName: "DATABASE_URL",
        scope: "runtime-only",
        injectionMode: "env",
        snapshotReadiness: {
          status: "ready",
        },
      },
    ]);
    expect(storedSummary).toMatchObject({
      triggerKind: "rollback",
      sourceDeploymentId: "dep_failed",
      rollbackCandidateDeploymentId: "dep_prev",
    });

    await database.close();
  });

  test("[SWARM-TARGET-APPLY-001][SWARM-TARGET-OBS-001][SWARM-TARGET-OBS-002] persists sanitized Swarm runtime identity for read models", async () => {
    const context = createRepositoryContext();
    const {
      createDatabase,
      createMigrator,
      PgDeploymentReadModel,
      PgDeploymentRepository,
      PgDestinationRepository,
      PgEnvironmentRepository,
      PgProjectRepository,
      PgResourceRepository,
      PgServerRepository,
    } = await import("../src/index");
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-deployment-swarm-read-model-"));
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: workspaceDir,
    });
    const migrator = createMigrator(database.db);
    await migrator.migrateToLatest();

    const projectRepository = new PgProjectRepository(database.db);
    const serverRepository = new PgServerRepository(database.db);
    const destinationRepository = new PgDestinationRepository(database.db);
    const environmentRepository = new PgEnvironmentRepository(database.db);
    const resourceRepository = new PgResourceRepository(database.db);
    const deploymentRepository = new PgDeploymentRepository(database.db);
    const deploymentReadModel = new PgDeploymentReadModel(database.db);

    const project = Project.create({
      id: ProjectId.rehydrate("prj_repo"),
      name: ProjectName.rehydrate("Repo Test"),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();
    const server = DeploymentTarget.register({
      id: DeploymentTargetId.rehydrate("srv_repo"),
      name: DeploymentTargetName.rehydrate("swarm-manager"),
      host: HostAddress.rehydrate("127.0.0.1"),
      port: PortNumber.rehydrate(22),
      providerKey: ProviderKey.rehydrate("docker-swarm"),
      targetKind: TargetKindValue.rehydrate("orchestrator-cluster"),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();
    const destination = Destination.register({
      id: DestinationId.rehydrate("dst_repo"),
      serverId: DeploymentTargetId.rehydrate("srv_repo"),
      name: DestinationName.rehydrate("default"),
      kind: DestinationKindValue.rehydrate("generic"),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();
    const environment = Environment.create({
      id: EnvironmentId.rehydrate("env_repo"),
      projectId: ProjectId.rehydrate("prj_repo"),
      name: EnvironmentName.rehydrate("production"),
      kind: EnvironmentKindValue.rehydrate("production"),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();
    const resource = Resource.create({
      id: ResourceId.rehydrate("res_repo"),
      projectId: ProjectId.rehydrate("prj_repo"),
      environmentId: EnvironmentId.rehydrate("env_repo"),
      destinationId: DestinationId.rehydrate("dst_repo"),
      name: ResourceName.rehydrate("web"),
      kind: ResourceKindValue.rehydrate("application"),
      networkProfile: {
        internalPort: PortNumber.rehydrate(3000),
        upstreamProtocol: ResourceNetworkProtocolValue.rehydrate("http"),
        exposureMode: ResourceExposureModeValue.rehydrate("reverse-proxy"),
      },
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();

    await projectRepository.upsert(context, project, UpsertProjectSpec.fromProject(project));
    await serverRepository.upsert(
      context,
      server,
      UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
    );
    await destinationRepository.upsert(
      context,
      destination,
      UpsertDestinationSpec.fromDestination(destination),
    );
    await environmentRepository.upsert(
      context,
      environment,
      UpsertEnvironmentSpec.fromEnvironment(environment),
    );
    await resourceRepository.upsert(context, resource, UpsertResourceSpec.fromResource(resource));

    const swarmRuntimeIdentity = {
      "swarm.stackName": "appaloft-res_repo-dst_repo-dep_swarm",
      "swarm.serviceName": "appaloft-res_repo-dst_repo-dep_swarm-web",
      "swarm.applyPlanSchemaVersion": "1",
    };
    const deployment = createDeploymentRecord({
      id: "dep_swarm",
      createdAt: "2026-01-01T00:00:01.000Z",
      status: "succeeded",
      targetKind: TargetKindValue.rehydrate("orchestrator-cluster"),
      targetProviderKey: ProviderKey.rehydrate("docker-swarm"),
      executionMetadata: swarmRuntimeIdentity,
    });

    const admit = await deploymentRepository.insertOne(
      context,
      deployment,
      UpsertDeploymentSpec.fromDeployment(deployment),
    );
    expect(admit.isOk()).toBe(true);

    const persisted = await deploymentRepository.findOne(
      context,
      DeploymentByIdSpec.create(DeploymentId.rehydrate("dep_swarm")),
    );
    expect(persisted?.toState().runtimePlan.toState().target.kind).toBe("orchestrator-cluster");
    expect(persisted?.toState().runtimePlan.toState().target.providerKey).toBe("docker-swarm");
    expect(persisted?.toState().runtimePlan.toState().execution.toState().metadata).toEqual(
      swarmRuntimeIdentity,
    );

    const summary = await deploymentReadModel.findOne(
      context,
      DeploymentByIdSpec.create(DeploymentId.rehydrate("dep_swarm")),
    );
    expect(summary?.runtimePlan.target).toMatchObject({
      kind: "orchestrator-cluster",
      providerKey: "docker-swarm",
    });
    expect(summary?.runtimePlan.execution.metadata).toEqual(swarmRuntimeIdentity);
    expect(summary?.runtimePlan.execution.metadata).not.toHaveProperty("swarm.command");
    expect(summary?.runtimePlan.execution.metadata).not.toHaveProperty("swarm.rawPayload");
    expect(summary?.runtimePlan.execution.metadata).not.toHaveProperty("registry.password");

    await database.close();
  });
});
