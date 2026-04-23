import {
  DeploymentByIdSpec,
  DeploymentId,
  type DomainError,
  domainError,
  err,
  ok,
  type Result,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type DeploymentEventObserver,
  type DeploymentEventStream,
  type DeploymentEventStreamEnvelope,
  type DeploymentReadModel,
  type StreamDeploymentEventsResult,
} from "../../ports";
import { tokens } from "../../tokens";
import { type StreamDeploymentEventsQuery } from "./stream-deployment-events.query";

function withStreamDeploymentEventDetails(
  error: DomainError,
  details: Record<string, string | number | boolean | null>,
): DomainError {
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      queryName: "deployments.stream-events",
      ...details,
    },
  };
}

function deploymentStreamEventsNotFound(deploymentId: string): DomainError {
  return withStreamDeploymentEventDetails(domainError.notFound("deployment", deploymentId), {
    phase: "deployment-resolution",
    deploymentId,
  });
}

function deploymentStreamReplayFailed(
  deploymentId: string,
  cursor: string | undefined,
  reason: unknown,
): DomainError {
  return {
    code: "deployment_event_replay_failed",
    category: "infra",
    message: "Deployment event replay failed",
    retryable: true,
    details: {
      queryName: "deployments.stream-events",
      phase: "event-replay",
      deploymentId,
      ...(cursor ? { cursor } : {}),
      reason: reason instanceof Error ? reason.message : "unknown",
    },
  };
}

async function collectDeploymentEventEnvelopes(
  deploymentId: string,
  cursor: string | undefined,
  stream: DeploymentEventStream,
): Promise<Result<DeploymentEventStreamEnvelope[]>> {
  const envelopes: DeploymentEventStreamEnvelope[] = [];

  try {
    for await (const envelope of stream) {
      envelopes.push(envelope);
    }

    return ok(envelopes);
  } catch (error) {
    return err(deploymentStreamReplayFailed(deploymentId, cursor, error));
  } finally {
    await stream.close();
  }
}

@injectable()
export class StreamDeploymentEventsQueryService {
  constructor(
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.deploymentEventObserver)
    private readonly deploymentEventObserver: DeploymentEventObserver,
  ) {}

  async execute(
    context: ExecutionContext,
    query: StreamDeploymentEventsQuery,
  ): Promise<Result<StreamDeploymentEventsResult>> {
    const repositoryContext = toRepositoryContext(context);
    const deployment = await this.deploymentReadModel.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(query.deploymentId)),
    );

    if (!deployment) {
      return err(deploymentStreamEventsNotFound(query.deploymentId));
    }

    const signal = query.signal ?? new AbortController().signal;
    const opened = await this.deploymentEventObserver.open(
      context,
      { deployment },
      {
        historyLimit: query.historyLimit,
        includeHistory: query.includeHistory,
        follow: query.follow,
        untilTerminal: query.untilTerminal,
        ...(query.cursor ? { cursor: query.cursor } : {}),
      },
      signal,
    );

    if (opened.isErr()) {
      return err(
        withStreamDeploymentEventDetails(opened.error, {
          phase: String(opened.error.details?.phase ?? "event-source-load"),
          deploymentId: query.deploymentId,
          ...(query.cursor ? { cursor: query.cursor } : {}),
        }),
      );
    }

    if (query.follow) {
      return ok({
        mode: "stream",
        deploymentId: deployment.id,
        stream: opened.value,
      });
    }

    return (await collectDeploymentEventEnvelopes(deployment.id, query.cursor, opened.value)).map(
      (envelopes) => ({
        mode: "bounded",
        deploymentId: deployment.id,
        envelopes,
      }),
    );
  }
}
