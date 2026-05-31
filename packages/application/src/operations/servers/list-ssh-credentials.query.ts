import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type SshCredentialSummary } from "../../ports";
import { boundedListLimit, parseOperationInput } from "../shared-schema";
import {
  type ListSshCredentialsQueryInput,
  listSshCredentialsQueryInputSchema,
} from "./list-ssh-credentials.schema";

export {
  type ListSshCredentialsQueryInput,
  listSshCredentialsQueryInputSchema,
} from "./list-ssh-credentials.schema";

export class ListSshCredentialsQuery extends Query<{ items: SshCredentialSummary[] }> {
  constructor(public readonly limit: number = boundedListLimit()) {
    super();
  }

  static create(input?: ListSshCredentialsQueryInput): Result<ListSshCredentialsQuery> {
    return parseOperationInput(listSshCredentialsQueryInputSchema, input ?? {}).map(
      (parsed) => new ListSshCredentialsQuery(boundedListLimit(parsed.limit)),
    );
  }
}
