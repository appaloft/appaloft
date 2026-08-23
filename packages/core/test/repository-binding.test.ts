import { describe, expect, test } from "bun:test";

import {
  CreatedAt,
  ProjectId,
  ProjectRepositoryBinding,
  ProjectRepositoryBindingId,
  RepositoryIdentity,
  UpdatedAt,
} from "../src";

describe("RepositoryBinding", () => {
  test("[WS-OPEN-BIND-005] binds one canonical repository identity to one Project", () => {
    const binding = ProjectRepositoryBinding.bind({
      id: ProjectRepositoryBindingId.rehydrate("rbd_acme_web"),
      repositoryIdentity: RepositoryIdentity.rehydrate("github.com/Acme/Web"),
      projectId: ProjectId.rehydrate("prj_web"),
      createdAt: CreatedAt.rehydrate("2026-07-28T00:00:00.000Z"),
    });

    expect(binding.isOk()).toBeTrue();
    expect(binding._unsafeUnwrap().toState()).toMatchObject({
      id: { value: "rbd_acme_web" },
      repositoryIdentity: { value: "github.com/Acme/Web" },
      projectId: { value: "prj_web" },
      status: "active",
    });

    expect(
      binding._unsafeUnwrap().unbind({
        at: UpdatedAt.rehydrate("2026-07-28T01:00:00.000Z"),
      }),
    ).toEqual(expect.objectContaining({ value: { changed: true } }));
    expect(binding._unsafeUnwrap().toState().status).toBe("unbound");
  });

  test("[WS-AGENT-BIND-005] rebinds the default Project instead of conflicting", () => {
    const binding = ProjectRepositoryBinding.bind({
      id: ProjectRepositoryBindingId.rehydrate("rbd_acme_web"),
      repositoryIdentity: RepositoryIdentity.rehydrate("github.com/Acme/Web"),
      projectId: ProjectId.rehydrate("prj_web"),
      createdAt: CreatedAt.rehydrate("2026-07-28T00:00:00.000Z"),
    })._unsafeUnwrap();

    expect(
      binding.rebind({
        projectId: ProjectId.rehydrate("prj_billing"),
        at: UpdatedAt.rehydrate("2026-08-23T00:00:00.000Z"),
      }),
    ).toEqual(expect.objectContaining({ value: { changed: true } }));
    expect(binding.toState().projectId.value).toBe("prj_billing");
    expect(binding.toState().status).toBe("active");
    expect(
      binding.rebind({
        projectId: ProjectId.rehydrate("prj_billing"),
        at: UpdatedAt.rehydrate("2026-08-23T00:00:01.000Z"),
      }),
    ).toEqual(expect.objectContaining({ value: { changed: false } }));
  });

  test("[WS-AGENT-BIND-005] two Projects can bind the same repository identity", () => {
    const first = ProjectRepositoryBinding.bind({
      id: ProjectRepositoryBindingId.rehydrate("rbd_web"),
      repositoryIdentity: RepositoryIdentity.rehydrate("github.com/Acme/Web"),
      projectId: ProjectId.rehydrate("prj_web"),
      createdAt: CreatedAt.rehydrate("2026-08-23T00:00:00.000Z"),
    })._unsafeUnwrap();
    const second = ProjectRepositoryBinding.bind({
      id: ProjectRepositoryBindingId.rehydrate("rbd_billing"),
      repositoryIdentity: RepositoryIdentity.rehydrate("github.com/Acme/Web"),
      projectId: ProjectId.rehydrate("prj_billing"),
      createdAt: CreatedAt.rehydrate("2026-08-23T00:00:01.000Z"),
    })._unsafeUnwrap();
    expect(first.toState().projectId.value).toBe("prj_web");
    expect(second.toState().projectId.value).toBe("prj_billing");
    expect(first.toState().repositoryIdentity.value).toBe(
      second.toState().repositoryIdentity.value,
    );
  });
});
