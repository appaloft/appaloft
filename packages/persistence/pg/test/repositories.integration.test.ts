import { describe, expect, test } from "bun:test";
import { type RepositoryContext } from "@yundu/application";

import {
  BuildStrategyKindValue,
  ConfigKey,
  ConfigScopeValue,
  ConfigValueText,
  CreatedAt,
  Deployment,
  DeploymentId,
  DeploymentLogEntry,
  DeploymentPhaseValue,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DeploymentTargetName,
  DetectSummary,
  DisplayNameText,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  EnvironmentProfile,
  EnvironmentSnapshotId,
  ExecutionResult,
  ExecutionStatusValue,
  ExecutionStrategyKindValue,
  ExitCode,
  FinishedAt,
  GeneratedAt,
  HostAddress,
  ImageReference,
  LogLevelValue,
  MessageText,
  OccurredAt,
  PackagingModeValue,
  PlanStepText,
  PortNumber,
  Project,
  ProjectId,
  ProjectName,
  ProviderKey,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  Server,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  StartedAt,
  TargetKindValue,
  UpdatedAt,
  UpsertDeploymentSpec,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertServerSpec,
  VariableExposureValue,
  VariableKindValue,
} from "@yundu/core";

function createRepositoryContext(): RepositoryContext {
  return {
    requestId: "req_pg_test",
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
  };
}

function ensureReflectMetadata(): void {
  const reflectObject = Reflect as typeof Reflect & {
    defineMetadata?: (...args: unknown[]) => void;
    getMetadata?: (...args: unknown[]) => unknown;
    getOwnMetadata?: (...args: unknown[]) => unknown;
    hasMetadata?: (...args: unknown[]) => boolean;
    metadata?: (_metadataKey: unknown, _metadataValue: unknown) => ClassDecorator;
  };

  reflectObject.defineMetadata ??= () => {};
  reflectObject.getMetadata ??= () => undefined;
  reflectObject.getOwnMetadata ??= () => undefined;
  reflectObject.hasMetadata ??= () => false;
  reflectObject.metadata ??= () => () => {};
}

const databaseUrl = process.env.YUNDU_DATABASE_URL;

