import {
  type InspectRuntimeUsageResponse,
  type RuntimeMonitoringSample as RetainedRuntimeMonitoringSample,
  type RuntimeMonitoringContributor,
  type RuntimeMonitoringDeploymentMarker,
  type RuntimeMonitoringRollupResponse,
  type RuntimeMonitoringSamplesResponse,
  type RuntimeMonitoringSignal,
  type RuntimeMonitoringThresholdMetric,
  type RuntimeMonitoringThresholdRule,
  type RuntimeMonitoringThresholdsResponse,
  type RuntimeUsageScope,
} from "@appaloft/contracts";

export function runtimeUsageQueryKey(scope: RuntimeUsageScope): readonly string[] {
  switch (scope.kind) {
    case "server":
      return ["runtime-usage", scope.kind, scope.serverId];
    case "project":
      return ["runtime-usage", scope.kind, scope.projectId];
    case "environment":
      return ["runtime-usage", scope.kind, scope.environmentId];
    case "resource":
      return ["runtime-usage", scope.kind, scope.resourceId];
    case "deployment":
      return ["runtime-usage", scope.kind, scope.deploymentId];
  }
}

export function runtimeMonitoringScopeQueryKey(
  prefix: string,
  scope: RuntimeUsageScope,
): readonly string[] {
  switch (scope.kind) {
    case "server":
      return [prefix, scope.kind, scope.serverId];
    case "project":
      return [prefix, scope.kind, scope.projectId];
    case "environment":
      return [prefix, scope.kind, scope.environmentId];
    case "resource":
      return [prefix, scope.kind, scope.resourceId];
    case "deployment":
      return [prefix, scope.kind, scope.deploymentId];
  }
}

export function formatRuntimeUsageBytes(value: number | undefined): string | null {
  if (value === undefined || !Number.isFinite(value)) {
    return null;
  }

  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let size = Math.max(0, value);
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = size >= 10 || unitIndex === 0 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}

export type RuntimeMonitoringSample = {
  observedAt: string;
  cpuLoadPercent: number | null;
  memoryPercent: number | null;
  diskPercent: number | null;
};

export type RuntimeMonitoringSignalKey = "cpu" | "memory" | "disk";

export type RuntimeMonitoringChartPoint = {
  observedAt: Date;
  observedAtIso: string;
  value: number;
};

export type RuntimeMonitoringContributorItem = {
  scope: RuntimeMonitoringContributor["scope"];
  scopeId: string;
  href: string;
  sampleCount: number;
};

export type RuntimeMonitoringDeploymentMarkerItem = RuntimeMonitoringDeploymentMarker & {
  href: string;
};

export type RuntimeMonitoringObservationHandoff = {
  from: string;
  to: string;
  scope: RuntimeUsageScope;
};

function percent(used: number | undefined, total: number | undefined): number | null {
  if (
    used === undefined ||
    total === undefined ||
    !Number.isFinite(used) ||
    !Number.isFinite(total) ||
    total <= 0
  ) {
    return null;
  }

  return Math.max(0, Math.min(100, (used / total) * 100));
}

function cpuPercent(totals: InspectRuntimeUsageResponse["totals"]): number | null {
  const logicalCores = totals.cpu?.logicalCores;
  if (totals.cpu?.containerCpuPercent !== undefined) {
    return Math.max(0, Math.min(100, totals.cpu.containerCpuPercent));
  }
  if (
    totals.cpu?.loadAverage1m !== undefined &&
    logicalCores !== undefined &&
    Number.isFinite(totals.cpu.loadAverage1m) &&
    Number.isFinite(logicalCores) &&
    logicalCores > 0
  ) {
    return Math.max(0, Math.min(100, (totals.cpu.loadAverage1m / logicalCores) * 100));
  }

  return null;
}

export function runtimeMonitoringSignalPercent(
  totals: InspectRuntimeUsageResponse["totals"],
  signal: RuntimeMonitoringSignalKey,
): number | null {
  switch (signal) {
    case "cpu":
      return cpuPercent(totals);
    case "memory":
      return percent(totals.memory?.usedBytes, totals.memory?.totalBytes);
    case "disk":
      return percent(totals.disk?.usedBytes, totals.disk?.totalBytes);
  }
}

