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
} from "@appaloft/testkit";
import { createExecutionContext, toRepositoryContext } from "../src";
import { RelinkSourceLinkCommand } from "../src/messages";
import {
  type SourceLinkRecord,
  type SourceLinkRepository,
  type SourceLinkSelectionSpec,
  type SourceLinkSelectionSpecVisitor,
} from "../src/ports";
import { RelinkSourceLinkUseCase } from "../src/use-cases";

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

async function createRelinkFixture(input?: {
  destinationServerId?: string;
  resourceDestinationId?: string;
  sourceLink?: SourceLinkRecord | null;
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
});
