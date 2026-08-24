import { describe, expect, test } from "bun:test";

import {
  ListProjectSummariesQuery,
  ListProjectSummariesQueryService,
  createExecutionContext,
  type OperationScopePort,
  type ProjectSummariesReadModel,
} from "../src";

const context = createExecutionContext({
  entrypoint: "system",
  requestId: "req_dashboard_projects",
  tenant: { tenantId: "org_example", organizationId: "org_example" },
});

describe("Dashboard Project summaries", () => {
  test("[DASH-DATA-001] defaults to a bounded deterministic cursor page", () => {
    const query = ListProjectSummariesQuery.create()._unsafeUnwrap();

    expect(query.limit).toBe(24);
    expect(query.sort).toBe("recent-activity-desc");
    expect(query.cursor).toBeUndefined();
    expect(ListProjectSummariesQuery.create({ limit: 101 }).isErr()).toBe(true);
    expect(ListProjectSummariesQuery.create({ cursor: "not-a-cursor" }).isErr()).toBe(true);
  });

  test("[DASH-DATA-001] returns only bounded Project summary fields", async () => {
    const readModel: ProjectSummariesReadModel = {
      async list() {
        return {
          items: [
            {
              id: "prj_atlas",
              name: "Atlas API",
              slug: "atlas-api",
              description: "Public API and workers",
              resourceCount: 6,
              attentionCount: 1,
              attentionStatus: "attention",
              latestActivityAt: "2026-08-24T08:00:00.000Z",
            },
          ],
          nextCursor: "cursor_24",
        };
      },
    };
    const service = new ListProjectSummariesQueryService(readModel);
    const result = await service.execute(
      context,
      ListProjectSummariesQuery.create({ search: "atlas" })._unsafeUnwrap(),
    );

    expect(result._unsafeUnwrap()).toEqual({
      items: [
        {
          id: "prj_atlas",
          name: "Atlas API",
          slug: "atlas-api",
          description: "Public API and workers",
          resourceCount: 6,
          attentionCount: 1,
          attentionStatus: "attention",
          latestActivityAt: "2026-08-24T08:00:00.000Z",
        },
      ],
      nextCursor: "cursor_24",
    });
    expect(result._unsafeUnwrap().items[0]).not.toHaveProperty("resources");
    expect(result._unsafeUnwrap().items[0]).not.toHaveProperty("deployments");
  });

  test("[DASH-DATA-005] applies generic constrained project visibility", async () => {
    let receivedProjectIds: readonly string[] | undefined;
    const readModel: ProjectSummariesReadModel = {
      async list(_context, input) {
        receivedProjectIds = input.projectIds;
        return { items: [] };
      },
    };
    const scopePort: OperationScopePort = {
      scopeOperation: async () => ({
        effect: "allow",
        visibility: "constrained",
        reason: "test-project-visibility",
        constraints: [{ kind: "project", operator: "in", values: ["prj_visible"] }],
      }),
    };
    const service = new ListProjectSummariesQueryService(readModel, scopePort);

    const result = await service.execute(
      context,
      ListProjectSummariesQuery.create()._unsafeUnwrap(),
    );

    expect(result.isOk()).toBe(true);
    expect(receivedProjectIds).toEqual(["prj_visible"]);
  });
});
