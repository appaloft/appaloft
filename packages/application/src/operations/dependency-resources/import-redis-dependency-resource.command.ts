import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ImportRedisDependencyResourceCommandInput,
  importRedisDependencyResourceCommandInputSchema,
} from "./import-redis-dependency-resource.schema";

export {
  type ImportRedisDependencyResourceCommandInput,
  importRedisDependencyResourceCommandInputSchema,
};

export class ImportRedisDependencyResourceCommand extends Command<{ id: string }> {
  constructor(
    public readonly projectId: string,
    public readonly environmentId: string,
    public readonly name: string,
    public readonly connectionUrl: string,
    public readonly secretRef?: string,
    public readonly connectionSecret?: string,
    public readonly description?: string,
    public readonly backupRelationship?: ImportRedisDependencyResourceCommandInput["backupRelationship"],
  ) {
    super();
  }

  static create(
    input: ImportRedisDependencyResourceCommandInput,
  ): Result<ImportRedisDependencyResourceCommand> {
    return parseOperationInput(importRedisDependencyResourceCommandInputSchema, input).map(
      (parsed) =>
        new ImportRedisDependencyResourceCommand(
          parsed.projectId,
          parsed.environmentId,
          parsed.name,
          parsed.connectionUrl,
          parsed.secretRef,
          parsed.connectionSecret,
          parsed.description,
          parsed.backupRelationship,
        ),
    );
  }
}
