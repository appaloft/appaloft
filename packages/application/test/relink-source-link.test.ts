import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTarget,
  DeploymentTargetId,
  DeploymentTargetName,
  Destination,
  DestinationId,
  DestinationKindValue,
  DestinationName,
  Environment,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  err,
  HostAddress,
  ok,
  PortNumber,
  Project,
  ProjectId,
  ProjectName,
  ProviderKey,
  Resource,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  type Result,
  UpsertDeploymentTargetSpec,
  UpsertDestinationSpec,
  UpsertEnvironmentSpec,
  UpsertProjectSpec,
  UpsertResourceSpec,
} from "@appaloft/core";
import {
  FixedClock,
  MemoryDestinationRepository,
  MemoryEnvironmentRepository,
  MemoryProjectRepository,
  MemoryResourceRepository,
  MemoryServerRepository,
  PassThroughMutationCoordinator,
} from "@appaloft/testkit";
import {
  coordinationTimeoutError,
  createExecutionContext,
  type MutationCoordinator,
  type MutationCoordinatorRunExclusiveInput,
  toRepositoryContext,
} from "../src";
import {
  DeleteSourceLinkCommand,
  ListSourceLinksQuery,
  RelinkSourceLinkCommand,
  ShowSourceLinkQuery,
} from "../src/messages";
import {
  SourceLinkBySourceFingerprintSpec,
  type SourceLinkReadModel,
  type SourceLinkRecord,
  type SourceLinkRepository,
  type SourceLinkSelectionSpec,
  type SourceLinkSelectionSpecVisitor,
} from "../src/ports";
import { SourceLinkQueryService } from "../src/source-link-handlers";
import { DeleteSourceLinkUseCase, RelinkSourceLinkUseCase } from "../src/use-cases";

class MemorySourceLinkRepository implements SourceLinkRepository {
  readonly upsertCalls: SourceLinkRecord[] = [];

  constructor(private record: SourceLinkRecord | null) {}

  async findOne(spec: SourceLinkSelectionSpec): Promise<Result<SourceLinkRecord | null>> {
    return spec.accept(ok(null), {
      visitSourceLinkBySourceFingerprint: (_query, sourceFingerprintSpec) => {
        if (
          !this.record ||
          this.record.sourceFingerprint !== sourceFingerprintSpec.sourceFingerprint
        ) {
          return ok(null);
        }

        return ok(this.record);
      },
    } satisfies SourceLinkSelectionSpecVisitor<Result<SourceLinkRecord | null>>);
  }

  async upsert(record: SourceLinkRecord): Promise<Result<SourceLinkRecord>> {
    this.upsertCalls.push(record);
    this.record = record;
    return ok(record);
  }

  async deleteOne(spec: SourceLinkSelectionSpec): Promise<Result<boolean>> {
    return spec.accept(ok(false), {
      visitSourceLinkBySourceFingerprint: (_query, sourceFingerprintSpec) => {
        if (
          !this.record ||
          this.record.sourceFingerprint !== sourceFingerprintSpec.sourceFingerprint
        ) {
          return ok(false);
        }

        this.record = null;
        return ok(true);
      },
    } satisfies SourceLinkSelectionSpecVisitor<Result<boolean>>);
  }
}

class TimeoutMutationCoordinator implements MutationCoordinator {
  async runExclusive<T>(input: MutationCoordinatorRunExclusiveInput<T>): Promise<Result<T>> {
    return err(
      coordinationTimeoutError({
        message: "Timed out waiting for source-link coordination",
        policy: input.policy,
        scope: input.scope,
        waitedSeconds: Math.ceil(input.policy.waitTimeoutMs / 1000),
        retryAfterSeconds: Math.ceil(input.policy.retryIntervalMs / 1000),
      }),
    );
  }
}

class MemorySourceLinkReadModel implements SourceLinkReadModel {
  constructor(private readonly records: SourceLinkRecord[]) {}

  async list(
    _context: Parameters<SourceLinkReadModel["list"]>[0],
    input: Parameters<SourceLinkReadModel["list"]>[1],
  ): Promise<SourceLinkRecord[]> {
    return this.records
      .filter(
        (record) =>
          (!input?.projectId || record.projectId === input.projectId) &&
          (!input?.resourceId || record.resourceId === input.resourceId) &&
          (!input?.serverId || record.serverId === input.serverId),
      )
      .slice(0, input?.limit ?? 50);
  }
}

