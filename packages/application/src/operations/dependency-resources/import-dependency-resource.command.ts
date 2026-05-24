import { type Result } from "@appaloft/core";

import { Command } from "../../cqrs";
import { type DependencyResourceKind } from "../../ports";
import { parseOperationInput } from "../shared-schema";
import {
  type ImportDependencyResourceCommandInput,
  importDependencyResourceCommandInputSchema,
} from "./import-dependency-resource.schema";

export { type ImportDependencyResourceCommandInput, importDependencyResourceCommandInputSchema };

export class ImportDependencyResourceCommand extends Command<{ id: string }> {
  constructor(
    public readonly kind: DependencyResourceKind,
    public readonly projectId: string,
    public readonly environmentId: string,
    public readonly name: string,
    public readonly connectionUrl: string,
    public readonly secretRef?: string,
    public readonly connectionSecret?: string,
    public readonly description?: string,
    public readonly backupRelationship?: ImportDependencyResourceCommandInput["backupRelationship"],
  ) {
    super();
  }

  static create(
    input: ImportDependencyResourceCommandInput,
  ): Result<ImportDependencyResourceCommand> {
    return parseOperationInput(importDependencyResourceCommandInputSchema, input).map(
      (parsed) =>
        new ImportDependencyResourceCommand(
          parsed.kind,
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
