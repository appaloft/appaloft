import { domainError, err, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";
import {
  CommandHandler,
  type CommandHandlerContract,
  QueryHandler,
  type QueryHandlerContract,
} from "./cqrs";
import { type ExecutionContext } from "./execution-context";
import { type SandboxAgentDeliveryService } from "./sandbox-agent-runtime";
import * as messages from "./sandbox-agent-runtime-messages";
import { tokens } from "./tokens";

type AgentCommand =
  | messages.CreateSandboxAgentRuntimeCommand
  | messages.IssueSandboxAgentAttachAccessCommand
  | messages.TerminateSandboxAgentRuntimeCommand
  | messages.CreateSandboxAgentRunCommand
  | messages.CancelSandboxAgentRunCommand
  | messages.ResolveSandboxAgentApprovalCommand
  | messages.CreateSandboxSourceArtifactCommand
  | messages.DeleteSandboxSourceArtifactCommand
  | messages.CreateSandboxCandidatePreviewCommand
  | messages.DeleteSandboxCandidatePreviewCommand
  | messages.PlanSandboxPromotionCommand
  | messages.AcceptSandboxPromotionCommand
  | messages.RetrySandboxPromotionCommand;
type AgentQuery =
  | messages.ListSandboxAgentHarnessesQuery
  | messages.ListSandboxAgentRuntimesQuery
  | messages.ShowSandboxAgentRuntimeQuery
  | messages.ListSandboxAgentRunsQuery
  | messages.ShowSandboxAgentRunQuery
  | messages.ListSandboxAgentRunEventsQuery
  | messages.StreamSandboxAgentRunEventsQuery
  | messages.ListSandboxSourceArtifactsQuery
  | messages.ListSandboxAgentApprovalsQuery
  | messages.ShowSandboxAgentApprovalQuery
  | messages.ShowSandboxSourceArtifactQuery
  | messages.ShowSandboxCandidatePreviewQuery
  | messages.ListSandboxPromotionsQuery
  | messages.ShowSandboxPromotionQuery;

const text = (input: Record<string, unknown>, key: string) => input[key] as string;

@injectable()
export class SandboxAgentCommandHandler implements CommandHandlerContract<AgentCommand, unknown> {
  constructor(
    @inject(tokens.sandboxAgentDeliveryService)
    private readonly service: SandboxAgentDeliveryService,
  ) {}
  handle(context: ExecutionContext, command: AgentCommand): Promise<Result<unknown>> {
    const input = command.input;
    if (command instanceof messages.CreateSandboxAgentRuntimeCommand)
      return this.service.createRuntime(
        context,
        input as Parameters<SandboxAgentDeliveryService["createRuntime"]>[1],
      );
    if (command instanceof messages.IssueSandboxAgentAttachAccessCommand)
      return this.service.issueAttachAccess(
        context,
        input as Parameters<SandboxAgentDeliveryService["issueAttachAccess"]>[1],
      );
    if (command instanceof messages.TerminateSandboxAgentRuntimeCommand)
      return this.service.terminateRuntime(
        context,
        text(input, "sandboxId"),
        text(input, "runtimeId"),
      );
    if (command instanceof messages.CreateSandboxAgentRunCommand)
      return this.service.createRun(
        context,
        input as Parameters<SandboxAgentDeliveryService["createRun"]>[1],
      );
    if (command instanceof messages.CancelSandboxAgentRunCommand)
      return this.service.cancelRun(context, text(input, "runtimeId"), text(input, "runId"));
    if (command instanceof messages.ResolveSandboxAgentApprovalCommand)
      return this.service.resolveApproval(
        context,
        input as { approvalId: string; decision: "approve" | "reject" },
      );
    if (command instanceof messages.CreateSandboxSourceArtifactCommand)
      return this.service.createSourceArtifact(
        context,
        input as Parameters<SandboxAgentDeliveryService["createSourceArtifact"]>[1],
      );
    if (command instanceof messages.DeleteSandboxSourceArtifactCommand)
      return this.service.deleteSourceArtifact(context, text(input, "artifactId"));
    if (command instanceof messages.CreateSandboxCandidatePreviewCommand)
      return this.service.createCandidatePreview(context, input as { artifactId: string });
    if (command instanceof messages.DeleteSandboxCandidatePreviewCommand)
      return this.service.deleteCandidatePreview(context, text(input, "previewId"));
    if (command instanceof messages.PlanSandboxPromotionCommand)
      return this.service.planPromotion(
        context,
        input as Parameters<SandboxAgentDeliveryService["planPromotion"]>[1],
      );
    if (command instanceof messages.AcceptSandboxPromotionCommand)
      return this.service.acceptPromotion(
        context,
        input as Parameters<SandboxAgentDeliveryService["acceptPromotion"]>[1],
      );
    if (command instanceof messages.RetrySandboxPromotionCommand)
      return this.service.retryPromotion(
        context,
        text(input, "promotionId"),
        text(input, "idempotencyKey"),
      );
    return Promise.resolve(err(domainError.invariant("Unknown Sandbox Agent command")));
  }
}

@injectable()
export class SandboxAgentQueryHandler implements QueryHandlerContract<AgentQuery, unknown> {
  constructor(
    @inject(tokens.sandboxAgentDeliveryService)
    private readonly service: SandboxAgentDeliveryService,
  ) {}
  handle(context: ExecutionContext, query: AgentQuery): Promise<Result<unknown>> {
    const input = query.input;
    if (query instanceof messages.ListSandboxAgentHarnessesQuery)
      return this.service.listHarnesses(context);
    if (query instanceof messages.ListSandboxAgentRuntimesQuery)
      return this.service.listRuntimes(context, text(input, "sandboxId"));
    if (query instanceof messages.ShowSandboxAgentRuntimeQuery)
      return this.service.showRuntime(context, text(input, "sandboxId"), text(input, "runtimeId"));
    if (query instanceof messages.ListSandboxAgentRunsQuery)
      return this.service.listRuns(context, text(input, "runtimeId"));
    if (query instanceof messages.ShowSandboxAgentRunQuery)
      return this.service.showRun(context, text(input, "runtimeId"), text(input, "runId"));
    if (query instanceof messages.ListSandboxAgentRunEventsQuery)
      return this.service.listRunEvents(
        context,
        text(input, "runId"),
        input as { afterSequence?: number; limit?: number },
      );
    if (query instanceof messages.StreamSandboxAgentRunEventsQuery)
      return this.service.streamRunEvents(
        context,
        text(input, "runId"),
        input as { afterSequence?: number; limit?: number },
        query.signal,
      );
    if (query instanceof messages.ListSandboxAgentApprovalsQuery)
      return this.service.listApprovals(context, text(input, "runId"));
    if (query instanceof messages.ShowSandboxAgentApprovalQuery)
      return this.service.showApproval(context, text(input, "approvalId"));
    if (query instanceof messages.ListSandboxSourceArtifactsQuery)
      return this.service.listSourceArtifacts(context, text(input, "sandboxId"));
    if (query instanceof messages.ShowSandboxSourceArtifactQuery)
      return this.service.showSourceArtifact(context, text(input, "artifactId"));
    if (query instanceof messages.ShowSandboxCandidatePreviewQuery)
      return this.service.showCandidatePreview(context, text(input, "previewId"));
    if (query instanceof messages.ListSandboxPromotionsQuery)
      return this.service.listPromotions(context, text(input, "sandboxId"));
    if (query instanceof messages.ShowSandboxPromotionQuery)
      return this.service.showPromotion(context, text(input, "promotionId"));
    return Promise.resolve(err(domainError.invariant("Unknown Sandbox Agent query")));
  }
}

for (const command of [
  messages.CreateSandboxAgentRuntimeCommand,
  messages.IssueSandboxAgentAttachAccessCommand,
  messages.TerminateSandboxAgentRuntimeCommand,
  messages.CreateSandboxAgentRunCommand,
  messages.CancelSandboxAgentRunCommand,
  messages.ResolveSandboxAgentApprovalCommand,
  messages.CreateSandboxSourceArtifactCommand,
  messages.DeleteSandboxSourceArtifactCommand,
  messages.CreateSandboxCandidatePreviewCommand,
  messages.DeleteSandboxCandidatePreviewCommand,
  messages.PlanSandboxPromotionCommand,
  messages.AcceptSandboxPromotionCommand,
  messages.RetrySandboxPromotionCommand,
])
  CommandHandler(command)(SandboxAgentCommandHandler);

for (const query of [
  messages.ListSandboxAgentHarnessesQuery,
  messages.ListSandboxAgentRuntimesQuery,
  messages.ShowSandboxAgentRuntimeQuery,
  messages.ListSandboxAgentRunsQuery,
  messages.ShowSandboxAgentRunQuery,
  messages.ListSandboxAgentRunEventsQuery,
  messages.StreamSandboxAgentRunEventsQuery,
  messages.ListSandboxSourceArtifactsQuery,
  messages.ListSandboxAgentApprovalsQuery,
  messages.ShowSandboxAgentApprovalQuery,
  messages.ShowSandboxSourceArtifactQuery,
  messages.ShowSandboxCandidatePreviewQuery,
  messages.ListSandboxPromotionsQuery,
  messages.ShowSandboxPromotionQuery,
])
  QueryHandler(query)(SandboxAgentQueryHandler);
