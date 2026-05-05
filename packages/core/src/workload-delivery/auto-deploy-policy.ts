import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { type UpdatedAt } from "../shared/temporal";
import { ConfigKey } from "../shared/text-values";
import { ScalarValueObject, ValueObject } from "../shared/value-object";
import { type GitRefText, type SourceBindingFingerprint } from "./source-binding";

export type ResourceAutoDeployTriggerKind = "git-push" | "generic-signed-webhook";
export type SourceEventKind = "push" | "tag";
export type ResourceAutoDeployPolicyStatus = "enabled" | "disabled" | "blocked";
export type ResourceAutoDeployPolicyBlockedReason = "source-binding-changed";

const triggerKinds = ["git-push", "generic-signed-webhook"] as const;
const sourceEventKinds = ["push", "tag"] as const;
const policyStatuses = ["enabled", "disabled", "blocked"] as const;
const blockedReasons = ["source-binding-changed"] as const;
const resourceSecretRefPrefix = "resource-secret:";

function includesValue<TValue extends string>(
  values: readonly TValue[],
  value: string,
): value is TValue {
  return values.includes(value as TValue);
}

function autoDeployValidationError(
  message: string,
  details?: Record<string, string | number | boolean>,
) {
  return domainError.validation(message, {
    phase: "auto-deploy-policy-admission",
    ...(details ?? {}),
  });
}

const resourceAutoDeployTriggerKindBrand: unique symbol = Symbol("ResourceAutoDeployTriggerKind");
export class ResourceAutoDeployTriggerKindValue extends ScalarValueObject<ResourceAutoDeployTriggerKind> {
  private [resourceAutoDeployTriggerKindBrand]!: void;

  private constructor(value: ResourceAutoDeployTriggerKind) {
    super(value);
  }

  static create(value: string): Result<ResourceAutoDeployTriggerKindValue> {
    const normalized = value.trim();
    if (!includesValue(triggerKinds, normalized)) {
      return err(
        autoDeployValidationError("Auto-deploy trigger kind is unsupported", {
          triggerKind: normalized,
        }),
      );
    }

    return ok(new ResourceAutoDeployTriggerKindValue(normalized));
  }

  static rehydrate(value: ResourceAutoDeployTriggerKind): ResourceAutoDeployTriggerKindValue {
    return new ResourceAutoDeployTriggerKindValue(value);
  }

  requiresGenericWebhookSecret(): boolean {
    return this.value === "generic-signed-webhook";
  }
}

const sourceEventKindBrand: unique symbol = Symbol("SourceEventKindValue");
export class SourceEventKindValue extends ScalarValueObject<SourceEventKind> {
  private [sourceEventKindBrand]!: void;

  private constructor(value: SourceEventKind) {
    super(value);
  }

  static create(value: string): Result<SourceEventKindValue> {
    const normalized = value.trim();
    if (!includesValue(sourceEventKinds, normalized)) {
      return err(
        autoDeployValidationError("Source event kind is unsupported", {
          eventKind: normalized,
        }),
      );
    }

    return ok(new SourceEventKindValue(normalized));
  }

  static rehydrate(value: SourceEventKind): SourceEventKindValue {
    return new SourceEventKindValue(value);
  }
}

const resourceAutoDeployPolicyStatusBrand: unique symbol = Symbol(
  "ResourceAutoDeployPolicyStatusValue",
);
export class ResourceAutoDeployPolicyStatusValue extends ScalarValueObject<ResourceAutoDeployPolicyStatus> {
  private [resourceAutoDeployPolicyStatusBrand]!: void;

  private constructor(value: ResourceAutoDeployPolicyStatus) {
    super(value);
  }

  static create(value: string): Result<ResourceAutoDeployPolicyStatusValue> {
    const normalized = value.trim();
    if (!includesValue(policyStatuses, normalized)) {
      return err(
        autoDeployValidationError("Auto-deploy policy status is unsupported", {
          status: normalized,
        }),
      );
    }

    return ok(new ResourceAutoDeployPolicyStatusValue(normalized));
  }

  static blocked(): ResourceAutoDeployPolicyStatusValue {
    return new ResourceAutoDeployPolicyStatusValue("blocked");
  }

  static disabled(): ResourceAutoDeployPolicyStatusValue {
    return new ResourceAutoDeployPolicyStatusValue("disabled");
  }

  static enabled(): ResourceAutoDeployPolicyStatusValue {
    return new ResourceAutoDeployPolicyStatusValue("enabled");
  }

  static rehydrate(value: ResourceAutoDeployPolicyStatus): ResourceAutoDeployPolicyStatusValue {
    return new ResourceAutoDeployPolicyStatusValue(value);
  }
}

