import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Command, Query } from "./cqrs";
import { parseOperationInput } from "./operations/shared-schema";
import { type RepositoryBindingReadModel } from "./repository-binding";

const repositoryIdentity = z.string().trim().min(3).max(2_048);
const projectId = z.string().trim().min(1).max(160);

export const bindProjectRepositoryInputSchema = z
  .object({ repositoryIdentity, projectId })
  .strict();
export const showRepositoryBindingInputSchema = z.object({ repositoryIdentity }).strict();
export const unbindRepositoryInputSchema = showRepositoryBindingInputSchema;

export class BindProjectRepositoryCommand extends Command<RepositoryBindingReadModel> {
  constructor(readonly input: z.output<typeof bindProjectRepositoryInputSchema>) {
    super();
  }

  static create(input: unknown): Result<BindProjectRepositoryCommand> {
    return parseOperationInput(bindProjectRepositoryInputSchema, input).map(
      (parsed) => new this(parsed),
    );
  }
}

export class ShowRepositoryBindingQuery extends Query<RepositoryBindingReadModel> {
  constructor(readonly input: z.output<typeof showRepositoryBindingInputSchema>) {
    super();
  }

  static create(input: unknown): Result<ShowRepositoryBindingQuery> {
    return parseOperationInput(showRepositoryBindingInputSchema, input).map(
      (parsed) => new this(parsed),
    );
  }
}

export class UnbindRepositoryCommand extends Command<RepositoryBindingReadModel> {
  constructor(readonly input: z.output<typeof unbindRepositoryInputSchema>) {
    super();
  }

  static create(input: unknown): Result<UnbindRepositoryCommand> {
    return parseOperationInput(unbindRepositoryInputSchema, input).map(
      (parsed) => new this(parsed),
    );
  }
}
