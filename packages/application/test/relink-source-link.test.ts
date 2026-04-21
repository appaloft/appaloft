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
  type DomainError,
  domainError,
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
} from "@appaloft/testkit";
import { createExecutionContext, toRepositoryContext } from "../src";
import { RelinkSourceLinkCommand } from "../src/messages";
import { type SourceLinkRecord, type SourceLinkStore, type SourceLinkTarget } from "../src/ports";
import { RelinkSourceLinkUseCase } from "../src/use-cases";

class MemorySourceLinkStore implements SourceLinkStore {
  readonly relinkCalls: Parameters<SourceLinkStore["relink"]>[0][] = [];

  constructor(private record: SourceLinkRecord | null) {}

  async read(): Promise<Result<SourceLinkRecord | null>> {
    return ok(this.record);
  }

  async requireSameTargetOrMissing(): Promise<Result<SourceLinkRecord | null>> {
    return ok(this.record);
  }

  async createIfMissing(input: {
    sourceFingerprint: string;
    target: SourceLinkTarget;
    updatedAt: string;
  }): Promise<Result<SourceLinkRecord>> {
    if (!this.record) {
      this.record = {
        sourceFingerprint: input.sourceFingerprint,
        updatedAt: input.updatedAt,
        ...input.target,
      };
    }

    return ok(this.record);
  }

  async relink(input: Parameters<SourceLinkStore["relink"]>[0]): Promise<Result<SourceLinkRecord>> {
    this.relinkCalls.push(input);

    if (!this.record) {
      return err(
        domainError.validation("Source link was not found", {
          phase: "source-link-resolution",
        }),
      );
    }

    if (
      input.expectedCurrentProjectId &&
      this.record.projectId !== input.expectedCurrentProjectId
    ) {
      return err(
        sourceLinkConflict("project", input.expectedCurrentProjectId, this.record.projectId),
      );
    }

    if (
      input.expectedCurrentEnvironmentId &&
      this.record.environmentId !== input.expectedCurrentEnvironmentId
    ) {
      return err(
        sourceLinkConflict(
          "environment",
          input.expectedCurrentEnvironmentId,
          this.record.environmentId,
        ),
      );
    }

    if (
      input.expectedCurrentResourceId &&
      this.record.resourceId !== input.expectedCurrentResourceId
    ) {
      return err(
        sourceLinkConflict("resource", input.expectedCurrentResourceId, this.record.resourceId),
      );
    }

    this.record = {
      sourceFingerprint: input.sourceFingerprint,
      updatedAt: input.updatedAt,
      ...(input.reason ? { reason: input.reason } : {}),
      ...input.target,
    };

    return ok(this.record);
  }

  async unlink(sourceFingerprint: string): Promise<Result<boolean>> {
    if (!this.record || this.record.sourceFingerprint !== sourceFingerprint) {
      return ok(false);
    }

    this.record = null;
    return ok(true);
  }
}

function sourceLinkConflict(kind: string, expected: string, actual: string): DomainError {
  return {
    code: "source_link_conflict",
    category: "user",
    message: `Source link ${kind} guard did not match`,
    retryable: false,
    details: {
      phase: "source-link-resolution",
      expected,
      actual,
    },
  };
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

  const sourceLinkStore = new MemorySourceLinkStore(
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
    sourceLinkStore,
    useCase: new RelinkSourceLinkUseCase(
      sourceLinkStore,
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
    const { context, sourceLinkStore, useCase } = await createRelinkFixture();

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
    expect(sourceLinkStore.relinkCalls[0]).toMatchObject({
      updatedAt: "2026-04-19T00:02:00.000Z",
      expectedCurrentResourceId: "res_old",
      reason: "move to canonical resource",
    });
  });

  test("[SOURCE-LINK-STATE-010] optimistic guard conflicts reject without changing the mapping", async () => {
    const { context, sourceLinkStore, useCase } = await createRelinkFixture();

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
      code: "source_link_conflict",
      details: {
        phase: "source-link-resolution",
        actual: "res_old",
      },
    });
    expect(sourceLinkStore.relinkCalls).toHaveLength(1);
  });

  test("[SOURCE-LINK-STATE-011] rejects mismatched destination/server context before persistence", async () => {
    const { context, sourceLinkStore, useCase } = await createRelinkFixture({
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
    expect(sourceLinkStore.relinkCalls).toHaveLength(0);
  });
});
