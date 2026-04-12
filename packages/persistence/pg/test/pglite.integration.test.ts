import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  Destination,
  DestinationId,
  DestinationKindValue,
  DestinationName,
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
  Resource,
  ResourceId,
  ResourceKindValue,
  ResourceName,
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
  UpsertDestinationSpec,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceSpec,
  UpsertServerSpec,
  VariableExposureValue,
  VariableKindValue,
} from "@yundu/core";

function createRepositoryContext(): RepositoryContext {
  return {
    requestId: "req_pglite_test",
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

describe("pglite persistence integration", () => {
  test("persists environments and deployments to a file-backed embedded store", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "yundu-pglite-"));
    const pgliteDataDir = join(workspaceDir, ".yundu", "data", "pglite");
    const context = createRepositoryContext();

    try {
      const suffix = crypto.randomUUID().slice(0, 8);
      ensureReflectMetadata();
      const {
        createDatabase,
        createMigrator,
        PgDeploymentReadModel,
        PgDeploymentRepository,
        PgDestinationRepository,
        PgEnvironmentReadModel,
        PgEnvironmentRepository,
        PgProjectRepository,
        PgResourceRepository,
        PgServerRepository,
      } = await import("../src/index");
      const database = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      const migrator = createMigrator(database.db);
      await migrator.migrateToLatest();

      const projectRepository = new PgProjectRepository(database.db);
      const serverRepository = new PgServerRepository(database.db);
      const destinationRepository = new PgDestinationRepository(database.db);
      const environmentRepository = new PgEnvironmentRepository(database.db);
      const resourceRepository = new PgResourceRepository(database.db);
      const deploymentRepository = new PgDeploymentRepository(database.db);

      const project = Project.create({
        id: ProjectId.rehydrate(`prj_${suffix}`),
        name: ProjectName.rehydrate(`Embedded ${suffix}`),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();
      const server = Server.register({
        id: DeploymentTargetId.rehydrate(`srv_${suffix}`),
        name: DeploymentTargetName.rehydrate(`embedded-${suffix}`),
        host: HostAddress.rehydrate("127.0.0.1"),
        port: PortNumber.rehydrate(22),
        providerKey: ProviderKey.rehydrate("generic-ssh"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();
      const destination = Destination.register({
        id: DestinationId.rehydrate(`dst_${suffix}`),
        serverId: DeploymentTargetId.rehydrate(`srv_${suffix}`),
        name: DestinationName.rehydrate("default"),
        kind: DestinationKindValue.rehydrate("generic"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();
      const environment = EnvironmentProfile.create({
        id: EnvironmentId.rehydrate(`env_${suffix}`),
        projectId: ProjectId.rehydrate(`prj_${suffix}`),
        name: EnvironmentName.rehydrate("local"),
        kind: EnvironmentKindValue.rehydrate("local"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();
      const resource = Resource.create({
        id: ResourceId.rehydrate(`res_${suffix}`),
        projectId: ProjectId.rehydrate(`prj_${suffix}`),
        environmentId: EnvironmentId.rehydrate(`env_${suffix}`),
        destinationId: DestinationId.rehydrate(`dst_${suffix}`),
        name: ResourceName.rehydrate("web"),
        kind: ResourceKindValue.rehydrate("application"),
        createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
      })._unsafeUnwrap();

      environment.setVariable({
        key: ConfigKey.rehydrate("PUBLIC_SITE_NAME"),
        value: ConfigValueText.rehydrate("embedded-yundu"),
        kind: VariableKindValue.rehydrate("plain-config"),
        exposure: VariableExposureValue.rehydrate("build-time"),
        scope: ConfigScopeValue.rehydrate("environment"),
        isSecret: false,
        updatedAt: UpdatedAt.rehydrate("2026-01-01T00:01:00.000Z"),
      });

      await projectRepository.upsert(context, project, UpsertProjectSpec.fromProject(project));
      await serverRepository.upsert(context, server, UpsertServerSpec.fromServer(server));
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

      const deployment = Deployment.create({
        id: DeploymentId.rehydrate(`dep_${suffix}`),
        projectId: ProjectId.rehydrate(`prj_${suffix}`),
        serverId: DeploymentTargetId.rehydrate(`srv_${suffix}`),
        destinationId: DestinationId.rehydrate(`dst_${suffix}`),
        environmentId: EnvironmentId.rehydrate(`env_${suffix}`),
        resourceId: ResourceId.rehydrate(`res_${suffix}`),
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
          detectSummary: DetectSummary.rehydrate("pglite integration test"),
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
              message: MessageText.rehydrate("embedded deployment persisted"),
            }),
          ],
        }),
      );

      await deploymentRepository.upsert(
        context,
        deployment,
        UpsertDeploymentSpec.fromDeployment(deployment),
      );
      await database.close();

      const reopened = await createDatabase({
        driver: "pglite",
        pgliteDataDir,
      });
      const reopenedMigrator = createMigrator(reopened.db);
      const migrationStatus = await reopenedMigrator.getMigrations();
      const environmentReadModel = new PgEnvironmentReadModel(reopened.db, "****");
      const deploymentReadModel = new PgDeploymentReadModel(reopened.db);

      const environments = await environmentReadModel.list(context, `prj_${suffix}`);
      const deployments = await deploymentReadModel.list(context, { projectId: `prj_${suffix}` });

      expect(migrationStatus.every((migration) => migration.executedAt !== undefined)).toBe(true);
      expect(environments[0]?.maskedVariables).toEqual([
        expect.objectContaining({
          key: "PUBLIC_SITE_NAME",
          value: "embedded-yundu",
          isSecret: false,
        }),
      ]);
      expect(deployments[0]?.environmentSnapshot.id).toBe(`snap_${suffix}`);
      expect(deployments[0]?.logCount).toBe(1);

      await reopened.close();
    } finally {
      rmSync(workspaceDir, { recursive: true, force: true });
    }
  }, 15000);
});
