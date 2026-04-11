import { type Result } from "@yundu/core";

import { Query } from "../../cqrs";
import { type GitHubRepositorySummary } from "../../ports";
import { parseOperationInput, trimToUndefined } from "../shared-schema";
import {
  type ListGitHubRepositoriesQueryInput,
  listGitHubRepositoriesQueryInputSchema,
} from "./list-github-repositories.schema";

export {
  type ListGitHubRepositoriesQueryInput,
  listGitHubRepositoriesQueryInputSchema,
} from "./list-github-repositories.schema";

export class ListGitHubRepositoriesQuery extends Query<{ items: GitHubRepositorySummary[] }> {
  constructor(public readonly search?: string) {
    super();
  }

  static create(input?: ListGitHubRepositoriesQueryInput): Result<ListGitHubRepositoriesQuery> {
    return parseOperationInput(listGitHubRepositoriesQueryInputSchema, input ?? {}).map(
      (parsed) => new ListGitHubRepositoriesQuery(trimToUndefined(parsed.search)),
    );
  }
}
