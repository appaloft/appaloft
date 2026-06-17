import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { type OccurredAt } from "../shared/temporal";
import { ScalarValueObject } from "../shared/value-object";
import { type ConnectionOwnerSnapshot } from "./connection";

export interface AcceptedConnectionCapabilityPlanEffectSnapshot {
  kind: string;
  title: string;
  description?: string;
}

export interface AcceptedConnectionCapabilityPlanCleanupSnapshot {
  supported: boolean;
  description?: string;
}

export interface AcceptedConnectionCapabilityPlanSnapshot {
  acceptedPlanId: string;
  planId: string;
  connectorKey: string;
  capabilityKey: string;
  ownerRef?: ConnectionOwnerSnapshot;
  acceptedBy: string;
  acceptedAt: string;
  riskLevel: "low" | "medium" | "high";
  summary: string;
  effects: AcceptedConnectionCapabilityPlanEffectSnapshot[];
  cleanup?: AcceptedConnectionCapabilityPlanCleanupSnapshot;
}

export interface AcceptConnectionCapabilityPlanInput {
  planId: string;
  connectorKey: string;
  capabilityKey: string;
  ownerRef?: ConnectionOwnerSnapshot;
  acceptedBy: string;
  acceptedAt: OccurredAt;
  riskLevel: "low" | "medium" | "high";
  summary: string;
  effects: AcceptedConnectionCapabilityPlanEffectSnapshot[];
  cleanup?: AcceptedConnectionCapabilityPlanCleanupSnapshot;
}

function requiredText(value: string, label: string): Result<string> {
  const normalized = value.trim();
  if (!normalized) {
    return err(domainError.validation(`${label} is required`));
  }
  if (looksLikeSecret(normalized)) {
    return err(domainError.validation(`${label} must not contain secret material`));
  }
  return ok(normalized);
}

function looksLikeSecret(value: string): boolean {
  return (
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value) ||
    /\b(?:password|token|private[_ -]?key)\s*[:=]/i.test(value) ||
    /\b(?:ghp_|github_pat_|xox[baprs]-|sk-[A-Za-z0-9_-]{16,})/.test(value)
  );
}

export class AcceptedConnectionCapabilityPlanId extends ScalarValueObject<string> {
  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<AcceptedConnectionCapabilityPlanId> {
    return requiredText(value, "Accepted plan id").map(
      (normalized) => new AcceptedConnectionCapabilityPlanId(normalized),
    );
  }
}

export class AcceptedConnectionCapabilityPlan {
  private constructor(private readonly snapshot: AcceptedConnectionCapabilityPlanSnapshot) {}

  static accept(
    input: AcceptConnectionCapabilityPlanInput,
  ): Result<AcceptedConnectionCapabilityPlan> {
    const planId = requiredText(input.planId, "Plan id");
    if (planId.isErr()) return err(planId.error);
    const connectorKey = requiredText(input.connectorKey, "Connector key");
    if (connectorKey.isErr()) return err(connectorKey.error);
    const capabilityKey = requiredText(input.capabilityKey, "Capability key");
    if (capabilityKey.isErr()) return err(capabilityKey.error);
    const acceptedBy = requiredText(input.acceptedBy, "Accepted by");
    if (acceptedBy.isErr()) return err(acceptedBy.error);
    const summary = requiredText(input.summary, "Accepted plan summary");
    if (summary.isErr()) return err(summary.error);
    if (!["low", "medium", "high"].includes(input.riskLevel)) {
      return err(domainError.validation(`Unsupported accepted plan risk ${input.riskLevel}`));
    }
    if (!input.effects.length) {
      return err(domainError.validation("Accepted plan must include at least one effect"));
    }
    const effects: AcceptedConnectionCapabilityPlanEffectSnapshot[] = [];
    for (const [index, effect] of input.effects.entries()) {
      const kind = requiredText(effect.kind, `Accepted plan effect ${index + 1} kind`);
      if (kind.isErr()) return err(kind.error);
      const title = requiredText(effect.title, `Accepted plan effect ${index + 1} title`);
      if (title.isErr()) return err(title.error);
      const description = effect.description
        ? requiredText(effect.description, `Accepted plan effect ${index + 1} description`)
        : undefined;
      if (description?.isErr()) return err(description.error);
      const normalizedEffect: AcceptedConnectionCapabilityPlanEffectSnapshot = {
        kind: kind.value,
        title: title.value,
      };
      if (description?.isOk()) {
        normalizedEffect.description = description.value;
      }
      effects.push(normalizedEffect);
    }
    const cleanupDescription = input.cleanup?.description
      ? requiredText(input.cleanup.description, "Accepted plan cleanup description")
      : undefined;
    if (cleanupDescription?.isErr()) return err(cleanupDescription.error);

    const acceptedPlanId = AcceptedConnectionCapabilityPlanId.create(
      `accepted_${stableHash({
        planId: planId.value,
        connectorKey: connectorKey.value,
        capabilityKey: capabilityKey.value,
        ownerRef: input.ownerRef,
        acceptedBy: acceptedBy.value,
        acceptedAt: input.acceptedAt.value,
      })}`,
    );
    if (acceptedPlanId.isErr()) return err(acceptedPlanId.error);

    return ok(
      new AcceptedConnectionCapabilityPlan({
        acceptedPlanId: acceptedPlanId.value.toString(),
        planId: planId.value,
        connectorKey: connectorKey.value,
        capabilityKey: capabilityKey.value,
        ...(input.ownerRef ? { ownerRef: { ...input.ownerRef } } : {}),
        acceptedBy: acceptedBy.value,
        acceptedAt: input.acceptedAt.value,
        riskLevel: input.riskLevel,
        summary: summary.value,
        effects,
        ...(input.cleanup
          ? {
              cleanup: {
                supported: input.cleanup.supported,
                ...(cleanupDescription?.isOk() ? { description: cleanupDescription.value } : {}),
              },
            }
          : {}),
      }),
    );
  }

  static rehydrate(
    snapshot: AcceptedConnectionCapabilityPlanSnapshot,
  ): AcceptedConnectionCapabilityPlan {
    return new AcceptedConnectionCapabilityPlan({
      ...snapshot,
      ...(snapshot.ownerRef ? { ownerRef: { ...snapshot.ownerRef } } : {}),
      effects: snapshot.effects.map((effect) => ({ ...effect })),
      ...(snapshot.cleanup ? { cleanup: { ...snapshot.cleanup } } : {}),
    });
  }

  matches(input: {
    connectorKey: string;
    capabilityKey: string;
    ownerRef?: ConnectionOwnerSnapshot;
  }): boolean {
    if (this.snapshot.connectorKey !== input.connectorKey) return false;
    if (this.snapshot.capabilityKey !== input.capabilityKey) return false;
    if (!this.snapshot.ownerRef && !input.ownerRef) return true;
    if (!this.snapshot.ownerRef || !input.ownerRef) return false;
    return (
      this.snapshot.ownerRef.scope === input.ownerRef.scope &&
      this.snapshot.ownerRef.id === input.ownerRef.id
    );
  }

  toJSON(): AcceptedConnectionCapabilityPlanSnapshot {
    return {
      ...this.snapshot,
      ...(this.snapshot.ownerRef ? { ownerRef: { ...this.snapshot.ownerRef } } : {}),
      effects: this.snapshot.effects.map((effect) => ({ ...effect })),
      ...(this.snapshot.cleanup ? { cleanup: { ...this.snapshot.cleanup } } : {}),
    };
  }
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
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
