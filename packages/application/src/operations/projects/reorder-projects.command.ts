import { type Result } from "@appaloft/core";
import { z } from "zod";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";

export const reorderProjectsCommandInputSchema = z.object({
  projectIds: z.array(z.string().trim().min(1)).min(1).max(500),
  startOffset: z.coerce.number().int().nonnegative().optional(),
});

export type ReorderProjectsCommandInput = z.input<typeof reorderProjectsCommandInputSchema>;

export class ReorderProjectsCommand extends Command<{ reorderedProjectIds: string[] }> {
  constructor(
    public readonly projectIds: string[],
    public readonly startOffset: number,
  ) {
    super();
  }

  static create(input: ReorderProjectsCommandInput): Result<ReorderProjectsCommand> {
    return parseOperationInput(reorderProjectsCommandInputSchema, input).map(
      (parsed) => new ReorderProjectsCommand(parsed.projectIds, parsed.startOffset ?? 0),
    );
  }
}
