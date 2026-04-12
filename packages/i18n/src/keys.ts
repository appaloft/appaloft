import { type YunduTranslationResource } from "./locales/zh-CN";

export const i18nKeys = {
  common: {
    actions: {
      checkHealth: "common:actions.checkHealth",
      connectGitHub: "common:actions.connectGitHub",
      createAndDeploy: "common:actions.createAndDeploy",
      createDeployment: "common:actions.createDeployment",
      newDeployment: "common:actions.newDeployment",
      next: "common:actions.next",
      openDeployments: "common:actions.openDeployments",
      openProject: "common:actions.openProject",
      previous: "common:actions.previous",
      selectDirectory: "common:actions.selectDirectory",
      viewAll: "common:actions.viewAll",
      viewDeployments: "common:actions.viewDeployments",
      viewProjects: "common:actions.viewProjects",
    },
    app: {
      consoleSubtitle: "common:app.consoleSubtitle",
      productName: "common:app.productName",
    },
    domain: {
      currentList: "common:domain.currentList",
      database: "common:domain.database",
      deployment: "common:domain.deployment",
      deployments: "common:domain.deployments",
      description: "common:domain.description",
      environment: "common:domain.environment",
      environments: "common:domain.environments",
      key: "common:domain.key",
      mode: "common:domain.mode",
      name: "common:domain.name",
      project: "common:domain.project",
      projects: "common:domain.projects",
      provider: "common:domain.provider",
      readiness: "common:domain.readiness",
      resource: "common:domain.resource",
      resources: "common:domain.resources",
      server: "common:domain.server",
      servers: "common:domain.servers",
      source: "common:domain.source",
      status: "common:domain.status",
      time: "common:domain.time",
      value: "common:domain.value",
      variables: "common:domain.variables",
    },
    language: {
      english: "common:language.english",
      label: "common:language.label",
      simplifiedChinese: "common:language.simplifiedChinese",
    },
    modes: {
      existing: "common:modes.existing",
      newEnvironment: "common:modes.newEnvironment",
      newProject: "common:modes.newProject",
      newServer: "common:modes.newServer",
      useExisting: "common:modes.useExisting",
    },
    status: {
      connected: "common:status.connected",
      notConfigured: "common:status.notConfigured",
      onDemandAuthorization: "common:status.onDemandAuthorization",
      pendingAuthorization: "common:status.pendingAuthorization",
      unauthenticated: "common:status.unauthenticated",
      unknown: "common:status.unknown",
    },
  },
  errors: {
    backend: {
      adapterUnhandled: "errors:backend.adapterUnhandled",
      notFound: "errors:backend.notFound",
      unknownAuthRuntime: "errors:backend.unknownAuthRuntime",
      unknownRequestFailure: "errors:backend.unknownRequestFailure",
    },
    cli: {
      label: "errors:cli.label",
    },
    domain: {
      conflict: "errors:domain.conflict",
      infra: "errors:domain.infra",
      invariant: "errors:domain.invariant",
      notFound: "errors:domain.notFound",
      provider: "errors:domain.provider",
      retryable: "errors:domain.retryable",
      validation: "errors:domain.validation",
    },
    validation: {
      inputValidationFailed: "errors:validation.inputValidationFailed",
    },
    web: {
      backendUnavailable: "errors:web.backendUnavailable",
      backendUnavailableDescription: "errors:web.backendUnavailableDescription",
      requestFailedWithDetail: "errors:web.requestFailedWithDetail",
      requestFailedWithoutDetail: "errors:web.requestFailedWithoutDetail",
      unknownRequestFailure: "errors:web.unknownRequestFailure",
    },
  },
  backend: {
    cqrs: {
      noCommandHandler: "backend:cqrs.noCommandHandler",
      noQueryHandler: "backend:cqrs.noQueryHandler",
    },
    deployment: {
      createSnapshotAndPlan: "backend:deployment.createSnapshotAndPlan",
      detectedSource: "backend:deployment.detectedSource",
      resolveContextAndDetect: "backend:deployment.resolveContextAndDetect",
      selectedRuntimeStrategy: "backend:deployment.selectedRuntimeStrategy",
    },
    progress: {
      deploymentCompleted: "backend:progress.deploymentCompleted",
      rollbackCompleted: "backend:progress.rollbackCompleted",
      rollbackPlanEmpty: "backend:progress.rollbackPlanEmpty",
      simulatedVerificationFailure: "backend:progress.simulatedVerificationFailure",
    },
  },
  console: {
    deployments: {
      allProjects: "console:deployments.allProjects",
      description: "console:deployments.description",
      emptyBody: "console:deployments.emptyBody",
      emptyTitle: "console:deployments.emptyTitle",
      listDescription: "console:deployments.listDescription",
      listTitle: "console:deployments.listTitle",
      latestDescription: "console:deployments.latestDescription",
      latestTitle: "console:deployments.latestTitle",
      noFilteredDeployments: "console:deployments.noFilteredDeployments",
      pageDescription: "console:deployments.pageDescription",
      pageDescriptionForProject: "console:deployments.pageDescriptionForProject",
      pageTitle: "console:deployments.pageTitle",
      records: "console:deployments.records",
    },
    home: {
      databaseCard: "console:home.databaseCard",
      deploymentBaseBody: "console:home.deploymentBaseBody",
      deploymentBaseTitle: "console:home.deploymentBaseTitle",
      deploymentFlowCreateEnvironment: "console:home.deploymentFlowCreateEnvironment",
      deploymentFlowCreateProject: "console:home.deploymentFlowCreateProject",
      deploymentFlowCreateServer: "console:home.deploymentFlowCreateServer",
      deploymentFlowDeploymentRecord: "console:home.deploymentFlowDeploymentRecord",
      deploymentFlowSource: "console:home.deploymentFlowSource",
      deploymentsWithoutRecordsBody: "console:home.deploymentsWithoutRecordsBody",
      deploymentsWithoutRecordsTitle: "console:home.deploymentsWithoutRecordsTitle",
      latestDeploymentDescription: "console:home.latestDeploymentDescription",
      latestDeploymentEmpty: "console:home.latestDeploymentEmpty",
      latestDeploymentTitle: "console:home.latestDeploymentTitle",
      modeCard: "console:home.modeCard",
      pageDescription: "console:home.pageDescription",
      pageTitle: "console:home.pageTitle",
      projectRelationsDescription: "console:home.projectRelationsDescription",
      projectRelationsEmpty: "console:home.projectRelationsEmpty",
      projectRelationsTitle: "console:home.projectRelationsTitle",
      readinessCard: "console:home.readinessCard",
      serverAvailableTarget: "console:home.serverAvailableTarget",
      serverCreatedDuringDeployment: "console:home.serverCreatedDuringDeployment",
      environmentSnapshotEntry: "console:home.environmentSnapshotEntry",
      environmentCreatedDuringDeployment: "console:home.environmentCreatedDuringDeployment",
      targetNeeded: "console:home.targetNeeded",
    },
    nav: {
      deploy: "console:nav.deploy",
      deployments: "console:nav.deployments",
      home: "console:nav.home",
      projects: "console:nav.projects",
      settings: "console:nav.settings",
      workspace: "console:nav.workspace",
    },
    projects: {
      description: "console:projects.description",
      emptyBody: "console:projects.emptyBody",
      emptyTitle: "console:projects.emptyTitle",
      environmentCount: "console:projects.environmentCount",
      noEnvironment: "console:projects.noEnvironment",
      noProjectSelected: "console:projects.noProjectSelected",
      noProjectSelectedDescription: "console:projects.noProjectSelectedDescription",
      noProjectDeploymentBody: "console:projects.noProjectDeploymentBody",
      noProjectDeploymentTitle: "console:projects.noProjectDeploymentTitle",
      pageTitle: "console:projects.pageTitle",
      projectListDescription: "console:projects.projectListDescription",
      projectListTitle: "console:projects.projectListTitle",
    },
    quickDeploy: {
      chooseSourceDirectoryBrowserHint: "console:quickDeploy.chooseSourceDirectoryBrowserHint",
      commandPreview: "console:quickDeploy.commandPreview",
      currentIdentity: "console:quickDeploy.currentIdentity",
      currentSummary: "console:quickDeploy.currentSummary",
      currentSummaryDescription: "console:quickDeploy.currentSummaryDescription",
      deployFeedbackErrorTitle: "console:quickDeploy.deployFeedbackErrorTitle",
      deployFeedbackSuccessTitle: "console:quickDeploy.deployFeedbackSuccessTitle",
      deploymentEntryTitle: "console:quickDeploy.deploymentEntryTitle",
      environmentKind: "console:quickDeploy.environmentKind",
      firstVariable: "console:quickDeploy.firstVariable",
      cloneUrl: "console:quickDeploy.cloneUrl",
      composeManifest: "console:quickDeploy.composeManifest",
      defaultBranch: "console:quickDeploy.defaultBranch",
      dockerImage: "console:quickDeploy.dockerImage",
      githubOAuthNotConfigured: "console:quickDeploy.githubOAuthNotConfigured",
      githubOnlyLoginWhenNeeded: "console:quickDeploy.githubOnlyLoginWhenNeeded",
      githubRepository: "console:quickDeploy.githubRepository",
      githubRepositoryAutoLocator: "console:quickDeploy.githubRepositoryAutoLocator",
      githubRepositorySearch: "console:quickDeploy.githubRepositorySearch",
      localFolderPath: "console:quickDeploy.localFolderPath",
      noEnvironmentOptions: "console:quickDeploy.noEnvironmentOptions",
      noProjectOptions: "console:quickDeploy.noProjectOptions",
      noRepositoryResults: "console:quickDeploy.noRepositoryResults",
      noServerOptions: "console:quickDeploy.noServerOptions",
      privateRepository: "console:quickDeploy.privateRepository",
      publicRepository: "console:quickDeploy.publicRepository",
      remoteGitUrl: "console:quickDeploy.remoteGitUrl",
      repositoryVisibility: "console:quickDeploy.repositoryVisibility",
      reviewBody: "console:quickDeploy.reviewBody",
      reviewDeployment: "console:quickDeploy.reviewDeployment",
      secretStorage: "console:quickDeploy.secretStorage",
      selectedRepository: "console:quickDeploy.selectedRepository",
      selectedRepositoryDescription: "console:quickDeploy.selectedRepositoryDescription",
      sourceAddress: "console:quickDeploy.sourceAddress",
      sourceCompose: "console:quickDeploy.sourceCompose",
      sourceComposeHint: "console:quickDeploy.sourceComposeHint",
      sourceDetails: "console:quickDeploy.sourceDetails",
      sourceDockerImage: "console:quickDeploy.sourceDockerImage",
      sourceDockerImageHint: "console:quickDeploy.sourceDockerImageHint",
      sourceGithub: "console:quickDeploy.sourceGithub",
      sourceGithubHint: "console:quickDeploy.sourceGithubHint",
      sourceLocalFolder: "console:quickDeploy.sourceLocalFolder",
      sourceLocalFolderHint: "console:quickDeploy.sourceLocalFolderHint",
      sourceNotSet: "console:quickDeploy.sourceNotSet",
      sourceRemoteGit: "console:quickDeploy.sourceRemoteGit",
      sourceRemoteGitHint: "console:quickDeploy.sourceRemoteGitHint",
      sourceType: "console:quickDeploy.sourceType",
      step: "console:quickDeploy.step",
      submitPending: "console:quickDeploy.submitPending",
      variablePlainStorage: "console:quickDeploy.variablePlainStorage",
    },
    shell: {
      noProjects: "console:shell.noProjects",
      projectSearch: "console:shell.projectSearch",
      userSettings: "console:shell.userSettings",
    },
  },
} as const;

type LeafValue<T> = T extends string
  ? T
  : T extends Readonly<Record<string, unknown>>
    ? LeafValue<T[keyof T]>
    : never;

type DotPath<T> = {
  [Key in keyof T & string]: T[Key] extends string
    ? Key
    : T[Key] extends Readonly<Record<string, unknown>>
      ? `${Key}.${DotPath<T[Key]>}`
      : never;
}[keyof T & string];

type ResourceTranslationKey = {
  [Namespace in keyof YunduTranslationResource & string]: `${Namespace}:${DotPath<
    YunduTranslationResource[Namespace]
  >}`;
}[keyof YunduTranslationResource & string];

type AssertExact<Actual, Expected> = [Actual] extends [Expected]
  ? [Expected] extends [Actual]
    ? true
    : never
  : never;

export type TranslationKey = LeafValue<typeof i18nKeys>;

const i18nKeyCoverageCheck: AssertExact<TranslationKey, ResourceTranslationKey> = true;
void i18nKeyCoverageCheck;
