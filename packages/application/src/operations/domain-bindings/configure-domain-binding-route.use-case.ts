import {
  ActiveDomainBindingByOwnerAndRouteSpec,
  CanonicalRedirectStatusCode,
  CreatedAt,
  DomainBindingByIdSpec,
  DomainBindingId,
  domainError,
  err,
  ok,
  PublicDomainName,
  type Result,
  safeTry,
  UpsertDomainBindingSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type AppLogger,
  type Clock,
  type DomainBindingRepository,
  type EventBus,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type ConfigureDomainBindingRouteCommandInput } from "./configure-domain-binding-route.command";

function domainBindingNotFound(id: string) {
  const error = domainError.notFound("DomainBinding", id);
  return {
    ...error,
    details: {
      ...(error.details ?? {}),
      phase: "domain-binding-route-configuration",
      domainBindingId: id,
    },
  };
}

@injectable()
export class ConfigureDomainBindingRouteUseCase {
  constructor(
    @inject(tokens.domainBindingRepository)
    private readonly domainBindingRepository: DomainBindingRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ConfigureDomainBindingRouteCommandInput,
  ): Promise<Result<{ id: string }>> {
    const { clock, domainBindingRepository, eventBus, logger } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const domainBindingId = yield* DomainBindingId.create(input.domainBindingId);
      const domainBinding = await domainBindingRepository.findOne(
        repositoryContext,
        DomainBindingByIdSpec.create(domainBindingId),
      );

      if (!domainBinding) {
        return err(domainBindingNotFound(input.domainBindingId));
      }

      let redirectTo: PublicDomainName | undefined;
      if (input.redirectTo) {
        redirectTo = yield* PublicDomainName.create(input.redirectTo);
        const redirectTarget = await domainBindingRepository.findOne(
          repositoryContext,
          ActiveDomainBindingByOwnerAndRouteSpec.create({
            projectId: domainBinding.projectId,
            environmentId: domainBinding.environmentId,
            resourceId: domainBinding.resourceId,
            domainName: redirectTo,
            pathPrefix: domainBinding.pathPrefix,
          }),
        );

        yield* domainBinding.ensureCanonicalRedirectTarget({
          redirectTo,
          target: redirectTarget,
          phase: "domain-binding-route-configuration",
        });
      }

      const redirectStatus = input.redirectStatus
        ? yield* CanonicalRedirectStatusCode.create(input.redirectStatus)
        : undefined;
      const configuredAt = yield* CreatedAt.create(clock.now());
      const configureResult = yield* domainBinding.configureRoute({
        ...(redirectTo ? { redirectTo } : {}),
        ...(redirectStatus ? { redirectStatus } : {}),
        configuredAt,
        correlationId: context.requestId,
      });

      if (!configureResult.changed) {
        return ok({ id: domainBindingId.value });
      }

      await domainBindingRepository.upsert(
        repositoryContext,
        domainBinding,
        UpsertDomainBindingSpec.fromDomainBinding(domainBinding),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, domainBinding, undefined);

      return ok({ id: domainBindingId.value });
    });
  }
}
