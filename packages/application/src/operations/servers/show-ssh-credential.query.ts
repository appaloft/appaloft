import { type Result } from "@appaloft/core";

import { Query } from "../../cqrs";
import { type SshCredentialDetail } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ShowSshCredentialQueryInput,
  showSshCredentialQueryInputSchema,
} from "./show-ssh-credential.schema";

export {
  type ShowSshCredentialQueryInput,
  showSshCredentialQueryInputSchema,
} from "./show-ssh-credential.schema";

export class ShowSshCredentialQuery extends Query<SshCredentialDetail> {
  constructor(
    public readonly credentialId: string,
    public readonly includeUsage: boolean,
  ) {
    super();
  }

  static create(input: ShowSshCredentialQueryInput): Result<ShowSshCredentialQuery> {
    return parseOperationInput(showSshCredentialQueryInputSchema, input).map(
      (parsed) => new ShowSshCredentialQuery(parsed.credentialId, parsed.includeUsage),
    );
  }
}
