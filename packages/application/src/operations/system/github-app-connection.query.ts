import { type Result } from "@appaloft/core";
import { Query } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type GitHubAppConnectionQueryInput,
  type GitHubAppConnectionStatus,
  githubAppConnectionQueryInputSchema,
} from "./github-app-connection.schema";

export {
  type GitHubAppConnectionQueryInput,
  type GitHubAppConnectionStatus,
  githubAppConnectionQueryInputSchema,
} from "./github-app-connection.schema";

export class GitHubAppConnectionQuery extends Query<GitHubAppConnectionStatus> {
  static create(input?: GitHubAppConnectionQueryInput): Result<GitHubAppConnectionQuery> {
    return parseOperationInput(githubAppConnectionQueryInputSchema, input ?? {}).map(
      () => new GitHubAppConnectionQuery(),
    );
  }
}
