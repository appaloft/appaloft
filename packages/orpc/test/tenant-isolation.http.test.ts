import "../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type AppLogger,
  type Clock,
  type Command,
  type CommandBus,
  createExecutionContext,
  type DefaultAccessDomainProvider,
  type ExecutionContext,
  type ExecutionContextFactory,
  ListCertificatesQuery,
  ListCertificatesQueryService,
  ListDependencyResourceBackupPoliciesQuery,
  ListDependencyResourceBackupPoliciesQueryService,
  ListDependencyResourceBackupsQuery,
  ListDependencyResourceBackupsQueryService,
  ListDependencyResourcesQuery,
  ListDependencyResourcesQueryService,
  ListDeploymentsQuery,
  ListDeploymentsQueryService,
  ListDeployTokensQuery,
  ListDeployTokensQueryService,
  ListDomainBindingsQuery,
  ListDomainBindingsQueryService,
  ListEnvironmentsQuery,
  ListEnvironmentsQueryService,
  ListPreviewEnvironmentsQuery,
  ListPreviewEnvironmentsQueryService,
  ListProjectsQuery,
  ListProjectsQueryService,
  ListResourceDependencyBindingsQuery,
  ListResourceDependencyBindingsQueryService,
  ListResourcesQuery,
  ListResourcesQueryService,
  ListRetentionDefaultsQuery,
  ListRetentionDefaultsQueryService,
  ListScheduledTaskRunsQuery,
  ListScheduledTaskRunsQueryService,
  ListScheduledTasksQuery,
  ListScheduledTasksQueryService,
  ListServersQuery,
  ListServersQueryService,
  ListSourceEventsQuery,
  ListSourceEventsQueryService,
  ListSourceLinksQuery,
  ListSshCredentialsQuery,
  ListSshCredentialsQueryService,
  ListStorageVolumesQuery,
  ListStorageVolumesQueryService,
  type ProductSessionAuthorizationPort,
  type Query,
  type QueryBus,
  ScheduledTaskRunLogsQuery,
  ScheduledTaskRunLogsQueryService,
  ShowCertificateQuery,
  ShowCertificateQueryService,
  ShowDependencyResourceBackupPolicyQuery,
  ShowDependencyResourceBackupPolicyQueryService,
  ShowDependencyResourceBackupQuery,
  ShowDependencyResourceBackupQueryService,
  ShowDependencyResourceQuery,
  ShowDependencyResourceQueryService,
  ShowDeploymentQuery,
  ShowDeploymentQueryService,
  ShowDeployTokenQuery,
  ShowDeployTokenQueryService,
  ShowDomainBindingQuery,
  ShowDomainBindingQueryService,
  ShowEnvironmentQuery,
  ShowEnvironmentQueryService,
  ShowPreviewEnvironmentQuery,
  ShowPreviewEnvironmentQueryService,
  ShowProjectQuery,
  ShowProjectQueryService,
  ShowResourceDependencyBindingQuery,
  ShowResourceDependencyBindingQueryService,
  ShowResourceQuery,
  ShowResourceQueryService,
  ShowRetentionDefaultQuery,
  ShowRetentionDefaultQueryService,
  ShowScheduledTaskQuery,
  ShowScheduledTaskQueryService,
  ShowScheduledTaskRunQuery,
  ShowScheduledTaskRunQueryService,
  ShowServerQuery,
  ShowServerQueryService,
  ShowSourceEventQuery,
  ShowSourceEventQueryService,
  ShowSourceLinkQuery,
  ShowSshCredentialQuery,
  ShowSshCredentialQueryService,
  ShowStorageVolumeQuery,
  ShowStorageVolumeQueryService,
  SourceLinkQueryService,
  toRepositoryContext,
} from "@appaloft/application";
import {
  CreatedAt,
  DependencyResourceSourceModeValue,
  DeploymentTarget,
  DeploymentTargetCredentialKindValue,
  DeploymentTargetId,
  DeploymentTargetName,
  Environment,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  HostAddress,
  OrganizationId,
  ok,
  PortNumber,
  Project,
  ProjectId,
  ProjectName,
  ProviderKey,
  Resource,
  ResourceId,
  ResourceInstance,
  ResourceInstanceId,
  ResourceInstanceKindValue,
  ResourceInstanceName,
  ResourceKindValue,
  ResourceName,
  type Result,
  SshCredential,
  SshCredentialId,
  SshCredentialName,
  SshPrivateKeyText,
  UpsertDeploymentTargetSpec,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceInstanceSpec,
  UpsertResourceSpec,
  UpsertSshCredentialSpec,
} from "@appaloft/core";
import {
  createDatabase,
  createMigrator,
  type Database,
  PgCertificateReadModel,
  PgDependencyResourceBackupPolicyRepository,
  PgDependencyResourceBackupReadModel,
  PgDependencyResourceReadModel,
  PgDependencyResourceRepository,
  PgDeploymentReadModel,
  PgDeployTokenReadModel,
  PgDestinationRepository,
  PgDomainBindingReadModel,
  PgEnvironmentReadModel,
  PgEnvironmentRepository,
  PgPreviewEnvironmentReadModel,
  PgProjectReadModel,
  PgProjectRepository,
  PgResourceDependencyBindingReadModel,
  PgResourceReadModel,
  PgResourceRepository,
  PgRetentionDefaultRepository,
  PgScheduledTaskReadModel,
  PgScheduledTaskRunLogReadModel,
  PgScheduledTaskRunReadModel,
  PgServerReadModel,
  PgServerRepository,
  PgSourceEventRepository,
  PgSourceLinkReadModel,
  PgSourceLinkRepository,
  PgSshCredentialReadModel,
  PgSshCredentialRepository,
  PgStorageVolumeReadModel,
} from "@appaloft/persistence-pg";
import { Elysia } from "elysia";
import { type Kysely } from "kysely";

import { mountAppaloftOrpcRoutes } from "../src";

class NoopLogger implements AppLogger {
  debug(): void {}
  info(): void {}
  warn(): void {}
  error(): void {}
}

class TestExecutionContextFactory implements ExecutionContextFactory {
  create(input: Parameters<ExecutionContextFactory["create"]>[0]): ExecutionContext {
    return createExecutionContext({
      requestId: input.requestId ?? "req_orpc_tenant_isolation_test",
      entrypoint: input.entrypoint,
      locale: input.locale,
      actor: input.actor,
      auth: input.auth,
      principal: input.principal,
      tenant: input.tenant,
    });
  }
}

const clock: Clock = {
  now: () => "2026-01-01T00:00:00.000Z",
};

const defaultAccessDomainProvider: DefaultAccessDomainProvider = {
  generate: async () =>
    ok({
      kind: "disabled",
      reason: "test-disabled",
    }),
};

const commandBus = {
  execute: async <T>(_context: ExecutionContext, _command: Command<T>): Promise<Result<T>> =>
    ok({} as T),
} as CommandBus;

type SessionFixture = {
  organizationId: string;
  role?: "admin" | "member" | "owner";
  userId: string;
};

function productSessionPort(
  sessions: Record<string, SessionFixture>,
): ProductSessionAuthorizationPort {
  return {
    authorizeProductSession: async (_context, input) => {
      const token = input.cookieHeader
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith("session="))
        ?.slice("session=".length);
      const session = token ? sessions[token] : undefined;
      if (!session) {
        throw new Error(`Missing test session for ${input.cookieHeader ?? "<empty>"}`);
      }

      return ok({
        actor: {
          kind: "user",
          id: session.userId,
          label: `${session.userId}@example.test`,
        },
        email: `${session.userId}@example.test`,
        organizationId: session.organizationId,
        role: session.role ?? "member",
        userId: session.userId,
      });
    },
  };
}

