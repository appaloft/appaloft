import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";

export type ManagedClusterTargetStatus = "ready" | "degraded" | "unavailable";
export type ManagedClusterSupportLevel = "community" | "standard" | "premium";
export type ManagedClusterPlacementMode = "initial" | "failover" | "recovery";
export type ManagedClusterFailureDomainKind = "provider" | "region" | "zone" | "host";

export interface ManagedClusterFailureDomainSnapshot {
  kind: ManagedClusterFailureDomainKind;
  key: string;
}

export interface ManagedClusterTargetCandidateSnapshot {
  targetId: string;
  providerKey: string;
  region: string;
  failureDomains?: ManagedClusterFailureDomainSnapshot[];
  status: ManagedClusterTargetStatus;
  capabilities: string[];
  availableCapacity: number;
  estimatedMonthlyCostUsd?: number;
  supportLevel: ManagedClusterSupportLevel;
}

export interface ManagedClusterTargetPoolSnapshot {
  poolId: string;
  targets: ManagedClusterTargetCandidateSnapshot[];
}

export interface ManagedClusterPlacementIntentSnapshot {
  workloadRef: string;
  requiredCapabilities: string[];
  preferredRegions: string[];
  excludedTargetIds: string[];
  currentTargetId?: string;
  currentPlacementEpoch: number;
  maxFailoverAttempts: number;
  requiredFailureDomainKinds?: ManagedClusterFailureDomainKind[];
}

export interface ManagedClusterPlacementDecisionSnapshot {
  poolId: string;
  workloadRef: string;
  mode: ManagedClusterPlacementMode;
  attempt: number;
  selectedTargetId: string;
  selectedProviderKey: string;
  selectedRegion: string;
  selectedFailureDomains?: ManagedClusterFailureDomainSnapshot[];
  previousTargetId?: string;
  placementEpoch: number;
  fencingToken: string;
  rankedEligibleTargetIds: string[];
  reasonCodes: string[];
  consideredTargets: {
    targetId: string;
    eligible: boolean;
    reasons: string[];
  }[];
}

export type ManagedClusterReplacementReadinessStatus = "ready" | "blocked";

export interface ManagedClusterReplacementReadinessSnapshot {
  poolId: string;
  workloadRef: string;
  currentTargetId: string;
  currentPlacementEpoch: number;
  status: ManagedClusterReplacementReadinessStatus;
  requiredCapabilities: string[];
  requiredFailureDomainKinds: ManagedClusterFailureDomainKind[];
  selectedTargetId?: string;
  selectedProviderKey?: string;
  selectedRegion?: string;
  selectedFailureDomains?: ManagedClusterFailureDomainSnapshot[];
  selectedEstimatedMonthlyCostUsd?: number;
  selectedSupportLevel?: ManagedClusterSupportLevel;
  eligibleReplacementTargetIds: string[];
  totalEligibleReplacementCapacity: number;
  reasonCodes: string[];
  consideredTargets: {
    targetId: string;
    eligible: boolean;
    availableCapacity: number;
    reasons: string[];
  }[];
}

function requiredText(value: string, label: string): Result<string> {
  const normalized = value.trim();
  return normalized ? ok(normalized) : err(domainError.validation(`${label} is required`));
}

function normalizedUniqueList(
  values: readonly string[],
  label: string,
  options: { sort?: boolean } = {},
): Result<string[]> {
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const parsed = requiredText(value, label);
    if (parsed.isErr()) return err(parsed.error);
    if (seen.has(parsed.value)) {
      return err(domainError.validation(`${label} must not contain duplicates`));
    }
    seen.add(parsed.value);
    normalized.push(parsed.value);
  }
  return ok(
    options.sort ? normalized.sort((left, right) => left.localeCompare(right)) : normalized,
  );
}

class ManagedClusterTargetCandidate {
  private constructor(private readonly snapshot: ManagedClusterTargetCandidateSnapshot) {}