describe("postgres persistence integration", () => {
  test("is configured", () => {
    expect(databaseUrl).toBeTruthy();
  });

  if (!databaseUrl) {
    return;
  }

  test("persists environments, snapshots, and masked reads against real postgres", async () => {
    const context = createRepositoryContext();
    ensureReflectMetadata();
    const {
      createDatabase,
      createMigrator,
      PgDeploymentReadModel,
      PgDeploymentRepository,
      PgEnvironmentReadModel,
      PgEnvironmentRepository,
      PgProjectRepository,
      PgServerRepository,
    } = await import("../src/index");
    const database = await createDatabase({
      driver: "postgres",
      databaseUrl,
    });
    const migrator = createMigrator(database.db);
    await migrator.migrateToLatest();

    const projectRepository = new PgProjectRepository(database.db);
    const serverRepository = new PgServerRepository(database.db);
    const environmentRepository = new PgEnvironmentRepository(database.db);
    const environmentReadModel = new PgEnvironmentReadModel(database.db, "****");
    const deploymentRepository = new PgDeploymentRepository(database.db);
    const deploymentReadModel = new PgDeploymentReadModel(database.db);

    const suffix = crypto.randomUUID().slice(0, 8);
    const project = Project.create({
      id: ProjectId.rehydrate(`prj_${suffix}`),
      name: ProjectName.rehydrate(`Persistence ${suffix}`),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();
    const server = Server.register({
      id: DeploymentTargetId.rehydrate(`srv_${suffix}`),
      name: DeploymentTargetName.rehydrate(`server-${suffix}`),
      host: HostAddress.rehydrate("127.0.0.1"),
      port: PortNumber.rehydrate(22),
      providerKey: ProviderKey.rehydrate("generic-ssh"),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();
    const environment = EnvironmentProfile.create({
      id: EnvironmentId.rehydrate(`env_${suffix}`),
      projectId: ProjectId.rehydrate(`prj_${suffix}`),
      name: EnvironmentName.rehydrate("production"),
      kind: EnvironmentKindValue.rehydrate("production"),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    })._unsafeUnwrap();

    environment.setVariable({
      key: ConfigKey.rehydrate("DATABASE_URL"),
      value: ConfigValueText.rehydrate("postgres://postgres:postgres@db:5432/yundu"),
      kind: VariableKindValue.rehydrate("secret"),
      exposure: VariableExposureValue.rehydrate("runtime"),
      scope: ConfigScopeValue.rehydrate("environment"),
      isSecret: true,
      updatedAt: UpdatedAt.rehydrate("2026-01-01T00:01:00.000Z"),
    });

    await projectRepository.upsert(context, project, UpsertProjectSpec.fromProject(project));
    await serverRepository.upsert(context, server, UpsertServerSpec.fromServer(server));
    await environmentRepository.upsert(
      context,
      environment,
      UpsertEnvironmentSpec.fromEnvironment(environment),
    );

    const deployment = Deployment.create({
      id: DeploymentId.rehydrate(`dep_${suffix}`),
      projectId: ProjectId.rehydrate(`prj_${suffix}`),
      serverId: DeploymentTargetId.rehydrate(`srv_${suffix}`),
      environmentId: EnvironmentId.rehydrate(`env_${suffix}`),
      runtimePlan: RuntimePlan.rehydrate({
        id: RuntimePlanId.rehydrate(`plan_${suffix}`),
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
          kind: TargetKindValue.rehydrate("single-server"),
          providerKey: ProviderKey.rehydrate("generic-ssh"),
          serverIds: [DeploymentTargetId.rehydrate(`srv_${suffix}`)],
        }),
        detectSummary: DetectSummary.rehydrate("integration test"),
        steps: [
          PlanStepText.rehydrate("package"),
          PlanStepText.rehydrate("deploy"),
          PlanStepText.rehydrate("verify"),
        ],
        generatedAt: GeneratedAt.rehydrate("2026-01-01T00:02:00.000Z"),
      }),
      environmentSnapshot: environment.materializeSnapshot({
        snapshotId: EnvironmentSnapshotId.rehydrate(`snap_${suffix}`),
        createdAt: GeneratedAt.rehydrate("2026-01-01T00:02:00.000Z"),
      }),
      createdAt: CreatedAt.rehydrate("2026-01-01T00:02:00.000Z"),
    })._unsafeUnwrap();

    deployment.markPlanning(StartedAt.rehydrate("2026-01-01T00:02:00.000Z"))._unsafeUnwrap();
    deployment.markPlanned(StartedAt.rehydrate("2026-01-01T00:02:01.000Z"))._unsafeUnwrap();
    deployment.start(StartedAt.rehydrate("2026-01-01T00:02:02.000Z"))._unsafeUnwrap();
    deployment.applyExecutionResult(
      FinishedAt.rehydrate("2026-01-01T00:02:03.000Z"),
      ExecutionResult.rehydrate({
        exitCode: ExitCode.rehydrate(0),
        status: ExecutionStatusValue.rehydrate("succeeded"),
        retryable: false,
        logs: [
          DeploymentLogEntry.rehydrate({
            timestamp: OccurredAt.rehydrate("2026-01-01T00:02:03.000Z"),
            phase: DeploymentPhaseValue.rehydrate("verify"),
            level: LogLevelValue.rehydrate("info"),
            message: MessageText.rehydrate("integration persisted deployment"),
          }),
        ],
      }),
    );

    await deploymentRepository.upsert(
      context,
      deployment,
      UpsertDeploymentSpec.fromDeployment(deployment),
    );

    const environments = await environmentReadModel.list(context, `prj_${suffix}`);
    const deployments = await deploymentReadModel.list(context, `prj_${suffix}`);

    expect(environments[0]?.maskedVariables).toEqual([
      expect.objectContaining({
        key: "DATABASE_URL",
        value: "****",
        isSecret: true,
      }),
    ]);
    expect(deployments[0]?.environmentSnapshot.variables).toEqual([
      expect.objectContaining({
        key: "DATABASE_URL",
        isSecret: true,
      }),
    ]);
    expect(deployments[0]?.logCount).toBe(1);

    await database.close();
  });
});