const resourceAutoDeployPolicyBlockedReasonBrand: unique symbol = Symbol(
  "ResourceAutoDeployPolicyBlockedReasonValue",
);
export class ResourceAutoDeployPolicyBlockedReasonValue extends ScalarValueObject<ResourceAutoDeployPolicyBlockedReason> {
  private [resourceAutoDeployPolicyBlockedReasonBrand]!: void;

  private constructor(value: ResourceAutoDeployPolicyBlockedReason) {
    super(value);
  }

  static create(value: string): Result<ResourceAutoDeployPolicyBlockedReasonValue> {
    const normalized = value.trim();
    if (!includesValue(blockedReasons, normalized)) {
      return err(
        autoDeployValidationError("Auto-deploy blocked reason is unsupported", {
          blockedReason: normalized,
        }),
      );
    }

    return ok(new ResourceAutoDeployPolicyBlockedReasonValue(normalized));
  }

  static sourceBindingChanged(): ResourceAutoDeployPolicyBlockedReasonValue {
    return new ResourceAutoDeployPolicyBlockedReasonValue("source-binding-changed");
  }

  static rehydrate(
    value: ResourceAutoDeployPolicyBlockedReason,
  ): ResourceAutoDeployPolicyBlockedReasonValue {
    return new ResourceAutoDeployPolicyBlockedReasonValue(value);
  }
}

const genericWebhookSecretRefBrand: unique symbol = Symbol("ResourceAutoDeploySecretRef");
export class ResourceAutoDeploySecretRef extends ScalarValueObject<string> {
  private [genericWebhookSecretRefBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<ResourceAutoDeploySecretRef> {
    const normalized = value.trim();
    if (!normalized) {
      return err(
        autoDeployValidationError("Generic signed webhook secret reference is required", {
          field: "policy.genericWebhookSecretRef",
        }),
      );
    }

    if (/[\r\n]/.test(normalized)) {
      return err(
        autoDeployValidationError("Generic signed webhook secret reference must be a single line", {
          field: "policy.genericWebhookSecretRef",
        }),
      );
    }

    if (!normalized.startsWith(resourceSecretRefPrefix)) {
      return err(
        autoDeployValidationError(
          "Generic signed webhook secret reference must use resource-secret:<KEY>",
          {
            field: "policy.genericWebhookSecretRef",
            refFamily: "resource-secret",
          },
        ),
      );
    }

    const configKey = ConfigKey.create(normalized.slice(resourceSecretRefPrefix.length));
    if (configKey.isErr()) {
      return err(
        autoDeployValidationError(
          "Generic signed webhook secret reference must include a Resource variable key",
          {
            field: "policy.genericWebhookSecretRef",
            refFamily: "resource-secret",
          },
        ),
      );
    }

    return ok(
      new ResourceAutoDeploySecretRef(`${resourceSecretRefPrefix}${configKey.value.value}`),
    );
  }

  static rehydrate(value: string): ResourceAutoDeploySecretRef {
    return new ResourceAutoDeploySecretRef(value.trim());
  }

  resourceVariableKey(): ConfigKey {
    return ConfigKey.rehydrate(this.value.slice(resourceSecretRefPrefix.length));
  }
}

const sourceEventDedupeWindowSecondsBrand: unique symbol = Symbol("SourceEventDedupeWindowSeconds");
export class SourceEventDedupeWindowSeconds extends ScalarValueObject<number> {
  private [sourceEventDedupeWindowSecondsBrand]!: void;

  private constructor(value: number) {
    super(value);
  }

  static create(value: number): Result<SourceEventDedupeWindowSeconds> {
    if (!Number.isInteger(value) || value <= 0) {
      return err(
        autoDeployValidationError("Source event dedupe window must be a positive integer", {
          field: "policy.dedupeWindowSeconds",
        }),
      );
    }

    return ok(new SourceEventDedupeWindowSeconds(value));
  }

  static rehydrate(value: number): SourceEventDedupeWindowSeconds {
    return new SourceEventDedupeWindowSeconds(value);
  }
}

export interface ResourceAutoDeployPolicyState {
  status: ResourceAutoDeployPolicyStatusValue;
  triggerKind: ResourceAutoDeployTriggerKindValue;
  refs: GitRefText[];
  eventKinds: SourceEventKindValue[];
  sourceBindingFingerprint: SourceBindingFingerprint;
  updatedAt: UpdatedAt;
  blockedReason?: ResourceAutoDeployPolicyBlockedReasonValue;
  genericWebhookSecretRef?: ResourceAutoDeploySecretRef;
  dedupeWindowSeconds?: SourceEventDedupeWindowSeconds;
}

export class ResourceAutoDeployPolicy extends ValueObject<ResourceAutoDeployPolicyState> {
  private constructor(state: ResourceAutoDeployPolicyState) {
    super(state);
  }