function tenantQueryBus(input: {
  dependencyResourceBackupPolicyRepository: PgDependencyResourceBackupPolicyRepository;
  dependencyResourceBackupReadModel: PgDependencyResourceBackupReadModel;
  dependencyResourceReadModel: PgDependencyResourceReadModel;
  certificateReadModel: PgCertificateReadModel;
  deployTokenReadModel: PgDeployTokenReadModel;
  deploymentReadModel: PgDeploymentReadModel;
  domainBindingReadModel: PgDomainBindingReadModel;
  environmentReadModel: PgEnvironmentReadModel;
  previewEnvironmentReadModel: PgPreviewEnvironmentReadModel;
  projectReadModel: PgProjectReadModel;
  resourceDependencyBindingReadModel: PgResourceDependencyBindingReadModel;
  resourceReadModel: PgResourceReadModel;
  resourceRepository: PgResourceRepository;
  retentionDefaultRepository: PgRetentionDefaultRepository;
  scheduledTaskReadModel: PgScheduledTaskReadModel;
  scheduledTaskRunLogReadModel: PgScheduledTaskRunLogReadModel;
  scheduledTaskRunReadModel: PgScheduledTaskRunReadModel;
  serverReadModel: PgServerReadModel;
  sourceEventReadModel: PgSourceEventRepository;
  sourceLinkReadModel: PgSourceLinkReadModel;
  sourceLinkRepository: PgSourceLinkRepository;
  sshCredentialReadModel: PgSshCredentialReadModel;
  sshCredentialRepository: PgSshCredentialRepository;
  storageVolumeReadModel: PgStorageVolumeReadModel;
  destinationRepository: PgDestinationRepository;
  serverRepository: PgServerRepository;
}): QueryBus {
  const listDependencyResourceBackupPolicies = new ListDependencyResourceBackupPoliciesQueryService(
    input.dependencyResourceBackupPolicyRepository,
  );
  const showDependencyResourceBackupPolicy = new ShowDependencyResourceBackupPolicyQueryService(
    input.dependencyResourceBackupPolicyRepository,
  );
  const listDependencyResourceBackups = new ListDependencyResourceBackupsQueryService(
    input.dependencyResourceBackupReadModel,
    clock,
  );
  const showDependencyResourceBackup = new ShowDependencyResourceBackupQueryService(
    input.dependencyResourceBackupReadModel,
    clock,
  );
  const listProjects = new ListProjectsQueryService(input.projectReadModel);
  const showProject = new ShowProjectQueryService(input.projectReadModel);
  const listEnvironments = new ListEnvironmentsQueryService(input.environmentReadModel);
  const showEnvironment = new ShowEnvironmentQueryService(input.environmentReadModel);
  const listPreviewEnvironments = new ListPreviewEnvironmentsQueryService(
    input.previewEnvironmentReadModel,
    clock,
  );
  const showPreviewEnvironment = new ShowPreviewEnvironmentQueryService(
    input.previewEnvironmentReadModel,
    clock,
  );
  const listResources = new ListResourcesQueryService(
    input.resourceReadModel,
    input.destinationRepository,
    input.serverRepository,
    defaultAccessDomainProvider,
  );
  const listResourceDependencyBindings = new ListResourceDependencyBindingsQueryService(
    input.resourceDependencyBindingReadModel,
    clock,
  );
  const showResourceDependencyBinding = new ShowResourceDependencyBindingQueryService(
    input.resourceDependencyBindingReadModel,
    clock,
  );
  const showResource = new ShowResourceQueryService(
    input.resourceRepository,
    listResources,
    input.deploymentReadModel,
    clock,
  );
  const listDependencyResources = new ListDependencyResourcesQueryService(
    input.dependencyResourceReadModel,
    clock,
  );
  const showDependencyResource = new ShowDependencyResourceQueryService(
    input.dependencyResourceReadModel,
    clock,
  );
  const listDeployments = new ListDeploymentsQueryService(input.deploymentReadModel);
  const showDeployment = new ShowDeploymentQueryService(
    input.deploymentReadModel,
    input.projectReadModel,
    input.environmentReadModel,
    input.resourceReadModel,
    input.serverReadModel,
    {
      execute: async () => {
        throw new Error("recovery summary is disabled in tenant isolation fixture");
      },
    },
    clock,
    input.sourceEventReadModel,
  );
  const listDeployTokens = new ListDeployTokensQueryService(input.deployTokenReadModel);
  const showDeployToken = new ShowDeployTokenQueryService(input.deployTokenReadModel);
  const listDomainBindings = new ListDomainBindingsQueryService(input.domainBindingReadModel);
  const showDomainBinding = new ShowDomainBindingQueryService(
    input.domainBindingReadModel,
    input.certificateReadModel,
    input.resourceReadModel,
  );
  const listRetentionDefaults = new ListRetentionDefaultsQueryService(
    input.retentionDefaultRepository,
  );
  const showRetentionDefault = new ShowRetentionDefaultQueryService(
    input.retentionDefaultRepository,
  );
  const listScheduledTasks = new ListScheduledTasksQueryService(
    input.scheduledTaskReadModel,
    clock,
  );
  const showScheduledTask = new ShowScheduledTaskQueryService(input.scheduledTaskReadModel, clock);
  const listScheduledTaskRuns = new ListScheduledTaskRunsQueryService(
    input.scheduledTaskRunReadModel,
    clock,
  );
  const showScheduledTaskRun = new ShowScheduledTaskRunQueryService(
    input.scheduledTaskRunReadModel,
    clock,
  );
  const scheduledTaskRunLogs = new ScheduledTaskRunLogsQueryService(
    input.scheduledTaskRunLogReadModel,
    clock,
  );
  const listServers = new ListServersQueryService(input.serverReadModel);
  const showServer = new ShowServerQueryService(
    input.serverReadModel,
    input.deploymentReadModel,
    input.domainBindingReadModel,
    clock,
  );
  const listSshCredentials = new ListSshCredentialsQueryService(input.sshCredentialReadModel);
  const showSshCredential = new ShowSshCredentialQueryService(
    input.sshCredentialReadModel,
    input.sshCredentialRepository,
    clock,
  );
  const listCertificates = new ListCertificatesQueryService(input.certificateReadModel);
  const showCertificate = new ShowCertificateQueryService(input.certificateReadModel);
  const listStorageVolumes = new ListStorageVolumesQueryService(
    input.storageVolumeReadModel,
    clock,
  );
  const showStorageVolume = new ShowStorageVolumeQueryService(input.storageVolumeReadModel, clock);
  const listSourceEvents = new ListSourceEventsQueryService(input.sourceEventReadModel, clock);
  const showSourceEvent = new ShowSourceEventQueryService(input.sourceEventReadModel);
  const sourceLinks = new SourceLinkQueryService(
    input.sourceLinkReadModel,
    input.sourceLinkRepository,
  );

  return {
    execute: async <T>(context: ExecutionContext, query: Query<T>): Promise<Result<T>> => {
      if (query instanceof ListProjectsQuery) {
        return (await listProjects.execute(context, query)) as Result<T>;
      }
      if (query instanceof ShowProjectQuery) {
        return (await showProject.execute(context, query)) as Result<T>;
      }
      if (query instanceof ListEnvironmentsQuery) {
        return ok((await listEnvironments.execute(context, query)) as T);
      }
      if (query instanceof ShowEnvironmentQuery) {
        return (await showEnvironment.execute(context, query.environmentId)) as Result<T>;
      }
      if (query instanceof ListPreviewEnvironmentsQuery) {
        return (await listPreviewEnvironments.execute(context, query)) as Result<T>;
      }
      if (query instanceof ShowPreviewEnvironmentQuery) {
        return (await showPreviewEnvironment.execute(context, query)) as Result<T>;
      }
      if (query instanceof ListResourcesQuery) {
        return ok((await listResources.execute(context, query)) as T);
      }
      if (query instanceof ShowResourceQuery) {
        return (await showResource.execute(context, query)) as Result<T>;
      }
      if (query instanceof ListResourceDependencyBindingsQuery) {
        return (await listResourceDependencyBindings.execute(context, {
          resourceId: query.resourceId,
        })) as Result<T>;
      }
      if (query instanceof ShowResourceDependencyBindingQuery) {
        return (await showResourceDependencyBinding.execute(context, {
          resourceId: query.resourceId,
          bindingId: query.bindingId,
        })) as Result<T>;
      }
      if (query instanceof ListDependencyResourcesQuery) {
        return (await listDependencyResources.execute(context, query)) as Result<T>;
      }
      if (query instanceof ShowDependencyResourceQuery) {
        return (await showDependencyResource.execute(context, query)) as Result<T>;
      }
      if (query instanceof ListDependencyResourceBackupsQuery) {
        return (await listDependencyResourceBackups.execute(context, query)) as Result<T>;
      }
      if (query instanceof ShowDependencyResourceBackupQuery) {
        return (await showDependencyResourceBackup.execute(context, query)) as Result<T>;
      }
      if (query instanceof ListDependencyResourceBackupPoliciesQuery) {
        return (await listDependencyResourceBackupPolicies.execute(context, {
          ...(query.dependencyResourceId
            ? { dependencyResourceId: query.dependencyResourceId }
            : {}),
          enabledOnly: query.enabledOnly,
          ...(query.dueAt ? { dueAt: query.dueAt } : {}),
        })) as Result<T>;
      }
      if (query instanceof ShowDependencyResourceBackupPolicyQuery) {
        return (await showDependencyResourceBackupPolicy.execute(context, query)) as Result<T>;
      }
      if (query instanceof ListDeploymentsQuery) {
        return ok((await listDeployments.execute(context, query)) as T);
      }
      if (query instanceof ShowDeploymentQuery) {
        return (await showDeployment.execute(context, query)) as Result<T>;
      }
      if (query instanceof ListDeployTokensQuery) {
        return ok((await listDeployTokens.execute(context, query)) as T);
      }
      if (query instanceof ShowDeployTokenQuery) {
        return (await showDeployToken.execute(context, query)) as Result<T>;
      }
      if (query instanceof ListDomainBindingsQuery) {
        return ok(
          (await listDomainBindings.execute(context, {
            ...(query.projectId ? { projectId: query.projectId } : {}),
            ...(query.environmentId ? { environmentId: query.environmentId } : {}),
            ...(query.resourceId ? { resourceId: query.resourceId } : {}),
          })) as T,
        );
      }
      if (query instanceof ShowDomainBindingQuery) {
        return (await showDomainBinding.execute(context, query)) as Result<T>;
      }
      if (query instanceof ListRetentionDefaultsQuery) {
        return (await listRetentionDefaults.execute(context, query.input)) as Result<T>;
      }
      if (query instanceof ShowRetentionDefaultQuery) {
        return (await showRetentionDefault.execute(context, query.input)) as Result<T>;
      }
      if (query instanceof ListScheduledTasksQuery) {
        return ok(
          (await listScheduledTasks.execute(context, {
            ...(query.projectId ? { projectId: query.projectId } : {}),
            ...(query.environmentId ? { environmentId: query.environmentId } : {}),
            ...(query.resourceId ? { resourceId: query.resourceId } : {}),
            ...(query.status ? { status: query.status } : {}),
            ...(query.limit ? { limit: query.limit } : {}),
            ...(query.cursor ? { cursor: query.cursor } : {}),
          })) as T,
        );
      }
      if (query instanceof ShowScheduledTaskQuery) {
        return (await showScheduledTask.execute(context, {
          taskId: query.taskId,
          ...(query.resourceId ? { resourceId: query.resourceId } : {}),
        })) as Result<T>;
      }
      if (query instanceof ListScheduledTaskRunsQuery) {
        return ok(
          (await listScheduledTaskRuns.execute(context, {
            ...(query.taskId ? { taskId: query.taskId } : {}),
            ...(query.resourceId ? { resourceId: query.resourceId } : {}),
            ...(query.status ? { status: query.status } : {}),
            ...(query.triggerKind ? { triggerKind: query.triggerKind } : {}),
            ...(query.limit ? { limit: query.limit } : {}),
            ...(query.cursor ? { cursor: query.cursor } : {}),
          })) as T,
        );
      }
      if (query instanceof ShowScheduledTaskRunQuery) {
        return (await showScheduledTaskRun.execute(context, {
          runId: query.runId,
          ...(query.taskId ? { taskId: query.taskId } : {}),
          ...(query.resourceId ? { resourceId: query.resourceId } : {}),
        })) as Result<T>;
      }
      if (query instanceof ScheduledTaskRunLogsQuery) {
        return ok(
          (await scheduledTaskRunLogs.execute(context, {
            runId: query.runId,
            ...(query.taskId ? { taskId: query.taskId } : {}),
            ...(query.resourceId ? { resourceId: query.resourceId } : {}),
            ...(query.cursor ? { cursor: query.cursor } : {}),
            ...(query.limit ? { limit: query.limit } : {}),
          })) as T,
        );
      }
      if (query instanceof ListServersQuery) {
        return ok((await listServers.execute(context, query)) as T);
      }
      if (query instanceof ShowServerQuery) {
        return (await showServer.execute(context, query)) as Result<T>;
      }
      if (query instanceof ListSshCredentialsQuery) {
        return ok((await listSshCredentials.execute(context, query)) as T);
      }
      if (query instanceof ShowSshCredentialQuery) {
        return (await showSshCredential.execute(context, query)) as Result<T>;
      }
      if (query instanceof ListCertificatesQuery) {
        return ok((await listCertificates.execute(context, query)) as T);
      }
      if (query instanceof ShowCertificateQuery) {
        return (await showCertificate.execute(context, query)) as Result<T>;
      }
      if (query instanceof ListStorageVolumesQuery) {
        return (await listStorageVolumes.execute(context, query)) as Result<T>;
      }
      if (query instanceof ShowStorageVolumeQuery) {
        return (await showStorageVolume.execute(context, query)) as Result<T>;
      }
      if (query instanceof ListSourceEventsQuery) {
        return (await listSourceEvents.execute(context, query)) as Result<T>;
      }
      if (query instanceof ShowSourceEventQuery) {
        return (await showSourceEvent.execute(context, query)) as Result<T>;
      }
      if (query instanceof ListSourceLinksQuery) {
        return (await sourceLinks.list(context, query)) as Result<T>;
      }
      if (query instanceof ShowSourceLinkQuery) {
        return (await sourceLinks.show(context, query)) as Result<T>;
      }

      throw new Error(`Unexpected query ${query.constructor.name}`);
    },
  } as QueryBus;
}