export function runtimeMonitoringSampleFromUsage(
  usage: InspectRuntimeUsageResponse | null,
): RuntimeMonitoringSample | null {
  if (!usage) {
    return null;
  }

  return {
    observedAt: usage.observedAt ?? usage.generatedAt,
    cpuLoadPercent: cpuPercent(usage.totals),
    memoryPercent: percent(usage.totals.memory?.usedBytes, usage.totals.memory?.totalBytes),
    diskPercent: percent(usage.totals.disk?.usedBytes, usage.totals.disk?.totalBytes),
  };
}

export function runtimeMonitoringSampleFromRetained(
  sample: RetainedRuntimeMonitoringSample,
): RuntimeMonitoringSample {
  return {
    observedAt: sample.observedAt,
    cpuLoadPercent: cpuPercent(sample.totals),
    memoryPercent: percent(sample.totals.memory?.usedBytes, sample.totals.memory?.totalBytes),
    diskPercent: percent(sample.totals.disk?.usedBytes, sample.totals.disk?.totalBytes),
  };
}

export function retainedRuntimeMonitoringSamples(
  response: RuntimeMonitoringSamplesResponse | null,
): RuntimeMonitoringSample[] {
  return response?.samples.map(runtimeMonitoringSampleFromRetained) ?? [];
}

export function appendRuntimeMonitoringSample(
  samples: RuntimeMonitoringSample[],
  sample: RuntimeMonitoringSample,
  limit = 20,
): RuntimeMonitoringSample[] {
  const withoutDuplicate = samples.filter((item) => item.observedAt !== sample.observedAt);
  return [...withoutDuplicate, sample].slice(-limit);
}

export function mergeRuntimeMonitoringSamples(
  retainedSamples: RuntimeMonitoringSample[],
  liveSamples: RuntimeMonitoringSample[],
  limit = 60,
): RuntimeMonitoringSample[] {
  const samplesByObservedAt = new Map<string, RuntimeMonitoringSample>();

  for (const sample of [...retainedSamples, ...liveSamples]) {
    samplesByObservedAt.set(sample.observedAt, sample);
  }

  return Array.from(samplesByObservedAt.values())
    .sort((left, right) => Date.parse(left.observedAt) - Date.parse(right.observedAt))
    .slice(-limit);
}

export function formatRuntimeMonitoringPercent(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return `${Math.round(value)}%`;
}

