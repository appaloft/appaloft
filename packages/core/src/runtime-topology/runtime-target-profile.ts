import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { ScalarValueObject, ValueObject } from "../shared/value-object";

export const RUNTIME_TARGET_PROFILE_SCHEMA_VERSION = "runtime-target-profile/v1" as const;

const runtimeTargetProfileReferenceBrand: unique symbol = Symbol("RuntimeTargetProfileReference");

/**
 * An opaque reference resolved by a runtime adapter or composition root.
 *
 * Core deliberately knows neither the referenced credential nor a provider
 * payload such as kubeconfig. Requiring a URI-like scheme keeps an accidental
 * inline payload from becoming durable domain state.
 */
export class RuntimeTargetProfileReference extends ScalarValueObject<string> {
  private [runtimeTargetProfileReferenceBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<RuntimeTargetProfileReference> {
    const normalized = value.trim();

    if (!normalized) {
      return err(domainError.validation("Runtime target profile reference is required"));
    }

    if (normalized.length > 512) {
      return err(
        domainError.validation("Runtime target profile reference must not exceed 512 characters"),
      );
    }

    if (/\s/.test(normalized) || !/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(normalized)) {
      return err(
        domainError.validation(
          "Runtime target profile reference must be an opaque URI-like reference",
        ),
      );
    }

    return ok(new RuntimeTargetProfileReference(normalized));
  }

  static rehydrate(value: string): RuntimeTargetProfileReference {
    return new RuntimeTargetProfileReference(value.trim());
  }
}

export interface RuntimeTargetProfileState {
  schemaVersion: typeof RUNTIME_TARGET_PROFILE_SCHEMA_VERSION;
  connectionReference: RuntimeTargetProfileReference;
  credentialReference?: RuntimeTargetProfileReference;
  placementPolicyReference?: RuntimeTargetProfileReference;
  routingPolicyReference?: RuntimeTargetProfileReference;
  registryCredentialReference?: RuntimeTargetProfileReference;
  capabilityPolicyReference?: RuntimeTargetProfileReference;
}

export interface RuntimeTargetProfileSnapshot {
  schemaVersion: typeof RUNTIME_TARGET_PROFILE_SCHEMA_VERSION;
  connectionReference: string;
  credentialReference?: string;
  placementPolicyReference?: string;
  routingPolicyReference?: string;
  registryCredentialReference?: string;
  capabilityPolicyReference?: string;
}

export type RuntimeTargetProfileReferenceKind =
  | "connection"
  | "credential"
  | "placement-policy"
  | "routing-policy"
  | "registry-credential"
  | "capability-policy";

type RuntimeTargetProfileInput = Omit<RuntimeTargetProfileSnapshot, "schemaVersion">;

export class RuntimeTargetProfile extends ValueObject<RuntimeTargetProfileState> {
  private constructor(state: RuntimeTargetProfileState) {
    super(state);
  }

  static create(input: RuntimeTargetProfileInput): Result<RuntimeTargetProfile> {
    const connectionReference = RuntimeTargetProfileReference.create(input.connectionReference);
    if (connectionReference.isErr()) {
      return err(connectionReference.error);
    }

    const optionalReferences: Array<
      readonly [keyof Omit<RuntimeTargetProfileInput, "connectionReference">, string | undefined]
    > = [
      ["credentialReference", input.credentialReference],
      ["placementPolicyReference", input.placementPolicyReference],
      ["routingPolicyReference", input.routingPolicyReference],
      ["registryCredentialReference", input.registryCredentialReference],
      ["capabilityPolicyReference", input.capabilityPolicyReference],
    ];

    const state: RuntimeTargetProfileState = {
      schemaVersion: RUNTIME_TARGET_PROFILE_SCHEMA_VERSION,
      connectionReference: connectionReference.value,
    };

    for (const [field, value] of optionalReferences) {
      if (value === undefined) {
        continue;
      }

      const reference = RuntimeTargetProfileReference.create(value);
      if (reference.isErr()) {
        return err(reference.error);
      }
      state[field] = reference.value;
    }

    return ok(new RuntimeTargetProfile(state));
  }

  static rehydrate(snapshot: RuntimeTargetProfileSnapshot): RuntimeTargetProfile {
    return new RuntimeTargetProfile({
      schemaVersion: RUNTIME_TARGET_PROFILE_SCHEMA_VERSION,
      connectionReference: RuntimeTargetProfileReference.rehydrate(snapshot.connectionReference),
      ...(snapshot.credentialReference
        ? {
            credentialReference: RuntimeTargetProfileReference.rehydrate(
              snapshot.credentialReference,
            ),
          }
        : {}),
      ...(snapshot.placementPolicyReference
        ? {
            placementPolicyReference: RuntimeTargetProfileReference.rehydrate(
              snapshot.placementPolicyReference,
            ),
          }
        : {}),
      ...(snapshot.routingPolicyReference
        ? {
            routingPolicyReference: RuntimeTargetProfileReference.rehydrate(
              snapshot.routingPolicyReference,
            ),
          }
        : {}),
      ...(snapshot.registryCredentialReference
        ? {
            registryCredentialReference: RuntimeTargetProfileReference.rehydrate(
              snapshot.registryCredentialReference,
            ),
          }
        : {}),
      ...(snapshot.capabilityPolicyReference
        ? {
            capabilityPolicyReference: RuntimeTargetProfileReference.rehydrate(
              snapshot.capabilityPolicyReference,
            ),
          }
        : {}),
    });
  }

  toSnapshot(): RuntimeTargetProfileSnapshot {
    return {
      schemaVersion: this.state.schemaVersion,
      connectionReference: this.state.connectionReference.value,
      ...(this.state.credentialReference
        ? { credentialReference: this.state.credentialReference.value }
        : {}),
      ...(this.state.placementPolicyReference
        ? { placementPolicyReference: this.state.placementPolicyReference.value }
        : {}),
      ...(this.state.routingPolicyReference
        ? { routingPolicyReference: this.state.routingPolicyReference.value }
        : {}),
      ...(this.state.registryCredentialReference
        ? { registryCredentialReference: this.state.registryCredentialReference.value }
        : {}),
      ...(this.state.capabilityPolicyReference
        ? { capabilityPolicyReference: this.state.capabilityPolicyReference.value }
        : {}),
    };
  }

  configuredReferenceKinds(): RuntimeTargetProfileReferenceKind[] {
    return [
      "connection" as const,
      ...(this.state.credentialReference ? (["credential"] as const) : []),
      ...(this.state.placementPolicyReference ? (["placement-policy"] as const) : []),
      ...(this.state.routingPolicyReference ? (["routing-policy"] as const) : []),
      ...(this.state.registryCredentialReference ? (["registry-credential"] as const) : []),
      ...(this.state.capabilityPolicyReference ? (["capability-policy"] as const) : []),
    ];
  }
}
