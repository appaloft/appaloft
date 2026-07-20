import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { type CreatedAt } from "../shared/temporal";
import { type SandboxNetworkPolicy } from "./network-policy";
import {
  type SandboxIsolationLevel,
  type SandboxResourceLimits,
  type SandboxTemplateId,
  type SandboxTemplateName,
} from "./values";

export interface SandboxTemplateOverridePolicy {
  isolation: "immutable" | "strengthen-only";
  limits: "immutable" | "decrease-only";
  network: "immutable";
}

export interface SandboxTemplateState {
  id: SandboxTemplateId;
  name: SandboxTemplateName;
  image: string;
  minimumIsolation: SandboxIsolationLevel;
  limits: SandboxResourceLimits;
  networkPolicy: SandboxNetworkPolicy;
  overridePolicy: SandboxTemplateOverridePolicy;
  createdAt: CreatedAt;
}

export interface ResolvedSandboxTemplatePolicy {
  image: string;
  requestedIsolation: SandboxIsolationLevel;
  limits: SandboxResourceLimits;
  networkPolicy: SandboxNetworkPolicy;
}

export class SandboxTemplate extends AggregateRoot<SandboxTemplateState, SandboxTemplateId> {
  private constructor(state: SandboxTemplateState) {
    super(state);
  }
  static create(input: SandboxTemplateState): Result<SandboxTemplate> {
    if (!input.image.trim() || /[\s;&|`$<>\0]/u.test(input.image)) {
      return err(
        domainError.validation("Sandbox template image is invalid", {
          phase: "execution-sandbox-template-admission",
          field: "image",
        }),
      );
    }
    const template = new SandboxTemplate(input);
    template.recordDomainEvent("sandbox-template-created", input.createdAt, {
      name: input.name.value,
      minimumIsolation: input.minimumIsolation.value,
    });
    return ok(template);
  }
  static rehydrate(state: SandboxTemplateState): SandboxTemplate {
    return new SandboxTemplate(state);
  }
  toState(): SandboxTemplateState {
    return { ...this.state };
  }
  resolveCreatePolicy(input: {
    requestedIsolation?: SandboxIsolationLevel;
    limits?: SandboxResourceLimits;
    networkPolicy?: SandboxNetworkPolicy;
  }): Result<ResolvedSandboxTemplatePolicy> {
    const isolation = input.requestedIsolation ?? this.state.minimumIsolation;
    if (
      (this.state.overridePolicy.isolation === "immutable" &&
        !isolation.equals(this.state.minimumIsolation)) ||
      !isolation.satisfies(this.state.minimumIsolation)
    ) {
      return err(
        domainError.conflict("Sandbox template isolation cannot be weakened", {
          phase: "execution-sandbox-template-override",
          field: "isolation",
        }),
      );
    }
    const limits = input.limits ?? this.state.limits;
    if (
      (this.state.overridePolicy.limits === "immutable" && !limits.equals(this.state.limits)) ||
      !limits.doesNotExceed(this.state.limits)
    ) {
      return err(
        domainError.conflict("Sandbox template resource limits cannot be increased", {
          phase: "execution-sandbox-template-override",
          field: "limits",
        }),
      );
    }
    if (input.networkPolicy && !input.networkPolicy.equals(this.state.networkPolicy)) {
      return err(
        domainError.conflict("Sandbox template network policy is immutable", {
          phase: "execution-sandbox-template-override",
          field: "networkPolicy",
        }),
      );
    }
    return ok({
      image: this.state.image,
      requestedIsolation: isolation,
      limits,
      networkPolicy: this.state.networkPolicy,
    });
  }
}
