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
} from "@yundu/core";
import { inject, injectable } from "tsyringe";
import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type Clock, type EnvironmentDiffSummary, type EnvironmentRepository } from "../../ports";
import { tokens } from "../../tokens";
import { type DiffEnvironmentsQueryInput } from "./diff-environments.query";

@injectable()
export class DiffEnvironmentsQueryService {
  constructor(
    @inject(tokens.environmentRepository)
    private readonly environmentRepository: EnvironmentRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
  ) {}

  async execute(
    context: ExecutionContext,
    input: DiffEnvironmentsQueryInput,
  ): Promise<Result<EnvironmentDiffSummary[]>> {
    const { clock, environmentRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const environmentId = yield* EnvironmentId.create(input.environmentId);
      const otherEnvironmentId = yield* EnvironmentId.create(input.otherEnvironmentId);

      const left = await environmentRepository.findOne(
        repositoryContext,
        EnvironmentByIdSpec.create(environmentId),
      );
      const right = await environmentRepository.findOne(
        repositoryContext,
        EnvironmentByIdSpec.create(otherEnvironmentId),
      );

      if (!left) {
        return err(domainError.notFound("environment", input.environmentId));
      }

      if (!right) {
        return err(domainError.notFound("environment", input.otherEnvironmentId));
      }

      const snapshotId = yield* EnvironmentSnapshotId.create(
        `snapshot-${input.otherEnvironmentId}`,
      );
      const createdAt = yield* GeneratedAt.create(clock.now());

      return ok(
        left
          .diffAgainst(
            right.materializeSnapshot({
              snapshotId,
              createdAt,
            }),
          )
          .map(
            (entry): EnvironmentDiffSummary => ({
              key: entry.key.value,
              exposure: entry.exposure.value as EnvironmentDiffSummary["exposure"],
              change: entry.change,
              ...(entry.left
                ? {
                    left: {
                      key: entry.left.key,
                      value: entry.left.value,
                      scope: entry.left.scope as NonNullable<
                        EnvironmentDiffSummary["left"]
                      >["scope"],
                      exposure: entry.left.exposure as NonNullable<
                        EnvironmentDiffSummary["left"]
                      >["exposure"],
                      isSecret: entry.left.isSecret,
                      kind: entry.left.kind as NonNullable<EnvironmentDiffSummary["left"]>["kind"],
                    },
                  }
                : {}),
              ...(entry.right
                ? {
                    right: {
                      key: entry.right.key,
                      value: entry.right.value,
                      scope: entry.right.scope as NonNullable<
                        EnvironmentDiffSummary["right"]
                      >["scope"],
                      exposure: entry.right.exposure as NonNullable<
                        EnvironmentDiffSummary["right"]
                      >["exposure"],
                      isSecret: entry.right.isSecret,
                      kind: entry.right.kind as NonNullable<
                        EnvironmentDiffSummary["right"]
                      >["kind"],
                    },
                  }
                : {}),
            }),
          ),
      );
    });
  }
}
