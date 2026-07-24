import { domainError, err, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import {
  CommandHandler,
  type CommandHandlerContract,
  QueryHandler,
  type QueryHandlerContract,
} from "./cqrs";
import { type ExecutionContext } from "./execution-context";
import { tokens } from "./tokens";
import { type WorkspaceCollaborationService } from "./workspace-collaboration";
import * as messages from "./workspace-collaboration-messages";

type CollaborationCommand =
  | messages.CreateWorkspaceCollaborationCommand
  | messages.AddWorkspaceCollaborationParticipantCommand
  | messages.ChangeWorkspaceCollaborationParticipantRoleCommand
  | messages.RemoveWorkspaceCollaborationParticipantCommand
  | messages.AddWorkspaceCollaborationLaneCommand
  | messages.ArchiveWorkspaceCollaborationLaneCommand
  | messages.AcquireWorkspaceWriterLeaseCommand
  | messages.RenewWorkspaceWriterLeaseCommand
  | messages.ReleaseWorkspaceWriterLeaseCommand
  | messages.TransferWorkspaceWriterLeaseCommand
  | messages.OfferWorkspaceCollaborationHandoffCommand
  | messages.ResolveWorkspaceCollaborationHandoffCommand
  | messages.IssueWorkspaceCollaborationTerminalAccessCommand
  | messages.IssueWorkspaceCollaborationNativeAttachCommand
  | messages.CloseWorkspaceCollaborationCommand;
type CollaborationQuery =
  | messages.ListWorkspaceCollaborationsQuery
  | messages.ShowWorkspaceCollaborationQuery
  | messages.AuthorizeWorkspaceCollaborationLaneAccessQuery;

const text = (input: Record<string, unknown>, key: string) => input[key] as string;

@injectable()
export class WorkspaceCollaborationCommandHandler
  implements CommandHandlerContract<CollaborationCommand, unknown>
{
  constructor(
    @inject(tokens.workspaceCollaborationService)
    private readonly service: WorkspaceCollaborationService,
  ) {}

  handle(context: ExecutionContext, command: CollaborationCommand): Promise<Result<unknown>> {
    const input = command.input;
    const collaborationId = text(input, "collaborationId");
    if (command instanceof messages.CreateWorkspaceCollaborationCommand) {
      return this.service.create(
        context,
        input as Parameters<WorkspaceCollaborationService["create"]>[1],
      );
    }
    if (command instanceof messages.AddWorkspaceCollaborationParticipantCommand) {
      return this.service.addParticipant(
        context,
        collaborationId,
        input as unknown as Parameters<WorkspaceCollaborationService["addParticipant"]>[2],
      );
    }
    if (command instanceof messages.ChangeWorkspaceCollaborationParticipantRoleCommand) {
      return this.service.changeParticipantRole(
        context,
        collaborationId,
        input as Parameters<WorkspaceCollaborationService["changeParticipantRole"]>[2],
      );
    }
    if (command instanceof messages.RemoveWorkspaceCollaborationParticipantCommand) {
      return this.service.removeParticipant(context, collaborationId, text(input, "participantId"));
    }
    if (command instanceof messages.AddWorkspaceCollaborationLaneCommand) {
      return this.service.addLane(
        context,
        collaborationId,
        input as Parameters<WorkspaceCollaborationService["addLane"]>[2],
      );
    }
    if (command instanceof messages.ArchiveWorkspaceCollaborationLaneCommand) {
      return this.service.archiveLane(context, collaborationId, text(input, "laneId"));
    }
    if (command instanceof messages.AcquireWorkspaceWriterLeaseCommand) {
      return this.service.acquireWriterLease(
        context,
        collaborationId,
        input as Parameters<WorkspaceCollaborationService["acquireWriterLease"]>[2],
      );
    }
    if (command instanceof messages.RenewWorkspaceWriterLeaseCommand) {
      return this.service.renewWriterLease(
        context,
        collaborationId,
        input as Parameters<WorkspaceCollaborationService["renewWriterLease"]>[2],
      );
    }
    if (command instanceof messages.ReleaseWorkspaceWriterLeaseCommand) {
      return this.service.releaseWriterLease(
        context,
        collaborationId,
        input as Parameters<WorkspaceCollaborationService["releaseWriterLease"]>[2],
      );
    }
    if (command instanceof messages.TransferWorkspaceWriterLeaseCommand) {
      return this.service.transferWriterLease(
        context,
        collaborationId,
        input as Parameters<WorkspaceCollaborationService["transferWriterLease"]>[2],
      );
    }
    if (command instanceof messages.OfferWorkspaceCollaborationHandoffCommand) {
      return this.service.offerHandoff(
        context,
        collaborationId,
        input as Parameters<WorkspaceCollaborationService["offerHandoff"]>[2],
      );
    }
    if (command instanceof messages.ResolveWorkspaceCollaborationHandoffCommand) {
      return this.service.resolveHandoff(
        context,
        collaborationId,
        input as Parameters<WorkspaceCollaborationService["resolveHandoff"]>[2],
      );
    }
    if (command instanceof messages.IssueWorkspaceCollaborationTerminalAccessCommand) {
      return this.service.issueTerminalAccess(
        context,
        input as unknown as Parameters<WorkspaceCollaborationService["issueTerminalAccess"]>[1],
      );
    }
    if (command instanceof messages.IssueWorkspaceCollaborationNativeAttachCommand) {
      return this.service.issueNativeAgentAttach(
        context,
        input as unknown as Parameters<WorkspaceCollaborationService["issueNativeAgentAttach"]>[1],
      );
    }
    if (command instanceof messages.CloseWorkspaceCollaborationCommand) {
      return this.service.close(context, collaborationId);
    }
    return Promise.resolve(err(domainError.invariant("Unknown Workspace Collaboration command")));
  }
}

@injectable()
export class WorkspaceCollaborationQueryHandler
  implements QueryHandlerContract<CollaborationQuery, unknown>
{
  constructor(
    @inject(tokens.workspaceCollaborationService)
    private readonly service: WorkspaceCollaborationService,
  ) {}

  handle(context: ExecutionContext, query: CollaborationQuery): Promise<Result<unknown>> {
    const input = query.input;
    if (query instanceof messages.ListWorkspaceCollaborationsQuery) {
      return this.service.list(context);
    }
    if (query instanceof messages.ShowWorkspaceCollaborationQuery) {
      return this.service.show(context, text(input, "collaborationId"));
    }
    if (query instanceof messages.AuthorizeWorkspaceCollaborationLaneAccessQuery) {
      return this.service.authorizeLaneAccess(
        context,
        input as unknown as Parameters<WorkspaceCollaborationService["authorizeLaneAccess"]>[1],
      );
    }
    return Promise.resolve(err(domainError.invariant("Unknown Workspace Collaboration query")));
  }
}

for (const command of [
  messages.CreateWorkspaceCollaborationCommand,
  messages.AddWorkspaceCollaborationParticipantCommand,
  messages.ChangeWorkspaceCollaborationParticipantRoleCommand,
  messages.RemoveWorkspaceCollaborationParticipantCommand,
  messages.AddWorkspaceCollaborationLaneCommand,
  messages.ArchiveWorkspaceCollaborationLaneCommand,
  messages.AcquireWorkspaceWriterLeaseCommand,
  messages.RenewWorkspaceWriterLeaseCommand,
  messages.ReleaseWorkspaceWriterLeaseCommand,
  messages.TransferWorkspaceWriterLeaseCommand,
  messages.OfferWorkspaceCollaborationHandoffCommand,
  messages.ResolveWorkspaceCollaborationHandoffCommand,
  messages.IssueWorkspaceCollaborationTerminalAccessCommand,
  messages.IssueWorkspaceCollaborationNativeAttachCommand,
  messages.CloseWorkspaceCollaborationCommand,
]) {
  CommandHandler(command)(WorkspaceCollaborationCommandHandler);
}

for (const query of [
  messages.ListWorkspaceCollaborationsQuery,
  messages.ShowWorkspaceCollaborationQuery,
  messages.AuthorizeWorkspaceCollaborationLaneAccessQuery,
]) {
  QueryHandler(query)(WorkspaceCollaborationQueryHandler);
}