  static create(
    input: ManagedClusterTargetCandidateSnapshot,
  ): Result<ManagedClusterTargetCandidate> {
    const targetId = requiredText(input.targetId, "Managed cluster target id");
    if (targetId.isErr()) return err(targetId.error);
    const providerKey = requiredText(input.providerKey, "Managed cluster provider key");
    if (providerKey.isErr()) return err(providerKey.error);
    const region = requiredText(input.region, "Managed cluster region");
    if (region.isErr()) return err(region.error);
    const failureDomains: ManagedClusterFailureDomainSnapshot[] = [];
    const failureDomainKinds = new Set<ManagedClusterFailureDomainKind>();
    for (const domain of input.failureDomains ?? []) {
      if (!(managedClusterFailureDomainKinds as readonly string[]).includes(domain.kind)) {
        return err(
          domainError.validation(`Unsupported managed cluster failure domain ${domain.kind}`),
        );
      }
      if (failureDomainKinds.has(domain.kind)) {
        return err(domainError.validation("Managed cluster failure domain kinds must be unique"));
      }
      const key = requiredText(domain.key, "Managed cluster failure domain key");
      if (key.isErr()) return err(key.error);
      failureDomainKinds.add(domain.kind);
      failureDomains.push({ kind: domain.kind, key: key.value });
    }
    if (!(["ready", "degraded", "unavailable"] as const).includes(input.status)) {
      return err(domainError.validation(`Unsupported managed cluster status ${input.status}`));
    }
    const capabilities = normalizedUniqueList(input.capabilities, "Managed cluster capability", {
      sort: true,
    });
    if (capabilities.isErr()) return err(capabilities.error);
    if (!Number.isInteger(input.availableCapacity) || input.availableCapacity < 0) {
      return err(
        domainError.validation("Managed cluster available capacity must be a non-negative integer"),
      );
    }
    if (
      input.estimatedMonthlyCostUsd !== undefined &&
      (!Number.isFinite(input.estimatedMonthlyCostUsd) || input.estimatedMonthlyCostUsd < 0)
    ) {
      return err(domainError.validation("Managed cluster estimated cost must be non-negative"));
    }
    if (!(["community", "standard", "premium"] as const).includes(input.supportLevel)) {
      return err(
        domainError.validation(`Unsupported managed cluster support level ${input.supportLevel}`),
      );
    }
    return ok(
      new ManagedClusterTargetCandidate({
        targetId: targetId.value,
        providerKey: providerKey.value,
        region: region.value,
        ...(failureDomains.length > 0 ? { failureDomains } : {}),
        status: input.status,
        capabilities: capabilities.value,
        availableCapacity: input.availableCapacity,
        ...(input.estimatedMonthlyCostUsd !== undefined
          ? { estimatedMonthlyCostUsd: input.estimatedMonthlyCostUsd }
          : {}),
        supportLevel: input.supportLevel,
      }),
    );
  }

  id(): string {
    return this.snapshot.targetId;
  }

  providerKey(): string {
    return this.snapshot.providerKey;
  }

  region(): string {
    return this.snapshot.region;
  }

  estimatedMonthlyCostUsd(): number | undefined {
    return this.snapshot.estimatedMonthlyCostUsd;
  }

  availableCapacity(): number {
    return this.snapshot.availableCapacity;
  }

  supportLevel(): ManagedClusterSupportLevel {
    return this.snapshot.supportLevel;
  }

  failureDomainKey(kind: ManagedClusterFailureDomainKind): string | undefined {
    return this.snapshot.failureDomains?.find((domain) => domain.kind === kind)?.key;
  }

  eligibilityReasons(
    intent: ManagedClusterPlacementIntent,
    mode: ManagedClusterPlacementMode,
    currentTarget?: ManagedClusterTargetCandidate,
  ): string[] {
    const reasons: string[] = [];
    if (this.snapshot.status !== "ready") reasons.push(`status:${this.snapshot.status}`);
    if (this.snapshot.availableCapacity < 1) reasons.push("capacity:unavailable");
    if (intent.excludes(this.snapshot.targetId)) reasons.push("policy:excluded");
    if (mode === "failover" && intent.currentTargetId() === this.snapshot.targetId) {
      reasons.push("failover:previous-target");
    }
    for (const required of intent.requiredCapabilities()) {
      if (!this.snapshot.capabilities.includes(required)) {
        reasons.push(`capability:missing:${required}`);
      }
    }
    for (const requiredKind of intent.requiredFailureDomainKinds()) {
      const candidateKey = this.failureDomainKey(requiredKind);
      if (!candidateKey) {
        reasons.push(`failure-domain:missing:${requiredKind}`);
        continue;
      }
      if (mode === "initial") continue;
      const currentKey = currentTarget?.failureDomainKey(requiredKind);
      if (!currentKey) {
        reasons.push(`failure-domain:current-missing:${requiredKind}`);
      } else if (currentKey === candidateKey) {
        reasons.push(`failure-domain:shared:${requiredKind}`);
      }
    }
    return reasons;
  }

