import { describe, expect, test } from "bun:test";
import {
  CreatedAt,
  EnvironmentId,
  ProjectId,
  Resource,
  ResourceId,
  ResourceKindValue,
  ResourceName,
  ResourceServiceKindValue,
  ResourceServiceName,
} from "../src";

const baseInput = {
  id: ResourceId.rehydrate("res_demo"),
  projectId: ProjectId.rehydrate("prj_demo"),
  environmentId: EnvironmentId.rehydrate("env_demo"),
  name: ResourceName.rehydrate("app-stack"),
  createdAt: CreatedAt.rehydrate("2026-01-01T00:00:00.000Z"),
};

describe("Resource", () => {
  test("allows compose-stack resources to contain multiple services", () => {
    const resource = Resource.create({
      ...baseInput,
      kind: ResourceKindValue.rehydrate("compose-stack"),
      services: [
        {
          name: ResourceServiceName.rehydrate("web"),
          kind: ResourceServiceKindValue.rehydrate("web"),
        },
        {
          name: ResourceServiceName.rehydrate("api"),
          kind: ResourceServiceKindValue.rehydrate("api"),
        },
      ],
    });

    expect(resource.isOk()).toBe(true);
    expect(resource._unsafeUnwrap().toState().services).toHaveLength(2);
  });

  test("rejects multiple services for non-compose resources", () => {
    const resource = Resource.create({
      ...baseInput,
      kind: ResourceKindValue.rehydrate("application"),
      services: [
        {
          name: ResourceServiceName.rehydrate("web"),
          kind: ResourceServiceKindValue.rehydrate("web"),
        },
        {
          name: ResourceServiceName.rehydrate("api"),
          kind: ResourceServiceKindValue.rehydrate("api"),
        },
      ],
    });

    expect(resource.isErr()).toBe(true);
  });
});