  static create(input: {
    triggerKind: ResourceAutoDeployTriggerKindValue;
    refs: readonly GitRefText[];
    eventKinds: readonly SourceEventKindValue[];
    sourceBindingFingerprint: SourceBindingFingerprint;
    updatedAt: UpdatedAt;
    genericWebhookSecretRef?: ResourceAutoDeploySecretRef;
    dedupeWindowSeconds?: SourceEventDedupeWindowSeconds;
  }): Result<ResourceAutoDeployPolicy> {
    const refs = uniqueByValue(input.refs);
    const eventKinds = uniqueByValue(input.eventKinds);

    if (refs.length === 0) {
      return err(
        autoDeployValidationError("Auto-deploy policy requires at least one ref selector", {
          field: "policy.refs",
        }),
      );
    }

    if (eventKinds.length === 0) {
      return err(
        autoDeployValidationError("Auto-deploy policy requires at least one event kind", {
          field: "policy.eventKinds",
        }),
      );
    }

    if (input.triggerKind.requiresGenericWebhookSecret() && !input.genericWebhookSecretRef) {
      return err(
        domainError.resourceAutoDeploySecretRequired(
          "Generic signed webhook auto-deploy requires a secret reference",
          {
            phase: "auto-deploy-policy-admission",
            triggerKind: input.triggerKind.value,
          },
        ),
      );
    }

    return ok(
      new ResourceAutoDeployPolicy({
        status: ResourceAutoDeployPolicyStatusValue.enabled(),
        triggerKind: input.triggerKind,
        refs,
        eventKinds,
        sourceBindingFingerprint: input.sourceBindingFingerprint,
        updatedAt: input.updatedAt,
        ...(input.genericWebhookSecretRef
          ? { genericWebhookSecretRef: input.genericWebhookSecretRef }
          : {}),
        ...(input.dedupeWindowSeconds ? { dedupeWindowSeconds: input.dedupeWindowSeconds } : {}),
      }),
    );
  }

  static rehydrate(state: ResourceAutoDeployPolicyState): ResourceAutoDeployPolicy {
    return new ResourceAutoDeployPolicy(cloneResourceAutoDeployPolicyState(state));
  }

  blockIfSourceBindingChanged(input: {
    currentSourceBindingFingerprint: SourceBindingFingerprint;
    changedAt: UpdatedAt;
  }): ResourceAutoDeployPolicy {
    if (this.state.sourceBindingFingerprint.equals(input.currentSourceBindingFingerprint)) {
      return this;
    }

    return new ResourceAutoDeployPolicy({
      ...this.toState(),
      status: ResourceAutoDeployPolicyStatusValue.blocked(),
      blockedReason: ResourceAutoDeployPolicyBlockedReasonValue.sourceBindingChanged(),
      updatedAt: input.changedAt,
    });
  }

  acknowledgeSourceBinding(input: {
    currentSourceBindingFingerprint: SourceBindingFingerprint;
    acknowledgedAt: UpdatedAt;
  }): ResourceAutoDeployPolicy {
    return new ResourceAutoDeployPolicy({
      ...this.toState(),
      status: ResourceAutoDeployPolicyStatusValue.enabled(),
      sourceBindingFingerprint: input.currentSourceBindingFingerprint,
      updatedAt: input.acknowledgedAt,
    });
  }

  toState(): ResourceAutoDeployPolicyState {
    const state = cloneResourceAutoDeployPolicyState(this.state);
    if (state.status.value === "blocked") {
      return state;
    }

    const { blockedReason, ...unblockedState } = state;
    void blockedReason;
    return unblockedState;
  }
}

export function cloneResourceAutoDeployPolicyState(
  state: ResourceAutoDeployPolicyState,
): ResourceAutoDeployPolicyState {
  return {
    status: state.status,
    triggerKind: state.triggerKind,
    refs: [...state.refs],
    eventKinds: [...state.eventKinds],
    sourceBindingFingerprint: state.sourceBindingFingerprint,
    updatedAt: state.updatedAt,
    ...(state.status.value === "blocked" && state.blockedReason
      ? { blockedReason: state.blockedReason }
      : {}),
    ...(state.genericWebhookSecretRef
      ? { genericWebhookSecretRef: state.genericWebhookSecretRef }
      : {}),
    ...(state.dedupeWindowSeconds ? { dedupeWindowSeconds: state.dedupeWindowSeconds } : {}),
  };
}

function uniqueByValue<TValue extends ScalarValueObject<string>>(
  values: readonly TValue[],
): TValue[] {
  const byValue = new Map<string, TValue>();
  for (const value of values) {
    byValue.set(value.value, value);
  }

  return [...byValue.values()];
}