export function runtimeMonitoringSparklinePoints(
  values: Array<number | null>,
  width = 160,
  height = 48,
): string {
  const indexedValues = values
    .map((value, index) => ({ value, index }))
    .filter((point): point is { value: number; index: number } => point.value !== null);

  if (indexedValues.length < 2) {
    return "";
  }

  const maxIndex = Math.max(1, values.length - 1);
  return indexedValues
    .map(({ value, index }) => {
      const x = (index / maxIndex) * width;
      const y = height - (Math.max(0, Math.min(100, value)) / 100) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function runtimeMonitoringRollupValues(
  rollup: RuntimeMonitoringRollupResponse | null,
  signal: RuntimeMonitoringSignalKey,
): Array<number | null> {
  const series = rollup?.series.find((candidate) => candidate.signal === signal);
  return series?.points.map((point) => runtimeMonitoringSignalPercent(point.totals, signal)) ?? [];
}

export function latestRuntimeMonitoringRollupValue(
  rollup: RuntimeMonitoringRollupResponse | null,
  signal: RuntimeMonitoringSignalKey,
): number | null {
  const values = runtimeMonitoringRollupValues(rollup, signal).filter(
    (value): value is number => value !== null,
  );
  return values.at(-1) ?? null;
}

function chartPointFromTimestamp(
  timestamp: string,
  value: number | null,
): RuntimeMonitoringChartPoint | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  const observedAt = new Date(timestamp);
  if (!Number.isFinite(observedAt.getTime())) {
    return null;
  }

  return {
    observedAt,
    observedAtIso: timestamp,
    value,
  };
}

export function runtimeMonitoringSignalChartPoints(
  rollup: RuntimeMonitoringRollupResponse | null,
  samples: RuntimeMonitoringSample[],
  signal: RuntimeMonitoringSignalKey,
): RuntimeMonitoringChartPoint[] {
  const rollupSeries = rollup?.series.find((candidate) => candidate.signal === signal);
  const rollupPoints =
    rollupSeries?.points
      .map((point) =>
        chartPointFromTimestamp(point.to, runtimeMonitoringSignalPercent(point.totals, signal)),
      )
      .filter((point): point is RuntimeMonitoringChartPoint => point !== null) ?? [];

  if (rollupPoints.length > 0) {
    return rollupPoints;
  }

  return samples
    .map((sample) => {
      switch (signal) {
        case "cpu":
          return chartPointFromTimestamp(sample.observedAt, sample.cpuLoadPercent);
        case "memory":
          return chartPointFromTimestamp(sample.observedAt, sample.memoryPercent);
        case "disk":
          return chartPointFromTimestamp(sample.observedAt, sample.diskPercent);
      }

      return null;
    })
    .filter((point): point is RuntimeMonitoringChartPoint => point !== null);
}

export function runtimeMonitoringRollupSummary(rollup: RuntimeMonitoringRollupResponse | null): {
  seriesCount: number;
  markerCount: number;
  contributorCount: number;
  bucket: RuntimeMonitoringRollupResponse["bucket"];
} | null {
  if (!rollup) {
    return null;
  }

  return {
    seriesCount: rollup.series.length,
    markerCount: rollup.deploymentMarkers.length,
    contributorCount: rollup.topContributors.length,
    bucket: rollup.bucket,
  };
}

export function runtimeMonitoringScopeId(scope: RuntimeUsageScope): string {
  switch (scope.kind) {
    case "server":
      return scope.serverId;
    case "project":
      return scope.projectId;
    case "environment":
      return scope.environmentId;
    case "resource":
      return scope.resourceId;
    case "deployment":
      return scope.deploymentId;
  }
}

export function runtimeMonitoringScopeHref(scope: RuntimeUsageScope): string {
  const scopeId = encodeURIComponent(runtimeMonitoringScopeId(scope));
  switch (scope.kind) {
    case "server":
      return `/servers/${scopeId}`;
    case "project":
      return `/projects/${scopeId}`;
    case "resource":
      return `/resources/${scopeId}`;
    case "deployment":
      return `/deployments/${scopeId}`;
    case "environment":
      return `/projects?environmentId=${scopeId}`;
  }
}

export function runtimeMonitoringObservationWindow(
  retainedSamples: RuntimeMonitoringSamplesResponse | null,
  rollup: RuntimeMonitoringRollupResponse | null,
): { from: string; to: string } | null {
  if (rollup?.from && rollup.to) {
    return {
      from: rollup.from,
      to: rollup.to,
    };
  }

  if (retainedSamples?.from && retainedSamples.to) {
    return {
      from: retainedSamples.from,
      to: retainedSamples.to,
    };
  }

  return null;
}

export function runtimeMonitoringObservationHref(
  href: string,
  input: {
    scope: RuntimeUsageScope;
    retainedSamples?: RuntimeMonitoringSamplesResponse | null;
    rollup?: RuntimeMonitoringRollupResponse | null;
  },
): string {
  const window = runtimeMonitoringObservationWindow(
    input.retainedSamples ?? null,
    input.rollup ?? null,
  );
  if (!href || !window) {
    return href;
  }

  const url = new URL(href, "http://appaloft.local");
  url.searchParams.set("runtimeMonitoringFrom", window.from);
  url.searchParams.set("runtimeMonitoringTo", window.to);
  url.searchParams.set("runtimeMonitoringScopeKind", input.scope.kind);
  url.searchParams.set("runtimeMonitoringScopeId", runtimeMonitoringScopeId(input.scope));

  return `${url.pathname}${url.search}${url.hash}`;
}

export function runtimeMonitoringObservationHandoffFromSearchParams(
  params: URLSearchParams,
): RuntimeMonitoringObservationHandoff | null {
  const from = params.get("runtimeMonitoringFrom")?.trim();
  const to = params.get("runtimeMonitoringTo")?.trim();
  const scopeKind = params.get("runtimeMonitoringScopeKind")?.trim();
  const scopeId = params.get("runtimeMonitoringScopeId")?.trim();
  if (!from || !to || !scopeKind || !scopeId) {
    return null;
  }

  if (!Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to))) {
    return null;
  }

  switch (scopeKind) {
    case "server":
      return { from, to, scope: { kind: "server", serverId: scopeId } };
    case "project":
      return { from, to, scope: { kind: "project", projectId: scopeId } };
    case "environment":
      return { from, to, scope: { kind: "environment", environmentId: scopeId } };
    case "resource":
      return { from, to, scope: { kind: "resource", resourceId: scopeId } };
    case "deployment":
      return { from, to, scope: { kind: "deployment", deploymentId: scopeId } };
    default:
      return null;
  }
}

