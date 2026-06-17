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
  type DeploymentTimelineEntry,
  type DeploymentTimelineEnvelope,
  type DeploymentTimelineJournalSummary,
  type DeploymentTimelineKind,
  type DeploymentTimelineObserver,
  type DeploymentTimelineReadResult,
  type DeploymentTimelineSource,
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

function timelineCursor(deploymentId: string, sequence: number): string {
  return `${deploymentId}:${sequence}`;
}

function deploymentTimelineInvalidCursor(deploymentId: string, cursor: string): DomainError {
  return {
    ...domainError.validation("Deployment timeline cursor is invalid", {
      queryName: "deployments.timeline",
      phase: "cursor-resolution",
      deploymentId,
      cursor,
    }),
    code: "deployment_timeline_cursor_invalid",
  };
}

function parseTimelineCursor(
  deploymentId: string,
  cursor: string | undefined,
): Result<number | undefined> {
  if (!cursor) {
    return ok(undefined);
  }

  const separatorIndex = cursor.lastIndexOf(":");
  if (separatorIndex <= 0 || separatorIndex >= cursor.length - 1) {
    return err(deploymentTimelineInvalidCursor(deploymentId, cursor));
  }

  const cursorDeploymentId = cursor.slice(0, separatorIndex);
  const rawSequence = cursor.slice(separatorIndex + 1);
  const sequence = Number(rawSequence);
  if (
    cursorDeploymentId !== deploymentId ||
    !Number.isInteger(sequence) ||
    sequence < 1 ||
    rawSequence !== String(sequence)
  ) {
    return err(deploymentTimelineInvalidCursor(deploymentId, cursor));
  }

  return ok(sequence);
}

function timelineKindFromJournalSource(source: DeploymentTimelineSource): DeploymentTimelineKind {
  if (
    source === "application" ||
    source === "docker" ||
    source === "ssh" ||
    source === "provider"
  ) {
    return "output";
  }

  if (source === "health") {
    return "health-check";
  }

  if (source === "domain-event") {
    return "status";
  }

  return "lifecycle";
}

function timelineEntryFromJournal(
  deploymentId: string,
  log: DeploymentTimelineJournalSummary,
  index: number,
): DeploymentTimelineEntry {
  const sequence = index + 1;

  return {
    deploymentId,
    sequence,
    cursor: timelineCursor(deploymentId, sequence),
    occurredAt: log.timestamp,
    source: log.source,
    kind: timelineKindFromJournalSource(log.source),
    phase: log.phase,
    level: log.level,
    message: log.message,
    ...(log.level === "error" ? { status: "failed" as const } : {}),
  };
}

function timelineEntryMatchesQuery(
  entry: DeploymentTimelineEntry,
  query: DeploymentTimelineQuery,
): boolean {
  return (
    (!query.kinds || query.kinds.includes(entry.kind)) &&
    (!query.sources || query.sources.includes(entry.source))
  );
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
    const repositoryContext = toRepositoryContext(context);
    const deployment = await this.deploymentReadModel.findOne(
      repositoryContext,
      DeploymentByIdSpec.create(DeploymentId.rehydrate(query.deploymentId)),
    );

    if (!deployment) {
      return err(deploymentTimelineNotFound(query.deploymentId));
    }

    const cursorSequence = parseTimelineCursor(query.deploymentId, query.cursor);
    if (cursorSequence.isErr()) {
      return err(cursorSequence.error);
    }

    let entries: DeploymentTimelineEntry[];
    try {
      const logs = await this.deploymentReadModel.findTimeline(
        repositoryContext,
        query.deploymentId,
      );
      entries = logs
        .map((log, index) => timelineEntryFromJournal(query.deploymentId, log, index))
        .filter((entry) => timelineEntryMatchesQuery(entry, query));
    } catch (error) {
      return err(deploymentTimelineReadFailed(query.deploymentId, error));
    }

    if (cursorSequence.value) {
      entries = entries.filter((entry) => entry.sequence > cursorSequence.value!);
    }
    if (query.limit > 0) {
      entries = query.cursor ? entries.slice(0, query.limit) : entries.slice(-query.limit);
    }

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
