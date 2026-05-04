import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { parseOperationInput } from "../shared-schema";
import {
  type ImportPostgresDependencyResourceCommandInput,
  importPostgresDependencyResourceCommandInputSchema,
} from "./import-postgres-dependency-resource.schema";

export {
  type ImportPostgresDependencyResourceCommandInput,
  importPostgresDependencyResourceCommandInputSchema,
};

export class ImportPostgresDependencyResourceCommand extends Command<{ id: string }> {
  constructor(
    public readonly projectId: string,
    public readonly environmentId: string,
    public readonly name: string,
    public readonly connectionUrl: string,
    public readonly secretRef?: string,
    public readonly connectionSecret?: string,
    public readonly description?: string,
    public readonly backupRelationship?: ImportPostgresDependencyResourceCommandInput["backupRelationship"],
  ) {
    super();
  }

  static create(
    input: ImportPostgresDependencyResourceCommandInput,
  ): Result<ImportPostgresDependencyResourceCommand> {
    return parseOperationInput(importPostgresDependencyResourceCommandInputSchema, input).map(
      (parsed) =>
        new ImportPostgresDependencyResourceCommand(
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
