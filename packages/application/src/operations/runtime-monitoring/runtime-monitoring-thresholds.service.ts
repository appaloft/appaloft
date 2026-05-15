import { err, ok, type Result, safeTry, UpdatedAt } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type IdGenerator,
  type RuntimeMonitoringSample,
  type RuntimeMonitoringSampleReadModel,
  type RuntimeMonitoringScope,
  type RuntimeMonitoringScopeEvidence,
  type RuntimeMonitoringSignal,
  type RuntimeMonitoringThresholdCrossing,
  type RuntimeMonitoringThresholdEvaluation,
  type RuntimeMonitoringThresholdMetric,
  type RuntimeMonitoringThresholdPolicyRead,
  type RuntimeMonitoringThresholdPolicyRecord,
  type RuntimeMonitoringThresholdPolicyRepository,
  type RuntimeMonitoringThresholdsReadback,
  type RuntimeUsageTotals,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ConfigureRuntimeMonitoringThresholdsCommandPayload } from "./configure-runtime-monitoring-thresholds.command";
import { type ParsedShowRuntimeMonitoringThresholdsQueryInput } from "./show-runtime-monitoring-thresholds.query";

function policyReadback(
  record: RuntimeMonitoringThresholdPolicyRecord,
): RuntimeMonitoringThresholdPolicyRead {
  return {
    schemaVersion: "runtime-monitoring-thresholds.policy/v1",
    policyId: record.policyId,
    scope: record.scope,
    rules: record.rules,
    enabled: record.enabled,
    updatedAt: record.updatedAt,
    ...(record.updatedByActorId ? { updatedByActorId: record.updatedByActorId } : {}),
    ...(record.updatedByActorKind ? { updatedByActorKind: record.updatedByActorKind } : {}),
  };
}

function defaultWindow(now: string): { from: string; to: string } {
  const toMs = Date.parse(now);
  return {
    from: new Date(toMs - 60 * 60 * 1000).toISOString(),
    to: now,
  };
}

function latestSample(samples: RuntimeMonitoringSample[]): RuntimeMonitoringSample | undefined {
  return [...samples].sort((left, right) => right.observedAt.localeCompare(left.observedAt))[0];
}

function runtimeMonitoringScopeKey(scope: RuntimeMonitoringScope): string {
  switch (scope.kind) {
    case "server":
      return `server:${scope.serverId}`;
    case "project":
      return `project:${scope.projectId}`;
    case "environment":
      return `environment:${scope.environmentId}`;
    case "resource":
      return `resource:${scope.resourceId}`;
    case "deployment":
      return `deployment:${scope.deploymentId}`;
  }
}

function scopeFromEvidence(
  kind: RuntimeMonitoringScope["kind"],
  evidence: RuntimeMonitoringScopeEvidence,
): RuntimeMonitoringScope | undefined {
  switch (kind) {
    case "server":
      return evidence.serverId ? { kind, serverId: evidence.serverId } : undefined;
    case "project":
      return evidence.projectId ? { kind, projectId: evidence.projectId } : undefined;
    case "environment":
      return evidence.environmentId ? { kind, environmentId: evidence.environmentId } : undefined;
    case "resource":
      return evidence.resourceId ? { kind, resourceId: evidence.resourceId } : undefined;
    case "deployment":
      return evidence.deploymentId ? { kind, deploymentId: evidence.deploymentId } : undefined;
  }
}

function inheritedThresholdPolicyScopeKinds(
  scope: RuntimeMonitoringScope,
): RuntimeMonitoringScope["kind"][] {
  switch (scope.kind) {
    case "deployment":
      return ["resource", "environment", "project", "server"];
    case "resource":
      return ["environment", "project", "server"];
    case "environment":
      return ["project", "server"];
    case "project":
      return ["server"];
    case "server":
      return [];
  }
}

function thresholdPolicyCandidateScopes(
  scope: RuntimeMonitoringScope,
  sample?: RuntimeMonitoringSample,
): RuntimeMonitoringScope[] {
  const candidates: RuntimeMonitoringScope[] = [scope];
  const seen = new Set([runtimeMonitoringScopeKey(scope)]);
  const evidence = sample?.scopeEvidence;
  if (!evidence) {
    return candidates;
  }

  for (const kind of inheritedThresholdPolicyScopeKinds(scope)) {
    const candidate = scopeFromEvidence(kind, evidence);
    if (!candidate) {
      continue;
    }
    const key = runtimeMonitoringScopeKey(candidate);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    candidates.push(candidate);
  }

  return candidates;
}