function createOrganizationRepositoryContext(input: { organizationId: string; userId: string }) {
  return toRepositoryContext(
    createExecutionContext({
      entrypoint: "system",
      requestId: `req_seed_${input.organizationId}_${input.userId}`,
      principal: {
        kind: "user",
        actorId: input.userId,
        userId: input.userId,
        activeOrganization: {
          organizationId: input.organizationId,
          role: "owner",
          productRole: "owner",
        },
      },
    }),
  );
}

async function seedProjectTree(input: {
  dependencyResourceRepository: PgDependencyResourceRepository;
  environmentRepository: PgEnvironmentRepository;
  projectRepository: PgProjectRepository;
  resourceRepository: PgResourceRepository;
  organizationId: string;
  projectId: string;
  projectName: string;
  environmentId: string;
  resourceId: string;
  resourceName: string;
  dependencyResourceId: string;
  dependencyResourceName: string;
}) {
  const context = toRepositoryContext(
    createExecutionContext({
      entrypoint: "system",
      requestId: `req_seed_${input.projectId}`,
    }),
  );
  const createdAt = CreatedAt.rehydrate("2026-01-01T00:00:00.000Z");
  const project = Project.create({
    id: ProjectId.rehydrate(input.projectId),
    organizationId: OrganizationId.rehydrate(input.organizationId),
    name: ProjectName.rehydrate(input.projectName),
    createdAt,
  })._unsafeUnwrap();
  const environment = Environment.create({
    id: EnvironmentId.rehydrate(input.environmentId),
    projectId: ProjectId.rehydrate(input.projectId),
    name: EnvironmentName.rehydrate("Production"),
    kind: EnvironmentKindValue.rehydrate("production"),
    createdAt,
  })._unsafeUnwrap();
  const resource = Resource.create({
    id: ResourceId.rehydrate(input.resourceId),
    projectId: ProjectId.rehydrate(input.projectId),
    environmentId: EnvironmentId.rehydrate(input.environmentId),
    name: ResourceName.rehydrate(input.resourceName),
    kind: ResourceKindValue.rehydrate("application"),
    createdAt,
  })._unsafeUnwrap();
  const dependencyResource = ResourceInstance.createPostgresDependencyResource({
    id: ResourceInstanceId.rehydrate(input.dependencyResourceId),
    projectId: ProjectId.rehydrate(input.projectId),
    environmentId: EnvironmentId.rehydrate(input.environmentId),
    name: ResourceInstanceName.rehydrate(input.dependencyResourceName),
    kind: ResourceInstanceKindValue.rehydrate("postgres"),
    sourceMode: DependencyResourceSourceModeValue.rehydrate("imported-external"),
    providerKey: ProviderKey.rehydrate("external-postgres"),
    endpoint: {
      host: `${input.projectId}.db.example.test`,
      port: 5432,
      databaseName: "app",
      maskedConnection: `postgres://app:********@${input.projectId}.db.example.test:5432/app`,
    },
    providerManaged: false,
    createdAt,
  })._unsafeUnwrap();

  await input.projectRepository.upsert(context, project, UpsertProjectSpec.fromProject(project));
  await input.environmentRepository.upsert(
    context,
    environment,
    UpsertEnvironmentSpec.fromEnvironment(environment),
  );
  await input.resourceRepository.upsert(
    context,
    resource,
    UpsertResourceSpec.fromResource(resource),
  );
  await input.dependencyResourceRepository.upsert(
    context,
    dependencyResource,
    UpsertResourceInstanceSpec.fromResourceInstance(dependencyResource),
  );
}

