import {
  domainError,
  err,
  GitRefText,
  ok,
  type ResourceAutoDeployPolicyState,
  ResourceAutoDeploySecretRef,
  ResourceAutoDeployTriggerKindValue,
  ResourceByIdSpec,
  ResourceId,
  type Result,
  SourceBindingFingerprint,
  SourceEventDedupeWindowSeconds,
  SourceEventKindValue,
  safeTry,
  UpdatedAt,
  UpsertResourceSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type AppLogger, type Clock, type EventBus, type ResourceRepository } from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import {
  type ConfigureResourceAutoDeployCommandInput,
  type ConfigureResourceAutoDeployCommandPayload,
  type ConfigureResourceAutoDeployResult,
} from "./configure-resource-auto-deploy.command";

@injectable()
export class ConfigureResourceAutoDeployUseCase {
  constructor(
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ConfigureResourceAutoDeployCommandInput,
  ): Promise<Result<ConfigureResourceAutoDeployResult>> {
    const { clock, eventBus, logger, resourceRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const resourceId = yield* ResourceId.create(input.resourceId);
      const resource = await resourceRepository.findOne(
        repositoryContext,
        ResourceByIdSpec.create(resourceId),
      );

      if (!resource) {
        return err(domainError.notFound("resource", input.resourceId));
      }

      const configuredAt = yield* UpdatedAt.create(clock.now());
      let result: ConfigureResourceAutoDeployResult;

      if (input.mode === "disable") {
        yield* resource.disableAutoDeployPolicy({ disabledAt: configuredAt });
        result = { resourceId: resourceId.value, status: "disabled" };
      } else if (input.mode === "acknowledge-source-binding") {
        const sourceBindingFingerprint = yield* SourceBindingFingerprint.create(
          input.sourceBindingFingerprint ?? "",
        );
        const policy = yield* resource.acknowledgeAutoDeploySourceBinding({
          sourceBindingFingerprint,
          acknowledgedAt: configuredAt,
        });
        result = resultFromPolicy(resourceId.value, policy);
      } else {
        if (!input.policy) {
          return err(
            domainError.validation("Auto-deploy policy is required", {
              phase: "auto-deploy-policy-admission",
              resourceId: resourceId.value,
              mode: input.mode,
            }),
          );
        }

        const policyInput = yield* autoDeployPolicyFromInput(input.policy);
        const policy = yield* resource.configureAutoDeployPolicy({
          ...policyInput,
          configuredAt,
        });
        result = resultFromPolicy(resourceId.value, policy);
      }

      await resourceRepository.upsert(
        repositoryContext,
        resource,
        UpsertResourceSpec.fromResource(resource),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, resource, undefined);

      return ok(result);
    });
  }
}

function autoDeployPolicyFromInput(
  input: NonNullable<ConfigureResourceAutoDeployCommandPayload["policy"]>,
): Result<{
  triggerKind: ResourceAutoDeployTriggerKindValue;
  refs: GitRefText[];
  eventKinds: SourceEventKindValue[];
  genericWebhookSecretRef?: ResourceAutoDeploySecretRef;
  dedupeWindowSeconds?: SourceEventDedupeWindowSeconds;
}> {
  return safeTry(function* () {
    const triggerKind = yield* ResourceAutoDeployTriggerKindValue.create(input.triggerKind);
    const refs: GitRefText[] = [];
    const eventKinds: SourceEventKindValue[] = [];

    for (const ref of input.refs) {
      refs.push(yield* GitRefText.create(ref));
    }

    for (const eventKind of input.eventKinds) {
      eventKinds.push(yield* SourceEventKindValue.create(eventKind));
    }

    const genericWebhookSecretRef = input.genericWebhookSecretRef
      ? yield* ResourceAutoDeploySecretRef.create(input.genericWebhookSecretRef)
      : undefined;
    const dedupeWindowSeconds = input.dedupeWindowSeconds
      ? yield* SourceEventDedupeWindowSeconds.create(input.dedupeWindowSeconds)
      : undefined;

    return ok({
      triggerKind,
      refs,
      eventKinds,
      ...(genericWebhookSecretRef ? { genericWebhookSecretRef } : {}),
      ...(dedupeWindowSeconds ? { dedupeWindowSeconds } : {}),
    });
  });
}

function resultFromPolicy(
  resourceId: string,
  policy: ResourceAutoDeployPolicyState,
): ConfigureResourceAutoDeployResult {
  return {
    resourceId,
    status: policy.status.value,
    triggerKind: policy.triggerKind.value,
    refs: policy.refs.map((ref) => ref.value),
    eventKinds: policy.eventKinds.map((eventKind) => eventKind.value),
    sourceBindingFingerprint: policy.sourceBindingFingerprint.value,
    ...(policy.blockedReason ? { blockedReason: policy.blockedReason.value } : {}),
  };
}