export function runtimeMonitoringObservationHandoffMatchesScope(
  handoff: RuntimeMonitoringObservationHandoff | null,
  scope: RuntimeUsageScope,
): handoff is RuntimeMonitoringObservationHandoff {
  return (
    handoff !== null &&
    handoff.scope.kind === scope.kind &&
    runtimeMonitoringScopeId(handoff.scope) === runtimeMonitoringScopeId(scope)
  );
}

export function runtimeMonitoringTimestampInObservationWindow(
  timestamp: string | undefined,
  handoff: RuntimeMonitoringObservationHandoff | null,
): boolean {
  if (!timestamp || !handoff) {
    return true;
  }

  const value = Date.parse(timestamp);
  if (!Number.isFinite(value)) {
    return true;
  }

  return value >= Date.parse(handoff.from) && value <= Date.parse(handoff.to);
}

export function runtimeMonitoringDeploymentInObservationWindow(
  deployment: {
    createdAt: string;
    startedAt?: string;
    finishedAt?: string;
  },
  handoff: RuntimeMonitoringObservationHandoff | null,
): boolean {
  if (!handoff) {
    return true;
  }

  return [deployment.createdAt, deployment.startedAt, deployment.finishedAt].some((timestamp) =>
    runtimeMonitoringTimestampInObservationWindow(timestamp, handoff),
  );
}

export function runtimeMonitoringTopContributorItems(
  rollup: RuntimeMonitoringRollupResponse | null,
  limit = 3,
): RuntimeMonitoringContributorItem[] {
  return (
    rollup?.topContributors.slice(0, limit).map((contributor) => ({
      scope: contributor.scope,
      scopeId: runtimeMonitoringScopeId(contributor.scope),
      href: runtimeMonitoringScopeHref(contributor.scope),
      sampleCount: contributor.sampleCount,
    })) ?? []
  );
}

export function runtimeMonitoringDeploymentMarkerItems(
  rollup: RuntimeMonitoringRollupResponse | null,
  limit = 3,
): RuntimeMonitoringDeploymentMarkerItem[] {
  return (
    rollup?.deploymentMarkers.slice(-limit).map((marker) => ({
      ...marker,
      href: `/deployments/${encodeURIComponent(marker.deploymentId)}`,
    })) ?? []
  );
}

export function runtimeMonitoringThresholdSummary(
  thresholds: RuntimeMonitoringThresholdsResponse | null,
): {
  state: RuntimeMonitoringThresholdsResponse["evaluation"]["state"];
  crossingCount: number;
  nextActionCount: number;
  hasPolicy: boolean;
} | null {
  if (!thresholds) {
    return null;
  }

  return {
    state: thresholds.evaluation.state,
    crossingCount: thresholds.evaluation.crossed.length,
    nextActionCount: thresholds.evaluation.nextActions.length,
    hasPolicy: thresholds.policy !== null,
  };
}

type RuntimeMonitoringThresholdRuleInput = Omit<RuntimeMonitoringThresholdRule, "ruleId"> & {
  ruleId?: string;
};

export type RuntimeMonitoringEditableThresholdKey = "cpu" | "memory" | "disk";

type RuntimeMonitoringEditableThresholdDefinition = {
  key: RuntimeMonitoringEditableThresholdKey;
  signal: RuntimeMonitoringSignal;
  metric: RuntimeMonitoringThresholdMetric;
};

const runtimeMonitoringEditableThresholds = [
  {
    key: "cpu",
    signal: "cpu",
    metric: "containerCpuPercent",
  },
  {
    key: "memory",
    signal: "memory",
    metric: "usedBytes",
  },
  {
    key: "disk",
    signal: "disk",
    metric: "usedBytes",
  },
] satisfies RuntimeMonitoringEditableThresholdDefinition[];

export type RuntimeMonitoringThresholdForm = {
  enabled: boolean;
  rules: Record<
    RuntimeMonitoringEditableThresholdKey,
    {
      warning: string;
      critical: string;
    }
  >;
};

export type RuntimeMonitoringThresholdConfigureInput = {
  policyId?: string;
  scope: RuntimeUsageScope;
  rules: RuntimeMonitoringThresholdRuleInput[];
  enabled: boolean;
};