async function seedServer(input: {
  serverRepository: PgServerRepository;
  organizationId: string;
  userId: string;
  serverId: string;
  serverName: string;
  host: string;
}) {
  const context = createOrganizationRepositoryContext({
    organizationId: input.organizationId,
    userId: input.userId,
  });
  const server = DeploymentTarget.register({
    id: DeploymentTargetId.rehydrate(input.serverId),
    name: DeploymentTargetName.rehydrate(input.serverName),
    host: HostAddress.rehydrate(input.host),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();

  await input.serverRepository.upsert(
    context,
    server,
    UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
  );
}

async function seedSshCredential(input: {
  sshCredentialRepository: PgSshCredentialRepository;
  organizationId: string;
  userId: string;
  credentialId: string;
  credentialName: string;
}) {
  const context = createOrganizationRepositoryContext({
    organizationId: input.organizationId,
    userId: input.userId,
  });
  const credential = SshCredential.create({
    id: SshCredentialId.rehydrate(input.credentialId),
    name: SshCredentialName.rehydrate(input.credentialName),
    kind: DeploymentTargetCredentialKindValue.rehydrate("ssh-private-key"),
    privateKey: SshPrivateKeyText.rehydrate("TEST_PRIVATE_KEY"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();

  await input.sshCredentialRepository.upsert(
    context,
    credential,
    UpsertSshCredentialSpec.fromSshCredential(credential),
  );
}

async function seedTenantAuxiliaryRecords(db: Kysely<Database>) {
  await db
    .insertInto("destinations")
    .values([
      {
        id: "dst_alpha_tenant",
        server_id: "srv_alpha_tenant",
        name: "alpha-main",
        kind: "docker",
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "dst_beta_tenant",
        server_id: "srv_beta_tenant",
        name: "beta-main",
        kind: "docker",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ])
    .execute();

  await db
    .insertInto("domain_bindings")
    .values([
      {
        id: "dom_alpha_tenant",
        project_id: "prj_alpha_tenant",
        environment_id: "env_alpha_tenant",
        resource_id: "res_alpha_tenant",
        server_id: "srv_alpha_tenant",
        destination_id: "dst_alpha_tenant",
        domain_name: "alpha.example.test",
        path_prefix: "/",
        proxy_kind: "traefik",
        tls_mode: "auto",
        redirect_to: null,
        redirect_status: null,
        certificate_policy: "auto",
        status: "ready",
        verification_attempts: [],
        dns_observation: null,
        route_failure: null,
        idempotency_key: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "dom_beta_tenant",
        project_id: "prj_beta_tenant",
        environment_id: "env_beta_tenant",
        resource_id: "res_beta_tenant",
        server_id: "srv_beta_tenant",
        destination_id: "dst_beta_tenant",
        domain_name: "beta.example.test",
        path_prefix: "/",
        proxy_kind: "traefik",
        tls_mode: "auto",
        redirect_to: null,
        redirect_status: null,
        certificate_policy: "auto",
        status: "ready",
        verification_attempts: [],
        dns_observation: null,
        route_failure: null,
        idempotency_key: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ])
    .execute();

  await db
    .insertInto("certificates")
    .values([
      {
        id: "cert_alpha_tenant",
        domain_binding_id: "dom_alpha_tenant",
        domain_name: "alpha.example.test",
        status: "active",
        source: "managed",
        provider_key: "test-acme",
        challenge_type: "http-01",
        issued_at: null,
        expires_at: null,
        fingerprint: null,
        secret_ref: null,
        safe_metadata: {},
        secret_refs: {},
        attempts: [],
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "cert_beta_tenant",
        domain_binding_id: "dom_beta_tenant",
        domain_name: "beta.example.test",
        status: "active",
        source: "managed",
        provider_key: "test-acme",
        challenge_type: "http-01",
        issued_at: null,
        expires_at: null,
        fingerprint: null,
        secret_ref: null,
        safe_metadata: {},
        secret_refs: {},
        attempts: [],
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ])
    .execute();

  await db
    .insertInto("source_links")
    .values([
      {
        source_fingerprint: "github:alpha/repo:main",
        project_id: "prj_alpha_tenant",
        environment_id: "env_alpha_tenant",
        resource_id: "res_alpha_tenant",
        server_id: "srv_alpha_tenant",
        destination_id: "dst_alpha_tenant",
        updated_at: "2026-01-01T00:00:00.000Z",
        reason: "tenant-test",
        metadata: {},
      },
      {
        source_fingerprint: "github:beta/repo:main",
        project_id: "prj_beta_tenant",
        environment_id: "env_beta_tenant",
        resource_id: "res_beta_tenant",
        server_id: "srv_beta_tenant",
        destination_id: "dst_beta_tenant",
        updated_at: "2026-01-01T00:00:00.000Z",
        reason: "tenant-test",
        metadata: {},
      },
    ])
    .execute();

  await db
    .insertInto("resource_dependency_bindings")
    .values([
      resourceDependencyBindingRow({
        id: "rdb_alpha_tenant",
        projectId: "prj_alpha_tenant",
        environmentId: "env_alpha_tenant",
        resourceId: "res_alpha_tenant",
        dependencyResourceId: "rsi_alpha_tenant",
        targetName: "DATABASE_URL",
      }),
      resourceDependencyBindingRow({
        id: "rdb_beta_tenant",
        projectId: "prj_beta_tenant",
        environmentId: "env_beta_tenant",
        resourceId: "res_beta_tenant",
        dependencyResourceId: "rsi_beta_tenant",
        targetName: "DATABASE_URL",
      }),
    ])
    .execute();

  await db
    .insertInto("source_events")
    .values([
      sourceEventRow({
        id: "sev_alpha_tenant",
        projectId: "prj_alpha_tenant",
        resourceId: "res_alpha_tenant",
        repositoryFullName: "alpha/repo",
      }),
      sourceEventRow({
        id: "sev_beta_tenant",
        projectId: "prj_beta_tenant",
        resourceId: "res_beta_tenant",
        repositoryFullName: "beta/repo",
      }),
    ])
    .execute();

  await db
    .insertInto("preview_environments")
    .values([
      previewEnvironmentRow({
        id: "prenv_alpha_tenant",
        projectId: "prj_alpha_tenant",
        environmentId: "env_alpha_tenant",
        resourceId: "res_alpha_tenant",
        serverId: "srv_alpha_tenant",
        destinationId: "dst_alpha_tenant",
        repositoryFullName: "alpha/repo",
        pullRequestNumber: 10,
      }),
      previewEnvironmentRow({
        id: "prenv_beta_tenant",
        projectId: "prj_beta_tenant",
        environmentId: "env_beta_tenant",
        resourceId: "res_beta_tenant",
        serverId: "srv_beta_tenant",
        destinationId: "dst_beta_tenant",
        repositoryFullName: "beta/repo",
        pullRequestNumber: 20,
      }),
    ])
    .execute();

  await db
    .insertInto("scheduled_task_definitions")
    .values([
      scheduledTaskRow("tsk_alpha_tenant", "res_alpha_tenant"),
      scheduledTaskRow("tsk_beta_tenant", "res_beta_tenant"),
    ])
    .execute();

  await db
    .insertInto("scheduled_task_run_attempts")
    .values([
      scheduledTaskRunRow("str_alpha_tenant", "tsk_alpha_tenant", "res_alpha_tenant"),
      scheduledTaskRunRow("str_beta_tenant", "tsk_beta_tenant", "res_beta_tenant"),
    ])
    .execute();

  await db
    .insertInto("scheduled_task_run_logs")
    .values([
      scheduledTaskRunLogRow(
        "stl_alpha_tenant",
        "str_alpha_tenant",
        "tsk_alpha_tenant",
        "res_alpha_tenant",
      ),
      scheduledTaskRunLogRow(
        "stl_beta_tenant",
        "str_beta_tenant",
        "tsk_beta_tenant",
        "res_beta_tenant",
      ),
    ])
    .execute();

  await db
    .insertInto("storage_volumes")
    .values([
      {
        id: "stv_alpha_tenant",
        project_id: "prj_alpha_tenant",
        environment_id: "env_alpha_tenant",
        name: "Alpha storage",
        slug: "alpha-storage",
        kind: "named-volume",
        source_path: null,
        description: null,
        backup_relationship: null,
        lifecycle_status: "active",
        created_at: "2026-01-01T00:00:00.000Z",
        deleted_at: null,
      },
      {
        id: "stv_beta_tenant",
        project_id: "prj_beta_tenant",
        environment_id: "env_beta_tenant",
        name: "Beta storage",
        slug: "beta-storage",
        kind: "named-volume",
        source_path: null,
        description: null,
        backup_relationship: null,
        lifecycle_status: "active",
        created_at: "2026-01-01T00:00:00.000Z",
        deleted_at: null,
      },
    ])
    .execute();

  await db
    .insertInto("deployments")
    .values([
      deploymentRow({
        id: "dep_alpha_tenant",
        projectId: "prj_alpha_tenant",
        environmentId: "env_alpha_tenant",
        resourceId: "res_alpha_tenant",
        serverId: "srv_alpha_tenant",
        destinationId: "dst_alpha_tenant",
      }),
      deploymentRow({
        id: "dep_beta_tenant",
        projectId: "prj_beta_tenant",
        environmentId: "env_beta_tenant",
        resourceId: "res_beta_tenant",
        serverId: "srv_beta_tenant",
        destinationId: "dst_beta_tenant",
      }),
    ])
    .execute();

  await db
    .insertInto("dependency_resource_backups")
    .values([
      {
        id: "drb_alpha_tenant",
        dependency_resource_id: "rsi_alpha_tenant",
        project_id: "prj_alpha_tenant",
        environment_id: "env_alpha_tenant",
        dependency_kind: "postgres",
        provider_key: "external-postgres",
        status: "ready",
        attempt_id: "attempt_alpha_tenant",
        requested_at: "2026-01-01T00:00:00.000Z",
        retention_status: "retained",
        provider_artifact_handle: "artifact-alpha",
        completed_at: "2026-01-01T00:01:00.000Z",
        failed_at: null,
        failure_code: null,
        failure_message: null,
        latest_restore_attempt: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "drb_beta_tenant",
        dependency_resource_id: "rsi_beta_tenant",
        project_id: "prj_beta_tenant",
        environment_id: "env_beta_tenant",
        dependency_kind: "postgres",
        provider_key: "external-postgres",
        status: "ready",
        attempt_id: "attempt_beta_tenant",
        requested_at: "2026-01-01T00:00:00.000Z",
        retention_status: "retained",
        provider_artifact_handle: "artifact-beta",
        completed_at: "2026-01-01T00:01:00.000Z",
        failed_at: null,
        failure_code: null,
        failure_message: null,
        latest_restore_attempt: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ])
    .execute();

  await db
    .insertInto("dependency_resource_backup_policies")
    .values([
      {
        id: "dbp_alpha_tenant",
        version: "v1",
        dependency_resource_id: "rsi_alpha_tenant",
        retention_days: 14,
        schedule_interval_hours: 6,
        provider_key: "external-postgres",
        retry_on_failure: true,
        enabled: true,
        last_run_at: null,
        next_run_at: "2026-01-02T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "dbp_beta_tenant",
        version: "v1",
        dependency_resource_id: "rsi_beta_tenant",
        retention_days: 7,
        schedule_interval_hours: 12,
        provider_key: "external-postgres",
        retry_on_failure: true,
        enabled: true,
        last_run_at: null,
        next_run_at: "2026-01-02T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ])
    .execute();

  await db
    .insertInto("deploy_tokens")
    .values([
      deployTokenRow("dpt_alpha_tenant", "org_alpha", "sha256:alpha-tenant"),
      deployTokenRow("dpt_beta_tenant", "org_beta", "sha256:beta-tenant"),
    ])
    .execute();

  await db
    .insertInto("retention_defaults")
    .values([
      {
        id: "rdf_system_tenant",
        scope: "system",
        organization_id: null,
        category: "domain-event-streams",
        retention_days: 30,
        dry_run_scheduling_enabled: true,
        destructive_scheduling_enabled: false,
        enabled: true,
        updated_at: "2026-01-01T00:00:00.000Z",
        updated_by_actor_id: "system",
        updated_by_actor_kind: "system",
      },
      {
        id: "rdf_alpha_tenant",
        scope: "organization",
        organization_id: "org_alpha",
        category: "provider-job-logs",
        retention_days: 14,
        dry_run_scheduling_enabled: true,
        destructive_scheduling_enabled: false,
        enabled: true,
        updated_at: "2026-01-01T00:00:00.000Z",
        updated_by_actor_id: "usr_alpha_owner",
        updated_by_actor_kind: "user",
      },
      {
        id: "rdf_beta_tenant",
        scope: "organization",
        organization_id: "org_beta",
        category: "provider-job-logs",
        retention_days: 7,
        dry_run_scheduling_enabled: true,
        destructive_scheduling_enabled: false,
        enabled: true,
        updated_at: "2026-01-01T00:00:00.000Z",
        updated_by_actor_id: "usr_beta_owner",
        updated_by_actor_kind: "user",
      },
    ])
    .execute();
}

function deploymentRow(input: {
  destinationId: string;
  environmentId: string;
  id: string;
  projectId: string;
  resourceId: string;
  serverId: string;
}) {
  return {
    id: input.id,
    project_id: input.projectId,
    environment_id: input.environmentId,
    resource_id: input.resourceId,
    server_id: input.serverId,
    destination_id: input.destinationId,
    status: "succeeded",
    runtime_plan: {
      id: `plan_${input.id}`,
      source: {
        kind: "local-folder",
        locator: ".",
        displayName: "workspace",
      },
      buildStrategy: "workspace-commands",
      packagingMode: "host-process-runtime",
      execution: {
        kind: "host-process",
        port: 3000,
        metadata: {},
      },
      target: {
        kind: "single-server",
        providerKey: "generic-ssh",
        serverIds: [input.serverId],
      },
      detectSummary: "tenant matrix",
      generatedAt: "2026-01-01T00:00:00.000Z",
      steps: ["deploy"],
    },
    environment_snapshot: {
      id: `snap_${input.id}`,
      environmentId: input.environmentId,
      createdAt: "2026-01-01T00:00:00.000Z",
      precedence: ["environment"],
      variables: [],
    },
    timeline: [],
    created_at: "2026-01-01T00:00:00.000Z",
    started_at: "2026-01-01T00:00:00.000Z",
    finished_at: "2026-01-01T00:01:00.000Z",
    rollback_of_deployment_id: null,
    archived_at: null,
  };
}

function resourceDependencyBindingRow(input: {
  dependencyResourceId: string;
  environmentId: string;
  id: string;
  projectId: string;
  resourceId: string;
  targetName: string;
}) {
  return {
    id: input.id,
    project_id: input.projectId,
    environment_id: input.environmentId,
    resource_id: input.resourceId,
    dependency_resource_id: input.dependencyResourceId,
    target_name: input.targetName,
    scope: "environment",
    injection_mode: "env",
    secret_ref: `secret:${input.id}`,
    secret_version: "v1",
    secret_rotated_at: null,
    lifecycle_status: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    removed_at: null,
  };
}

function sourceEventRow(input: {
  id: string;
  projectId: string;
  repositoryFullName: string;
  resourceId: string;
}) {
  return {
    id: input.id,
    project_id: input.projectId,
    source_kind: "github",
    event_kind: "push",
    source_identity: {
      locator: `https://github.com/${input.repositoryFullName}`,
      repositoryFullName: input.repositoryFullName,
    },
    ref: "refs/heads/main",
    revision: `${input.id}_revision`,
    delivery_id: `${input.id}_delivery`,
    idempotency_key: null,
    dedupe_key: `${input.id}_dedupe`,
    dedupe_status: "new",
    dedupe_of_source_event_id: null,
    verification: {
      status: "verified",
      method: "provider-signature",
      keyVersion: "test",
    },
    status: "dispatched",
    matched_resource_ids: [input.resourceId],
    ignored_reasons: [],
    policy_results: [],
    created_deployment_ids: [],
    received_at: "2026-01-01T00:00:00.000Z",
  };
}

function previewEnvironmentRow(input: {
  destinationId: string;
  environmentId: string;
  id: string;
  projectId: string;
  pullRequestNumber: number;
  repositoryFullName: string;
  resourceId: string;
  serverId: string;
}) {
  return {
    id: input.id,
    project_id: input.projectId,
    environment_id: input.environmentId,
    resource_id: input.resourceId,
    server_id: input.serverId,
    destination_id: input.destinationId,
    provider: "github",
    repository_full_name: input.repositoryFullName,
    head_repository_full_name: input.repositoryFullName,
    pull_request_number: input.pullRequestNumber,
    head_sha: `${input.id}_sha`,
    base_ref: "main",
    source_binding_fingerprint: `${input.id}_fingerprint`,
    status: "active",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    expires_at: null,
  };
}

function scheduledTaskRow(id: string, resourceId: string) {
  return {
    id,
    resource_id: resourceId,
    schedule: "0 * * * *",
    timezone: "UTC",
    command_intent: "backup",
    timeout_seconds: 300,
    retry_limit: 1,
    concurrency_policy: "forbid",
    status: "enabled",
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

function scheduledTaskRunRow(id: string, taskId: string, resourceId: string) {
  return {
    id,
    task_id: taskId,
    resource_id: resourceId,
    trigger_kind: "scheduled",
    status: "succeeded",
    created_at: "2026-01-01T00:01:00.000Z",
    started_at: "2026-01-01T00:01:00.000Z",
    finished_at: "2026-01-01T00:02:00.000Z",
    exit_code: 0,
    failure_summary: null,
    skipped_reason: null,
  };
}

function scheduledTaskRunLogRow(id: string, runId: string, taskId: string, resourceId: string) {
  return {
    id,
    run_id: runId,
    task_id: taskId,
    resource_id: resourceId,
    logged_at: "2026-01-01T00:01:30.000Z",
    stream: "stdout",
    message: `${id} ok`,
  };
}

function deployTokenRow(id: string, organizationId: string, verifierDigest: string) {
  return {
    id,
    organization_id: organizationId,
    display_name: `${organizationId} deploy token`,
    verifier_digest: verifierDigest,
    secret_suffix: "abcd1234",
    status: "active",
    scope: {
      deploymentTargetIds: [],
      environmentIds: [],
      projectIds: [],
      repositoryFullNames: [],
      resourceIds: [],
      workflowCommands: ["source-link-deploy"],
    },
    created_at: "2026-01-01T00:00:00.000Z",
    expires_at: null,
    last_used_at: null,
    rotated_at: null,
    revoked_at: null,
  };
}

async function getJson(app: Elysia, path: string, session: string): Promise<unknown> {
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method: "GET",
      headers: {
        cookie: `session=${session}`,
      },
    }),
  );

  const body = await response.text();
  expect(response.status, body).toBe(200);
  return JSON.parse(body) as unknown;
}

async function getStatus(app: Elysia, path: string, session: string): Promise<number> {
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method: "GET",
      headers: {
        cookie: `session=${session}`,
      },
    }),
  );
  return response.status;
}

function itemIds(response: unknown): string[] {
  expect(response).toEqual(
    expect.objectContaining({
      items: expect.any(Array),
    }),
  );
  return (response as { items: Array<{ id: string }> }).items.map((item) => item.id);
}

function sourceFingerprints(response: unknown): string[] {
  expect(response).toEqual(
    expect.objectContaining({
      items: expect.any(Array),
    }),
  );
  return (response as { items: Array<{ sourceFingerprint: string }> }).items.map(
    (item) => item.sourceFingerprint,
  );
}

function tokenIds(response: unknown): string[] {
  expect(response).toEqual(
    expect.objectContaining({
      items: expect.any(Array),
    }),
  );
  return (response as { items: Array<{ tokenId: string }> }).items.map((item) => item.tokenId);
}

function previewEnvironmentIds(response: unknown): string[] {
  expect(response).toEqual(
    expect.objectContaining({
      items: expect.any(Array),
    }),
  );
  return (response as { items: Array<{ previewEnvironmentId: string }> }).items.map(
    (item) => item.previewEnvironmentId,
  );
}

function sourceEventIds(response: unknown): string[] {
  expect(response).toEqual(
    expect.objectContaining({
      items: expect.any(Array),
    }),
  );
  return (response as { items: Array<{ sourceEventId: string }> }).items.map(
    (item) => item.sourceEventId,
  );
}

function taskIds(response: unknown): string[] {
  expect(response).toEqual(
    expect.objectContaining({
      items: expect.any(Array),
    }),
  );
  return (response as { items: Array<{ taskId: string }> }).items.map((item) => item.taskId);
}

function runIds(response: unknown): string[] {
  expect(response).toEqual(
    expect.objectContaining({
      items: expect.any(Array),
    }),
  );
  return (response as { items: Array<{ runId: string }> }).items.map((item) => item.runId);
}

describe("tenant isolation over product HTTP routes", () => {
  test("[TENANT-HTTP-001] scopes project and resource lists by active organization even without query parameters", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "appaloft-orpc-tenant-isolation-"));
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: dataDir,
    });

    try {
      const migrationResult = await createMigrator(database.db).migrateToLatest();
      expect(migrationResult.error).toBeUndefined();

      const projectRepository = new PgProjectRepository(database.db);
      const projectReadModel = new PgProjectReadModel(database.db);
      const environmentRepository = new PgEnvironmentRepository(database.db);
      const environmentReadModel = new PgEnvironmentReadModel(database.db);
      const previewEnvironmentReadModel = new PgPreviewEnvironmentReadModel(database.db);
      const resourceRepository = new PgResourceRepository(database.db);
      const resourceReadModel = new PgResourceReadModel(database.db);
      const resourceDependencyBindingReadModel = new PgResourceDependencyBindingReadModel(
        database.db,
      );
      const dependencyResourceBackupPolicyRepository =
        new PgDependencyResourceBackupPolicyRepository(database.db);
      const dependencyResourceBackupReadModel = new PgDependencyResourceBackupReadModel(
        database.db,
      );
      const dependencyResourceRepository = new PgDependencyResourceRepository(database.db);
      const dependencyResourceReadModel = new PgDependencyResourceReadModel(database.db);
      const deployTokenReadModel = new PgDeployTokenReadModel(database.db);
      const deploymentReadModel = new PgDeploymentReadModel(database.db);
      const destinationRepository = new PgDestinationRepository(database.db);
      const domainBindingReadModel = new PgDomainBindingReadModel(database.db);
      const retentionDefaultRepository = new PgRetentionDefaultRepository(database.db);
      const scheduledTaskReadModel = new PgScheduledTaskReadModel(database.db);
      const scheduledTaskRunLogReadModel = new PgScheduledTaskRunLogReadModel(database.db);
      const scheduledTaskRunReadModel = new PgScheduledTaskRunReadModel(database.db);
      const serverRepository = new PgServerRepository(database.db);
      const serverReadModel = new PgServerReadModel(database.db);
      const sshCredentialRepository = new PgSshCredentialRepository(database.db);
      const sshCredentialReadModel = new PgSshCredentialReadModel(database.db);
      const certificateReadModel = new PgCertificateReadModel(database.db);
      const sourceEventReadModel = new PgSourceEventRepository(database.db);
      const sourceLinkRepository = new PgSourceLinkRepository(database.db);
      const sourceLinkReadModel = new PgSourceLinkReadModel(database.db);
      const storageVolumeReadModel = new PgStorageVolumeReadModel(database.db);

      await seedProjectTree({
        dependencyResourceRepository,
        environmentRepository,
        projectRepository,
        resourceRepository,
        organizationId: "org_alpha",
        projectId: "prj_alpha_tenant",
        projectName: "Alpha Project",
        environmentId: "env_alpha_tenant",
        resourceId: "res_alpha_tenant",
        resourceName: "Alpha API",
        dependencyResourceId: "rsi_alpha_tenant",
        dependencyResourceName: "Alpha Database",
      });
      await seedProjectTree({
        dependencyResourceRepository,
        environmentRepository,
        projectRepository,
        resourceRepository,
        organizationId: "org_beta",
        projectId: "prj_beta_tenant",
        projectName: "Beta Project",
        environmentId: "env_beta_tenant",
        resourceId: "res_beta_tenant",
        resourceName: "Beta API",
        dependencyResourceId: "rsi_beta_tenant",
        dependencyResourceName: "Beta Database",
      });
      await seedServer({
        serverRepository,
        organizationId: "org_alpha",
        userId: "usr_alpha_owner",
        serverId: "srv_alpha_tenant",
        serverName: "Alpha Rack",
        host: "10.0.0.10",
      });
      await seedServer({
        serverRepository,
        organizationId: "org_beta",
        userId: "usr_beta_owner",
        serverId: "srv_beta_tenant",
        serverName: "Beta Rack",
        host: "10.0.1.10",
      });
      await seedSshCredential({
        sshCredentialRepository,
        organizationId: "org_alpha",
        userId: "usr_alpha_owner",
        credentialId: "sshcred_alpha_tenant",
        credentialName: "Alpha SSH key",
      });
      await seedSshCredential({
        sshCredentialRepository,
        organizationId: "org_beta",
        userId: "usr_beta_owner",
        credentialId: "sshcred_beta_tenant",
        credentialName: "Beta SSH key",
      });
      await seedTenantAuxiliaryRecords(database.db);

      const app = mountAppaloftOrpcRoutes(new Elysia(), {
        commandBus,
        executionContextFactory: new TestExecutionContextFactory(),
        logger: new NoopLogger(),
        productSessionAuthorizationPort: productSessionPort({
          alphaOwner: { userId: "usr_alpha_owner", organizationId: "org_alpha", role: "owner" },
          alphaDeveloper: { userId: "usr_alpha_developer", organizationId: "org_alpha" },
          betaOwner: { userId: "usr_beta_owner", organizationId: "org_beta", role: "owner" },
          multiAlpha: { userId: "usr_multi", organizationId: "org_alpha" },
          multiBeta: { userId: "usr_multi", organizationId: "org_beta" },
        }),
        queryBus: tenantQueryBus({
          certificateReadModel,
          dependencyResourceBackupPolicyRepository,
          dependencyResourceBackupReadModel,
          dependencyResourceReadModel,
          deployTokenReadModel,
          deploymentReadModel,
          destinationRepository,
          domainBindingReadModel,
          environmentReadModel,
          previewEnvironmentReadModel,
          projectReadModel,
          resourceDependencyBindingReadModel,
          resourceReadModel,
          resourceRepository,
          retentionDefaultRepository,
          scheduledTaskReadModel,
          scheduledTaskRunLogReadModel,
          scheduledTaskRunReadModel,
          serverReadModel,
          serverRepository,
          sourceEventReadModel,
          sourceLinkReadModel,
          sourceLinkRepository,
          sshCredentialReadModel,
          sshCredentialRepository,
          storageVolumeReadModel,
        }),
      });

      expect(itemIds(await getJson(app, "/api/projects", "alphaOwner"))).toEqual([
        "prj_alpha_tenant",
      ]);
      expect(await getStatus(app, "/api/projects/prj_alpha_tenant", "alphaOwner")).toBe(200);
      expect(itemIds(await getJson(app, "/api/resources", "alphaOwner"))).toEqual([
        "res_alpha_tenant",
      ]);
      expect(
        itemIds(
          await getJson(app, "/api/resources/res_alpha_tenant/dependency-bindings", "alphaOwner"),
        ),
      ).toEqual(["rdb_alpha_tenant"]);
      expect(
        await getStatus(
          app,
          "/api/resources/res_alpha_tenant/dependency-bindings/rdb_alpha_tenant",
          "alphaOwner",
        ),
      ).toBe(200);
      expect(itemIds(await getJson(app, "/api/environments", "alphaOwner"))).toEqual([
        "env_alpha_tenant",
      ]);
      expect(await getStatus(app, "/api/environments/env_alpha_tenant", "alphaOwner")).toBe(200);
      expect(await getStatus(app, "/api/resources/res_alpha_tenant", "alphaOwner")).toBe(200);
      expect(itemIds(await getJson(app, "/api/dependency-resources", "alphaOwner"))).toEqual([
        "rsi_alpha_tenant",
      ]);
      expect(await getStatus(app, "/api/dependency-resources/rsi_alpha_tenant", "alphaOwner")).toBe(
        200,
      );
      expect(
        itemIds(
          await getJson(app, "/api/dependency-resources/rsi_alpha_tenant/backups", "alphaOwner"),
        ),
      ).toEqual(["drb_alpha_tenant"]);
      expect(
        await getStatus(app, "/api/dependency-resources/backups/drb_alpha_tenant", "alphaOwner"),
      ).toBe(200);
      expect(
        itemIds(await getJson(app, "/api/dependency-resources/backup-policies", "alphaOwner")),
      ).toEqual(["dbp_alpha_tenant"]);
      expect(
        (await getJson(
          app,
          "/api/dependency-resources/backup-policies/dbp_alpha_tenant",
          "alphaOwner",
        )) as { policy: { id: string } | null },
      ).toEqual(
        expect.objectContaining({ policy: expect.objectContaining({ id: "dbp_alpha_tenant" }) }),
      );
      expect(itemIds(await getJson(app, "/api/servers", "alphaOwner"))).toEqual([
        "srv_alpha_tenant",
      ]);
      expect(
        await getStatus(app, "/api/servers/srv_alpha_tenant?includeRollups=false", "alphaOwner"),
      ).toBe(200);
      expect(itemIds(await getJson(app, "/api/credentials/ssh", "alphaOwner"))).toEqual([
        "sshcred_alpha_tenant",
      ]);
      expect(
        await getStatus(
          app,
          "/api/credentials/ssh/sshcred_alpha_tenant?includeUsage=false",
          "alphaOwner",
        ),
      ).toBe(200);
      expect(itemIds(await getJson(app, "/api/domain-bindings", "alphaOwner"))).toEqual([
        "dom_alpha_tenant",
      ]);
      expect(await getStatus(app, "/api/domain-bindings/dom_alpha_tenant", "alphaOwner")).toBe(200);
      expect(itemIds(await getJson(app, "/api/certificates", "alphaOwner"))).toEqual([
        "cert_alpha_tenant",
      ]);
      expect(await getStatus(app, "/api/certificates/cert_alpha_tenant", "alphaOwner")).toBe(200);
      expect(itemIds(await getJson(app, "/api/storage-volumes", "alphaOwner"))).toEqual([
        "stv_alpha_tenant",
      ]);
      expect(await getStatus(app, "/api/storage-volumes/stv_alpha_tenant", "alphaOwner")).toBe(200);
      expect(itemIds(await getJson(app, "/api/deployments", "alphaOwner"))).toEqual([
        "dep_alpha_tenant",
      ]);
      expect(
        await getStatus(
          app,
          "/api/deployments/dep_alpha_tenant?includeTimeline=false&includeSnapshot=false&includeRelatedContext=false&includeLatestFailure=false&includeRecoverySummary=false",
          "alphaOwner",
        ),
      ).toBe(200);
      expect(
        tokenIds(await getJson(app, "/api/deploy-tokens?organizationId=org_alpha", "alphaOwner")),
      ).toEqual(["dpt_alpha_tenant"]);
      expect(
        await getStatus(
          app,
          "/api/deploy-tokens/dpt_alpha_tenant?organizationId=org_alpha",
          "alphaOwner",
        ),
      ).toBe(200);
      expect(
        itemIds(
          await getJson(
            app,
            "/api/retention-defaults?scope=organization&organizationId=org_alpha",
            "alphaOwner",
          ),
        ),
      ).toEqual(["rdf_alpha_tenant"]);
      expect(
        (
          (await getJson(
            app,
            "/api/retention-defaults/provider-job-logs?scope=organization&organizationId=org_alpha",
            "alphaOwner",
          )) as { policy: { id: string } | null }
        ).policy?.id,
      ).toBe("rdf_alpha_tenant");
      expect(sourceFingerprints(await getJson(app, "/api/source-links", "alphaOwner"))).toEqual([
        "github:alpha/repo:main",
      ]);
      expect(
        sourceEventIds(
          await getJson(app, "/api/source-events?projectId=prj_alpha_tenant", "alphaOwner"),
        ),
      ).toEqual(["sev_alpha_tenant"]);
      expect(
        await getStatus(
          app,
          "/api/source-events/sev_alpha_tenant?projectId=prj_alpha_tenant",
          "alphaOwner",
        ),
      ).toBe(200);
      expect(
        previewEnvironmentIds(await getJson(app, "/api/preview-environments", "alphaOwner")),
      ).toEqual(["prenv_alpha_tenant"]);
      expect(
        await getStatus(
          app,
          "/api/preview-environments/prenv_alpha_tenant?projectId=prj_alpha_tenant",
          "alphaOwner",
        ),
      ).toBe(200);
      expect(taskIds(await getJson(app, "/api/scheduled-tasks", "alphaOwner"))).toEqual([
        "tsk_alpha_tenant",
      ]);
      expect(await getStatus(app, "/api/scheduled-tasks/tsk_alpha_tenant", "alphaOwner")).toBe(200);
      expect(runIds(await getJson(app, "/api/scheduled-task-runs", "alphaOwner"))).toEqual([
        "str_alpha_tenant",
      ]);
      expect(await getStatus(app, "/api/scheduled-task-runs/str_alpha_tenant", "alphaOwner")).toBe(
        200,
      );
      expect(
        await getJson(app, "/api/scheduled-task-runs/str_alpha_tenant/logs", "alphaOwner"),
      ).toEqual(
        expect.objectContaining({
          runId: "str_alpha_tenant",
          entries: [expect.objectContaining({ message: "stl_alpha_tenant ok" })],
        }),
      );
      expect(
        await getJson(app, "/api/source-links/github%3Aalpha%2Frepo%3Amain", "alphaOwner"),
      ).toEqual(
        expect.objectContaining({
          sourceLink: expect.objectContaining({
            sourceFingerprint: "github:alpha/repo:main",
          }),
        }),
      );

      expect(itemIds(await getJson(app, "/api/projects", "betaOwner"))).toEqual([
        "prj_beta_tenant",
      ]);
      expect(await getStatus(app, "/api/projects/prj_beta_tenant", "betaOwner")).toBe(200);
      expect(itemIds(await getJson(app, "/api/resources", "betaOwner"))).toEqual([
        "res_beta_tenant",
      ]);
      expect(
        itemIds(
          await getJson(app, "/api/resources/res_beta_tenant/dependency-bindings", "betaOwner"),
        ),
      ).toEqual(["rdb_beta_tenant"]);
      expect(
        await getStatus(
          app,
          "/api/resources/res_beta_tenant/dependency-bindings/rdb_beta_tenant",
          "betaOwner",
        ),
      ).toBe(200);
      expect(itemIds(await getJson(app, "/api/environments", "betaOwner"))).toEqual([
        "env_beta_tenant",
      ]);
      expect(await getStatus(app, "/api/environments/env_beta_tenant", "betaOwner")).toBe(200);
      expect(await getStatus(app, "/api/resources/res_beta_tenant", "betaOwner")).toBe(200);
      expect(itemIds(await getJson(app, "/api/dependency-resources", "betaOwner"))).toEqual([
        "rsi_beta_tenant",
      ]);
      expect(await getStatus(app, "/api/dependency-resources/rsi_beta_tenant", "betaOwner")).toBe(
        200,
      );
      expect(
        itemIds(
          await getJson(app, "/api/dependency-resources/rsi_beta_tenant/backups", "betaOwner"),
        ),
      ).toEqual(["drb_beta_tenant"]);
      expect(
        itemIds(await getJson(app, "/api/dependency-resources/backup-policies", "betaOwner")),
      ).toEqual(["dbp_beta_tenant"]);
      expect(itemIds(await getJson(app, "/api/servers", "betaOwner"))).toEqual(["srv_beta_tenant"]);
      expect(
        await getStatus(app, "/api/servers/srv_beta_tenant?includeRollups=false", "betaOwner"),
      ).toBe(200);
      expect(itemIds(await getJson(app, "/api/credentials/ssh", "betaOwner"))).toEqual([
        "sshcred_beta_tenant",
      ]);
      expect(
        await getStatus(
          app,
          "/api/credentials/ssh/sshcred_beta_tenant?includeUsage=false",
          "betaOwner",
        ),
      ).toBe(200);
      expect(itemIds(await getJson(app, "/api/domain-bindings", "betaOwner"))).toEqual([
        "dom_beta_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/certificates", "betaOwner"))).toEqual([
        "cert_beta_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/storage-volumes", "betaOwner"))).toEqual([
        "stv_beta_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/deployments", "betaOwner"))).toEqual([
        "dep_beta_tenant",
      ]);
      expect(
        await getStatus(
          app,
          "/api/deployments/dep_beta_tenant?includeTimeline=false&includeSnapshot=false&includeRelatedContext=false&includeLatestFailure=false&includeRecoverySummary=false",
          "betaOwner",
        ),
      ).toBe(200);
      expect(
        tokenIds(await getJson(app, "/api/deploy-tokens?organizationId=org_beta", "betaOwner")),
      ).toEqual(["dpt_beta_tenant"]);
      expect(
        itemIds(
          await getJson(
            app,
            "/api/retention-defaults?scope=organization&organizationId=org_beta",
            "betaOwner",
          ),
        ),
      ).toEqual(["rdf_beta_tenant"]);
      expect(sourceFingerprints(await getJson(app, "/api/source-links", "betaOwner"))).toEqual([
        "github:beta/repo:main",
      ]);
      expect(
        sourceEventIds(
          await getJson(app, "/api/source-events?projectId=prj_beta_tenant", "betaOwner"),
        ),
      ).toEqual(["sev_beta_tenant"]);
      expect(
        await getStatus(
          app,
          "/api/source-events/sev_beta_tenant?projectId=prj_beta_tenant",
          "betaOwner",
        ),
      ).toBe(200);
      expect(
        previewEnvironmentIds(await getJson(app, "/api/preview-environments", "betaOwner")),
      ).toEqual(["prenv_beta_tenant"]);
      expect(
        await getStatus(
          app,
          "/api/preview-environments/prenv_beta_tenant?projectId=prj_beta_tenant",
          "betaOwner",
        ),
      ).toBe(200);
      expect(taskIds(await getJson(app, "/api/scheduled-tasks", "betaOwner"))).toEqual([
        "tsk_beta_tenant",
      ]);
      expect(await getStatus(app, "/api/scheduled-tasks/tsk_beta_tenant", "betaOwner")).toBe(200);
      expect(runIds(await getJson(app, "/api/scheduled-task-runs", "betaOwner"))).toEqual([
        "str_beta_tenant",
      ]);
      expect(await getStatus(app, "/api/scheduled-task-runs/str_beta_tenant", "betaOwner")).toBe(
        200,
      );
      expect(
        await getJson(app, "/api/scheduled-task-runs/str_beta_tenant/logs", "betaOwner"),
      ).toEqual(
        expect.objectContaining({
          runId: "str_beta_tenant",
          entries: [expect.objectContaining({ message: "stl_beta_tenant ok" })],
        }),
      );

      expect(itemIds(await getJson(app, "/api/projects", "alphaDeveloper"))).toEqual([
        "prj_alpha_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/resources", "alphaDeveloper"))).toEqual([
        "res_alpha_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/environments", "alphaDeveloper"))).toEqual([
        "env_alpha_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/dependency-resources", "alphaDeveloper"))).toEqual([
        "rsi_alpha_tenant",
      ]);
      expect(
        itemIds(
          await getJson(
            app,
            "/api/dependency-resources/rsi_alpha_tenant/backups",
            "alphaDeveloper",
          ),
        ),
      ).toEqual(["drb_alpha_tenant"]);
      expect(itemIds(await getJson(app, "/api/servers", "alphaDeveloper"))).toEqual([
        "srv_alpha_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/credentials/ssh", "alphaDeveloper"))).toEqual([
        "sshcred_alpha_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/certificates", "alphaDeveloper"))).toEqual([
        "cert_alpha_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/domain-bindings", "alphaDeveloper"))).toEqual([
        "dom_alpha_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/storage-volumes", "alphaDeveloper"))).toEqual([
        "stv_alpha_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/deployments", "alphaDeveloper"))).toEqual([
        "dep_alpha_tenant",
      ]);
      expect(sourceFingerprints(await getJson(app, "/api/source-links", "alphaDeveloper"))).toEqual(
        ["github:alpha/repo:main"],
      );
      expect(
        sourceEventIds(
          await getJson(app, "/api/source-events?projectId=prj_alpha_tenant", "alphaDeveloper"),
        ),
      ).toEqual(["sev_alpha_tenant"]);
      expect(
        previewEnvironmentIds(await getJson(app, "/api/preview-environments", "alphaDeveloper")),
      ).toEqual(["prenv_alpha_tenant"]);
      expect(taskIds(await getJson(app, "/api/scheduled-tasks", "alphaDeveloper"))).toEqual([
        "tsk_alpha_tenant",
      ]);
      expect(runIds(await getJson(app, "/api/scheduled-task-runs", "alphaDeveloper"))).toEqual([
        "str_alpha_tenant",
      ]);

      expect(itemIds(await getJson(app, "/api/projects", "multiAlpha"))).toEqual([
        "prj_alpha_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/projects", "multiBeta"))).toEqual([
        "prj_beta_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/resources", "multiAlpha"))).toEqual([
        "res_alpha_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/resources", "multiBeta"))).toEqual([
        "res_beta_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/environments", "multiAlpha"))).toEqual([
        "env_alpha_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/environments", "multiBeta"))).toEqual([
        "env_beta_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/servers", "multiAlpha"))).toEqual([
        "srv_alpha_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/servers", "multiBeta"))).toEqual(["srv_beta_tenant"]);
      expect(itemIds(await getJson(app, "/api/credentials/ssh", "multiAlpha"))).toEqual([
        "sshcred_alpha_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/credentials/ssh", "multiBeta"))).toEqual([
        "sshcred_beta_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/certificates", "multiAlpha"))).toEqual([
        "cert_alpha_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/certificates", "multiBeta"))).toEqual([
        "cert_beta_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/domain-bindings", "multiAlpha"))).toEqual([
        "dom_alpha_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/domain-bindings", "multiBeta"))).toEqual([
        "dom_beta_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/storage-volumes", "multiAlpha"))).toEqual([
        "stv_alpha_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/storage-volumes", "multiBeta"))).toEqual([
        "stv_beta_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/deployments", "multiAlpha"))).toEqual([
        "dep_alpha_tenant",
      ]);
      expect(itemIds(await getJson(app, "/api/deployments", "multiBeta"))).toEqual([
        "dep_beta_tenant",
      ]);
      expect(sourceFingerprints(await getJson(app, "/api/source-links", "multiAlpha"))).toEqual([
        "github:alpha/repo:main",
      ]);
      expect(sourceFingerprints(await getJson(app, "/api/source-links", "multiBeta"))).toEqual([
        "github:beta/repo:main",
      ]);
      expect(
        sourceEventIds(
          await getJson(app, "/api/source-events?projectId=prj_alpha_tenant", "multiAlpha"),
        ),
      ).toEqual(["sev_alpha_tenant"]);
      expect(
        sourceEventIds(
          await getJson(app, "/api/source-events?projectId=prj_beta_tenant", "multiBeta"),
        ),
      ).toEqual(["sev_beta_tenant"]);
      expect(
        previewEnvironmentIds(await getJson(app, "/api/preview-environments", "multiAlpha")),
      ).toEqual(["prenv_alpha_tenant"]);
      expect(
        previewEnvironmentIds(await getJson(app, "/api/preview-environments", "multiBeta")),
      ).toEqual(["prenv_beta_tenant"]);
      expect(taskIds(await getJson(app, "/api/scheduled-tasks", "multiAlpha"))).toEqual([
        "tsk_alpha_tenant",
      ]);
      expect(taskIds(await getJson(app, "/api/scheduled-tasks", "multiBeta"))).toEqual([
        "tsk_beta_tenant",
      ]);
      expect(runIds(await getJson(app, "/api/scheduled-task-runs", "multiAlpha"))).toEqual([
        "str_alpha_tenant",
      ]);
      expect(runIds(await getJson(app, "/api/scheduled-task-runs", "multiBeta"))).toEqual([
        "str_beta_tenant",
      ]);

      expect(
        itemIds(await getJson(app, "/api/resources?projectId=prj_beta_tenant", "alphaOwner")),
      ).toEqual([]);
      expect(
        itemIds(await getJson(app, "/api/resources?environmentId=env_beta_tenant", "alphaOwner")),
      ).toEqual([]);
      expect(
        itemIds(await getJson(app, "/api/environments?projectId=prj_beta_tenant", "alphaOwner")),
      ).toEqual([]);
      expect(await getStatus(app, "/api/projects/prj_beta_tenant", "alphaOwner")).toBe(404);
      expect(await getStatus(app, "/api/environments/env_beta_tenant", "alphaOwner")).toBe(404);
      expect(await getStatus(app, "/api/resources/res_beta_tenant", "alphaOwner")).toBe(404);
      expect(
        itemIds(
          await getJson(app, "/api/resources/res_beta_tenant/dependency-bindings", "alphaOwner"),
        ),
      ).toEqual([]);
      expect(
        await getStatus(
          app,
          "/api/resources/res_beta_tenant/dependency-bindings/rdb_beta_tenant",
          "alphaOwner",
        ),
      ).toBe(404);
      expect(
        itemIds(
          await getJson(app, "/api/dependency-resources?projectId=prj_beta_tenant", "alphaOwner"),
        ),
      ).toEqual([]);
      expect(
        itemIds(
          await getJson(
            app,
            "/api/dependency-resources?environmentId=env_beta_tenant",
            "alphaOwner",
          ),
        ),
      ).toEqual([]);
      expect(await getStatus(app, "/api/dependency-resources/rsi_beta_tenant", "alphaOwner")).toBe(
        404,
      );
      expect(
        itemIds(
          await getJson(app, "/api/dependency-resources/rsi_beta_tenant/backups", "alphaOwner"),
        ),
      ).toEqual([]);
      expect(
        await getStatus(app, "/api/dependency-resources/backups/drb_beta_tenant", "alphaOwner"),
      ).toBe(404);
      expect(
        itemIds(
          await getJson(
            app,
            "/api/dependency-resources/backup-policies?dependencyResourceId=rsi_beta_tenant",
            "alphaOwner",
          ),
        ),
      ).toEqual([]);
      expect(
        (await getJson(
          app,
          "/api/dependency-resources/backup-policies/dbp_beta_tenant",
          "alphaOwner",
        )) as { policy: unknown | null },
      ).toEqual(expect.objectContaining({ policy: null }));
      expect(
        await getStatus(app, "/api/servers/srv_beta_tenant?includeRollups=false", "alphaOwner"),
      ).toBe(404);
      expect(
        await getStatus(
          app,
          "/api/credentials/ssh/sshcred_beta_tenant?includeUsage=false",
          "alphaOwner",
        ),
      ).toBe(404);
      expect(
        itemIds(await getJson(app, "/api/domain-bindings?projectId=prj_beta_tenant", "alphaOwner")),
      ).toEqual([]);
      expect(await getStatus(app, "/api/domain-bindings/dom_beta_tenant", "alphaOwner")).toBe(404);
      expect(
        itemIds(
          await getJson(app, "/api/certificates?domainBindingId=dom_beta_tenant", "alphaOwner"),
        ),
      ).toEqual([]);
      expect(await getStatus(app, "/api/certificates/cert_beta_tenant", "alphaOwner")).toBe(404);
      expect(
        itemIds(await getJson(app, "/api/storage-volumes?projectId=prj_beta_tenant", "alphaOwner")),
      ).toEqual([]);
      expect(await getStatus(app, "/api/storage-volumes/stv_beta_tenant", "alphaOwner")).toBe(404);
      expect(
        itemIds(await getJson(app, "/api/deployments?projectId=prj_beta_tenant", "alphaOwner")),
      ).toEqual([]);
      expect(
        await getStatus(
          app,
          "/api/deployments/dep_beta_tenant?includeTimeline=false&includeSnapshot=false&includeRelatedContext=false&includeLatestFailure=false&includeRecoverySummary=false",
          "alphaOwner",
        ),
      ).toBe(404);
      expect(
        sourceEventIds(
          await getJson(app, "/api/source-events?projectId=prj_beta_tenant", "alphaOwner"),
        ),
      ).toEqual([]);
      expect(
        await getStatus(
          app,
          "/api/source-events/sev_beta_tenant?projectId=prj_beta_tenant",
          "alphaOwner",
        ),
      ).toBe(404);
      expect(
        previewEnvironmentIds(
          await getJson(app, "/api/preview-environments?projectId=prj_beta_tenant", "alphaOwner"),
        ),
      ).toEqual([]);
      expect(
        await getStatus(
          app,
          "/api/preview-environments/prenv_beta_tenant?projectId=prj_beta_tenant",
          "alphaOwner",
        ),
      ).toBe(404);
      expect(
        taskIds(await getJson(app, "/api/scheduled-tasks?projectId=prj_beta_tenant", "alphaOwner")),
      ).toEqual([]);
      expect(await getStatus(app, "/api/scheduled-tasks/tsk_beta_tenant", "alphaOwner")).toBe(404);
      expect(
        runIds(
          await getJson(app, "/api/scheduled-task-runs?resourceId=res_beta_tenant", "alphaOwner"),
        ),
      ).toEqual([]);
      expect(await getStatus(app, "/api/scheduled-task-runs/str_beta_tenant", "alphaOwner")).toBe(
        404,
      );
      expect(
        await getJson(app, "/api/scheduled-task-runs/str_beta_tenant/logs", "alphaOwner"),
      ).toEqual(
        expect.objectContaining({
          runId: "str_beta_tenant",
          entries: [],
        }),
      );
      expect(
        tokenIds(await getJson(app, "/api/deploy-tokens?organizationId=org_beta", "alphaOwner")),
      ).toEqual([]);
      expect(
        await getStatus(
          app,
          "/api/deploy-tokens/dpt_beta_tenant?organizationId=org_beta",
          "alphaOwner",
        ),
      ).toBe(404);
      expect(
        itemIds(
          await getJson(
            app,
            "/api/retention-defaults?scope=organization&organizationId=org_beta",
            "alphaOwner",
          ),
        ),
      ).toEqual([]);
      expect(
        (
          (await getJson(
            app,
            "/api/retention-defaults/provider-job-logs?scope=organization&organizationId=org_beta",
            "alphaOwner",
          )) as { policy: unknown | null }
        ).policy,
      ).toBeNull();
      expect(
        sourceFingerprints(
          await getJson(app, "/api/source-links?projectId=prj_beta_tenant", "alphaOwner"),
        ),
      ).toEqual([]);
      expect(
        await getStatus(app, "/api/source-links/github%3Abeta%2Frepo%3Amain", "alphaOwner"),
      ).toBe(404);
    } finally {
      await database.close();
      rmSync(dataDir, { force: true, recursive: true });
    }
  }, 15000);
});
