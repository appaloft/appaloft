import {
  CreateDeploymentUseCase,
  CreateEnvironmentUseCase,
  CreateProjectUseCase,
  DbMigrateUseCase,
  DbStatusQueryService,
  DeploymentContextBootstrapService,
  DeploymentContextDefaultsFactory,
  DeploymentContextResolver,
  DeploymentFactory,
  DeploymentLifecycleService,
  DeploymentLogsQueryService,
  DeploymentSnapshotFactory,
  DiffEnvironmentsQueryService,
  DoctorQueryService,
  ListDeploymentsQueryService,
  ListEnvironmentsQueryService,
  ListGitHubRepositoriesQueryService,
  ListPluginsQueryService,
  ListProjectsQueryService,
  ListProvidersQueryService,
  ListServersQueryService,
  PromoteEnvironmentUseCase,
  RegisterServerUseCase,
  RollbackDeploymentUseCase,
  RollbackPlanFactory,
  RuntimePlanResolutionInputBuilder,
  SetEnvironmentVariableUseCase,
  ShowEnvironmentQueryService,
  tokens,
  UnsetEnvironmentVariableUseCase,
} from "@yundu/application";
import { type DependencyContainer } from "tsyringe";

export function registerApplicationServices(container: DependencyContainer): void {
  container.registerSingleton(tokens.createProjectUseCase, CreateProjectUseCase);
  container.registerSingleton(tokens.listProjectsQueryService, ListProjectsQueryService);
  container.registerSingleton(tokens.registerServerUseCase, RegisterServerUseCase);
  container.registerSingleton(tokens.listServersQueryService, ListServersQueryService);
  container.registerSingleton(tokens.createEnvironmentUseCase, CreateEnvironmentUseCase);
  container.registerSingleton(tokens.listEnvironmentsQueryService, ListEnvironmentsQueryService);
  container.registerSingleton(tokens.showEnvironmentQueryService, ShowEnvironmentQueryService);
  container.registerSingleton(tokens.setEnvironmentVariableUseCase, SetEnvironmentVariableUseCase);
  container.registerSingleton(
    tokens.unsetEnvironmentVariableUseCase,
    UnsetEnvironmentVariableUseCase,
  );
  container.registerSingleton(tokens.diffEnvironmentsQueryService, DiffEnvironmentsQueryService);
  container.registerSingleton(tokens.promoteEnvironmentUseCase, PromoteEnvironmentUseCase);
  container.registerSingleton(
    tokens.deploymentContextDefaultsFactory,
    DeploymentContextDefaultsFactory,
  );
  container.registerSingleton(
    tokens.deploymentContextBootstrapService,
    DeploymentContextBootstrapService,
  );
  container.registerSingleton(tokens.deploymentSnapshotFactory, DeploymentSnapshotFactory);
  container.registerSingleton(
    tokens.runtimePlanResolutionInputBuilder,
    RuntimePlanResolutionInputBuilder,
  );
  container.registerSingleton(tokens.deploymentContextResolver, DeploymentContextResolver);
  container.registerSingleton(tokens.deploymentFactory, DeploymentFactory);
  container.registerSingleton(tokens.rollbackPlanFactory, RollbackPlanFactory);
  container.registerSingleton(tokens.deploymentLifecycleService, DeploymentLifecycleService);
  container.registerSingleton(tokens.createDeploymentUseCase, CreateDeploymentUseCase);
  container.registerSingleton(tokens.listDeploymentsQueryService, ListDeploymentsQueryService);
  container.registerSingleton(tokens.logsQueryService, DeploymentLogsQueryService);
  container.registerSingleton(tokens.rollbackDeploymentUseCase, RollbackDeploymentUseCase);
  container.registerSingleton(tokens.providersQueryService, ListProvidersQueryService);
  container.registerSingleton(tokens.pluginsQueryService, ListPluginsQueryService);
  container.registerSingleton(
    tokens.listGitHubRepositoriesQueryService,
    ListGitHubRepositoriesQueryService,
  );
  container.registerSingleton(tokens.doctorQueryService, DoctorQueryService);
  container.registerSingleton(tokens.dbStatusQueryService, DbStatusQueryService);
  container.registerSingleton(tokens.dbMigrateUseCase, DbMigrateUseCase);
}
