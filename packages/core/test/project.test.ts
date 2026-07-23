import { describe, expect, test } from "bun:test";

import {
  ArchivedAt,
  CreatedAt,
  DeletedAt,
  DescriptionText,
  OrganizationId,
  Project,
  ProjectDisplayOrder,
  ProjectId,
  ProjectName,
  UpdatedAt,
} from "../src";

const createdAt = CreatedAt.rehydrate("2026-07-20T00:00:00.000Z");
const updatedAt = UpdatedAt.rehydrate("2026-07-20T00:10:00.000Z");
const archivedAt = ArchivedAt.rehydrate("2026-07-20T00:20:00.000Z");
const deletedAt = DeletedAt.rehydrate("2026-07-20T00:30:00.000Z");

function createProject(input?: { name?: string; organizationId?: string; description?: string }) {
  return Project.create({
    id: ProjectId.rehydrate("prj_demo"),
    name: ProjectName.rehydrate(input?.name ?? "Demo App"),
    createdAt,
    ...(input?.organizationId
      ? { organizationId: OrganizationId.rehydrate(input.organizationId) }
      : {}),
    ...(input?.description ? { description: DescriptionText.rehydrate(input.description) } : {}),
  });
}

describe("Project", () => {
  test("[CORE-PROJECT-001] creates an active project with slug and default org", () => {
    const project = createProject()._unsafeUnwrap();

    expect(project.toState().lifecycleStatus.value).toBe("active");
    expect(project.toState().slug.value).toBe("demo-app");
    expect(project.toState().organizationId?.value).toBe("org_self_hosted");
    expect(project.toState().displayOrder.value).toBe(0);
    expect(project.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: "project.created",
        aggregateId: "prj_demo",
        payload: expect.objectContaining({
          organizationId: "org_self_hosted",
          slug: "demo-app",
        }),
      }),
    ]);
  });

  test("[CORE-PROJECT-002] renames a project and emits project-renamed", () => {
    const project = createProject()._unsafeUnwrap();
    project.pullDomainEvents();

    const renamed = project.rename({
      name: ProjectName.rehydrate("Launch Pad"),
      renamedAt: updatedAt,
    });

    expect(renamed.isOk()).toBe(true);
    expect(renamed._unsafeUnwrap().changed).toBe(true);
    expect(project.toState().name.value).toBe("Launch Pad");
    expect(project.toState().slug.value).toBe("launch-pad");
    expect(project.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: "project-renamed",
        payload: expect.objectContaining({
          previousSlug: "demo-app",
          nextSlug: "launch-pad",
        }),
      }),
    ]);

    expect(
      project
        .rename({
          name: ProjectName.rehydrate("Launch Pad"),
          renamedAt: UpdatedAt.rehydrate("2026-07-20T00:11:00.000Z"),
        })
        ._unsafeUnwrap().changed,
    ).toBe(false);
  });

  test("[CORE-PROJECT-003] archives, restores, and blocks mutations while archived", () => {
    const project = createProject()._unsafeUnwrap();
    project.pullDomainEvents();

    expect(project.archive({ archivedAt }).isOk()).toBe(true);
    expect(project.toState().lifecycleStatus.value).toBe("archived");
    expect(project.pullDomainEvents()).toEqual([
      expect.objectContaining({ type: "project-archived" }),
    ]);

    const blocked = project.rename({
      name: ProjectName.rehydrate("Nope"),
      renamedAt: updatedAt,
    });
    expect(blocked.isErr()).toBe(true);
    expect(blocked._unsafeUnwrapErr().message).toBe(
      "Archived projects cannot accept new mutations",
    );
    expect(blocked._unsafeUnwrapErr().details).toMatchObject({
      phase: "project-lifecycle-guard",
      lifecycleStatus: "archived",
      commandName: "projects.rename",
    });

    expect(project.archive({ archivedAt })._unsafeUnwrap().changed).toBe(false);

    const restored = project.restore({ restoredAt: updatedAt });
    expect(restored.isOk()).toBe(true);
    expect(project.toState().lifecycleStatus.value).toBe("active");
    expect(project.toState().archivedAt).toBeUndefined();
    expect(project.pullDomainEvents()).toEqual([
      expect.objectContaining({ type: "project-restored" }),
    ]);
  });

  test("[CORE-PROJECT-004] deletes only archived projects and rejects further mutations", () => {
    const project = createProject()._unsafeUnwrap();
    project.pullDomainEvents();

    const activeDelete = project.delete({ deletedAt });
    expect(activeDelete.isErr()).toBe(true);
    expect(activeDelete._unsafeUnwrapErr().message).toBe("Only archived projects can be deleted");

    project.archive({ archivedAt })._unsafeUnwrap();
    project.pullDomainEvents();

    expect(project.delete({ deletedAt }).isOk()).toBe(true);
    expect(project.toState().lifecycleStatus.value).toBe("deleted");
    expect(project.toState().deletedAt?.value).toBe(deletedAt.value);
    expect(project.pullDomainEvents()).toEqual([
      expect.objectContaining({ type: "project-deleted" }),
    ]);
    expect(project.delete({ deletedAt })._unsafeUnwrap().changed).toBe(false);

    const blocked = project.ensureCanAcceptMutation("projects.rename");
    expect(blocked.isErr()).toBe(true);
    expect(blocked._unsafeUnwrapErr().details).toMatchObject({
      phase: "project-lifecycle-guard",
      lifecycleStatus: "deleted",
      commandName: "projects.rename",
    });
  });

  test("[CORE-PROJECT-005] reorders and sets description with idempotent no-ops", () => {
    const project = createProject({ description: "initial" })._unsafeUnwrap();
    project.pullDomainEvents();

    expect(
      project
        .reorder({
          displayOrder: ProjectDisplayOrder.create(3)._unsafeUnwrap(),
          reorderedAt: updatedAt,
        })
        ._unsafeUnwrap().changed,
    ).toBe(true);
    expect(project.toState().displayOrder.value).toBe(3);
    expect(
      project
        .reorder({
          displayOrder: ProjectDisplayOrder.rehydrate(3),
          reorderedAt: updatedAt,
        })
        ._unsafeUnwrap().changed,
    ).toBe(false);

    expect(
      project
        .setDescription({
          description: DescriptionText.rehydrate("updated"),
          changedAt: updatedAt,
        })
        ._unsafeUnwrap().changed,
    ).toBe(true);
    expect(
      project
        .setDescription({
          description: DescriptionText.rehydrate("updated"),
          changedAt: updatedAt,
        })
        ._unsafeUnwrap().changed,
    ).toBe(false);
    expect(
      project
        .setDescription({
          changedAt: updatedAt,
        })
        ._unsafeUnwrap().changed,
    ).toBe(true);
    expect(project.toState().description).toBeUndefined();
  });

  test("[CORE-PROJECT-006] rejects invalid display order values", () => {
    expect(ProjectDisplayOrder.create(-1).isErr()).toBe(true);
    expect(ProjectDisplayOrder.create(1.5).isErr()).toBe(true);
    expect(ProjectDisplayOrder.create(0).isOk()).toBe(true);
  });

  test("[CORE-PROJECT-007] cannot restore a deleted project", () => {
    const project = createProject()._unsafeUnwrap();
    project.archive({ archivedAt })._unsafeUnwrap();
    project.delete({ deletedAt })._unsafeUnwrap();

    const restored = project.restore({ restoredAt: updatedAt });
    expect(restored.isErr()).toBe(true);
  });
});
