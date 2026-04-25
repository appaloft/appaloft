import {
  domainError,
  EnvironmentByIdSpec,
  EnvironmentId,
  EnvironmentSnapshotId,
  err,
  GeneratedAt,
  ok,
  type Result,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type Clock,
  type EnvironmentConfigEntryView,
  type EnvironmentEffectivePrecedenceView,
  type EnvironmentRepository,
} from "../../ports";
import { tokens } from "../../tokens";
import { type EnvironmentEffectivePrecedenceQueryInput } from "./environment-effective-precedence.query";

const secretMask = "****";

function maskEntry(input: {
  key: string;
  value: string;
  scope: EnvironmentConfigEntryView["scope"];
  exposure: EnvironmentConfigEntryView["exposure"];
  isSecret: boolean;
  kind: EnvironmentConfigEntryView["kind"];
  updatedAt?: string;
}): EnvironmentConfigEntryView {
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

function environmentNotFound(environmentId: string) {
  const error = domainError.notFound("environment", environmentId);
  return {
    ...error,
    details: {
      ...error.details,
      phase: "environment-read",
    },
  };
}

@injectable()
export class EnvironmentEffectivePrecedenceQueryService {
  constructor(
    @inject(tokens.environmentRepository)
    private readonly environmentRepository: EnvironmentRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: EnvironmentEffectivePrecedenceQueryInput,
  ): Promise<Result<EnvironmentEffectivePrecedenceView>> {
    const repositoryContext = toRepositoryContext(context);
    const { clock, environmentRepository } = this;

    return safeTry(async function* () {
      const environmentId = yield* EnvironmentId.create(input.environmentId);
      const environment = await environmentRepository.findOne(
        repositoryContext,
        EnvironmentByIdSpec.create(environmentId),
      );

      if (!environment) {
        return err(environmentNotFound(input.environmentId));
      }

      const generatedAt = yield* GeneratedAt.create(clock.now());
      const state = environment.toState();
      const effective = environment.materializeSnapshot({
        snapshotId: EnvironmentSnapshotId.rehydrate(`${state.id.value}-effective-precedence`),
        createdAt: generatedAt,
      });

      return ok({
        schemaVersion: "environments.effective-precedence/v1",
        environmentId: state.id.value,
        projectId: state.projectId.value,
        ownedEntries: state.variables.map((entry) =>
          maskEntry({
            key: entry.key,
            value: entry.value,
            scope: entry.scope as EnvironmentConfigEntryView["scope"],
            exposure: entry.exposure as EnvironmentConfigEntryView["exposure"],
            isSecret: entry.isSecret,
            kind: entry.kind as EnvironmentConfigEntryView["kind"],
            updatedAt: entry.updatedAt,
          }),
        ),
        effectiveEntries: effective.variables.map((entry) =>
          maskEntry({
            key: entry.key,
            value: entry.value,
            scope: entry.scope as EnvironmentConfigEntryView["scope"],
            exposure: entry.exposure as EnvironmentConfigEntryView["exposure"],
            isSecret: entry.isSecret,
            kind: entry.kind as EnvironmentConfigEntryView["kind"],
          }),
        ),
        precedence: [...effective.precedence] as EnvironmentEffectivePrecedenceView["precedence"],
        generatedAt: generatedAt.value,
      } satisfies EnvironmentEffectivePrecedenceView);
    });
  }
}
