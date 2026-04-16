import {
  BootstrapServerEdgeProxyOnTargetRegisteredHandler,
  BootstrapServerProxyCommandHandler,
  BootstrapServerProxyUseCase,
  type CertificateProviderSelection,
  type CertificateProviderSelectionInput,
  type CertificateProviderSelectionPolicy,
  ConfigureServerCredentialUseCase,
  ConfirmDomainBindingOwnershipUseCase,
  CreateDeploymentUseCase,
  CreateDomainBindingUseCase,
  CreateEnvironmentUseCase,
  CreateProjectUseCase,
  CreateResourceUseCase,
  CreateSshCredentialUseCase,
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
  type ExecutionContext,
  IssueCertificateOnCertificateRequestedHandler,
  IssueOrRenewCertificateCommandHandler,
  IssueOrRenewCertificateUseCase,
  ListCertificatesQueryHandler,
  ListCertificatesQueryService,
  ListDeploymentsQueryService,
  ListDomainBindingsQueryService,
  ListEnvironmentsQueryService,
  ListGitHubRepositoriesQueryService,
  ListPluginsQueryService,
  ListProjectsQueryService,
  ListProvidersQueryService,
  ListResourcesQueryService,
  ListServersQueryService,
  ListSshCredentialsQueryService,
  MarkDomainReadyOnCertificateIssuedHandler,
  MarkDomainReadyOnDomainBoundHandler,
  OpenTerminalSessionUseCase,
  PromoteEnvironmentUseCase,
  RegisterServerUseCase,
  ResourceDiagnosticSummaryQueryService,
  ResourceHealthQueryService,
  ResourceProxyConfigurationPreviewQueryService,
  ResourceRuntimeLogsQueryService,
  RuntimePlanResolutionInputBuilder,
  SetEnvironmentVariableUseCase,
  ShowEnvironmentQueryService,
  TestServerConnectivityUseCase,
  tokens,
  UnsetEnvironmentVariableUseCase,
} from "@yundu/application";
import { type DomainError, ok, type Result } from "@yundu/core";
import { type DependencyContainer } from "tsyringe";

class ShellCertificateProviderSelectionPolicy implements CertificateProviderSelectionPolicy {
  async select(
    context: ExecutionContext,
    input: CertificateProviderSelectionInput,
  ): Promise<Result<CertificateProviderSelection, DomainError>> {
    void context;
    return ok({
      providerKey: input.providerKey ?? "acme",
      challengeType: input.challengeType ?? "http-01",
    });
  }
}

export function registerApplicationServices(container: DependencyContainer): void {
  container.registerSingleton(BootstrapServerEdgeProxyOnTargetRegisteredHandler);
  container.registerSingleton(MarkDomainReadyOnDomainBoundHandler);
  container.registerSingleton(MarkDomainReadyOnCertificateIssuedHandler);
  container.registerSingleton(IssueCertificateOnCertificateRequestedHandler);
  container.registerSingleton(BootstrapServerProxyCommandHandler);
  container.registerSingleton(IssueOrRenewCertificateCommandHandler);
  container.registerSingleton(ListCertificatesQueryHandler);
  container.registerSingleton(
    tokens.certificateProviderSelectionPolicy,
    ShellCertificateProviderSelectionPolicy,
  );
  container.registerSingleton(tokens.createProjectUseCase, CreateProjectUseCase);
  container.registerSingleton(tokens.listProjectsQueryService, ListProjectsQueryService);
  container.registerSingleton(tokens.createResourceUseCase, CreateResourceUseCase);
  container.registerSingleton(tokens.listResourcesQueryService, ListResourcesQueryService);
  container.registerSingleton(tokens.registerServerUseCase, RegisterServerUseCase);
  container.registerSingleton(
    tokens.configureServerCredentialUseCase,
    ConfigureServerCredentialUseCase,
  );
  container.registerSingleton(tokens.createSshCredentialUseCase, CreateSshCredentialUseCase);
  container.registerSingleton(
    tokens.listSshCredentialsQueryService,
    ListSshCredentialsQueryService,
  );
  container.registerSingleton(tokens.listServersQueryService, ListServersQueryService);
  container.registerSingleton(tokens.testServerConnectivityUseCase, TestServerConnectivityUseCase);
  container.registerSingleton(tokens.bootstrapServerProxyUseCase, BootstrapServerProxyUseCase);
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
  container.registerSingleton(tokens.deploymentLifecycleService, DeploymentLifecycleService);
  container.registerSingleton(tokens.createDeploymentUseCase, CreateDeploymentUseCase);
  container.registerSingleton(tokens.createDomainBindingUseCase, CreateDomainBindingUseCase);
  container.registerSingleton(
    tokens.confirmDomainBindingOwnershipUseCase,
    ConfirmDomainBindingOwnershipUseCase,
  );
  container.registerSingleton(
    tokens.listDomainBindingsQueryService,
    ListDomainBindingsQueryService,
  );
  container.registerSingleton(
    tokens.issueOrRenewCertificateUseCase,
    IssueOrRenewCertificateUseCase,
  );
  container.registerSingleton(tokens.listCertificatesQueryService, ListCertificatesQueryService);
  container.registerSingleton(tokens.listDeploymentsQueryService, ListDeploymentsQueryService);
  container.registerSingleton(tokens.logsQueryService, DeploymentLogsQueryService);
  container.registerSingleton(
    tokens.resourceDiagnosticSummaryQueryService,
    ResourceDiagnosticSummaryQueryService,
  );
  container.registerSingleton(tokens.resourceHealthQueryService, ResourceHealthQueryService);
  container.registerSingleton(
    tokens.resourceRuntimeLogsQueryService,
    ResourceRuntimeLogsQueryService,
  );
  container.registerSingleton(tokens.openTerminalSessionUseCase, OpenTerminalSessionUseCase);
  container.registerSingleton(
    tokens.resourceProxyConfigurationPreviewQueryService,
    ResourceProxyConfigurationPreviewQueryService,
  );
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