function metricValue(
  totals: RuntimeUsageTotals,
  signal: RuntimeMonitoringSignal,
  metric: RuntimeMonitoringThresholdMetric,
): number | undefined {
  switch (signal) {
    case "cpu":
      return metric === "containerCpuPercent"
        ? totals.cpu?.containerCpuPercent
        : totals.cpu?.loadAverage1m;
    case "memory":
      return metric === "containerUsedBytes"
        ? totals.memory?.containerUsedBytes
        : totals.memory?.usedBytes;
    case "disk":
      return metric === "attributedBytes" ? totals.disk?.attributedBytes : totals.disk?.usedBytes;
    case "inode":
      return totals.inode?.used;
    case "docker":
      switch (metric) {
        case "imageBytes":
          return totals.docker?.imageBytes;
        case "buildCacheBytes":
          return totals.docker?.buildCacheBytes;
        case "containerWritableBytes":
          return totals.docker?.containerWritableBytes;
        default:
          return undefined;
      }
    case "network":
      return metric === "rxBytes" ? totals.network?.rxBytes : totals.network?.txBytes;
  }
}

function crossingSeverity(input: {
  observedValue: number;
  warning?: number;
  critical?: number;
}): "warning" | "critical" | undefined {
  if (input.critical !== undefined && input.observedValue >= input.critical) {
    return "critical";
  }
  if (input.warning !== undefined && input.observedValue >= input.warning) {
    return "warning";
  }
  return undefined;
}

function stateForCrossings(
  sample: RuntimeMonitoringSample,
  crossed: RuntimeMonitoringThresholdCrossing[],
): RuntimeMonitoringThresholdEvaluation["state"] {
  if (sample.freshness === "stale") {
    return "stale";
  }
  if (crossed.some((crossing) => crossing.severity === "critical")) {
    return "critical";
  }
  if (crossed.some((crossing) => crossing.severity === "warning")) {
    return "warning";
  }
  return "ok";
}

function nextActionsForState(
  state: RuntimeMonitoringThresholdEvaluation["state"],
): RuntimeMonitoringThresholdEvaluation["nextActions"] {
  if (state === "ok") {
    return ["open-runtime-monitoring"];
  }
  if (state === "unknown" || state === "stale") {
    return ["open-runtime-monitoring", "inspect-runtime-usage", "configure-thresholds"];
  }
  return [
    "open-runtime-monitoring",
    "inspect-runtime-usage",
    "inspect-capacity",
    "review-runtime-logs",
    "review-deployment-events",
  ];
}

function evaluateThresholds(input: {
  policy: RuntimeMonitoringThresholdPolicyRecord | null;
  sample?: RuntimeMonitoringSample;
  sourceErrors: RuntimeMonitoringThresholdEvaluation["sourceErrors"];
}): RuntimeMonitoringThresholdEvaluation {
  if (!input.policy) {
    return {
      state: "unknown",
      crossed: [],
      nextActions: ["configure-thresholds"],
      sourceErrors: input.sourceErrors,
    };
  }
  if (!input.policy.enabled) {
    return {
      state: "unknown",
      crossed: [],
      nextActions: ["configure-thresholds"],
      sourceErrors: input.sourceErrors,
    };
  }
  if (!input.sample) {
    return {
      state: "unknown",
      crossed: [],
      nextActions: nextActionsForState("unknown"),
      sourceErrors: input.sourceErrors,
    };
  }

  const crossed = input.policy.rules.flatMap((rule): RuntimeMonitoringThresholdCrossing[] => {
    const observedValue = metricValue(input.sample?.totals ?? {}, rule.signal, rule.metric);
    if (observedValue === undefined) {
      return [];
    }
    const severity = crossingSeverity({
      observedValue,
      ...(rule.warning !== undefined ? { warning: rule.warning } : {}),
      ...(rule.critical !== undefined ? { critical: rule.critical } : {}),
    });
    return severity
      ? [
          {
            ruleId: rule.ruleId,
            signal: rule.signal,
            metric: rule.metric,
            severity,
            observedValue,
            boundary:
              severity === "critical" ? (rule.critical as number) : (rule.warning as number),
          },
        ]
      : [];
  });
  const state = stateForCrossings(input.sample, crossed);

  return {
    state,
    evaluatedAt: input.sample.observedAt,
    sourceSampleId: input.sample.sampleId,
    crossed,
    nextActions: nextActionsForState(state),
    sourceErrors: input.sourceErrors,
  };
}

