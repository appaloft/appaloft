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
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { checkOperationGuards } from "../../operation-guard";
import {
  AllowAllOperationGuardPort,
  type DeploymentReadModel,
  type DeploymentSummary,
  type IdGenerator,
  type OperationGuardPort,
  type ResourceReadModel,
  type ServerReadModel,
  type TerminalSessionDescriptor,
  type TerminalSessionGateway,
} from "../../ports";
import { tokens } from "../../tokens";
import { isServerBackedDeploymentSummary } from "../deployments/deployment-target-guards";
import { type PreviewOperableScopeResolver } from "../preview-deployments/preview-operable-scope.resolver";
import { type OpenTerminalSessionCommand } from "./open-terminal-session.command";

const openTerminalSessionOperation = findOperationCatalogEntryByKey("terminal-sessions.open");
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

type ResolvedTerminalScope =
  | { kind: "server"; serverId: string }
  | { kind: "resource"; resourceId: string; deploymentId?: string }
  | { kind: "sandbox"; sandboxId: string };

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

function sourceBaseDirectory(deployment: DeploymentSummary): string | null | undefined {
  const rawBaseDirectory = deployment.runtimePlan.source.metadata?.baseDirectory?.trim();
  if (!rawBaseDirectory) {
    return undefined;
  }

  const normalized = rawBaseDirectory.replace(/^\/+/, "").replace(/\/+$/, "");
  if (!normalized || normalized.includes("\0") || /^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)) {
    return null;
  }

  const safeSegments = normalized
    .split("/")
    .filter((segment) => segment.length > 0)
    .every((segment) => segment !== "." && segment !== ".." && !/[;&|`$<>]/u.test(segment));

  return safeSegments ? normalized : null;
}

function appendSourceBaseDirectory(root: string, baseDirectory?: string | null): string {
  if (!baseDirectory) {
    return root;
  }

  const normalizedRoot = root.replace(/\/+$/, "");
  return normalizedRoot.endsWith(`/${baseDirectory}`)
    ? normalizedRoot
    : `${normalizedRoot}/${baseDirectory}`;
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
  const adapterResolvedWorkspace =
    metadataValue(deployment, "workdir") ?? metadataValue(deployment, "remoteWorkdir");
  if (adapterResolvedWorkspace) {
    return adapterResolvedWorkspace;
  }

  const baseDirectory = sourceBaseDirectory(deployment);
  if (baseDirectory === null) {
    return undefined;
  }

  const sourceWorkspace =
    metadataValue(deployment, "sourceDir") ??
    meaningfulWorkingDirectory(deployment.runtimePlan.execution.workingDirectory);
  return sourceWorkspace ? appendSourceBaseDirectory(sourceWorkspace, baseDirectory) : undefined;
}

function runtimeTargetCanOpenWithoutWorkspace(deployment: DeploymentSummary): boolean {
  return ["docker-container", "docker-compose-stack"].includes(
    deployment.runtimePlan.execution.kind,
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
    @inject(tokens.operationGuardPort)
    private readonly operationGuardPort?: OperationGuardPort,
    @inject(tokens.previewOperableScopeResolver)
    private readonly previewOperableScopeResolver?: PreviewOperableScopeResolver,
  ) {}

  async execute(
    context: ExecutionContext,
    command: OpenTerminalSessionCommand,
  ): Promise<Result<TerminalSessionDescriptor>> {
    const repositoryContext = toRepositoryContext(context);
    let scope: ResolvedTerminalScope;
    if (command.scope.kind === "preview") {
      const previewScope = await this.previewOperableScopeResolver?.resolve(context, {
        previewEnvironmentId: command.scope.previewEnvironmentId,
        deploymentId: command.scope.deploymentId,
        requireDeployment: true,
      });
      if (!previewScope) {
        return err(
          domainError.validation("Preview terminal scope resolver is unavailable", {
            phase: "terminal-session-preview-scope-resolution",
            previewEnvironmentId: command.scope.previewEnvironmentId,
          }),
        );
      }
      if (previewScope.isErr()) {
        return err(previewScope.error);
      }
      const resolvedPreviewScope = previewScope.value;
      if (!resolvedPreviewScope) {
        return err(
          domainError.validation("Preview terminal scope could not be resolved", {
            phase: "terminal-session-preview-scope-resolution",
            previewEnvironmentId: command.scope.previewEnvironmentId,
          }),
        );
      }
      scope = {
        kind: "resource",
        resourceId: resolvedPreviewScope.resourceId,
        ...(resolvedPreviewScope.deploymentId
          ? { deploymentId: resolvedPreviewScope.deploymentId }
          : {}),
      };
    } else {
      scope =
        command.scope.kind === "server" || command.scope.kind === "sandbox"
          ? command.scope
          : {
              kind: "resource",
              resourceId: command.scope.resourceId,
              ...(command.scope.deploymentId ? { deploymentId: command.scope.deploymentId } : {}),
            };
    }

    if (openTerminalSessionOperation) {
      const checked = await checkOperationGuards({
        context,
        entry: openTerminalSessionOperation,
        message: command,
        operationGuardPort: this.operationGuardPort ?? defaultOperationGuardPort,
        resourceRefs:
          scope.kind === "server"
            ? { serverId: scope.serverId }
            : scope.kind === "sandbox"
              ? { sandboxId: scope.sandboxId }
              : {
                  resourceId: scope.resourceId,
                  ...(scope.deploymentId ? { deploymentId: scope.deploymentId } : {}),
                },
      });
      if (checked.isErr()) {
        return err(checked.error);
      }
    }

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

    if (scope.kind === "sandbox") {
      return this.terminalSessionGateway.open(context, {
        sessionId: this.idGenerator.next("term"),
        scope: {
          kind: "sandbox",
          sandboxId: scope.sandboxId,
          ...(command.relativeDirectory ? { workingDirectory: command.relativeDirectory } : {}),
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

    const serverBackedDeployment = isServerBackedDeploymentSummary(deployment)
      ? deployment
      : undefined;
    if (!serverBackedDeployment) {
      return err(
        domainError.validation("Terminal sessions require a server-backed deployment", {
          deploymentId: deployment.id,
          resourceId: resource.id,
          targetKind: deployment.target?.kind ?? "unknown",
        }),
      );
    }

    const server = await this.serverReadModel.findOne(
      repositoryContext,
      ServerByIdSpec.create(DeploymentTargetId.rehydrate(serverBackedDeployment.serverId)),
    );

    if (!server) {
      return err(domainError.notFound("server", serverBackedDeployment.serverId));
    }

    const workspace = resolveDeploymentWorkspace(deployment);
    const workingDirectory = workspace
      ? appendRelativeDirectory(workspace, command.relativeDirectory)
      : undefined;
    if (
      !workingDirectory &&
      (!runtimeTargetCanOpenWithoutWorkspace(deployment) || command.relativeDirectory)
    ) {
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
        ...(workingDirectory ? { workingDirectory } : {}),
      },
      initialRows: command.initialRows,
      initialCols: command.initialCols,
    });
  }
}
