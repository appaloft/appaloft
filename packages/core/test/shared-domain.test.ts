import { describe, expect, test } from "bun:test";

import {
  CanonicalRedirectStatusCode,
  DeploymentTargetLifecycleStatusValue,
  domainError,
  EdgeProxyKindValue,
  EdgeProxyStatusValue,
  EnvironmentLifecycleStatusValue,
  PortNumber,
  ProjectId,
  ProjectLifecycleStatusValue,
  ProjectName,
  ProjectSlug,
} from "../src";

describe("Shared domain errors", () => {
  test("[CORE-SHARED-ERR-001] factories produce stable codes and categories", () => {
    expect(domainError.validation("bad input", { field: "name" })).toMatchObject({
      code: "validation_error",
      category: "user",
      message: "bad input",
      details: { field: "name" },
      retryable: false,
    });
    expect(domainError.conflict("already exists")).toMatchObject({
      code: "conflict",
      category: "user",
    });
    expect(domainError.invariant("broken rule")).toMatchObject({
      code: "invariant_violation",
      category: "user",
    });
    expect(domainError.notFound("project", "prj_x")).toMatchObject({
      code: "not_found",
      message: "project prj_x was not found",
      details: { entity: "project", id: "prj_x" },
    });
    expect(
      domainError.projectArchived("Archived projects cannot accept new mutations", {
        projectId: "prj_demo",
      }),
    ).toMatchObject({
      message: "Archived projects cannot accept new mutations",
      details: { projectId: "prj_demo" },
    });
  });
});

describe("Shared value objects", () => {
  test("[CORE-SHARED-VO-001] validates ports, redirect codes, ids, and slugs", () => {
    expect(PortNumber.create(0).isErr()).toBe(true);
    expect(PortNumber.create(65536).isErr()).toBe(true);
    expect(PortNumber.create(443)._unsafeUnwrap().value).toBe(443);

    expect(CanonicalRedirectStatusCode.create(200).isErr()).toBe(true);
    expect(CanonicalRedirectStatusCode.create(301)._unsafeUnwrap().value).toBe(301);

    expect(ProjectId.create("").isErr()).toBe(true);
    expect(ProjectId.create(" prj_demo ")._unsafeUnwrap().value).toBe("prj_demo");

    expect(ProjectName.create("").isErr()).toBe(true);
    expect(ProjectSlug.create("Invalid Slug").isErr()).toBe(true);
    expect(ProjectSlug.fromName(ProjectName.rehydrate("Demo App"))._unsafeUnwrap().value).toBe(
      "demo-app",
    );
  });
});

describe("Shared lifecycle state machines", () => {
  test("[CORE-SHARED-SM-001] project lifecycle allows only archived deletes", () => {
    const active = ProjectLifecycleStatusValue.active();
    expect(active.archive().isOk()).toBe(true);
    expect(active.delete().isErr()).toBe(true);
    expect(active.delete()._unsafeUnwrapErr().message).toBe(
      "Only archived projects can be deleted",
    );

    const archived = active.archive()._unsafeUnwrap();
    expect(archived.restore().isOk()).toBe(true);
    expect(archived.delete().isOk()).toBe(true);
    expect(archived.delete()._unsafeUnwrap().isDeleted()).toBe(true);
  });

  test("[CORE-SHARED-SM-002] environment lock/unlock/archive transitions fail closed", () => {
    const active = EnvironmentLifecycleStatusValue.active();
    expect(active.unlock().isErr()).toBe(true);

    const locked = active.lock()._unsafeUnwrap();
    expect(locked.isLocked()).toBe(true);
    expect(locked.lock().isErr()).toBe(true);
    expect(locked.unlock()._unsafeUnwrap().isActive()).toBe(true);

    const archived = locked.archive()._unsafeUnwrap();
    expect(archived.isArchived()).toBe(true);
    expect(archived.lock().isErr()).toBe(true);
  });

  test("[CORE-SHARED-SM-003] edge proxy bootstrap and server lifecycle guards", () => {
    const disabled = EdgeProxyStatusValue.initialForKind(EdgeProxyKindValue.rehydrate("none"));
    expect(disabled.isDisabled()).toBe(true);
    expect(disabled.beginBootstrap(EdgeProxyKindValue.rehydrate("none")).isErr()).toBe(true);

    const pending = EdgeProxyStatusValue.initialForKind(EdgeProxyKindValue.rehydrate("traefik"));
    expect(pending.value).toBe("pending");
    const starting = pending
      .beginBootstrap(EdgeProxyKindValue.rehydrate("traefik"))
      ._unsafeUnwrap();
    expect(starting.value).toBe("starting");
    expect(starting.markReady()._unsafeUnwrap().value).toBe("ready");
    expect(starting.markFailed()._unsafeUnwrap().value).toBe("failed");

    const serverActive = DeploymentTargetLifecycleStatusValue.active();
    expect(serverActive.deactivate().isOk()).toBe(true);
    expect(serverActive.delete().isErr()).toBe(true);
    const inactive = serverActive.deactivate()._unsafeUnwrap();
    expect(inactive.delete().isOk()).toBe(true);
  });
});