  toJSON(): ManagedClusterTargetCandidateSnapshot {
    return {
      ...this.snapshot,
      capabilities: [...this.snapshot.capabilities],
      ...(this.snapshot.failureDomains
        ? { failureDomains: this.snapshot.failureDomains.map((domain) => ({ ...domain })) }
        : {}),
    };
  }
}

export class ManagedClusterPlacementIntent {
  private constructor(private readonly snapshot: ManagedClusterPlacementIntentSnapshot) {}

  static create(
    input: ManagedClusterPlacementIntentSnapshot,
  ): Result<ManagedClusterPlacementIntent> {
    const workloadRef = requiredText(input.workloadRef, "Managed cluster workload ref");
    if (workloadRef.isErr()) return err(workloadRef.error);
    const requiredCapabilities = normalizedUniqueList(
      input.requiredCapabilities,
      "Managed cluster required capability",
      { sort: true },
    );
    if (requiredCapabilities.isErr()) return err(requiredCapabilities.error);
    const preferredRegions = normalizedUniqueList(
      input.preferredRegions,
      "Managed cluster preferred region",
    );
    if (preferredRegions.isErr()) return err(preferredRegions.error);
    const excludedTargetIds = normalizedUniqueList(
      input.excludedTargetIds,
      "Managed cluster excluded target id",
      { sort: true },
    );
    if (excludedTargetIds.isErr()) return err(excludedTargetIds.error);
    const requiredFailureDomainKinds = normalizedUniqueFailureDomainKinds(
      input.requiredFailureDomainKinds ?? [],
    );
    if (requiredFailureDomainKinds.isErr()) return err(requiredFailureDomainKinds.error);
    const currentTargetId = input.currentTargetId
      ? requiredText(input.currentTargetId, "Managed cluster current target id")
      : undefined;
    if (currentTargetId?.isErr()) return err(currentTargetId.error);
    if (!Number.isInteger(input.currentPlacementEpoch) || input.currentPlacementEpoch < 0) {
      return err(
        domainError.validation("Managed cluster placement epoch must be a non-negative integer"),
      );
    }
    if (
      !Number.isInteger(input.maxFailoverAttempts) ||
      input.maxFailoverAttempts < 0 ||
      input.maxFailoverAttempts > 10
    ) {
      return err(
        domainError.validation("Managed cluster failover attempts must be between 0 and 10"),
      );
    }
    return ok(
      new ManagedClusterPlacementIntent({
        workloadRef: workloadRef.value,
        requiredCapabilities: requiredCapabilities.value,
        preferredRegions: preferredRegions.value,
        excludedTargetIds: excludedTargetIds.value,
        ...(requiredFailureDomainKinds.value.length > 0
          ? { requiredFailureDomainKinds: requiredFailureDomainKinds.value }
          : {}),
        ...(currentTargetId?.isOk() ? { currentTargetId: currentTargetId.value } : {}),
        currentPlacementEpoch: input.currentPlacementEpoch,
        maxFailoverAttempts: input.maxFailoverAttempts,
      }),
    );
  }

  workloadRef(): string {
    return this.snapshot.workloadRef;
  }

  requiredCapabilities(): readonly string[] {
    return this.snapshot.requiredCapabilities;
  }

  currentTargetId(): string | undefined {
    return this.snapshot.currentTargetId;
  }

  currentPlacementEpoch(): number {
    return this.snapshot.currentPlacementEpoch;
  }

  maxFailoverAttempts(): number {
    return this.snapshot.maxFailoverAttempts;
  }

  requiredFailureDomainKinds(): readonly ManagedClusterFailureDomainKind[] {
    return this.snapshot.requiredFailureDomainKinds ?? [];
  }

  excludes(targetId: string): boolean {
    return this.snapshot.excludedTargetIds.includes(targetId);
  }

  regionRank(region: string): number {
    const index = this.snapshot.preferredRegions.indexOf(region);
    return index < 0 ? Number.MAX_SAFE_INTEGER : index;
  }

  toJSON(): ManagedClusterPlacementIntentSnapshot {
    return {
      ...this.snapshot,
      requiredCapabilities: [...this.snapshot.requiredCapabilities],
      preferredRegions: [...this.snapshot.preferredRegions],
      excludedTargetIds: [...this.snapshot.excludedTargetIds],
      ...(this.snapshot.requiredFailureDomainKinds
        ? { requiredFailureDomainKinds: [...this.snapshot.requiredFailureDomainKinds] }
        : {}),
    };
  }
}

