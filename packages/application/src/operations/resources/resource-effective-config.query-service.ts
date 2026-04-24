import {
  domainError,
  EnvironmentByIdSpec,
  EnvironmentSnapshotId,
  err,
  GeneratedAt,
  ok,
  ResourceByIdSpec,
  ResourceId,
  type Result,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type EnvironmentRepository,
  type ResourceConfigEntryView,
  type ResourceEffectiveConfigView,
  type ResourceRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ResourceEffectiveConfigQueryInput } from "./resource-effective-config.query";

const secretMask = "****";

function maskEntry(input: {
  key: string;
  value: string;
  scope: ResourceConfigEntryView["scope"];
  exposure: ResourceConfigEntryView["exposure"];
  isSecret: boolean;
  kind: ResourceConfigEntryView["kind"];
  updatedAt?: string;
}): ResourceConfigEntryView {
  return {
    key: input.key,
    value: input.isSecret ? secretMask : input.value,
    scope: input.scope,
    exposure: input.exposure,
    isSecret: input.isSecret,
    kind: input.kind,
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
  };
}

function resourceReadNotFound(resourceId: string) {
  return domainError.notFound("resource", resourceId);
}

@injectable()
export class ResourceEffectiveConfigQueryService {
  constructor(
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.environmentRepository)
    private readonly environmentRepository: EnvironmentRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ResourceEffectiveConfigQueryInput,
  ): Promise<Result<ResourceEffectiveConfigView>> {
    const repositoryContext = toRepositoryContext(context);
    const { clock, environmentRepository, resourceRepository } = this;

    return safeTry(async function* () {
      const resourceId = yield* ResourceId.create(input.resourceId);
      const resource = await resourceRepository.findOne(
        repositoryContext,
        ResourceByIdSpec.create(resourceId),
      );

      if (!resource) {
        return err(resourceReadNotFound(input.resourceId));
      }

      const resourceState = resource.toState();
      const environment = await environmentRepository.findOne(
        repositoryContext,
        EnvironmentByIdSpec.create(resourceState.environmentId),
      );

      if (!environment) {
        return err(resourceReadNotFound(input.resourceId));
      }

      const generatedAt = yield* GeneratedAt.create(clock.now());
      const snapshotId = EnvironmentSnapshotId.rehydrate(`${resourceState.id.value}-effective`);
      const inherited = environment.materializeSnapshot({
        snapshotId,
        createdAt: generatedAt,
      });
      const effective = resource.materializeEffectiveEnvironmentSnapshot({
        environmentId: resourceState.environmentId,
        snapshotId,
        createdAt: generatedAt,
        inherited: inherited.toState().variables,
      });

      return ok({
        schemaVersion: "resources.effective-config/v1",
        resourceId: resourceState.id.value,
        environmentId: resourceState.environmentId.value,
        ownedEntries: resourceState.variables.map((entry) =>
          maskEntry({
            key: entry.key,
            value: entry.value,
            scope: entry.scope as ResourceConfigEntryView["scope"],
            exposure: entry.exposure as ResourceConfigEntryView["exposure"],
            isSecret: entry.isSecret,
            kind: entry.kind as ResourceConfigEntryView["kind"],
            updatedAt: entry.updatedAt,
          }),
        ),
        effectiveEntries: effective.variables.map((entry) =>
          maskEntry({
            key: entry.key,
            value: entry.value,
            scope: entry.scope as ResourceConfigEntryView["scope"],
            exposure: entry.exposure as ResourceConfigEntryView["exposure"],
            isSecret: entry.isSecret,
            kind: entry.kind as ResourceConfigEntryView["kind"],
          }),
        ),
        precedence: [...effective.precedence] as ResourceEffectiveConfigView["precedence"],
        generatedAt: generatedAt.value,
      } satisfies ResourceEffectiveConfigView);
    });
  }
}