async function createRelinkFixture(input?: {
  destinationServerId?: string;
  resourceDestinationId?: string;
  sourceLink?: SourceLinkRecord | null;
  mutationCoordinator?: MutationCoordinator;
}) {
  const context = createExecutionContext({
    requestId: "req_source_link_test",
    entrypoint: "system",
  });
  const repositoryContext = toRepositoryContext(context);
  const clock = new FixedClock("2026-04-19T00:02:00.000Z");
  const projects = new MemoryProjectRepository();
  const environments = new MemoryEnvironmentRepository();
  const resources = new MemoryResourceRepository();
  const servers = new MemoryServerRepository();
  const destinations = new MemoryDestinationRepository();

  const project = Project.create({
    id: ProjectId.rehydrate("prj_demo"),
    name: ProjectName.rehydrate("Demo"),
    createdAt: CreatedAt.rehydrate("2026-04-19T00:00:00.000Z"),
  })._unsafeUnwrap();
  const environment = Environment.create({
    id: EnvironmentId.rehydrate("env_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    name: EnvironmentName.rehydrate("production"),
    kind: EnvironmentKindValue.rehydrate("production"),
    createdAt: CreatedAt.rehydrate("2026-04-19T00:00:00.000Z"),
  })._unsafeUnwrap();
  const server = DeploymentTarget.register({
    id: DeploymentTargetId.rehydrate("srv_demo"),
    name: DeploymentTargetName.rehydrate("demo-server"),
    host: HostAddress.rehydrate("127.0.0.1"),
    port: PortNumber.rehydrate(22),
    providerKey: ProviderKey.rehydrate("generic-ssh"),
    createdAt: CreatedAt.rehydrate("2026-04-19T00:00:00.000Z"),
  })._unsafeUnwrap();
  const destination = Destination.register({
    id: DestinationId.rehydrate("dst_demo"),
    serverId: DeploymentTargetId.rehydrate(input?.destinationServerId ?? "srv_demo"),
    name: DestinationName.rehydrate("default"),
    kind: DestinationKindValue.rehydrate("generic"),
    createdAt: CreatedAt.rehydrate("2026-04-19T00:00:00.000Z"),
  })._unsafeUnwrap();
  const resource = Resource.create({
    id: ResourceId.rehydrate("res_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    destinationId: DestinationId.rehydrate(input?.resourceDestinationId ?? "dst_demo"),
    name: ResourceName.rehydrate("web"),
    kind: ResourceKindValue.rehydrate("application"),
    createdAt: CreatedAt.rehydrate("2026-04-19T00:00:00.000Z"),
  })._unsafeUnwrap();

  await projects.upsert(repositoryContext, project, UpsertProjectSpec.fromProject(project));
  await environments.upsert(
    repositoryContext,
    environment,
    UpsertEnvironmentSpec.fromEnvironment(environment),
  );
  await servers.upsert(
    repositoryContext,
    server,
    UpsertDeploymentTargetSpec.fromDeploymentTarget(server),
  );
  await destinations.upsert(
    repositoryContext,
    destination,
    UpsertDestinationSpec.fromDestination(destination),
  );
  await resources.upsert(repositoryContext, resource, UpsertResourceSpec.fromResource(resource));

  const sourceLinkRepository = new MemorySourceLinkRepository(
    input?.sourceLink === undefined
      ? {
          sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
          projectId: "prj_demo",
          environmentId: "env_demo",
          resourceId: "res_old",
          updatedAt: "2026-04-19T00:00:00.000Z",
        }
      : input.sourceLink,
  );

  return {
    context,
    sourceLinkRepository,
    useCase: new RelinkSourceLinkUseCase(
      sourceLinkRepository,
      projects,
      environments,
      resources,
      servers,
      destinations,
      clock,
      input?.mutationCoordinator ?? new PassThroughMutationCoordinator(),
    ),
  };
}

describe("RelinkSourceLinkCommand", () => {
  test("parses target ids and optimistic guards", () => {
    const command = RelinkSourceLinkCommand.create({
      sourceFingerprint: " source-fingerprint:v1:branch%3Amain ",
      projectId: " prj_demo ",
      environmentId: " env_demo ",
      resourceId: " res_demo ",
      serverId: " srv_demo ",
      destinationId: " dst_demo ",
      expectedCurrentProjectId: " prj_demo ",
      expectedCurrentEnvironmentId: " env_demo ",
      expectedCurrentResourceId: " res_old ",
      reason: " move to canonical resource ",
    });

    expect(command.isOk()).toBe(true);
    if (command.isErr()) {
      throw new Error(command.error.message);
    }
    expect(command.value).toMatchObject({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      expectedCurrentProjectId: "prj_demo",
      expectedCurrentEnvironmentId: "env_demo",
      expectedCurrentResourceId: "res_old",
      reason: "move to canonical resource",
    });
  });
});

describe("SourceLinkQueryService", () => {
  test("[SOURCE-LINK-STATE-021] lists source fingerprint links with safe filters", async () => {
    const { context, sourceLinkRepository } = await createRelinkFixture({
      sourceLink: {
        sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
        projectId: "prj_demo",
        environmentId: "env_demo",
        resourceId: "res_demo",
        serverId: "srv_demo",
        updatedAt: "2026-04-19T00:00:00.000Z",
        reason: "linked",
      },
    });
    const query = ListSourceLinksQuery.create({ projectId: "prj_demo", limit: 10 });
    expect(query.isOk()).toBe(true);
    if (query.isErr()) {
      throw new Error(query.error.message);
    }
    const service = new SourceLinkQueryService(
      new MemorySourceLinkReadModel([
        {
          sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
          projectId: "prj_demo",
          environmentId: "env_demo",
          resourceId: "res_demo",
          serverId: "srv_demo",
          updatedAt: "2026-04-19T00:00:00.000Z",
          reason: "linked",
        },
      ]),
      sourceLinkRepository,
    );

    const result = await service.list(context, query.value);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error(result.error.message);
    }
    expect(result.value).toEqual({
      schemaVersion: "source-links.list/v1",
      items: [
        expect.objectContaining({
          sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
          projectId: "prj_demo",
          resourceId: "res_demo",
        }),
      ],
    });
  });

  test("[SOURCE-LINK-STATE-022] shows one source fingerprint link", async () => {
    const { sourceLinkRepository } = await createRelinkFixture();
    const query = ShowSourceLinkQuery.create({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
    });
    expect(query.isOk()).toBe(true);
    if (query.isErr()) {
      throw new Error(query.error.message);
    }
    const service = new SourceLinkQueryService(
      new MemorySourceLinkReadModel([]),
      sourceLinkRepository,
    );

    const result = await service.show(query.value);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error(result.error.message);
    }
    expect(result.value.sourceLink).toMatchObject({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      resourceId: "res_old",
    });
  });
});

