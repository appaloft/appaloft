import {
  ArchiveResourceCommandHandler,
  ArchiveResourceUseCase,
  BootstrapServerEdgeProxyOnTargetRegisteredHandler,
  BootstrapServerProxyCommandHandler,
  BootstrapServerProxyUseCase,
  type CertificateProviderSelection,
  type CertificateProviderSelectionInput,
  type CertificateProviderSelectionPolicy,
  CertificateRetryScheduler,
  ConfigureResourceHealthCommandHandler,
  ConfigureResourceHealthUseCase,
  ConfigureResourceNetworkCommandHandler,
  ConfigureResourceNetworkUseCase,
  ConfigureResourceRuntimeCommandHandler,
  ConfigureResourceRuntimeUseCase,
  ConfigureResourceSourceCommandHandler,
  ConfigureResourceSourceUseCase,
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
  MarkDomainReadyOnDeploymentFinishedHandler,
  MarkDomainReadyOnDomainBoundHandler,
  MarkDomainRouteFailedOnDeploymentFinishedHandler,
  MarkServerAppliedRouteStatusOnDeploymentFinishedHandler,
  OpenTerminalSessionUseCase,
  PromoteEnvironmentUseCase,
  RegisterServerUseCase,
  RelinkSourceLinkCommandHandler,
  RelinkSourceLinkUseCase,
  ResourceDiagnosticSummaryQueryService,
  ResourceHealthQueryService,
  ResourceProxyConfigurationPreviewQueryService,
  ResourceRuntimeLogsQueryService,
  RuntimePlanResolutionInputBuilder,
  SetEnvironmentVariableUseCase,
  ShowEnvironmentQueryService,
  ShowResourceQueryHandler,
  ShowResourceQueryService,
  TestServerConnectivityUseCase,
  tokens,
  UnsetEnvironmentVariableUseCase,
} from "@appaloft/application";
import { type DomainError, ok, type Result } from "@appaloft/core";
import { type DependencyContainer } from "tsyringe";
import { PublicDnsDomainOwnershipVerifier } from "./domain-ownership-verifier";

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
  container.registerSingleton(MarkDomainReadyOnDeploymentFinishedHandler);
  container.registerSingleton(MarkDomainRouteFailedOnDeploymentFinishedHandler);
  container.registerSingleton(MarkServerAppliedRouteStatusOnDeploymentFinishedHandler);
  container.registerSingleton(IssueCertificateOnCertificateRequestedHandler);
  container.registerSingleton(BootstrapServerProxyCommandHandler);
  container.registerSingleton(ConfigureResourceHealthCommandHandler);
  container.registerSingleton(ConfigureResourceNetworkCommandHandler);
  container.registerSingleton(ConfigureResourceRuntimeCommandHandler);
  container.registerSingleton(ConfigureResourceSourceCommandHandler);
  container.registerSingleton(ArchiveResourceCommandHandler);
  container.registerSingleton(ShowResourceQueryHandler);
  container.registerSingleton(IssueOrRenewCertificateCommandHandler);
  container.registerSingleton(RelinkSourceLinkCommandHandler);
  container.registerSingleton(ListCertificatesQueryHandler);
  container.registerSingleton(
    tokens.certificateProviderSelectionPolicy,
    ShellCertificateProviderSelectionPolicy,
  );
  container.registerSingleton(tokens.domainOwnershipVerifier, PublicDnsDomainOwnershipVerifier);
  container.registerSingleton(tokens.createProjectUseCase, CreateProjectUseCase);
  container.registerSingleton(tokens.listProjectsQueryService, ListProjectsQueryService);
  container.registerSingleton(tokens.createResourceUseCase, CreateResourceUseCase);
  container.registerSingleton(tokens.archiveResourceUseCase, ArchiveResourceUseCase);
  container.registerSingleton(
    tokens.configureResourceSourceUseCase,
    ConfigureResourceSourceUseCase,
  );
  container.registerSingleton(
    tokens.configureResourceHealthUseCase,
    ConfigureResourceHealthUseCase,
  );
  container.registerSingleton(
    tokens.configureResourceNetworkUseCase,
    ConfigureResourceNetworkUseCase,
  );
  container.registerSingleton(
    tokens.configureResourceRuntimeUseCase,
    ConfigureResourceRuntimeUseCase,
  );
  container.registerSingleton(tokens.listResourcesQueryService, ListResourcesQueryService);
  container.registerSingleton(tokens.showResourceQueryService, ShowResourceQueryService);
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
  container.registerSingleton(tokens.certificateRetryScheduler, CertificateRetryScheduler);
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
  container.registerSingleton(tokens.relinkSourceLinkUseCase, RelinkSourceLinkUseCase);
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