export class ManagedClusterPlacementDecision {
  private constructor(private readonly snapshot: ManagedClusterPlacementDecisionSnapshot) {}

  static rehydrate(
    snapshot: ManagedClusterPlacementDecisionSnapshot,
  ): ManagedClusterPlacementDecision {
    return new ManagedClusterPlacementDecision(snapshot);
  }

  toJSON(): ManagedClusterPlacementDecisionSnapshot {
    return {
      ...this.snapshot,
      rankedEligibleTargetIds: [...this.snapshot.rankedEligibleTargetIds],
      reasonCodes: [...this.snapshot.reasonCodes],
      ...(this.snapshot.selectedFailureDomains
        ? {
            selectedFailureDomains: this.snapshot.selectedFailureDomains.map((domain) => ({
              ...domain,
            })),
          }
        : {}),
      consideredTargets: this.snapshot.consideredTargets.map((target) => ({
        ...target,
        reasons: [...target.reasons],
      })),
    };
  }
}

export class ManagedClusterReplacementReadiness {
  private constructor(private readonly snapshot: ManagedClusterReplacementReadinessSnapshot) {}

  static rehydrate(
    snapshot: ManagedClusterReplacementReadinessSnapshot,
  ): ManagedClusterReplacementReadiness {
    return new ManagedClusterReplacementReadiness(snapshot);
  }

  toJSON(): ManagedClusterReplacementReadinessSnapshot {
    return {
      ...this.snapshot,
      requiredCapabilities: [...this.snapshot.requiredCapabilities],
      requiredFailureDomainKinds: [...this.snapshot.requiredFailureDomainKinds],
      ...(this.snapshot.selectedFailureDomains
        ? {
            selectedFailureDomains: this.snapshot.selectedFailureDomains.map((domain) => ({
              ...domain,
            })),
          }
        : {}),
      eligibleReplacementTargetIds: [...this.snapshot.eligibleReplacementTargetIds],
      reasonCodes: [...this.snapshot.reasonCodes],
      consideredTargets: this.snapshot.consideredTargets.map((target) => ({
        ...target,
        reasons: [...target.reasons],
      })),
    };
  }
}

export class ManagedClusterTargetPool {
  private constructor(
    private readonly poolIdValue: string,
    private readonly targetsValue: ManagedClusterTargetCandidate[],
  ) {}

  static create(input: ManagedClusterTargetPoolSnapshot): Result<ManagedClusterTargetPool> {
    const poolId = requiredText(input.poolId, "Managed cluster target pool id");
    if (poolId.isErr()) return err(poolId.error);
    if (input.targets.length === 0) {
      return err(
        domainError.validation("Managed cluster target pool requires at least one target"),
      );
    }
    const targets: ManagedClusterTargetCandidate[] = [];
    const targetIds = new Set<string>();
    for (const targetInput of input.targets) {
      const target = ManagedClusterTargetCandidate.create(targetInput);
      if (target.isErr()) return err(target.error);
      if (targetIds.has(target.value.id())) {
        return err(domainError.validation("Managed cluster target ids must be unique"));
      }
      targetIds.add(target.value.id());
      targets.push(target.value);
    }
    return ok(new ManagedClusterTargetPool(poolId.value, targets));
  }

