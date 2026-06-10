import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";

export const reorderServersCommandInputSchema = z.object({
  serverIds: z.array(z.string().trim().min(1)).min(1).max(500),
  startOffset: z.coerce.number().int().nonnegative().optional(),
});

export type ReorderServersCommandInput = z.input<typeof reorderServersCommandInputSchema>;

export class ReorderServersCommand extends Command<{ reorderedServerIds: string[] }> {
  constructor(
    public readonly serverIds: string[],
    public readonly startOffset: number,
  ) {
    super();
  }

  static create(input: ReorderServersCommandInput): Result<ReorderServersCommand> {
    return parseOperationInput(reorderServersCommandInputSchema, input).map(
      (parsed) => new ReorderServersCommand(parsed.serverIds, parsed.startOffset ?? 0),
    );
  }
}
