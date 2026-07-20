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
  BrokerSandboxCredentialRequestCommand,
  ConfigureSandboxNetworkPolicyCommand,
  CreateSandboxCommand,
  CreateSandboxSnapshotCommand,
  CreateSandboxTemplateCommand,
  DeleteSandboxSnapshotCommand,
  DeleteSandboxTemplateCommand,
  ExecuteSandboxCommand,
  ExposeSandboxPortCommand,
  GrantSandboxCredentialCommand,
  ListSandboxCredentialGrantsQuery,
  ListSandboxesQuery,
  ListSandboxFilesQuery,
  ListSandboxPortsQuery,
  ListSandboxProcessesQuery,
  ListSandboxSnapshotsQuery,
  ListSandboxTemplatesQuery,
  PauseSandboxCommand,
  ReadSandboxFileQuery,
  RemoveSandboxFileCommand,
  ResumeSandboxCommand,
  RevokeSandboxCredentialCommand,
  RevokeSandboxPortCommand,
  ShowSandboxProcessQuery,
  ShowSandboxQuery,
  ShowSandboxSnapshotQuery,
  ShowSandboxTemplateQuery,
  StreamSandboxEventsQuery,
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
  | ConfigureSandboxNetworkPolicyCommand
  | ExposeSandboxPortCommand
  | RevokeSandboxPortCommand
  | CreateSandboxSnapshotCommand
  | DeleteSandboxSnapshotCommand
  | CreateSandboxTemplateCommand
  | DeleteSandboxTemplateCommand
  | GrantSandboxCredentialCommand
  | RevokeSandboxCredentialCommand
  | BrokerSandboxCredentialRequestCommand;
type SandboxQuery =
  | ListSandboxesQuery
  | ShowSandboxQuery
  | ListSandboxFilesQuery
  | ReadSandboxFileQuery
  | ListSandboxProcessesQuery
  | ShowSandboxProcessQuery
  | ListSandboxPortsQuery
  | ListSandboxSnapshotsQuery
  | ShowSandboxSnapshotQuery
  | ListSandboxTemplatesQuery
  | ShowSandboxTemplateQuery
  | StreamSandboxEventsQuery
  | ListSandboxCredentialGrantsQuery;

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
      return this.service.createAndReconcile(
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
      const stdinValue = input.stdinBase64;
      let stdin: Uint8Array | undefined;
      if (typeof stdinValue === "string") {
        const decoded = decodeBase64(stdinValue);
        if (decoded.isErr()) return err(decoded.error);
        stdin = decoded.value;
      }
      return this.service.exec(context, text(input, "sandboxId"), {
        ...(input as Parameters<ExecutionSandboxService["exec"]>[2]),
        ...(stdin ? { stdin } : {}),
      });
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
    if (command instanceof ConfigureSandboxNetworkPolicyCommand) {
      return this.service.updateNetworkPolicy(context, text(input, "sandboxId"), {
        networkPolicy: input.networkPolicy as Parameters<
          ExecutionSandboxService["updateNetworkPolicy"]
        >[2]["networkPolicy"],
      });
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
    if (command instanceof DeleteSandboxSnapshotCommand) {
      return this.service.deleteSnapshot(context, text(input, "snapshotId"));
    }
    if (command instanceof CreateSandboxTemplateCommand) {
      return this.service.createTemplate(
        context,
        input as Parameters<ExecutionSandboxService["createTemplate"]>[1],
      );
    }
    if (command instanceof DeleteSandboxTemplateCommand) {
      return this.service.deleteTemplate(context, text(input, "templateId"));
    }
    if (command instanceof GrantSandboxCredentialCommand) {
      return this.service.grantCredential(context, text(input, "sandboxId"), {
        grantId: text(input, "grantId"),
        secretRef: text(input, "secretRef"),
        destination: text(input, "destination"),
        transformation: input.transformation as Parameters<
          ExecutionSandboxService["grantCredential"]
        >[2]["transformation"],
        ...(typeof input.parameterName === "string" ? { parameterName: input.parameterName } : {}),
      });
    }
    if (command instanceof RevokeSandboxCredentialCommand) {
      return this.service.revokeCredential(
        context,
        text(input, "sandboxId"),
        text(input, "grantId"),
      );
    }
    if (command instanceof BrokerSandboxCredentialRequestCommand) {
      return this.service.brokerCredentialRequest(
        context,
        text(input, "sandboxId"),
        input as Parameters<ExecutionSandboxService["brokerCredentialRequest"]>[2],
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
    if (query instanceof StreamSandboxEventsQuery)
      return this.service.streamEvents(context, text(input, "sandboxId"), {
        ...(input as Parameters<ExecutionSandboxService["streamEvents"]>[2]),
        follow: true,
        ...(query.signal ? { signal: query.signal } : {}),
      });
    if (query instanceof ListSandboxCredentialGrantsQuery)
      return this.service.listCredentialGrants(context, text(input, "sandboxId"), input);
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
    if (query instanceof ShowSandboxProcessQuery)
      return this.service.showProcess(context, text(input, "sandboxId"), text(input, "processId"));
    if (query instanceof ListSandboxPortsQuery)
      return this.service.listPorts(context, text(input, "sandboxId"));
    if (query instanceof ListSandboxSnapshotsQuery)
      return this.service.listSnapshots(context, input);
    if (query instanceof ShowSandboxSnapshotQuery)
      return this.service.showSnapshot(context, text(input, "snapshotId"));
    if (query instanceof ListSandboxTemplatesQuery)
      return this.service.listTemplates(context, input);
    if (query instanceof ShowSandboxTemplateQuery)
      return this.service.showTemplate(context, text(input, "templateId"));
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
  ConfigureSandboxNetworkPolicyCommand,
  ExposeSandboxPortCommand,
  RevokeSandboxPortCommand,
  CreateSandboxSnapshotCommand,
  DeleteSandboxSnapshotCommand,
  CreateSandboxTemplateCommand,
  DeleteSandboxTemplateCommand,
  GrantSandboxCredentialCommand,
  RevokeSandboxCredentialCommand,
  BrokerSandboxCredentialRequestCommand,
])
  CommandHandler(command)(SandboxCommandHandler);

for (const query of [
  ListSandboxesQuery,
  ShowSandboxQuery,
  ListSandboxFilesQuery,
  ReadSandboxFileQuery,
  ListSandboxProcessesQuery,
  ShowSandboxProcessQuery,
  ListSandboxPortsQuery,
  ListSandboxSnapshotsQuery,
  ShowSandboxSnapshotQuery,
  ListSandboxTemplatesQuery,
  ShowSandboxTemplateQuery,
  StreamSandboxEventsQuery,
  ListSandboxCredentialGrantsQuery,
])
  QueryHandler(query)(SandboxQueryHandler);
