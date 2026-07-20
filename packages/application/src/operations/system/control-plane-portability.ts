import { type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import { z } from "zod";

import {
  Command,
  CommandHandler,
  type CommandHandlerContract,
  Query,
  QueryHandler,
  type QueryHandlerContract,
} from "../../cqrs";
import {
  type ExecutionContext,
  type RepositoryContext,
  toRepositoryContext,
} from "../../execution-context";
import { tokens } from "../../tokens";
import { parseOperationInput } from "../shared-schema";

export type ControlPlaneImportMode = "merge" | "replace";

export interface ControlPlanePortabilityArtifactSummary {
  id: string;
  schemaVersion: "appaloft.control-plane-portability/v1";
  createdAt: string;
  sourceRevision: string;
  tableCount: number;
  rowCount: number;
  checksum: string;
  sizeBytes: number;
  kind: "export" | "rollback" | "imported";
}

export interface ControlPlaneExportPlan {
  schemaVersion: "control-plane-portability.export-plan/v1";
  sourceRevision: string;
  tables: Array<{ name: string; rowCount: number }>;
  totalRows: number;
  warnings: string[];
}

export interface ControlPlaneExportResult {
  schemaVersion: "control-plane-portability.export/v1";
  artifact: ControlPlanePortabilityArtifactSummary;
  encryptedEnvelope: string;
}

export interface ControlPlaneImportPlan {
  schemaVersion: "control-plane-portability.import-plan/v1";
  compatible: boolean;
  mode: ControlPlaneImportMode;
  sourceRevision: string;
  targetRevision: string;
  tables: Array<{ name: string; incomingRows: number; existingRows: number; conflicts: number }>;
  blockers: string[];
  warnings: string[];
}

export interface ControlPlaneImportResult {
  schemaVersion: "control-plane-portability.import/v1";
  mode: ControlPlaneImportMode;
  importedRows: number;
  updatedRows: number;
  rollbackArtifactId: string;
  completedAt: string;
}

export interface ControlPlanePortabilityPort {
  planExport(context: RepositoryContext): Promise<Result<ControlPlaneExportPlan>>;
  export(
    context: RepositoryContext,
    input: { passphrase: string },
  ): Promise<Result<ControlPlaneExportResult>>;
  planImport(
    context: RepositoryContext,
    input: { encryptedEnvelope: string; passphrase: string; mode: ControlPlaneImportMode },
  ): Promise<Result<ControlPlaneImportPlan>>;
  importControlPlane(
    context: RepositoryContext,
    input: {
      encryptedEnvelope: string;
      passphrase: string;
      mode: ControlPlaneImportMode;
      acknowledgeReplace: boolean;
    },
  ): Promise<Result<ControlPlaneImportResult>>;
  listArtifacts(
    context: RepositoryContext,
  ): Promise<Result<ControlPlanePortabilityArtifactSummary[]>>;
  showArtifact(
    context: RepositoryContext,
    artifactId: string,
  ): Promise<Result<ControlPlanePortabilityArtifactSummary>>;
  deleteArtifact(
    context: RepositoryContext,
    artifactId: string,
  ): Promise<Result<{ id: string; deletedAt: string }>>;
}

const passphraseSchema = z.string().min(12).max(1024);
const envelopeSchema = z
  .string()
  .min(32)
  .max(256 * 1024 * 1024);
export const controlPlanePortabilityExportPlanQueryInputSchema = z.object({});
export const exportControlPlaneCommandInputSchema = z.object({ passphrase: passphraseSchema });
export const controlPlanePortabilityImportPlanQueryInputSchema = z.object({
  encryptedEnvelope: envelopeSchema,
  passphrase: passphraseSchema,
  mode: z.enum(["merge", "replace"]),
});
export const importControlPlaneCommandInputSchema =
  controlPlanePortabilityImportPlanQueryInputSchema.extend({
    acknowledgeReplace: z.boolean().default(false),
  });
export const listControlPlanePortabilityArtifactsQueryInputSchema = z.object({});
export const showControlPlanePortabilityArtifactQueryInputSchema = z.object({
  artifactId: z.string().trim().min(1),
});
export const deleteControlPlanePortabilityArtifactCommandInputSchema =
  showControlPlanePortabilityArtifactQueryInputSchema;
export type ControlPlanePortabilityExportPlanQueryInput = z.input<
  typeof controlPlanePortabilityExportPlanQueryInputSchema
>;
export type ExportControlPlaneCommandInput = z.input<typeof exportControlPlaneCommandInputSchema>;
export type ControlPlanePortabilityImportPlanQueryInput = z.input<
  typeof controlPlanePortabilityImportPlanQueryInputSchema
>;
export type ImportControlPlaneCommandInput = z.input<typeof importControlPlaneCommandInputSchema>;
export type ListControlPlanePortabilityArtifactsQueryInput = z.input<
  typeof listControlPlanePortabilityArtifactsQueryInputSchema
>;
export type ShowControlPlanePortabilityArtifactQueryInput = z.input<
  typeof showControlPlanePortabilityArtifactQueryInputSchema
>;
export type DeleteControlPlanePortabilityArtifactCommandInput = z.input<
  typeof deleteControlPlanePortabilityArtifactCommandInputSchema
>;
export interface ListControlPlanePortabilityArtifactsResponse {
  schemaVersion: "control-plane-portability.artifacts.list/v1";
  items: ControlPlanePortabilityArtifactSummary[];
}
export interface ShowControlPlanePortabilityArtifactResponse {
  schemaVersion: "control-plane-portability.artifacts.show/v1";
  artifact: ControlPlanePortabilityArtifactSummary;
}
export interface DeleteControlPlanePortabilityArtifactResponse {
  id: string;
  deletedAt: string;
}

export class ControlPlanePortabilityExportPlanQuery extends Query<ControlPlaneExportPlan> {
  static create(input: unknown = {}): Result<ControlPlanePortabilityExportPlanQuery> {
    return parseOperationInput(controlPlanePortabilityExportPlanQueryInputSchema, input).map(
      () => new ControlPlanePortabilityExportPlanQuery(),
    );
  }
}
export class ExportControlPlaneCommand extends Command<ControlPlaneExportResult> {
  constructor(public readonly passphrase: string) {
    super();
  }
  static create(input: unknown): Result<ExportControlPlaneCommand> {
    return parseOperationInput(exportControlPlaneCommandInputSchema, input).map(
      (value) => new ExportControlPlaneCommand(value.passphrase),
    );
  }
}
export class ControlPlanePortabilityImportPlanQuery extends Query<ControlPlaneImportPlan> {
  constructor(
    public readonly encryptedEnvelope: string,
    public readonly passphrase: string,
    public readonly mode: ControlPlaneImportMode,
  ) {
    super();
  }
  static create(input: unknown): Result<ControlPlanePortabilityImportPlanQuery> {
    return parseOperationInput(controlPlanePortabilityImportPlanQueryInputSchema, input).map(
      (value) =>
        new ControlPlanePortabilityImportPlanQuery(
          value.encryptedEnvelope,
          value.passphrase,
          value.mode,
        ),
    );
  }
}
export class ImportControlPlaneCommand extends Command<ControlPlaneImportResult> {
  constructor(
    public readonly encryptedEnvelope: string,
    public readonly passphrase: string,
    public readonly mode: ControlPlaneImportMode,
    public readonly acknowledgeReplace: boolean,
  ) {
    super();
  }
  static create(input: unknown): Result<ImportControlPlaneCommand> {
    return parseOperationInput(importControlPlaneCommandInputSchema, input).map(
      (value) =>
        new ImportControlPlaneCommand(
          value.encryptedEnvelope,
          value.passphrase,
          value.mode,
          value.acknowledgeReplace,
        ),
    );
  }
}
export class ListControlPlanePortabilityArtifactsQuery extends Query<{
  schemaVersion: "control-plane-portability.artifacts.list/v1";
  items: ControlPlanePortabilityArtifactSummary[];
}> {
  static create(input: unknown = {}): Result<ListControlPlanePortabilityArtifactsQuery> {
    return parseOperationInput(listControlPlanePortabilityArtifactsQueryInputSchema, input).map(
      () => new ListControlPlanePortabilityArtifactsQuery(),
    );
  }
}
export class ShowControlPlanePortabilityArtifactQuery extends Query<{
  schemaVersion: "control-plane-portability.artifacts.show/v1";
  artifact: ControlPlanePortabilityArtifactSummary;
}> {
  constructor(public readonly artifactId: string) {
    super();
  }
  static create(input: unknown): Result<ShowControlPlanePortabilityArtifactQuery> {
    return parseOperationInput(showControlPlanePortabilityArtifactQueryInputSchema, input).map(
      (value) => new ShowControlPlanePortabilityArtifactQuery(value.artifactId),
    );
  }
}
export class DeleteControlPlanePortabilityArtifactCommand extends Command<{
  id: string;
  deletedAt: string;
}> {
  constructor(public readonly artifactId: string) {
    super();
  }
  static create(input: unknown): Result<DeleteControlPlanePortabilityArtifactCommand> {
    return parseOperationInput(deleteControlPlanePortabilityArtifactCommandInputSchema, input).map(
      (value) => new DeleteControlPlanePortabilityArtifactCommand(value.artifactId),
    );
  }
}

@injectable()
export class ControlPlanePortabilityService {
  constructor(
    @inject(tokens.controlPlanePortabilityPort) private readonly port: ControlPlanePortabilityPort,
  ) {}
  planExport(context: ExecutionContext) {
    return this.port.planExport(toRepositoryContext(context));
  }
  export(context: ExecutionContext, command: ExportControlPlaneCommand) {
    return this.port.export(toRepositoryContext(context), { passphrase: command.passphrase });
  }
  planImport(context: ExecutionContext, query: ControlPlanePortabilityImportPlanQuery) {
    return this.port.planImport(toRepositoryContext(context), {
      encryptedEnvelope: query.encryptedEnvelope,
      passphrase: query.passphrase,
      mode: query.mode,
    });
  }
  importControlPlane(context: ExecutionContext, command: ImportControlPlaneCommand) {
    return this.port.importControlPlane(toRepositoryContext(context), {
      encryptedEnvelope: command.encryptedEnvelope,
      passphrase: command.passphrase,
      mode: command.mode,
      acknowledgeReplace: command.acknowledgeReplace,
    });
  }
  async list(context: ExecutionContext): Promise<
    Result<{
      schemaVersion: "control-plane-portability.artifacts.list/v1";
      items: ControlPlanePortabilityArtifactSummary[];
    }>
  > {
    return (await this.port.listArtifacts(toRepositoryContext(context))).map((items) => ({
      schemaVersion: "control-plane-portability.artifacts.list/v1",
      items,
    }));
  }
  async show(
    context: ExecutionContext,
    artifactId: string,
  ): Promise<
    Result<{
      schemaVersion: "control-plane-portability.artifacts.show/v1";
      artifact: ControlPlanePortabilityArtifactSummary;
    }>
  > {
    return (await this.port.showArtifact(toRepositoryContext(context), artifactId)).map(
      (artifact) => ({ schemaVersion: "control-plane-portability.artifacts.show/v1", artifact }),
    );
  }
  delete(context: ExecutionContext, artifactId: string) {
    return this.port.deleteArtifact(toRepositoryContext(context), artifactId);
  }
}

@QueryHandler(ControlPlanePortabilityExportPlanQuery)
@injectable()
export class ControlPlanePortabilityExportPlanQueryHandler
  implements QueryHandlerContract<ControlPlanePortabilityExportPlanQuery, ControlPlaneExportPlan>
{
  constructor(
    @inject(tokens.controlPlanePortabilityService)
    private readonly service: ControlPlanePortabilityService,
  ) {}
  handle(context: ExecutionContext) {
    return this.service.planExport(context);
  }
}
@CommandHandler(ExportControlPlaneCommand)
@injectable()
export class ExportControlPlaneCommandHandler
  implements CommandHandlerContract<ExportControlPlaneCommand, ControlPlaneExportResult>
{
  constructor(
    @inject(tokens.controlPlanePortabilityService)
    private readonly service: ControlPlanePortabilityService,
  ) {}
  handle(context: ExecutionContext, command: ExportControlPlaneCommand) {
    return this.service.export(context, command);
  }
}
@QueryHandler(ControlPlanePortabilityImportPlanQuery)
@injectable()
export class ControlPlanePortabilityImportPlanQueryHandler
  implements QueryHandlerContract<ControlPlanePortabilityImportPlanQuery, ControlPlaneImportPlan>
{
  constructor(
    @inject(tokens.controlPlanePortabilityService)
    private readonly service: ControlPlanePortabilityService,
  ) {}
  handle(context: ExecutionContext, query: ControlPlanePortabilityImportPlanQuery) {
    return this.service.planImport(context, query);
  }
}
@CommandHandler(ImportControlPlaneCommand)
@injectable()
export class ImportControlPlaneCommandHandler
  implements CommandHandlerContract<ImportControlPlaneCommand, ControlPlaneImportResult>
{
  constructor(
    @inject(tokens.controlPlanePortabilityService)
    private readonly service: ControlPlanePortabilityService,
  ) {}
  handle(context: ExecutionContext, command: ImportControlPlaneCommand) {
    return this.service.importControlPlane(context, command);
  }
}
@QueryHandler(ListControlPlanePortabilityArtifactsQuery)
@injectable()
export class ListControlPlanePortabilityArtifactsQueryHandler
  implements
    QueryHandlerContract<
      ListControlPlanePortabilityArtifactsQuery,
      {
        schemaVersion: "control-plane-portability.artifacts.list/v1";
        items: ControlPlanePortabilityArtifactSummary[];
      }
    >
{
  constructor(
    @inject(tokens.controlPlanePortabilityService)
    private readonly service: ControlPlanePortabilityService,
  ) {}
  handle(context: ExecutionContext) {
    return this.service.list(context);
  }
}
@QueryHandler(ShowControlPlanePortabilityArtifactQuery)
@injectable()
export class ShowControlPlanePortabilityArtifactQueryHandler
  implements
    QueryHandlerContract<
      ShowControlPlanePortabilityArtifactQuery,
      {
        schemaVersion: "control-plane-portability.artifacts.show/v1";
        artifact: ControlPlanePortabilityArtifactSummary;
      }
    >
{
  constructor(
    @inject(tokens.controlPlanePortabilityService)
    private readonly service: ControlPlanePortabilityService,
  ) {}
  handle(context: ExecutionContext, query: ShowControlPlanePortabilityArtifactQuery) {
    return this.service.show(context, query.artifactId);
  }
}
@CommandHandler(DeleteControlPlanePortabilityArtifactCommand)
@injectable()
export class DeleteControlPlanePortabilityArtifactCommandHandler
  implements
    CommandHandlerContract<
      DeleteControlPlanePortabilityArtifactCommand,
      { id: string; deletedAt: string }
    >
{
  constructor(
    @inject(tokens.controlPlanePortabilityService)
    private readonly service: ControlPlanePortabilityService,
  ) {}
  handle(context: ExecutionContext, command: DeleteControlPlanePortabilityArtifactCommand) {
    return this.service.delete(context, command.artifactId);
  }
}
