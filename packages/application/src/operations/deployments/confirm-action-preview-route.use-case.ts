import {
  DeploymentByIdSpec,
  DeploymentId,
  domainError,
  err,
  ok,
  PublicDomainName,
  type Result,
  RoutePathPrefix,
  TlsModeValue,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type DeploymentRepository } from "../../ports";
import { tokens } from "../../tokens";
import {
  type ConfirmActionPreviewRouteCommandParsedInput,
  type ConfirmActionPreviewRouteResponse,
} from "./confirm-action-preview-route.schema";

function previewRouteUrl(input: {
  host: string;
  pathPrefix: string;
  tlsMode: "auto" | "disabled";
}): string {
  const scheme = input.tlsMode === "disabled" ? "http" : "https";
  const path = input.pathPrefix === "/" ? "" : input.pathPrefix;
  return `${scheme}://${input.host}${path}`;
}

@injectable()
export class ConfirmActionPreviewRouteUseCase {
  constructor(
    @inject(tokens.deploymentRepository)
    private readonly deploymentRepository: DeploymentRepository,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ConfirmActionPreviewRouteCommandParsedInput,
  ): Promise<Result<ConfirmActionPreviewRouteResponse>> {
    const deploymentId = DeploymentId.create(input.deploymentId);
    if (deploymentId.isErr()) {
      return err(deploymentId.error);
    }

    const deployment = await this.deploymentRepository.findOne(
      toRepositoryContext(context),
      DeploymentByIdSpec.create(deploymentId.value),
    );
    if (!deployment) {
      return err(domainError.notFound("Deployment", input.deploymentId));
    }

    const host = PublicDomainName.create(input.host);
    if (host.isErr()) {
      return err(host.error);
    }
    const pathPrefix = RoutePathPrefix.create(input.pathPrefix);
    if (pathPrefix.isErr()) {
      return err(pathPrefix.error);
    }
    const tlsMode = TlsModeValue.create(input.tlsMode);
    if (tlsMode.isErr()) {
      return err(tlsMode.error);
    }

    if (
      !deployment.hasRealizedAccessRoute({
        host: host.value,
        pathPrefix: pathPrefix.value,
        tlsMode: tlsMode.value,
      })
    ) {
      return err(
        domainError.validation(
          "Action server config preview route was not realized; deployment did not use the requested preview domain",
          {
            phase: "preview-route-verification",
            deploymentId: input.deploymentId,
            expectedHost: input.host,
            expectedPathPrefix: input.pathPrefix,
            expectedTlsMode: input.tlsMode,
          },
        ),
      );
    }

    return ok({ previewUrl: previewRouteUrl(input) });
  }
}
