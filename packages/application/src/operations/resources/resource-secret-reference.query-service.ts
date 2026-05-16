import {
  domainError,
  err,
  GeneratedAt,
  ok,
  ResourceByIdSpec,
  ResourceId,
  type Result,
  safeTry,
  VariableExposureValue,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type ListResourceSecretReferencesResult,
  type ResourceRepository,
  type ResourceSecretReferenceSummary,
  type ShowResourceSecretReferenceResult,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ListResourceSecretReferencesQuery } from "./list-resource-secret-references.query";
import { type ShowResourceSecretReferenceQuery } from "./show-resource-secret-reference.query";

const secretMask = "****";

interface SecretSummaryEntry {
  key: string;
  exposure: "build-time" | "runtime";
  updatedAt: string;
}

function toSecretSummary(input: {
  resourceId: string;
  entry: SecretSummaryEntry;
}): ResourceSecretReferenceSummary {
  return {
    resourceId: input.resourceId,
    key: input.entry.key,
    value: secretMask,
    scope: "resource",
    exposure: input.entry.exposure,
    kind: "secret",
    isSecret: true,
    updatedAt: input.entry.updatedAt,
  };
}

@injectable()
export class ResourceSecretReferenceQueryService {
  constructor(
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async list(
    context: ExecutionContext,
    query: ListResourceSecretReferencesQuery,
  ): Promise<Result<ListResourceSecretReferencesResult>> {
    const { clock, resourceRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const resourceId = yield* ResourceId.create(query.resourceId);
      const resource = await resourceRepository.findOne(
        repositoryContext,
        ResourceByIdSpec.create(resourceId),
      );

      if (!resource) {
        return err(domainError.notFound("resource", query.resourceId));
      }

      const exposure = query.exposure
        ? yield* VariableExposureValue.create(query.exposure)
        : undefined;
      const generatedAt = yield* GeneratedAt.create(clock.now());
      const resourceState = resource.toState();
      const items = resourceState.variables
        .toState()
        .filter(
          (entry) =>
            entry.scope.value === "resource" &&
            entry.kind.value === "secret" &&
            entry.isSecret &&
            (!exposure || entry.exposure.equals(exposure)),
        )
        .map((entry) =>
          toSecretSummary({
            resourceId: resourceState.id.value,
            entry: {
              key: entry.key.value,
              exposure: entry.exposure.value,
              updatedAt: entry.updatedAt.value,
            },
          }),
        )
        .sort(
          (left, right) =>
            left.key.localeCompare(right.key) || left.exposure.localeCompare(right.exposure),
        );

      return ok({
        schemaVersion: "resources.secrets.list/v1",
        resourceId: resourceState.id.value,
        items,
        generatedAt: generatedAt.value,
      } satisfies ListResourceSecretReferencesResult);
    });
  }

  async show(
    context: ExecutionContext,
    query: ShowResourceSecretReferenceQuery,
  ): Promise<Result<ShowResourceSecretReferenceResult>> {
    const { clock, resourceRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const resourceId = yield* ResourceId.create(query.resourceId);
      const resource = await resourceRepository.findOne(
        repositoryContext,
        ResourceByIdSpec.create(resourceId),
      );

      if (!resource) {
        return err(domainError.notFound("resource", query.resourceId));
      }

      const exposure = yield* VariableExposureValue.create(query.exposure);
      const generatedAt = yield* GeneratedAt.create(clock.now());
      const resourceState = resource.toState();
      const entry = resourceState.variables
        .toState()
        .find(
          (candidate) =>
            candidate.scope.value === "resource" &&
            candidate.kind.value === "secret" &&
            candidate.isSecret &&
            candidate.key.value === query.key &&
            candidate.exposure.equals(exposure),
        );

      if (!entry) {
        return err(domainError.notFound("resource_secret_reference", query.key));
      }

      return ok({
        schemaVersion: "resources.secrets.show/v1",
        secret: toSecretSummary({
          resourceId: resourceState.id.value,
          entry: {
            key: entry.key.value,
            exposure: entry.exposure.value,
            updatedAt: entry.updatedAt.value,
          },
        }),
        generatedAt: generatedAt.value,
      } satisfies ShowResourceSecretReferenceResult);
    });
  }
}
