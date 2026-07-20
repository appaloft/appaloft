import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import {
  CommandHandler,
  type CommandHandlerContract,
  QueryHandler,
  type QueryHandlerContract,
} from "./cqrs";
import { type ExecutionContext } from "./execution-context";
import { type ExecutionSandboxService } from "./execution-sandbox";
import {
  CreateSandboxCommand,
  CreateSandboxSnapshotCommand,
  ExecuteSandboxCommand,
  ExposeSandboxPortCommand,
  ListSandboxesQuery,
  ListSandboxFilesQuery,
  ListSandboxPortsQuery,
  ListSandboxProcessesQuery,
  ListSandboxSnapshotsQuery,
  PauseSandboxCommand,
  ReadSandboxFileQuery,
  RemoveSandboxFileCommand,
  ResumeSandboxCommand,
  RevokeSandboxPortCommand,
  ShowSandboxQuery,
  ShowSandboxSnapshotQuery,
  TerminateSandboxCommand,
  TerminateSandboxProcessCommand,
  WriteSandboxFileCommand,
} from "./execution-sandbox-messages";
import { tokens } from "./tokens";

type SandboxCommand =
  | CreateSandboxCommand
  | PauseSandboxCommand
  | ResumeSandboxCommand
  | TerminateSandboxCommand
  | ExecuteSandboxCommand
  | WriteSandboxFileCommand
  | RemoveSandboxFileCommand
  | TerminateSandboxProcessCommand
  | ExposeSandboxPortCommand
  | RevokeSandboxPortCommand
  | CreateSandboxSnapshotCommand;
type SandboxQuery =
  | ListSandboxesQuery
  | ShowSandboxQuery
  | ListSandboxFilesQuery
  | ReadSandboxFileQuery
  | ListSandboxProcessesQuery
  | ListSandboxPortsQuery
  | ListSandboxSnapshotsQuery
  | ShowSandboxSnapshotQuery;

function text(input: Record<string, unknown>, key: string): string {
  return input[key] as string;
}

function decodeBase64(value: string): Result<Uint8Array> {
  try {
    const decoded = atob(value);
    return ok(Uint8Array.from(decoded, (character) => character.charCodeAt(0)));
  } catch {
    return err(
      domainError.validation("Sandbox file content must be valid base64", {
        phase: "execution-sandbox-file-admission",
      }),
    );
  }
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

@injectable()
export class SandboxCommandHandler implements CommandHandlerContract<SandboxCommand, unknown> {
  constructor(
    @inject(tokens.executionSandboxService)
    private readonly service: ExecutionSandboxService,
  ) {}

  async handle(context: ExecutionContext, command: SandboxCommand): Promise<Result<unknown>> {
    const input = command.input;
    if (command instanceof CreateSandboxCommand) {
      return this.service.create(
        context,
        input as Parameters<ExecutionSandboxService["create"]>[1],
      );
    }
    if (command instanceof PauseSandboxCommand)
      return this.service.pause(context, text(input, "sandboxId"));
    if (command instanceof ResumeSandboxCommand)
      return this.service.resume(context, text(input, "sandboxId"));
    if (command instanceof TerminateSandboxCommand)
      return this.service.terminate(context, text(input, "sandboxId"));
    if (command instanceof ExecuteSandboxCommand) {
      return this.service.exec(
        context,
        text(input, "sandboxId"),
        input as Parameters<ExecutionSandboxService["exec"]>[2],
      );
    }
    if (command instanceof WriteSandboxFileCommand) {
      const decoded = decodeBase64(text(input, "contentBase64"));
      if (decoded.isErr()) return err(decoded.error);
      return this.service.writeFile(context, text(input, "sandboxId"), {
        path: text(input, "path"),
        content: decoded.value,
      });
    }
    if (command instanceof RemoveSandboxFileCommand) {
      return this.service.removeFile(
        context,
        text(input, "sandboxId"),
        input as Parameters<ExecutionSandboxService["removeFile"]>[2],
      );
    }
    if (command instanceof TerminateSandboxProcessCommand) {
      return this.service.terminateProcess(
        context,
        text(input, "sandboxId"),
        text(input, "processId"),
      );
    }
    if (command instanceof ExposeSandboxPortCommand) {
      return this.service.exposePort(
        context,
        text(input, "sandboxId"),
        input as Parameters<ExecutionSandboxService["exposePort"]>[2],
      );
    }
    if (command instanceof RevokeSandboxPortCommand) {
      return this.service.revokePort(context, text(input, "sandboxId"), text(input, "exposureId"));
    }
    if (command instanceof CreateSandboxSnapshotCommand) {
      return this.service.createSnapshot(
        context,
        text(input, "sandboxId"),
        input as Parameters<ExecutionSandboxService["createSnapshot"]>[2],
      );
    }
    return err(domainError.invariant("Sandbox command handler received an unknown message"));
  }
}

@injectable()
export class SandboxQueryHandler implements QueryHandlerContract<SandboxQuery, unknown> {
  constructor(
    @inject(tokens.executionSandboxService)
    private readonly service: ExecutionSandboxService,
  ) {}

  async handle(context: ExecutionContext, query: SandboxQuery): Promise<Result<unknown>> {
    const input = query.input;
    if (query instanceof ListSandboxesQuery) return this.service.list(context, input);
    if (query instanceof ShowSandboxQuery)
      return this.service.show(context, text(input, "sandboxId"));
    if (query instanceof ListSandboxFilesQuery)
      return this.service.listFiles(context, text(input, "sandboxId"), {
        path: text(input, "path"),
      });
    if (query instanceof ReadSandboxFileQuery) {
      const result = await this.service.readFile(context, text(input, "sandboxId"), {
        path: text(input, "path"),
      });
      return result.map((content) => ({
        contentBase64: encodeBase64(content),
        sizeBytes: content.byteLength,
      }));
    }
    if (query instanceof ListSandboxProcessesQuery)
      return this.service.listProcesses(context, text(input, "sandboxId"));
    if (query instanceof ListSandboxPortsQuery)
      return this.service.listPorts(context, text(input, "sandboxId"));
    if (query instanceof ListSandboxSnapshotsQuery)
      return this.service.listSnapshots(context, input);
    if (query instanceof ShowSandboxSnapshotQuery)
      return this.service.showSnapshot(context, text(input, "snapshotId"));
    return err(domainError.invariant("Sandbox query handler received an unknown message"));
  }
}

for (const command of [
  CreateSandboxCommand,
  PauseSandboxCommand,
  ResumeSandboxCommand,
  TerminateSandboxCommand,
  ExecuteSandboxCommand,
  WriteSandboxFileCommand,
  RemoveSandboxFileCommand,
  TerminateSandboxProcessCommand,
  ExposeSandboxPortCommand,
  RevokeSandboxPortCommand,
  CreateSandboxSnapshotCommand,
])
  CommandHandler(command)(SandboxCommandHandler);

for (const query of [
  ListSandboxesQuery,
  ShowSandboxQuery,
  ListSandboxFilesQuery,
  ReadSandboxFileQuery,
  ListSandboxProcessesQuery,
  ListSandboxPortsQuery,
  ListSandboxSnapshotsQuery,
  ShowSandboxSnapshotQuery,
])
  QueryHandler(query)(SandboxQueryHandler);
