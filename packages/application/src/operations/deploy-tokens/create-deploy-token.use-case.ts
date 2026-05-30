import {
  CreatedAt,
  DeploymentTargetId,
  DeployToken,
  DeployTokenId,
  DeployTokenScope,
  DeployTokenWorkflowCommandValue,
  DisplayNameText,
  EnvironmentId,
  ExpiresAt,
  err,
  OrganizationId,
  ok,
  ProjectId,
  ResourceId,
  type Result,
  SourceRepositoryFullName,
  safeTry,
  UpsertDeployTokenSpec,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { findOperationCatalogEntryByKey } from "../../operation-catalog";
import { checkOperationGuards } from "../../operation-guard";
import {
  type ActionDeployTokenWorkflow,
  AllowAllOperationGuardPort,
  type AppLogger,
  type Clock,
  type DeployTokenMaterialIssuer,
  type DeployTokenRepository,
  type EventBus,
  type IdGenerator,
  type OperationCheckResourceRefs,
  type OperationGuardPort,
} from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import { type DeployTokenScopeResult, mapDeployTokenScope } from "./deploy-token-result-mapper";

const createDeployTokenOperation = findOperationCatalogEntryByKey("deploy-tokens.create");
const defaultOperationGuardPort = new AllowAllOperationGuardPort();

export interface CreateDeployTokenScopeInput {
  deploymentTargetIds?: readonly string[];
  environmentIds?: readonly string[];
  projectIds?: readonly string[];
  repositoryFullNames?: readonly string[];
  resourceIds?: readonly string[];
  workflowCommands: readonly ActionDeployTokenWorkflow[];
}

export interface CreateDeployTokenUseCaseInput {
  displayName: string;
  organizationId: string;
  scope: CreateDeployTokenScopeInput;
  expiresAt?: string;
}

export interface CreateDeployTokenUseCaseResult {
  token: string;
  tokenId: string;
  organizationId: string;
  displayName: string;
  secretSuffix: string;
  scopes: DeployTokenScopeResult;
  createdAt: string;
  expiresAt?: string;
}

@injectable()
export class CreateDeployTokenUseCase {
  constructor(
    @inject(tokens.deployTokenRepository)
    private readonly deployTokenRepository: DeployTokenRepository,
    @inject(tokens.deployTokenMaterialIssuer)
    private readonly deployTokenMaterialIssuer: DeployTokenMaterialIssuer,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.idGenerator)
    private readonly idGenerator: IdGenerator,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
    @inject(tokens.operationGuardPort)
    private readonly operationGuardPort?: OperationGuardPort,
  ) {}

  async execute(
    context: ExecutionContext,
    input: CreateDeployTokenUseCaseInput,
  ): Promise<Result<CreateDeployTokenUseCaseResult>> {
    const {
      clock,
      deployTokenMaterialIssuer,
      deployTokenRepository,
      eventBus,
      idGenerator,
      logger,
      operationGuardPort,
    } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      if (createDeployTokenOperation) {
        const resourceRefs: OperationCheckResourceRefs = {
          ...(input.scope.projectIds?.[0] ? { projectId: input.scope.projectIds[0] } : {}),
          ...(input.scope.environmentIds?.[0]
            ? { environmentId: input.scope.environmentIds[0] }
            : {}),
          ...(input.scope.resourceIds?.[0] ? { resourceId: input.scope.resourceIds[0] } : {}),
          ...(input.scope.deploymentTargetIds?.[0]
            ? { serverId: input.scope.deploymentTargetIds[0] }
            : {}),
        };
        const checked = await checkOperationGuards({
          context,
          entry: createDeployTokenOperation,
          message: input,
          operationGuardPort: operationGuardPort ?? defaultOperationGuardPort,
          organizationId: input.organizationId,
          ...(Object.keys(resourceRefs).length > 0 ? { resourceRefs } : {}),
        });
        if (checked.isErr()) {
          return err(checked.error);
        }
      }

      const material = yield* await deployTokenMaterialIssuer.issue(context);
      const createdAt = yield* CreatedAt.create(clock.now());
      const deployToken = yield* DeployToken.create({
        id: yield* DeployTokenId.create(idGenerator.next("dpt")),
        organizationId: yield* OrganizationId.create(input.organizationId),
        displayName: yield* DisplayNameText.create(input.displayName),
        verifierDigest: material.verifierDigest,
        secretSuffix: material.secretSuffix,
        scope: yield* createScope(input.scope),
        createdAt,
        ...(input.expiresAt ? { expiresAt: yield* ExpiresAt.create(input.expiresAt) } : {}),
      });

      await deployTokenRepository.upsert(
        repositoryContext,
        deployToken,
        UpsertDeployTokenSpec.fromDeployToken(deployToken),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, deployToken, undefined);

      const state = deployToken.toState();

      return ok({
        token: material.token,
        tokenId: state.id.value,
        organizationId: state.organizationId.value,
        displayName: state.displayName.value,
        secretSuffix: state.secretSuffix.value,
        scopes: mapDeployTokenScope(state.scope),
        createdAt: state.createdAt.value,
        ...(state.expiresAt ? { expiresAt: state.expiresAt.value } : {}),
      });
    });
  }
}

function createScope(input: CreateDeployTokenScopeInput): Result<DeployTokenScope> {
  return safeTry(function* () {
    return ok(
      yield* DeployTokenScope.create({
        deploymentTargetIds: yield* createDeploymentTargetIds(input.deploymentTargetIds ?? []),
        environmentIds: yield* createEnvironmentIds(input.environmentIds ?? []),
        projectIds: yield* createProjectIds(input.projectIds ?? []),
        repositoryFullNames: yield* createRepositoryFullNames(input.repositoryFullNames ?? []),
        resourceIds: yield* createResourceIds(input.resourceIds ?? []),
        workflowCommands: yield* createWorkflowCommands(input.workflowCommands),
      }),
    );
  });
}

function createDeploymentTargetIds(values: readonly string[]) {
  return safeTry(function* () {
    const ids: DeploymentTargetId[] = [];
    for (const value of values) {
      ids.push(yield* DeploymentTargetId.create(value));
    }
    return ok(ids);
  });
}

function createEnvironmentIds(values: readonly string[]) {
  return safeTry(function* () {
    const ids: EnvironmentId[] = [];
    for (const value of values) {
      ids.push(yield* EnvironmentId.create(value));
    }
    return ok(ids);
  });
}

function createProjectIds(values: readonly string[]) {
  return safeTry(function* () {
    const ids: ProjectId[] = [];
    for (const value of values) {
      ids.push(yield* ProjectId.create(value));
    }
    return ok(ids);
  });
}

function createRepositoryFullNames(values: readonly string[]) {
  return safeTry(function* () {
    const repositoryFullNames: SourceRepositoryFullName[] = [];
    for (const value of values) {
      repositoryFullNames.push(yield* SourceRepositoryFullName.create(value));
    }
    return ok(repositoryFullNames);
  });
}

function createResourceIds(values: readonly string[]) {
  return safeTry(function* () {
    const ids: ResourceId[] = [];
    for (const value of values) {
      ids.push(yield* ResourceId.create(value));
    }
    return ok(ids);
  });
}

function createWorkflowCommands(values: readonly string[]) {
  return safeTry(function* () {
    const commands: DeployTokenWorkflowCommandValue[] = [];
    for (const value of values) {
      commands.push(yield* DeployTokenWorkflowCommandValue.create(value));
    }
    return ok(commands);
  });
}
