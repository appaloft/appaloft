import { domainError, err, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import {
  type DeploymentReadModel,
  type DeploymentSummary,
  type IdGenerator,
  type ResourceReadModel,
  type ServerReadModel,
  type TerminalSessionDescriptor,
  type TerminalSessionGateway,
} from "../../ports";
import { tokens } from "../../tokens";
import { type OpenTerminalSessionCommand } from "./open-terminal-session.command";

function metadataValue(deployment: DeploymentSummary, key: string): string | undefined {
  const value = deployment.runtimePlan.execution.metadata?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function appendRelativeDirectory(root: string, relativeDirectory?: string): string {
  if (!relativeDirectory) {
    return root;
  }

  const normalizedRoot = root.replace(/\/+$/, "");
  const normalizedRelative = relativeDirectory.replace(/^\/+/, "").replace(/\/+$/, "");
  return normalizedRelative ? `${normalizedRoot}/${normalizedRelative}` : normalizedRoot;
}

function meaningfulWorkingDirectory(workingDirectory?: string): string | undefined {
  const trimmed = workingDirectory?.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || /^[^@\s]+@[^:\s]+:.+/.test(trimmed)) {
    return undefined;
  }

  return trimmed;
}

function deploymentCreatedAtMillis(deployment: DeploymentSummary): number {
  const parsed = Date.parse(deployment.createdAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestDeployment(deployments: DeploymentSummary[]): DeploymentSummary | undefined {
  return [...deployments].sort(
    (left, right) => deploymentCreatedAtMillis(right) - deploymentCreatedAtMillis(left),
  )[0];
}

function resolveDeploymentWorkspace(deployment: DeploymentSummary): string | undefined {
  return (
    metadataValue(deployment, "workdir") ??
    metadataValue(deployment, "remoteWorkdir") ??
    metadataValue(deployment, "sourceDir") ??
    meaningfulWorkingDirectory(deployment.runtimePlan.execution.workingDirectory)
  );
}

@injectable()
export class OpenTerminalSessionUseCase {
  constructor(
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.serverReadModel)
    private readonly serverReadModel: ServerReadModel,
    @inject(tokens.resourceReadModel)
    private readonly resourceReadModel: ResourceReadModel,
    @inject(tokens.deploymentReadModel)
    private readonly deploymentReadModel: DeploymentReadModel,
    @inject(tokens.terminalSessionGateway)
    private readonly terminalSessionGateway: TerminalSessionGateway,
  ) {}

  async execute(
    context: ExecutionContext,
    command: OpenTerminalSessionCommand,
  ): Promise<Result<TerminalSessionDescriptor>> {
    const repositoryContext = toRepositoryContext(context);
    const scope = command.scope;

    if (scope.kind === "server") {
      if (command.relativeDirectory) {
        return err(
          domainError.terminalSessionContextMismatch(
            "Server terminal sessions cannot declare a resource-relative directory",
            {
              serverId: scope.serverId,
            },
          ),
        );
      }

      const server = (await this.serverReadModel.list(repositoryContext)).find(
        (candidate) => candidate.id === scope.serverId,
      );

      if (!server) {
        return err(domainError.notFound("server", scope.serverId));
      }

      return this.terminalSessionGateway.open(context, {
        sessionId: this.idGenerator.next("term"),
        scope: {
          kind: "server",
          server,
        },
        initialRows: command.initialRows,
        initialCols: command.initialCols,
      });
    }

    const resource = (await this.resourceReadModel.list(repositoryContext)).find(
      (candidate) => candidate.id === scope.resourceId,
    );

    if (!resource) {
      return err(domainError.notFound("resource", scope.resourceId));
    }

    const resourceDeployments = await this.deploymentReadModel.list(repositoryContext, {
      resourceId: resource.id,
    });
    const deployment = scope.deploymentId
      ? resourceDeployments.find((candidate) => candidate.id === scope.deploymentId)
      : latestDeployment(resourceDeployments);

    if (!deployment) {
      if (scope.deploymentId) {
        const selectedDeployment = (await this.deploymentReadModel.list(repositoryContext)).find(
          (candidate) => candidate.id === scope.deploymentId,
        );

        if (selectedDeployment) {
          return err(
            domainError.terminalSessionContextMismatch(
              "Selected deployment does not belong to the requested resource",
              {
                resourceId: resource.id,
                deploymentId: selectedDeployment.id,
              },
            ),
          );
        }
      }

      return err(
        scope.deploymentId
          ? domainError.notFound("deployment", scope.deploymentId)
          : domainError.terminalSessionWorkspaceUnavailable(
              "Resource terminal session requires an observable deployment workspace",
              {
                resourceId: resource.id,
              },
            ),
      );
    }

    const server = (await this.serverReadModel.list(repositoryContext)).find(
      (candidate) => candidate.id === deployment.serverId,
    );

    if (!server) {
      return err(domainError.notFound("server", deployment.serverId));
    }

    const workspace = resolveDeploymentWorkspace(deployment);
    if (!workspace) {
      return err(
        domainError.terminalSessionWorkspaceUnavailable(
          "Deployment workspace metadata is not available",
          {
            resourceId: resource.id,
            deploymentId: deployment.id,
          },
        ),
      );
    }

    return this.terminalSessionGateway.open(context, {
      sessionId: this.idGenerator.next("term"),
      scope: {
        kind: "resource",
        resource,
        deployment,
        server,
        workingDirectory: appendRelativeDirectory(workspace, command.relativeDirectory),
      },
      initialRows: command.initialRows,
      initialCols: command.initialCols,
    });
  }
}
