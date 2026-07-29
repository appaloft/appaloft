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
});
