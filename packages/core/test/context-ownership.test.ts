import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  DeploymentTargetId,
  Destination,
  DestinationId,
  DestinationKindValue,
  DestinationName,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  EnvironmentProfile,
  ProjectId,
  Resource,
  ResourceId,
  ResourceKindValue,
  ResourceName,
} from "../src";

function environment() {
  return EnvironmentProfile.create({
    id: EnvironmentId.rehydrate("env_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    name: EnvironmentName.rehydrate("production"),
    kind: EnvironmentKindValue.rehydrate("production"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();
}

function resource(input?: { destinationId?: string }) {
  return Resource.create({
    id: ResourceId.rehydrate("res_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate("env_demo"),
    name: ResourceName.rehydrate("web"),
    kind: ResourceKindValue.rehydrate("application"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
    ...(input?.destinationId
      ? { destinationId: DestinationId.rehydrate(input.destinationId) }
      : {}),
  })._unsafeUnwrap();
}

function destination() {
  return Destination.register({
    id: DestinationId.rehydrate("dst_demo"),
    serverId: DeploymentTargetId.rehydrate("srv_demo"),
    name: DestinationName.rehydrate("default"),
    kind: DestinationKindValue.rehydrate("generic"),
    createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
  })._unsafeUnwrap();
}

describe("Context ownership", () => {
  test("[DMBH-CONTEXT-001] Environment answers project ownership", () => {
    const env = environment();

    expect(env.belongsToProject(ProjectId.rehydrate("prj_demo"))).toBe(true);
    expect(env.belongsToProject(ProjectId.rehydrate("prj_other"))).toBe(false);
    expect(env.projectId.equals(ProjectId.rehydrate("prj_demo"))).toBe(true);
  });

  test("[DMBH-CONTEXT-001] Resource answers project, environment, and destination ownership", () => {
    const deployable = resource({ destinationId: "dst_demo" });

    expect(deployable.belongsToProject(ProjectId.rehydrate("prj_demo"))).toBe(true);
    expect(deployable.belongsToProject(ProjectId.rehydrate("prj_other"))).toBe(false);
    expect(deployable.belongsToEnvironment(EnvironmentId.rehydrate("env_demo"))).toBe(true);
    expect(deployable.belongsToEnvironment(EnvironmentId.rehydrate("env_other"))).toBe(false);
    expect(deployable.canDeployToDestination(DestinationId.rehydrate("dst_demo"))).toBe(true);
    expect(deployable.canDeployToDestination(DestinationId.rehydrate("dst_other"))).toBe(false);

    const unconstrained = resource();
    expect(unconstrained.canDeployToDestination(DestinationId.rehydrate("dst_other"))).toBe(true);
    expect(unconstrained.defaultDestinationId).toBeUndefined();
  });

  test("[DMBH-CONTEXT-001] Destination answers server ownership", () => {
    const targetDestination = destination();

    expect(targetDestination.belongsToServer(DeploymentTargetId.rehydrate("srv_demo"))).toBe(true);
    expect(targetDestination.belongsToServer(DeploymentTargetId.rehydrate("srv_other"))).toBe(
      false,
    );
    expect(targetDestination.serverId.equals(DeploymentTargetId.rehydrate("srv_demo"))).toBe(true);
  });
});
