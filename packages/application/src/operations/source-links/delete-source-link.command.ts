import { type Result } from "@appaloft/core";
import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type DeleteSourceLinkCommandInput,
  type DeleteSourceLinkCommandPayload,
  deleteSourceLinkCommandInputSchema,
} from "./delete-source-link.schema";

export {
  type DeleteSourceLinkCommandInput,
  deleteSourceLinkCommandInputSchema,
} from "./delete-source-link.schema";

export interface DeleteSourceLinkResult {
  sourceFingerprint: string;
  deleted: boolean;
}

export class DeleteSourceLinkCommand extends Command<DeleteSourceLinkResult> {
  constructor(
    public readonly sourceFingerprint: string,
    public readonly reason?: string,
  ) {
    super();
  }

  static create(input: DeleteSourceLinkCommandInput): Result<DeleteSourceLinkCommand> {
    return parseOperationInput(deleteSourceLinkCommandInputSchema, input).map(
      (parsed: DeleteSourceLinkCommandPayload) =>
        new DeleteSourceLinkCommand(parsed.sourceFingerprint, parsed.reason),
    );
  }
}