export type RuntimeMonitoringThresholdConfigureResult =
  | {
      ok: true;
      input: RuntimeMonitoringThresholdConfigureInput;
    }
  | {
      ok: false;
      reason: "critical-before-warning" | "empty-policy" | "invalid-number";
    };

function runtimeMonitoringScopeKey(scope: RuntimeUsageScope): string {
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

function runtimeMonitoringThresholdPolicyIsExactScope(
  scope: RuntimeUsageScope,
  thresholds: RuntimeMonitoringThresholdsResponse | null,
): boolean {
  return thresholds?.policy
    ? runtimeMonitoringScopeKey(scope) === runtimeMonitoringScopeKey(thresholds.policy.scope)
    : false;
}

function runtimeMonitoringEditableThresholdDefinitionForRule(
  rule: RuntimeMonitoringThresholdRule,
): RuntimeMonitoringEditableThresholdDefinition | undefined {
  return runtimeMonitoringEditableThresholds.find(
    (definition) => rule.signal === definition.signal && rule.metric === definition.metric,
  );
}

function isRuntimeMonitoringEditableThresholdRule(rule: RuntimeMonitoringThresholdRule): boolean {
  return runtimeMonitoringEditableThresholdDefinitionForRule(rule) !== undefined;
}

function parseRuntimeMonitoringThresholdValue(
  value: string,
): { ok: true; value: number | undefined } | { ok: false } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, value: undefined };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false };
  }

  return { ok: true, value: parsed };
}

export function runtimeMonitoringThresholdFormFromPolicy(
  thresholds: RuntimeMonitoringThresholdsResponse | null,
): RuntimeMonitoringThresholdForm {
  const rules = Object.fromEntries(
    runtimeMonitoringEditableThresholds.map((definition) => {
      const rule = thresholds?.policy?.rules.find(
        (candidate) =>
          candidate.signal === definition.signal && candidate.metric === definition.metric,
      );
      return [
        definition.key,
        {
          warning: rule?.warning?.toString() ?? "",
          critical: rule?.critical?.toString() ?? "",
        },
      ];
    }),
  ) as RuntimeMonitoringThresholdForm["rules"];

  return {
    enabled: thresholds?.policy?.enabled ?? true,
    rules,
  };
}

export function buildRuntimeMonitoringThresholdConfigureInput(
  scope: RuntimeUsageScope,
  thresholds: RuntimeMonitoringThresholdsResponse | null,
  form: RuntimeMonitoringThresholdForm,
): RuntimeMonitoringThresholdConfigureResult {
  const policyIsExactScope = runtimeMonitoringThresholdPolicyIsExactScope(scope, thresholds);
  const preservedRules =
    policyIsExactScope && thresholds?.policy
      ? thresholds.policy.rules.filter((rule) => !isRuntimeMonitoringEditableThresholdRule(rule))
      : [];
  const rules: RuntimeMonitoringThresholdRuleInput[] = [...preservedRules];

  for (const definition of runtimeMonitoringEditableThresholds) {
    const ruleForm = form.rules[definition.key];
    const warning = parseRuntimeMonitoringThresholdValue(ruleForm.warning);
    const critical = parseRuntimeMonitoringThresholdValue(ruleForm.critical);
    if (!warning.ok || !critical.ok) {
      return { ok: false, reason: "invalid-number" };
    }

    if (
      warning.value !== undefined &&
      critical.value !== undefined &&
      critical.value < warning.value
    ) {
      return { ok: false, reason: "critical-before-warning" };
    }

    if (warning.value !== undefined || critical.value !== undefined) {
      const existingRule = policyIsExactScope
        ? thresholds?.policy?.rules.find(
            (rule) => rule.signal === definition.signal && rule.metric === definition.metric,
          )
        : undefined;
      rules.push({
        ruleId: existingRule?.ruleId,
        signal: definition.signal,
        metric: definition.metric,
        warning: warning.value,
        critical: critical.value,
        comparator: "greater-than-or-equal",
      });
    }
  }

  if (rules.length === 0) {
    return { ok: false, reason: "empty-policy" };
  }

  return {
    ok: true,
    input: {
      ...(policyIsExactScope && thresholds?.policy?.policyId
        ? { policyId: thresholds.policy.policyId }
        : {}),
      scope,
      rules,
      enabled: form.enabled,
    },
  };
}
