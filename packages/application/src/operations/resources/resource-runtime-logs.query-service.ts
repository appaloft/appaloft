import { type DomainError, domainError, err, ok, type Result } from "@yundu/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type DeploymentReadModel,
  type DeploymentSummary,
  type ResourceReadModel,
  type ResourceRuntimeLogEvent,
  type ResourceRuntimeLogLine,
  type ResourceRuntimeLogReader,
  type ResourceRuntimeLogRequest,
  type ResourceRuntimeLogStream,
  type ResourceRuntimeLogsResult,
  type ResourceSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ResourceRuntimeLogsQuery } from "./resource-runtime-logs.query";

class MaskingResourceRuntimeLogStream implements ResourceRuntimeLogStream {
  constructor(
    private readonly inner: ResourceRuntimeLogStream,
    private readonly redactions: readonly string[],
  ) {}

  async close(): Promise<void> {
    await this.inner.close();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<ResourceRuntimeLogEvent> {
    for await (const event of this.inner) {
      if (event.kind !== "line") {
        yield event;
        continue;
      }

      yield {
        kind: "line",
        line: maskRuntimeLogLine(event.line, this.redactions),
      };
    }
  }
}

function replaceAllText(value: string, search: string, replacement: string): string {
  return value.split(search).join(replacement);
}

function maskRuntimeLogLine(
  line: ResourceRuntimeLogLine,
  redactions: readonly string[],
): ResourceRuntimeLogLine {
  let message = line.message;
  let masked = line.masked;

  for (const redaction of redactions) {
    if (!redaction || !message.includes(redaction)) {
      continue;
    }

    message = replaceAllText(message, redaction, "********");
    masked = true;
  }

  return {
    ...line,
    message,
    masked,
  };
}

function runtimeLogError(
  code: "context_mismatch" | "unavailable",
  message: string,
  details: Record<string, string | number | boolean | null>,
): DomainError {
  switch (code) {
    case "context_mismatch":
      return domainError.resourceRuntimeLogsContextMismatch(message, details);
    case "unavailable":
      return domainError.resourceRuntimeLogsUnavailable(message, details);
  }
}

function compareCreatedAtDesc(left: DeploymentSummary, right: DeploymentSummary): number {
  const createdCompare = right.createdAt.localeCompare(left.createdAt);

  if (createdCompare !== 0) {
    return createdCompare;
  }

  return right.id.localeCompare(left.id);
}

function resolveServiceName(
  resource: ResourceSummary,
  requestedServiceName: string | undefined,
): Result<string | undefined> {
  if (requestedServiceName) {
    const serviceExists = resource.services.some(
      (service) => service.name === requestedServiceName,
    );

    if (!serviceExists && resource.services.length > 0) {
      return err(
        domainError.validation("Resource service was not found", {
          phase: "runtime-instance-resolution",
          resourceId: resource.id,
          serviceName: requestedServiceName,
        }),
      );
    }

    return ok(requestedServiceName);
  }

  if (resource.networkProfile?.targetServiceName) {
    return ok(resource.networkProfile.targetServiceName);
  }

  if (resource.services.length <= 1) {
    return ok(resource.services[0]?.name);
  }

  return err(
    domainError.validation("serviceName is required for multi-service runtime logs", {
      phase: "runtime-instance-resolution",
      resourceId: resource.id,
      serviceCount: resource.services.length,
    }),
  );
}

function redactionsFromDeployment(deployment: DeploymentSummary): string[] {
  return deployment.environmentSnapshot.variables
    .filter((variable) => variable.isSecret)
    .map((variable) => variable.value)
    .filter((value) => value.trim().length > 0);
}

@injectable()
export class ResourceRuntimeLogsQueryService {
  constructor(
    @inject(tokens.resourceReadModel) private readonly resourceReadModel: ResourceReadModel,
    @inject(tokens.deploymentReadModel) private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.resourceRuntimeLogReader)
    private readonly runtimeLogReader: ResourceRuntimeLogReader,
  ) {}

  async execute(
    context: ExecutionContext,
    query: ResourceRuntimeLogsQuery,
  ): Promise<Result<ResourceRuntimeLogsResult>> {
    const repositoryContext = toRepositoryContext(context);
    const resources = await this.resourceReadModel.list(repositoryContext);
    const resource = resources.find((candidate) => candidate.id === query.resourceId);

    if (!resource) {
      return err(domainError.notFound("resource", query.resourceId));
    }

    const deployments = await this.deploymentReadModel.list(repositoryContext, {
      resourceId: resource.id,
    });
    const deploymentResult = query.deploymentId
      ? await this.resolveSelectedDeployment(context, query.deploymentId, resource, deployments)
      : ok(deployments.sort(compareCreatedAtDesc)[0] ?? null);

    if (deploymentResult.isErr()) {
      return err(deploymentResult.error);
    }

    const deployment = deploymentResult.value;

    if (!deployment) {
      return err(
        runtimeLogError("unavailable", "Resource has no observable runtime deployment", {
          phase: "runtime-instance-resolution",
          resourceId: resource.id,
        }),
      );
    }

    const serviceNameResult = resolveServiceName(resource, query.serviceName);
    if (serviceNameResult.isErr()) {
      return err(serviceNameResult.error);
    }

    const request: ResourceRuntimeLogRequest = {
      tailLines: query.tailLines,
      follow: query.follow,
      ...(serviceNameResult.value ? { serviceName: serviceNameResult.value } : {}),
      ...(query.since ? { since: query.since } : {}),
      ...(query.cursor ? { cursor: query.cursor } : {}),
    };
    const signal = query.signal ?? new AbortController().signal;
    const opened = await this.runtimeLogReader.open(
      context,
      {
        resource,
        deployment,
        redactions: redactionsFromDeployment(deployment),
      },
      request,
      signal,
    );

    if (opened.isErr()) {
      return err(opened.error);
    }

    const stream = new MaskingResourceRuntimeLogStream(
      opened.value,
      redactionsFromDeployment(deployment),
    );

    if (query.follow) {
      return ok({
        mode: "stream",
        resourceId: resource.id,
        deploymentId: deployment.id,
        stream,
      });
    }

    const logs: ResourceRuntimeLogLine[] = [];

    try {
      for await (const event of stream) {
        if (event.kind === "line") {
          logs.push(event.line);
          continue;
        }

        if (event.kind === "error") {
          return err(event.error);
        }
      }
    } finally {
      await stream.close();
    }

    return ok({
      mode: "bounded",
      resourceId: resource.id,
      deploymentId: deployment.id,
      logs,
    });
  }

  private async resolveSelectedDeployment(
    context: ExecutionContext,
    deploymentId: string,
    resource: ResourceSummary,
    resourceDeployments: DeploymentSummary[],
  ): Promise<Result<DeploymentSummary | null>> {
    const matchingDeployment = resourceDeployments.find(
      (deployment) => deployment.id === deploymentId,
    );

    if (matchingDeployment) {
      return ok(matchingDeployment);
    }

    const allDeployments = await this.deploymentReadModel.list(toRepositoryContext(context));
    const deployment = allDeployments.find((candidate) => candidate.id === deploymentId);

    if (!deployment) {
      return err(domainError.notFound("deployment", deploymentId));
    }

    return err(
      runtimeLogError("context_mismatch", "Deployment does not belong to resource", {
        phase: "context-resolution",
        resourceId: resource.id,
        deploymentId,
        deploymentResourceId: deployment.resourceId,
      }),
    );
  }
}