  decidePlacement(
    intent: ManagedClusterPlacementIntent,
    input: { mode: ManagedClusterPlacementMode; attempt: number },
  ): Result<ManagedClusterPlacementDecision> {
    if (!(["initial", "failover", "recovery"] as const).includes(input.mode)) {
      return err(
        domainError.validation(`Unsupported managed cluster placement mode ${input.mode}`),
      );
    }
    if (!Number.isInteger(input.attempt) || input.attempt < 0) {
      return err(domainError.validation("Managed cluster placement attempt must be non-negative"));
    }
    if (input.mode !== "initial" && input.attempt > intent.maxFailoverAttempts()) {
      return err(
        domainError.conflict("Managed cluster failover attempt limit exceeded", {
          poolId: this.poolIdValue,
          attempt: input.attempt,
          maxFailoverAttempts: intent.maxFailoverAttempts(),
        }),
      );
    }
    if (input.mode === "failover" && !intent.currentTargetId()) {
      return err(domainError.validation("Managed cluster failover requires a current target"));
    }

    const currentTarget = intent.currentTargetId()
      ? this.targetsValue.find((target) => target.id() === intent.currentTargetId())
      : undefined;
    const considered = this.targetsValue
      .map((target) => ({
        target,
        reasons: target.eligibilityReasons(intent, input.mode, currentTarget),
      }))
      .sort((left, right) => left.target.id().localeCompare(right.target.id()));
    const eligible = considered
      .filter((candidate) => candidate.reasons.length === 0)
      .map((candidate) => candidate.target)
      .sort((left, right) => this.compareCandidates(left, right, intent));
    const selected = eligible[0];
    if (!selected) {
      return err(
        domainError.conflict("Managed cluster target pool has no eligible target", {
          poolId: this.poolIdValue,
          workloadRef: intent.workloadRef(),
          mode: input.mode,
          consideredTargetIds: considered.map(({ target }) => target.id()),
          ineligibilityReasons: considered.flatMap(({ target, reasons }) =>
            reasons.map((reason) => `${target.id()}:${reason}`),
          ),
        }),
      );
    }

    const placementEpoch = intent.currentPlacementEpoch() + 1;
    const fencingToken = `fence_${stableHash({
      poolId: this.poolIdValue,
      workloadRef: intent.workloadRef(),
      placementEpoch,
      selectedTargetId: selected.id(),
    })}`;
    const cost = selected.estimatedMonthlyCostUsd();
    const lowestCost = eligible.every(
      (candidate) =>
        candidate.estimatedMonthlyCostUsd() === undefined ||
        cost === undefined ||
        cost <= (candidate.estimatedMonthlyCostUsd() as number),
    );
    const reasonCodes = [
      `region-rank:${intent.regionRank(selected.region())}`,
      ...(input.mode !== "initial"
        ? intent.requiredFailureDomainKinds().map((kind) => `failure-domain:${kind}:separated`)
        : []),
      ...(lowestCost ? ["cost:lowest-eligible"] : []),
      "tie-break:target-id",
    ];
    const previousTargetId = intent.currentTargetId();
    return ok(
      ManagedClusterPlacementDecision.rehydrate({
        poolId: this.poolIdValue,
        workloadRef: intent.workloadRef(),
        mode: input.mode,
        attempt: input.attempt,
        selectedTargetId: selected.id(),
        selectedProviderKey: selected.providerKey(),
        selectedRegion: selected.region(),
        ...(selected.toJSON().failureDomains
          ? { selectedFailureDomains: selected.toJSON().failureDomains }
          : {}),
        ...(previousTargetId ? { previousTargetId } : {}),
        placementEpoch,
        fencingToken,
        rankedEligibleTargetIds: eligible.map((candidate) => candidate.id()),
        reasonCodes,
        consideredTargets: considered.map(({ target, reasons }) => ({
          targetId: target.id(),
          eligible: reasons.length === 0,
          reasons,
        })),
      }),
    );
  }

