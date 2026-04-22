import {
  DeploymentByIdSpec,
  DeploymentId,
  DeploymentTargetId,
  domainError,
  err,
  LatestDeploymentSpec,
  ResourceByIdSpec,
  ResourceId,
  type Result,
  ServerByIdSpec,
} from "@appaloft/core";
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

      const server = await this.serverReadModel.findOne(
        repositoryContext,
        ServerByIdSpec.create(DeploymentTargetId.rehydrate(scope.serverId)),
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

    const resource = await this.resourceReadModel.findOne(
      repositoryContext,
      ResourceByIdSpec.create(ResourceId.rehydrate(scope.resourceId)),
    );

    if (!resource) {
      return err(domainError.notFound("resource", scope.resourceId));
    }

    const deployment = scope.deploymentId
      ? await this.deploymentReadModel.findOne(
          repositoryContext,
          DeploymentByIdSpec.create(DeploymentId.rehydrate(scope.deploymentId)),
        )
      : await this.deploymentReadModel.findOne(
          repositoryContext,
          LatestDeploymentSpec.forResource(ResourceId.rehydrate(resource.id)),
        );

    if (!deployment) {
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

    if (deployment.resourceId !== resource.id) {
      return err(
        domainError.terminalSessionContextMismatch(
          "Selected deployment does not belong to the requested resource",
          {
            resourceId: resource.id,
            deploymentId: deployment.id,
          },
        ),
      );
    }

    const server = await this.serverReadModel.findOne(
      repositoryContext,
      ServerByIdSpec.create(DeploymentTargetId.rehydrate(deployment.serverId)),
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
