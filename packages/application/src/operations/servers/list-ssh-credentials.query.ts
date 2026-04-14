import { ok, type Result } from "@yundu/core";

import { Query } from "../../cqrs";
import { type SshCredentialSummary } from "../../ports";

export {
  type ListSshCredentialsQueryInput,
  listSshCredentialsQueryInputSchema,
} from "./list-ssh-credentials.schema";

export class ListSshCredentialsQuery extends Query<{ items: SshCredentialSummary[] }> {
  static create(): Result<ListSshCredentialsQuery> {
    return ok(new ListSshCredentialsQuery());
  }
}