  checkReplacementReadiness(
    intent: ManagedClusterPlacementIntent,
  ): Result<ManagedClusterReplacementReadiness> {
    const currentTargetId = intent.currentTargetId();
    if (!currentTargetId) {
      return err(
        domainError.validation("Managed cluster replacement readiness requires a current target"),
      );
    }
    const currentTarget = this.targetsValue.find((target) => target.id() === currentTargetId);
    if (!currentTarget) {
      return ok(
        ManagedClusterReplacementReadiness.rehydrate({
          poolId: this.poolIdValue,
          workloadRef: intent.workloadRef(),
          currentTargetId,
          currentPlacementEpoch: intent.currentPlacementEpoch(),
          status: "blocked",
          requiredCapabilities: [...intent.requiredCapabilities()],
          requiredFailureDomainKinds: [...intent.requiredFailureDomainKinds()],
          eligibleReplacementTargetIds: [],
          totalEligibleReplacementCapacity: 0,
          reasonCodes: ["replacement:current-target-missing"],
          consideredTargets: [],
        }),
      );
    }

    const considered = this.targetsValue
      .map((target) => ({
        target,
        reasons:
          target.id() === currentTargetId
            ? ["failover:previous-target"]
            : target.eligibilityReasons(intent, "failover", currentTarget),
      }))
      .sort((left, right) => left.target.id().localeCompare(right.target.id()));
    const eligible = considered
      .filter((candidate) => candidate.reasons.length === 0)
      .map((candidate) => candidate.target)
      .sort((left, right) => this.compareCandidates(left, right, intent));
    const selected = eligible[0];
    const consideredTargets = considered.map(({ target, reasons }) => ({
      targetId: target.id(),
      eligible: reasons.length === 0,
      availableCapacity: target.availableCapacity(),
      reasons,
    }));
    const totalEligibleReplacementCapacity = eligible.reduce(
      (total, target) => total + target.availableCapacity(),
      0,
    );

    if (!selected) {
      const reasons = [
        ...new Set(
          considered
            .filter(({ target }) => target.id() !== currentTargetId)
            .flatMap(({ reasons: candidateReasons }) => candidateReasons),
        ),
      ].sort((left, right) => left.localeCompare(right));
      return ok(
        ManagedClusterReplacementReadiness.rehydrate({
          poolId: this.poolIdValue,
          workloadRef: intent.workloadRef(),
          currentTargetId,
          currentPlacementEpoch: intent.currentPlacementEpoch(),
          status: "blocked",
          requiredCapabilities: [...intent.requiredCapabilities()],
          requiredFailureDomainKinds: [...intent.requiredFailureDomainKinds()],
          eligibleReplacementTargetIds: [],
          totalEligibleReplacementCapacity,
          reasonCodes: ["replacement:no-eligible-target", ...reasons],
          consideredTargets,
        }),
      );
    }

    const cost = selected.estimatedMonthlyCostUsd();
    const lowestCost = eligible.every(
      (candidate) =>
        candidate.estimatedMonthlyCostUsd() === undefined ||
        cost === undefined ||
        cost <= (candidate.estimatedMonthlyCostUsd() as number),
    );
    const selectedSnapshot = selected.toJSON();
    return ok(
      ManagedClusterReplacementReadiness.rehydrate({
        poolId: this.poolIdValue,
        workloadRef: intent.workloadRef(),
        currentTargetId,
        currentPlacementEpoch: intent.currentPlacementEpoch(),
        status: "ready",
        requiredCapabilities: [...intent.requiredCapabilities()],
        requiredFailureDomainKinds: [...intent.requiredFailureDomainKinds()],
        selectedTargetId: selected.id(),
        selectedProviderKey: selected.providerKey(),
        selectedRegion: selected.region(),
        ...(selectedSnapshot.failureDomains
          ? { selectedFailureDomains: selectedSnapshot.failureDomains }
          : {}),
        ...(cost !== undefined ? { selectedEstimatedMonthlyCostUsd: cost } : {}),
        selectedSupportLevel: selected.supportLevel(),
        eligibleReplacementTargetIds: eligible.map((candidate) => candidate.id()),
        totalEligibleReplacementCapacity,
        reasonCodes: [
          "replacement:ready",
          ...intent.requiredFailureDomainKinds().map((kind) => `failure-domain:${kind}:separated`),
          ...(lowestCost ? ["cost:lowest-eligible"] : []),
          "tie-break:target-id",
        ],
        consideredTargets,
      }),
    );
  }

  private compareCandidates(
    left: ManagedClusterTargetCandidate,
    right: ManagedClusterTargetCandidate,
    intent: ManagedClusterPlacementIntent,
  ): number {
    const regionDifference = intent.regionRank(left.region()) - intent.regionRank(right.region());
    if (regionDifference !== 0) return regionDifference;
    const leftCost = left.estimatedMonthlyCostUsd() ?? Number.MAX_SAFE_INTEGER;
    const rightCost = right.estimatedMonthlyCostUsd() ?? Number.MAX_SAFE_INTEGER;
    if (leftCost !== rightCost) return leftCost - rightCost;
    return left.id().localeCompare(right.id());
  }

  toJSON(): ManagedClusterTargetPoolSnapshot {
    return {
      poolId: this.poolIdValue,
      targets: this.targetsValue.map((target) => target.toJSON()),
    };
  }
}

const managedClusterFailureDomainKinds = ["provider", "region", "zone", "host"] as const;

function normalizedUniqueFailureDomainKinds(
  values: readonly ManagedClusterFailureDomainKind[],
): Result<ManagedClusterFailureDomainKind[]> {
  const unsupported = values.find(
    (value) => !(managedClusterFailureDomainKinds as readonly string[]).includes(value),
  );
  if (unsupported) {
    return err(domainError.validation(`Unsupported managed cluster failure domain ${unsupported}`));
  }
  if (new Set(values).size !== values.length) {
    return err(
      domainError.validation(
        "Managed cluster required failure domains must not contain duplicates",
      ),
    );
  }
  return ok([...values]);
}

function stableHash(value: unknown): string {
  const input = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