describe("DeleteSourceLinkUseCase", () => {
  test("[SOURCE-LINK-STATE-023] deletes one source fingerprint link explicitly", async () => {
    const { context, sourceLinkRepository } = await createRelinkFixture();
    const command = DeleteSourceLinkCommand.create({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      reason: "reset link",
    });
    expect(command.isOk()).toBe(true);
    if (command.isErr()) {
      throw new Error(command.error.message);
    }
    const useCase = new DeleteSourceLinkUseCase(
      sourceLinkRepository,
      new PassThroughMutationCoordinator(),
    );

    const result = await useCase.execute(context, command.value);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error(result.error.message);
    }
    expect(result.value).toEqual({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      deleted: true,
    });
    const deleted = await sourceLinkRepository.findOne(
      SourceLinkBySourceFingerprintSpec.create("source-fingerprint:v1:branch%3Amain"),
    );
    expect(deleted).toEqual(ok(null));
  });
});

describe("RelinkSourceLinkUseCase", () => {
  test("[SOURCE-LINK-STATE-008] relinks a source fingerprint after target context validation", async () => {
    const { context, sourceLinkRepository, useCase } = await createRelinkFixture();

    const result = await useCase.execute(context, {
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      expectedCurrentResourceId: "res_old",
      reason: "move to canonical resource",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw new Error(result.error.message);
    }
    expect(result.value).toEqual({
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
    });
    expect(sourceLinkRepository.upsertCalls[0]).toMatchObject({
      updatedAt: "2026-04-19T00:02:00.000Z",
      reason: "move to canonical resource",
      resourceId: "res_demo",
    });
  });

  test("[SOURCE-LINK-STATE-010] optimistic guard conflicts reject without changing the mapping", async () => {
    const { context, sourceLinkRepository, useCase } = await createRelinkFixture();

    const result = await useCase.execute(context, {
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      expectedCurrentResourceId: "res_other",
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected source link conflict");
    }
    expect(result.error).toMatchObject({
      code: "source_link_context_mismatch",
      details: {
        phase: "source-link-admission",
        actualResourceId: "res_old",
      },
    });
    expect(sourceLinkRepository.upsertCalls).toHaveLength(0);
  });

  test("[SOURCE-LINK-STATE-011] rejects mismatched destination/server context before persistence", async () => {
    const { context, sourceLinkRepository, useCase } = await createRelinkFixture({
      destinationServerId: "srv_other",
    });

    const result = await useCase.execute(context, {
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected source link context mismatch");
    }
    expect(result.error).toMatchObject({
      code: "source_link_context_mismatch",
      details: {
        phase: "source-link-admission",
        serverId: "srv_demo",
        destinationId: "dst_demo",
      },
    });
    expect(sourceLinkRepository.upsertCalls).toHaveLength(0);
  });

  test("[SOURCE-LINK-STATE-012] surfaces coordination timeout without mutating the mapping", async () => {
    const { context, sourceLinkRepository, useCase } = await createRelinkFixture({
      mutationCoordinator: new TimeoutMutationCoordinator(),
    });

    const result = await useCase.execute(context, {
      sourceFingerprint: "source-fingerprint:v1:branch%3Amain",
      projectId: "prj_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("Expected coordination timeout");
    }
    expect(result.error).toMatchObject({
      code: "coordination_timeout",
      category: "timeout",
      details: {
        phase: "operation-coordination",
        coordinationScopeKind: "source-link",
        coordinationScope: "source-fingerprint:v1:branch%3Amain",
        coordinationMode: "serialize-with-bounded-wait",
      },
    });
    expect(sourceLinkRepository.upsertCalls).toHaveLength(0);
  });
});
