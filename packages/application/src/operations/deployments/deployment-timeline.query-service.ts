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
  type DeploymentReadModel,
  type DeploymentTimelineEnvelope,
  type DeploymentTimelineObserver,
  type DeploymentTimelineReadResult,
  type StreamDeploymentTimelineResult,
} from "../../ports";
import { tokens } from "../../tokens";
import { type DeploymentTimelineQuery } from "./deployment-timeline.query";
import { type StreamDeploymentTimelineQuery } from "./stream-deployment-timeline.query";

function deploymentTimelineNotFound(deploymentId: string): DomainError {
  return {
    ...domainError.notFound("deployment", deploymentId),
    details: {
      queryName: "deployments.timeline",
      phase: "deployment-resolution",
      deploymentId,
    },
  };
}

function deploymentTimelineReadFailed(deploymentId: string, reason: unknown): DomainError {
  return {
    code: "deployment_timeline_unavailable",
    category: "infra",
    message: "Deployment timeline is unavailable",
    retryable: true,
    details: {
      queryName: "deployments.timeline",
      phase: "timeline-source-load",
      deploymentId,
      reason: reason instanceof Error ? reason.message : "unknown",
    },
  };
}

async function collectTimelineEnvelopes(
  deploymentId: string,
  stream: AsyncIterable<DeploymentTimelineEnvelope> & { close(): Promise<void> },
): Promise<Result<DeploymentTimelineEnvelope[]>> {
  const envelopes: DeploymentTimelineEnvelope[] = [];

  try {
    for await (const envelope of stream) {
      envelopes.push(envelope);
    }

    return ok(envelopes);
  } catch (error) {
    return err(deploymentTimelineReadFailed(deploymentId, error));
  } finally {
    await stream.close();
  }
}

@injectable()
export class DeploymentTimelineQueryService {
  constructor(
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.deploymentTimelineObserver)
    private readonly deploymentTimelineObserver: DeploymentTimelineObserver,
  ) {}

  async read(
    context: ExecutionContext,
    query: DeploymentTimelineQuery,
  ): Promise<Result<DeploymentTimelineReadResult>> {
    const result = await this.stream(context, {
      ...query,
      includeHistory: true,
      follow: false,
      untilTerminal: true,
    } as StreamDeploymentTimelineQuery);

    if (result.isErr()) {
      return err(result.error);
    }

    let envelopes: DeploymentTimelineEnvelope[];
    if (result.value.mode === "bounded") {
      envelopes = result.value.envelopes;
    } else {
      const collected = await collectTimelineEnvelopes(query.deploymentId, result.value.stream);
      if (collected.isErr()) {
        return err(collected.error);
      }
      envelopes = collected.value;
    }
    const entries = envelopes
      .filter((envelope): envelope is Extract<DeploymentTimelineEnvelope, { kind: "entry" }> => {
        return envelope.kind === "entry";
      })
      .map((envelope) => envelope.entry);
    const nextCursor = entries.at(-1)?.cursor;

    return ok({
      schemaVersion: "deployments.timeline/v1",
      deploymentId: query.deploymentId,
      entries,
      ...(nextCursor ? { nextCursor } : {}),
      hasMore: false,
    });
  }

  async stream(
    context: ExecutionContext,
    query: StreamDeploymentTimelineQuery,
  ): Promise<Result<StreamDeploymentTimelineResult>> {
    const repositoryContext = toRepositoryContext(context);
    const deployment = await this.deploymentReadModel.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(query.deploymentId)),
    );

    if (!deployment) {
      return err(deploymentTimelineNotFound(query.deploymentId));
    }

    const opened = await this.deploymentTimelineObserver.open(
      context,
      { deployment },
      {
        ...(query.cursor ? { cursor: query.cursor } : {}),
        limit: query.limit,
        includeHistory: query.includeHistory,
        follow: query.follow,
        untilTerminal: query.untilTerminal,
        ...(query.kinds ? { kinds: query.kinds } : {}),
        ...(query.sources ? { sources: query.sources } : {}),
      },
      query.signal ?? new AbortController().signal,
    );

    if (opened.isErr()) {
      return err(opened.error);
    }

    if (query.follow) {
      return ok({
        mode: "stream",
        deploymentId: deployment.id,
        stream: opened.value,
      });
    }

    return (await collectTimelineEnvelopes(deployment.id, opened.value)).map((envelopes) => ({
      mode: "bounded",
      deploymentId: deployment.id,
      envelopes,
    }));
  }
}
