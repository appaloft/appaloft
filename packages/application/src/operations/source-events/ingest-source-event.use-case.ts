import { err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type IdGenerator,
  type IngestSourceEventResult,
  type SourceEventIdentity,
  type SourceEventIgnoredReason,
  type SourceEventPolicyReader,
  type SourceEventPolicyResult,
  type SourceEventRecord,
  type SourceEventRecorder,
  type SourceEventVerificationSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import { parseOperationInput } from "../shared-schema";
import {
  type IngestSourceEventCommandInput,
  type IngestSourceEventCommandPayload,
  ingestSourceEventCommandInputSchema,
} from "./ingest-source-event.schema";

@injectable()
export class IngestSourceEventUseCase {
  constructor(
    @inject(tokens.sourceEventRecorder)
    private readonly sourceEventRecorder: SourceEventRecorder,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.sourceEventPolicyReader)
    private readonly sourceEventPolicyReader?: SourceEventPolicyReader,
  ) {}

  async execute(
    context: ExecutionContext,
    input: IngestSourceEventCommandInput,
  ): Promise<Result<IngestSourceEventResult>> {
    const parsed = parseOperationInput(ingestSourceEventCommandInputSchema, input);
    if (parsed.isErr()) {
      return err(parsed.error);
    }

    return this.executeParsed(context, parsed.value);
  }

  private async executeParsed(
    context: ExecutionContext,
    input: IngestSourceEventCommandPayload,
  ): Promise<Result<IngestSourceEventResult>> {
    const repositoryContext = toRepositoryContext(context);
    const dedupeKey = sourceEventDedupeKey(input);
    const existing = await this.sourceEventRecorder.findByDedupeKey(repositoryContext, dedupeKey);
    const sourceIdentity = sourceIdentityFromInput(input.sourceIdentity);

    if (existing) {
      return ok({
        sourceEventId: existing.sourceEventId,
        status: "deduped",
        matchedResourceIds: [...existing.matchedResourceIds],
        createdDeploymentIds: [...existing.createdDeploymentIds],
        ignoredReasons: [...existing.ignoredReasons],
        dedupeOfSourceEventId: existing.sourceEventId,
      });
    }

    const outcome = this.sourceEventPolicyReader
      ? await evaluateSourceEventPolicyMatch(
          repositoryContext,
          this.sourceEventPolicyReader,
          input.sourceKind,
          sourceIdentity,
          input.eventKind,
          input.ref,
        )
      : emptySourceEventOutcome();

    const record: SourceEventRecord = {
      sourceEventId: this.idGenerator.next("sevt"),
      ...(outcome.projectId ? { projectId: outcome.projectId } : {}),
      sourceKind: input.sourceKind,
      eventKind: input.eventKind,
      sourceIdentity,
      ref: input.ref,
      revision: input.revision,
      ...(input.deliveryId ? { deliveryId: input.deliveryId } : {}),
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      dedupeKey,
      dedupeStatus: "new",
      verification: verificationFromInput(input.verification),
      status: outcome.status,
      matchedResourceIds: outcome.matchedResourceIds,
      ignoredReasons: outcome.ignoredReasons,
      policyResults: outcome.policyResults,
      createdDeploymentIds: outcome.createdDeploymentIds,
      receivedAt: input.receivedAt ?? this.clock.now(),
    };

    const stored = await this.sourceEventRecorder.record(repositoryContext, record);
    return ok(resultFromRecord(stored));
  }
}

interface SourceEventOutcome {
  status: "accepted" | "ignored" | "blocked";
  projectId?: string;
  matchedResourceIds: string[];
  ignoredReasons: SourceEventIgnoredReason[];
  policyResults: SourceEventPolicyResult[];
  createdDeploymentIds: string[];
}

function emptySourceEventOutcome(): SourceEventOutcome {
  return {
    status: "accepted",
    matchedResourceIds: [],
    ignoredReasons: [],
    policyResults: [],
    createdDeploymentIds: [],
  };
}

