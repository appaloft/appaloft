import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Query } from "../../cqrs";
import { type ProjectEnvironmentOverview } from "../../ports";
import { parseOperationInput } from "../shared-schema";

export const projectEnvironmentOverviewQueryInputSchema = z.object({
  projectId: z.string().trim().min(1).max(160),
  environmentId: z.string().trim().min(1).max(160),
  cursor: z
    .string()
    .trim()
    .regex(/^offset:\d+$/)
    .max(160)
    .optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
  search: z.string().trim().max(160).optional(),
  sort: z.enum(["name-asc", "name-desc", "recent-activity-desc"]).default("name-asc"),
  health: z.enum(["all", "healthy", "attention", "unknown"]).default("all"),
});

export type ProjectEnvironmentOverviewQueryInput = z.input<
  typeof projectEnvironmentOverviewQueryInputSchema
>;

export class ProjectEnvironmentOverviewQuery extends Query<ProjectEnvironmentOverview> {
  constructor(
    public readonly projectId: string,
    public readonly environmentId: string,
    public readonly limit: number,
    public readonly sort: "name-asc" | "name-desc" | "recent-activity-desc",
    public readonly health: "all" | "healthy" | "attention" | "unknown",
    public readonly cursor?: string,
    public readonly search?: string,
  ) {
    super();
  }

  static create(
    input: ProjectEnvironmentOverviewQueryInput,
  ): Result<ProjectEnvironmentOverviewQuery> {
    return parseOperationInput(projectEnvironmentOverviewQueryInputSchema, input).map(
      (parsed) =>
        new ProjectEnvironmentOverviewQuery(
          parsed.projectId,
          parsed.environmentId,
          parsed.limit,
          parsed.sort,
          parsed.health,
          parsed.cursor,
          parsed.search || undefined,
        ),
    );
  }
}
