import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type RetryOperatorWorkCommandInput,
  type RetryOperatorWorkCommandPayload,
  retryOperatorWorkCommandInputSchema,
} from "./retry-operator-work.schema";

export {
  type RetryOperatorWorkCommandInput,
  retryOperatorWorkCommandInputSchema,
} from "./retry-operator-work.schema";

export class RetryOperatorWorkCommand extends Command<{
  workId: string;
  status: "pending";
  retryOfWorkId: string;
  retriedAt: string;
}> {
  constructor(
    public readonly workId: string,
    public readonly reason?: string,
  ) {
    super();
  }

  static create(input: RetryOperatorWorkCommandInput): Result<RetryOperatorWorkCommand> {
    return parseOperationInput(retryOperatorWorkCommandInputSchema, input).map(
      (parsed: RetryOperatorWorkCommandPayload) =>
        new RetryOperatorWorkCommand(parsed.workId, parsed.reason),
    );
  }
}