async function evaluateSourceEventPolicyMatch(
  context: Parameters<SourceEventPolicyReader["listCandidates"]>[0],
  sourceEventPolicyReader: SourceEventPolicyReader,
  sourceKind: IngestSourceEventCommandPayload["sourceKind"],
  sourceIdentity: SourceEventIdentity,
  eventKind: IngestSourceEventCommandPayload["eventKind"],
  ref: string,
): Promise<SourceEventOutcome> {
  const candidates = await sourceEventPolicyReader.listCandidates(context, {
    sourceKind,
    sourceIdentity,
  });
  if (candidates.length === 0) {
    return {
      status: "ignored",
      matchedResourceIds: [],
      ignoredReasons: ["no-matching-policy"],
      policyResults: [],
      createdDeploymentIds: [],
    };
  }

  const policyResults: SourceEventPolicyResult[] = [];
  const ignoredReasons = new Set<SourceEventIgnoredReason>();
  const matchedResourceIds: string[] = [];
  let projectId: string | undefined;

  for (const candidate of candidates) {
    projectId ??= candidate.projectId;

    if (candidate.status === "blocked") {
      ignoredReasons.add("policy-blocked");
      policyResults.push({
        resourceId: candidate.resourceId,
        status: "blocked",
        reason: "policy-blocked",
      });
      continue;
    }

    if (candidate.status === "disabled") {
      ignoredReasons.add("policy-disabled");
      policyResults.push({
        resourceId: candidate.resourceId,
        status: "ignored",
        reason: "policy-disabled",
      });
      continue;
    }

    if (!candidate.eventKinds.includes(eventKind) || !candidate.refs.includes(ref)) {
      ignoredReasons.add("ref-not-matched");
      policyResults.push({
        resourceId: candidate.resourceId,
        status: "ignored",
        reason: "ref-not-matched",
      });
      continue;
    }

    matchedResourceIds.push(candidate.resourceId);
    policyResults.push({
      resourceId: candidate.resourceId,
      status: "matched",
    });
  }

  if (matchedResourceIds.length > 0) {
    return {
      status: "accepted",
      ...(projectId ? { projectId } : {}),
      matchedResourceIds,
      ignoredReasons: [...ignoredReasons],
      policyResults,
      createdDeploymentIds: [],
    };
  }

  return {
    status: ignoredReasons.has("policy-blocked") ? "blocked" : "ignored",
    ...(projectId ? { projectId } : {}),
    matchedResourceIds: [],
    ignoredReasons: [...ignoredReasons],
    policyResults,
    createdDeploymentIds: [],
  };
}

export function sourceEventDedupeKey(input: {
  sourceKind: IngestSourceEventCommandPayload["sourceKind"];
  eventKind: IngestSourceEventCommandPayload["eventKind"];
  sourceIdentity: IngestSourceEventCommandPayload["sourceIdentity"];
  ref: string;
  revision: string;
  deliveryId?: string | undefined;
  idempotencyKey?: string | undefined;
}): string {
  const identity = [
    input.sourceKind,
    input.sourceIdentity.providerRepositoryId ?? "",
    input.sourceIdentity.repositoryFullName ?? "",
    safeSourceLocator(input.sourceIdentity.locator),
  ].join(":");

  if (input.deliveryId) {
    return `delivery:${identity}:${input.deliveryId.trim()}`;
  }

  if (input.idempotencyKey) {
    return `idempotency:${identity}:${input.idempotencyKey.trim()}`;
  }

  return `event:${identity}:${input.eventKind}:${input.ref.trim()}:${input.revision.trim()}`;
}

function sourceIdentityFromInput(
  input: IngestSourceEventCommandPayload["sourceIdentity"],
): SourceEventIdentity {
  return {
    locator: safeSourceLocator(input.locator),
    ...(input.providerRepositoryId ? { providerRepositoryId: input.providerRepositoryId } : {}),
    ...(input.repositoryFullName ? { repositoryFullName: input.repositoryFullName } : {}),
  };
}

function verificationFromInput(
  input: IngestSourceEventCommandPayload["verification"],
): SourceEventVerificationSummary {
  return {
    status: input.status,
    method: input.method,
    ...(input.keyVersion ? { keyVersion: input.keyVersion } : {}),
  };
}

function safeSourceLocator(locator: string): string {
  try {
    const parsed = new URL(locator);
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return locator.trim();
  }
}

function resultFromRecord(record: SourceEventRecord): IngestSourceEventResult {
  return {
    sourceEventId: record.sourceEventId,
    status: record.status,
    matchedResourceIds: [...record.matchedResourceIds],
    createdDeploymentIds: [...record.createdDeploymentIds],
    ignoredReasons: [...record.ignoredReasons],
    ...(record.dedupeOfSourceEventId
      ? { dedupeOfSourceEventId: record.dedupeOfSourceEventId }
      : {}),
  };
}
