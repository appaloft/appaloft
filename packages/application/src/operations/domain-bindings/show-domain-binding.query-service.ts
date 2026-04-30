import {
  domainError,
  err,
  ok,
  ResourceByIdSpec,
  ResourceId,
  type Result,
  safeTry,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type CertificateReadModel,
  type DomainBindingDetail,
  type DomainBindingReadModel,
  type ResourceAccessSummary,
  type ResourceReadModel,
} from "../../ports";
import { tokens } from "../../tokens";
import {
  routeIntentStatusDescriptors,
  selectedRouteIntentStatus,
} from "../resources/route-intent-status";
import { domainBindingDeleteSafety } from "./domain-binding-delete-safety";
import { type ShowDomainBindingQueryInput } from "./show-domain-binding.query";

@injectable()
export class ShowDomainBindingQueryService {
  constructor(
    @inject(tokens.domainBindingReadModel)
    private readonly domainBindingReadModel: DomainBindingReadModel,
    @inject(tokens.certificateReadModel)
    private readonly certificateReadModel: CertificateReadModel,
    @inject(tokens.resourceReadModel)
    private readonly resourceReadModel: ResourceReadModel,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ShowDomainBindingQueryInput,
  ): Promise<Result<DomainBindingDetail>> {
    const repositoryContext = toRepositoryContext(context);
    const { certificateReadModel, domainBindingReadModel, resourceReadModel } = this;

    return safeTry(async function* () {
      const bindings = await domainBindingReadModel.list(repositoryContext);
      const binding = bindings.find((candidate) => candidate.id === input.domainBindingId);

      if (!binding) {
        return err(domainError.notFound("DomainBinding", input.domainBindingId));
      }

      const certificates = await certificateReadModel.list(repositoryContext, {
        domainBindingId: binding.id,
      });
      const resourceId = yield* ResourceId.create(binding.resourceId);
      const resource = await resourceReadModel.findOne(
        repositoryContext,
        ResourceByIdSpec.create(resourceId),
      );
      const routeDescriptors = routeIntentStatusDescriptors({
        resourceId: binding.resourceId,
        accessSummary: resource?.accessSummary,
      });
      const selectedRoute = selectedRouteIntentStatus({
        resourceId: binding.resourceId,
        accessSummary: resource?.accessSummary,
        domainBindings: [binding],
      });
      const generatedAccessFallback =
        resource?.accessSummary?.latestGeneratedAccessRoute ??
        resource?.accessSummary?.plannedGeneratedAccessRoute;
      const routeReadinessStatus: DomainBindingDetail["routeReadiness"]["status"] =
        binding.status === "ready"
          ? "ready"
          : binding.status === "deleted"
            ? "deleted"
            : binding.status === "failed"
              ? "failed"
              : binding.status === "pending_verification" || binding.status === "requested"
                ? "pending"
                : "not-ready";
      const proxyReadiness: ResourceAccessSummary["proxyRouteStatus"] | undefined =
        resource?.accessSummary?.proxyRouteStatus;
      const routeBehavior: DomainBindingDetail["routeReadiness"]["routeBehavior"] =
        binding.redirectTo ? "redirect" : "serve";

      return ok({
        binding,
        routeReadiness: {
          status: routeReadinessStatus,
          routeBehavior,
          ...(selectedRoute ? { selectedRoute } : {}),
          contextRoutes: routeDescriptors,
        },
        ...(generatedAccessFallback ? { generatedAccessFallback } : {}),
        ...(proxyReadiness ? { proxyReadiness } : {}),
        certificates,
        deleteSafety: domainBindingDeleteSafety({
          domainBindingId: binding.id,
          certificates,
        }),
      });
    });
  }
}