@injectable()
export class ConfigureRuntimeMonitoringThresholdsUseCase {
  constructor(
    @inject(tokens.runtimeMonitoringThresholdPolicyRepository)
    private readonly repository: RuntimeMonitoringThresholdPolicyRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ConfigureRuntimeMonitoringThresholdsCommandPayload,
  ): Promise<Result<{ policy: RuntimeMonitoringThresholdPolicyRead }>> {
    const repositoryContext = toRepositoryContext(context);
    const { repository, clock, idGenerator } = this;

    return safeTry(async function* () {
      const updatedAt = yield* UpdatedAt.create(clock.now());
      const policyId = input.policyId ?? idGenerator.next("rmtp");
      const record: RuntimeMonitoringThresholdPolicyRecord = {
        policyId,
        scope: input.scope,
        rules: input.rules.map((rule) => ({
          ruleId: rule.ruleId ?? idGenerator.next("rmtr"),
          signal: rule.signal,
          metric: rule.metric,
          ...(rule.warning !== undefined ? { warning: rule.warning } : {}),
          ...(rule.critical !== undefined ? { critical: rule.critical } : {}),
          comparator: rule.comparator,
        })),
        enabled: input.enabled,
        updatedAt: updatedAt.value,
        ...(context.actor?.id ? { updatedByActorId: context.actor.id } : {}),
        ...(context.actor?.kind ? { updatedByActorKind: context.actor.kind } : {}),
      };
      const persisted = yield* await repository.upsert(repositoryContext, record);

      return ok({ policy: policyReadback(persisted) });
    });
  }
}

@injectable()
export class ShowRuntimeMonitoringThresholdsQueryService {
  constructor(
    @inject(tokens.runtimeMonitoringThresholdPolicyRepository)
    private readonly repository: RuntimeMonitoringThresholdPolicyRepository,
    @inject(tokens.runtimeMonitoringSampleReadModel)
    private readonly sampleReadModel: RuntimeMonitoringSampleReadModel,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ParsedShowRuntimeMonitoringThresholdsQueryInput,
  ): Promise<Result<RuntimeMonitoringThresholdsReadback>> {
    const window = input.window ?? defaultWindow(this.clock.now());
    const sampleResult = await this.sampleReadModel.listSamples(context, {
      scope: input.scope,
      window,
      limit: 720,
    });
    if (sampleResult.isErr()) {
      return err(sampleResult.error);
    }
    const sampleRead = sampleResult.value;
    const sample = latestSample(sampleRead.samples);
    const repositoryContext = toRepositoryContext(context);
    let policy: RuntimeMonitoringThresholdPolicyRecord | null = null;

    if (input.policyId) {
      const repositoryResult = await this.repository.findOne(repositoryContext, {
        policyId: input.policyId,
      });
      if (repositoryResult.isErr()) {
        return err(repositoryResult.error);
      }
      policy = repositoryResult.value;
    } else {
      for (const candidate of thresholdPolicyCandidateScopes(input.scope, sample)) {
        const repositoryResult = await this.repository.findOne(repositoryContext, {
          scope: candidate,
        });
        if (repositoryResult.isErr()) {
          return err(repositoryResult.error);
        }
        if (repositoryResult.value) {
          policy = repositoryResult.value;
          break;
        }
      }
    }

    const evaluation = evaluateThresholds({
      policy,
      ...(sample ? { sample } : {}),
      sourceErrors: sampleRead.sourceErrors,
    });

    return ok({
      schemaVersion: "runtime-monitoring-thresholds.show/v1",
      scope: input.scope,
      generatedAt: this.clock.now(),
      policy: policy ? policyReadback(policy) : null,
      evaluation,
    });
  }
}
