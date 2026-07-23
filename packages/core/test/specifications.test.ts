import { describe, expect, test } from "bun:test";

import {
  ActiveResourceBindingByTargetSpec,
  Certificate,
  CertificateAttemptId,
  CertificateByDomainBindingIdSpec,
  CertificateByIdSpec,
  CertificateChallengeTypeValue,
  CertificateId,
  CertificateIssueReasonValue,
  CertificatePolicyValue,
  CreatedAt,
  DeletePreviewEnvironmentSpec,
  DependencyResourceBackup,
  DependencyResourceBackupAttemptId,
  DependencyResourceBackupByIdSpec,
  DependencyResourceBackupId,
  DependencyResourceBackupsByDependencyResourceSpec,
  DependencyResourceSourceModeValue,
  DeploymentByIdSpec,
  DeploymentId,
  DeploymentTarget,
  DeploymentTargetByIdSpec,
  DeploymentTargetCredentialKindValue,
  DeploymentTargetId,
  DeploymentTargetName,
  DeployToken,
  DeployTokenByIdSpec,
  DeployTokenId,
  DeployTokenScope,
  DeployTokenSecretSuffix,
  DeployTokenVerifierDigest,
  DeployTokenWorkflowCommandValue,
  DescriptionText,
  Destination,
  DestinationByIdSpec,
  DestinationByServerAndNameSpec,
  DestinationId,
  DestinationName,
  DisplayNameText,
  DomainBinding,
  DomainBindingByIdSpec,
  DomainBindingId,
  DomainBindingStatusValue,
  EdgeProxyKindValue,
  EnvironmentByIdSpec,
  EnvironmentId,
  EnvironmentKindValue,
  EnvironmentName,
  EnvironmentProfile,
  HostAddress,
  LatestDeploymentSpec,
  OccurredAt,
  OrganizationId,
  PortNumber,
  PreviewEnvironmentByIdSpec,
  PreviewEnvironmentId,
  Project,
  ProjectByIdSpec,
  ProjectBySlugSpec,
  ProjectId,
  ProjectName,
  ProjectSlug,
  ProviderKey,
  PublicDomainName,
  Resource,
  ResourceBinding,
  ResourceBindingByIdSpec,
  ResourceBindingId,
  ResourceBindingScopeValue,
  ResourceBindingTargetName,
  ResourceByEnvironmentAndSlugSpec,
  ResourceByIdSpec,
  ResourceId,
  ResourceInjectionModeValue,
  ResourceInstance,
  ResourceInstanceByEnvironmentAndSlugSpec,
  ResourceInstanceByIdSpec,
  ResourceInstanceId,
  ResourceInstanceKindValue,
  ResourceInstanceName,
  ResourceKindValue,
  ResourceName,
  RoutePathPrefix,
  ServerByIdSpec,
  SshCredential,
  SshCredentialByIdSpec,
  SshCredentialId,
  SshCredentialName,
  SshPrivateKeyText,
  StorageVolume,
  StorageVolumeBackup,
  StorageVolumeBackupAttemptId,
  StorageVolumeBackupByIdSpec,
  StorageVolumeBackupConsistencyLevelValue,
  StorageVolumeBackupId,
  StorageVolumeBackupSourceAdapterKeyValue,
  StorageVolumeBackupsByStorageVolumeSpec,
  StorageVolumeBackupTargetProviderKeyValue,
  StorageVolumeByIdSpec,
  StorageVolumeId,
  StorageVolumeKindValue,
  StorageVolumeName,
  TargetKindValue,
  TlsModeValue,
  UnusedSshCredentialByIdSpec,
  UpdatedAt,
  UpsertCertificateSpec,
  UpsertDeployTokenSpec,
  UpsertProjectSpec,
  UpsertSshCredentialSpec,
} from "../src";

const createdAt = CreatedAt.rehydrate("2026-07-20T00:00:00.000Z");
const updatedAt = UpdatedAt.rehydrate("2026-07-20T00:01:00.000Z");

function project(id = "prj_demo", name = "Demo App") {
  return Project.create({
    id: ProjectId.rehydrate(id),
    name: ProjectName.rehydrate(name),
    createdAt,
  })._unsafeUnwrap();
}

function environment(input?: { id?: string; projectId?: string }) {
  return EnvironmentProfile.create({
    id: EnvironmentId.rehydrate(input?.id ?? "env_demo"),
    projectId: ProjectId.rehydrate(input?.projectId ?? "prj_demo"),
    name: EnvironmentName.rehydrate("production"),
    kind: EnvironmentKindValue.rehydrate("production"),
    createdAt,
  })._unsafeUnwrap();
}

function resource(input?: { id?: string; environmentId?: string; name?: string }) {
  return Resource.create({
    id: ResourceId.rehydrate(input?.id ?? "res_demo"),
    projectId: ProjectId.rehydrate("prj_demo"),
    environmentId: EnvironmentId.rehydrate(input?.environmentId ?? "env_demo"),
    name: ResourceName.rehydrate(input?.name ?? "App Stack"),
    kind: ResourceKindValue.rehydrate("application"),
    createdAt,
  })._unsafeUnwrap();
}

describe("Project specifications", () => {
  test("[CORE-SPEC-PROJECT-001] selects by id/slug and rejects cross-tenant candidates", () => {
    const demo = project("prj_demo", "Demo App");
    const other = project("prj_other", "Other App");

    const byId = ProjectByIdSpec.create(ProjectId.rehydrate("prj_demo"));
    const bySlug = ProjectBySlugSpec.create(ProjectSlug.rehydrate("demo-app"));

    expect(byId.isSatisfiedBy(demo)).toBe(true);
    expect(byId.isSatisfiedBy(other)).toBe(false);
    expect(bySlug.isSatisfiedBy(demo)).toBe(true);
    expect(bySlug.isSatisfiedBy(other)).toBe(false);

    expect(
      byId.accept("query", {
        visitProjectById: (query, spec) => `${query}:${spec.id.value}`,
        visitProjectBySlug: () => "slug",
      }),
    ).toBe("query:prj_demo");

    expect(
      UpsertProjectSpec.fromProject(demo).accept({
        visitUpsertProject: (spec) => spec.state.slug.value,
      }),
    ).toBe("demo-app");
  });
});

describe("Environment and resource specifications", () => {
  test("[CORE-SPEC-ENV-001] environment by-id visitor carries the requested id", () => {
    const env = environment();
    const other = environment({ id: "env_other" });
    const byId = EnvironmentByIdSpec.create(EnvironmentId.rehydrate("env_demo"));

    const evaluate = (candidate: ReturnType<typeof environment>) =>
      byId.accept("query", {
        visitEnvironmentById: (_query, spec) =>
          candidate.toState().id.equals(spec.id) ? "hit" : "miss",
        visitEnvironmentByProjectAndName: () => "name",
      });

    expect(evaluate(env)).toBe("hit");
    expect(evaluate(other)).toBe("miss");
  });

  test("[CORE-SPEC-RESOURCE-001] selects resource by id and project/env/slug with isolation", () => {
    const app = resource({ name: "Web App" });
    const otherEnv = resource({
      id: "res_other",
      environmentId: "env_other",
      name: "Web App",
    });
    const otherName = resource({ id: "res_api", name: "API App" });

    const byId = ResourceByIdSpec.create(ResourceId.rehydrate("res_demo"));
    const byEnvSlug = ResourceByEnvironmentAndSlugSpec.create(
      ProjectId.rehydrate("prj_demo"),
      EnvironmentId.rehydrate("env_demo"),
      app.toState().slug,
    );

    expect(byId.isSatisfiedBy(app)).toBe(true);
    expect(byId.isSatisfiedBy(otherEnv)).toBe(false);
    expect(byEnvSlug.isSatisfiedBy(app)).toBe(true);
    expect(byEnvSlug.isSatisfiedBy(otherEnv)).toBe(false);
    expect(byEnvSlug.isSatisfiedBy(otherName)).toBe(false);
  });
});

describe("Resource binding and instance specifications", () => {
  test("[CORE-SPEC-BINDING-001] matches active target bindings and ignores unbound ones", () => {
    const active = ResourceBinding.create({
      id: ResourceBindingId.rehydrate("rbd_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      resourceId: ResourceId.rehydrate("res_demo"),
      resourceInstanceId: ResourceInstanceId.rehydrate("rsi_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      targetName: ResourceBindingTargetName.rehydrate("DATABASE_URL"),
      scope: ResourceBindingScopeValue.rehydrate("runtime-only"),
      injectionMode: ResourceInjectionModeValue.rehydrate("env"),
      createdAt,
    })._unsafeUnwrap();

    const unbound = ResourceBinding.create({
      id: ResourceBindingId.rehydrate("rbd_old"),
      projectId: ProjectId.rehydrate("prj_demo"),
      resourceId: ResourceId.rehydrate("res_demo"),
      resourceInstanceId: ResourceInstanceId.rehydrate("rsi_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      targetName: ResourceBindingTargetName.rehydrate("DATABASE_URL"),
      scope: ResourceBindingScopeValue.rehydrate("runtime-only"),
      injectionMode: ResourceInjectionModeValue.rehydrate("env"),
      createdAt,
    })._unsafeUnwrap();
    unbound.unbind({ removedAt: updatedAt })._unsafeUnwrap();

    const byId = ResourceBindingByIdSpec.create(ResourceBindingId.rehydrate("rbd_demo"));
    const activeTarget = ActiveResourceBindingByTargetSpec.create(
      ResourceId.rehydrate("res_demo"),
      ResourceInstanceId.rehydrate("rsi_demo"),
      ResourceBindingTargetName.rehydrate("DATABASE_URL"),
    );

    expect(byId.isSatisfiedBy(active)).toBe(true);
    expect(byId.isSatisfiedBy(unbound)).toBe(false);
    expect(activeTarget.isSatisfiedBy(active)).toBe(true);
    expect(activeTarget.isSatisfiedBy(unbound)).toBe(false);
  });

  test("[CORE-SPEC-INSTANCE-001] selects dependency instances by id and env/kind/slug", () => {
    const instance = ResourceInstance.createPostgresDependencyResource({
      id: ResourceInstanceId.rehydrate("rsi_pg"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      name: ResourceInstanceName.rehydrate("Main DB"),
      kind: ResourceInstanceKindValue.rehydrate("postgres"),
      sourceMode: DependencyResourceSourceModeValue.rehydrate("imported-external"),
      providerKey: ProviderKey.rehydrate("external-postgres"),
      providerManaged: false,
      endpoint: {
        host: "db.example.com",
        port: 5432,
        databaseName: "app",
        maskedConnection: "postgres://app:********@db.example.com:5432/app",
      },
      createdAt,
    })._unsafeUnwrap();
    const other = ResourceInstance.createPostgresDependencyResource({
      id: ResourceInstanceId.rehydrate("rsi_other"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_other"),
      name: ResourceInstanceName.rehydrate("Main DB"),
      kind: ResourceInstanceKindValue.rehydrate("postgres"),
      sourceMode: DependencyResourceSourceModeValue.rehydrate("imported-external"),
      providerKey: ProviderKey.rehydrate("external-postgres"),
      providerManaged: false,
      endpoint: {
        host: "db.example.com",
        port: 5432,
        databaseName: "app",
        maskedConnection: "postgres://app:********@db.example.com:5432/app",
      },
      createdAt,
    })._unsafeUnwrap();

    const instanceSlug = instance.toState().slug;
    if (!instanceSlug) {
      throw new Error("expected postgres dependency instance slug");
    }

    const byId = ResourceInstanceByIdSpec.create(ResourceInstanceId.rehydrate("rsi_pg"));
    const byEnvSlug = ResourceInstanceByEnvironmentAndSlugSpec.create(
      ProjectId.rehydrate("prj_demo"),
      EnvironmentId.rehydrate("env_demo"),
      ResourceInstanceKindValue.rehydrate("postgres"),
      instanceSlug,
    );

    expect(byId.isSatisfiedBy(instance)).toBe(true);
    expect(byId.isSatisfiedBy(other)).toBe(false);
    expect(byEnvSlug.isSatisfiedBy(instance)).toBe(true);
    expect(byEnvSlug.isSatisfiedBy(other)).toBe(false);
  });
});

describe("Topology and storage specifications", () => {
  test("[CORE-SPEC-TARGET-001] deployment target/server by-id visitors isolate candidates", () => {
    const target = DeploymentTarget.register({
      id: DeploymentTargetId.rehydrate("srv_demo"),
      name: DeploymentTargetName.rehydrate("edge"),
      host: HostAddress.rehydrate("10.0.0.1"),
      port: PortNumber.rehydrate(22),
      providerKey: ProviderKey.rehydrate("local-shell"),
      targetKind: TargetKindValue.rehydrate("single-server"),
      createdAt,
    })._unsafeUnwrap();
    const other = DeploymentTarget.register({
      id: DeploymentTargetId.rehydrate("srv_other"),
      name: DeploymentTargetName.rehydrate("other"),
      host: HostAddress.rehydrate("10.0.0.2"),
      port: PortNumber.rehydrate(22),
      providerKey: ProviderKey.rehydrate("local-shell"),
      createdAt,
    })._unsafeUnwrap();

    const byId = DeploymentTargetByIdSpec.create(DeploymentTargetId.rehydrate("srv_demo"));
    const serverById = ServerByIdSpec.create(DeploymentTargetId.rehydrate("srv_demo"));

    const evaluate = (candidate: DeploymentTarget) =>
      byId.accept("query", {
        visitDeploymentTargetById: (_query, spec) =>
          candidate.toState().id.equals(spec.id) ? "hit" : "miss",
        visitDeploymentTargetByProviderAndHost: () => "provider",
        visitNonDeletedDeploymentTargetByEndpoint: () => "endpoint",
      });

    const evaluateServer = (candidate: DeploymentTarget) =>
      serverById.accept("query", {
        visitDeploymentTargetById: (_query, spec) =>
          candidate.toState().id.equals(spec.id) ? "hit" : "miss",
        visitDeploymentTargetByProviderAndHost: () => "provider",
        visitNonDeletedDeploymentTargetByEndpoint: () => "endpoint",
      });

    expect(evaluate(target)).toBe("hit");
    expect(evaluate(other)).toBe("miss");
    expect(evaluateServer(target)).toBe("hit");
    expect(evaluateServer(other)).toBe("miss");
  });

  test("[CORE-SPEC-DOMAIN-001] selects domain bindings by id with isolation", () => {
    const binding = DomainBinding.rehydrate({
      id: DomainBindingId.rehydrate("dom_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      resourceId: ResourceId.rehydrate("res_demo"),
      serverId: DeploymentTargetId.rehydrate("srv_demo"),
      destinationId: DestinationId.rehydrate("dst_demo"),
      domainName: PublicDomainName.rehydrate("app.example.com"),
      pathPrefix: RoutePathPrefix.rehydrate("/"),
      proxyKind: EdgeProxyKindValue.rehydrate("traefik"),
      tlsMode: TlsModeValue.rehydrate("auto"),
      certificatePolicy: CertificatePolicyValue.rehydrate("auto"),
      status: DomainBindingStatusValue.rehydrate("bound"),
      verificationAttempts: [],
      createdAt,
    });
    const other = DomainBinding.rehydrate({
      ...binding.toState(),
      id: DomainBindingId.rehydrate("dom_other"),
    });

    const byId = DomainBindingByIdSpec.create(DomainBindingId.rehydrate("dom_demo"));
    expect(byId.isSatisfiedBy(binding)).toBe(true);
    expect(byId.isSatisfiedBy(other)).toBe(false);
  });

  test("[CORE-SPEC-STORAGE-001] selects storage volumes by id", () => {
    const volume = StorageVolume.create({
      id: StorageVolumeId.rehydrate("stv_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      name: StorageVolumeName.rehydrate("App Data"),
      kind: StorageVolumeKindValue.rehydrate("named-volume"),
      createdAt,
    })._unsafeUnwrap();
    const other = StorageVolume.create({
      id: StorageVolumeId.rehydrate("stv_other"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      name: StorageVolumeName.rehydrate("Other"),
      kind: StorageVolumeKindValue.rehydrate("named-volume"),
      createdAt,
    })._unsafeUnwrap();

    const byId = StorageVolumeByIdSpec.create(StorageVolumeId.rehydrate("stv_demo"));
    expect(byId.isSatisfiedBy(volume)).toBe(true);
    expect(byId.isSatisfiedBy(other)).toBe(false);
  });
});

describe("Certificate, destination, backup, and token specifications", () => {
  test("[CORE-SPEC-CERT-001] selects certificates by id and domain binding", () => {
    const certificate = Certificate.request({
      id: CertificateId.rehydrate("crt_demo"),
      domainBindingId: DomainBindingId.rehydrate("dom_demo"),
      domainName: PublicDomainName.rehydrate("secure.example.com"),
      attemptId: CertificateAttemptId.rehydrate("cat_demo"),
      reason: CertificateIssueReasonValue.rehydrate("issue"),
      providerKey: ProviderKey.rehydrate("acme"),
      challengeType: CertificateChallengeTypeValue.rehydrate("http-01"),
      requestedAt: createdAt,
    })._unsafeUnwrap();
    const other = Certificate.request({
      id: CertificateId.rehydrate("crt_other"),
      domainBindingId: DomainBindingId.rehydrate("dom_other"),
      domainName: PublicDomainName.rehydrate("other.example.com"),
      attemptId: CertificateAttemptId.rehydrate("cat_other"),
      reason: CertificateIssueReasonValue.rehydrate("issue"),
      providerKey: ProviderKey.rehydrate("acme"),
      challengeType: CertificateChallengeTypeValue.rehydrate("http-01"),
      requestedAt: createdAt,
    })._unsafeUnwrap();

    const byId = CertificateByIdSpec.create(CertificateId.rehydrate("crt_demo"));
    const byDomain = CertificateByDomainBindingIdSpec.create(DomainBindingId.rehydrate("dom_demo"));

    expect(byId.isSatisfiedBy(certificate)).toBe(true);
    expect(byId.isSatisfiedBy(other)).toBe(false);
    expect(byDomain.isSatisfiedBy(certificate)).toBe(true);
    expect(byDomain.isSatisfiedBy(other)).toBe(false);
    expect(
      UpsertCertificateSpec.fromCertificate(certificate).accept({
        visitUpsertCertificate: (spec) => spec.state.id.value,
      }),
    ).toBe("crt_demo");
  });

  test("[CORE-SPEC-DEST-001] destination by-id and by-server/name visitors isolate candidates", () => {
    const destination = Destination.register({
      id: DestinationId.rehydrate("dst_demo"),
      serverId: DeploymentTargetId.rehydrate("srv_demo"),
      name: DestinationName.rehydrate("default"),
      createdAt,
    })._unsafeUnwrap();
    const other = Destination.register({
      id: DestinationId.rehydrate("dst_other"),
      serverId: DeploymentTargetId.rehydrate("srv_other"),
      name: DestinationName.rehydrate("other"),
      createdAt,
    })._unsafeUnwrap();

    const byId = DestinationByIdSpec.create(DestinationId.rehydrate("dst_demo"));
    const byServerName = DestinationByServerAndNameSpec.create(
      DeploymentTargetId.rehydrate("srv_demo"),
      DestinationName.rehydrate("default"),
    );

    expect(
      byId.accept("query", {
        visitDestinationById: (_query, spec) =>
          destination.toState().id.equals(spec.id) ? "hit" : "miss",
        visitDestinationByServerAndName: () => "name",
      }),
    ).toBe("hit");
    expect(
      byId.accept("query", {
        visitDestinationById: (_query, spec) =>
          other.toState().id.equals(spec.id) ? "hit" : "miss",
        visitDestinationByServerAndName: () => "name",
      }),
    ).toBe("miss");
    expect(
      byServerName.accept("query", {
        visitDestinationById: () => "id",
        visitDestinationByServerAndName: (_query, spec) =>
          destination.belongsToServer(spec.serverId) && destination.toState().name.equals(spec.name)
            ? "hit"
            : "miss",
      }),
    ).toBe("hit");
  });

  test("[CORE-SPEC-SSH-001] ssh credential by-id and unused visitors carry identity", () => {
    const credential = SshCredential.create({
      id: SshCredentialId.rehydrate("ssh_demo"),
      name: SshCredentialName.rehydrate("Deploy Key"),
      kind: DeploymentTargetCredentialKindValue.rehydrate("ssh-private-key"),
      privateKey: SshPrivateKeyText.rehydrate(
        "-----BEGIN OPENSSH PRIVATE KEY-----\nv1\n-----END OPENSSH PRIVATE KEY-----",
      ),
      createdAt,
    })._unsafeUnwrap();

    const byId = SshCredentialByIdSpec.create(SshCredentialId.rehydrate("ssh_demo"));
    const unused = UnusedSshCredentialByIdSpec.create(SshCredentialId.rehydrate("ssh_demo"));

    expect(
      byId.accept("query", {
        visitSshCredentialById: (_query, spec) => spec.id.value,
        visitUnusedSshCredentialById: () => "unused",
      }),
    ).toBe("ssh_demo");
    expect(
      unused.accept("query", {
        visitSshCredentialById: () => "id",
        visitUnusedSshCredentialById: (_query, spec) => spec.id.value,
      }),
    ).toBe("ssh_demo");
    expect(
      UpsertSshCredentialSpec.fromSshCredential(credential).accept({
        visitUpsertSshCredential: (spec) => spec.state.id.value,
        visitRotateSshCredential: () => "rotate",
      }),
    ).toBe("ssh_demo");
  });

  test("[CORE-SPEC-BACKUP-001] dependency and storage volume backup specs select by ownership", () => {
    const dependencyBackup = DependencyResourceBackup.createPending({
      id: DependencyResourceBackupId.rehydrate("drb_1"),
      dependencyResourceId: ResourceInstanceId.rehydrate("rsi_pg"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      dependencyKind: ResourceInstanceKindValue.rehydrate("postgres"),
      providerKey: ProviderKey.rehydrate("appaloft-managed-postgres"),
      attemptId: DependencyResourceBackupAttemptId.rehydrate("dba_1"),
      requestedAt: OccurredAt.rehydrate("2026-07-20T00:00:00.000Z"),
      createdAt,
    })._unsafeUnwrap();
    const otherDependencyBackup = DependencyResourceBackup.createPending({
      id: DependencyResourceBackupId.rehydrate("drb_2"),
      dependencyResourceId: ResourceInstanceId.rehydrate("rsi_other"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      dependencyKind: ResourceInstanceKindValue.rehydrate("postgres"),
      providerKey: ProviderKey.rehydrate("appaloft-managed-postgres"),
      attemptId: DependencyResourceBackupAttemptId.rehydrate("dba_2"),
      requestedAt: OccurredAt.rehydrate("2026-07-20T00:00:00.000Z"),
      createdAt,
    })._unsafeUnwrap();

    expect(
      DependencyResourceBackupByIdSpec.create(
        DependencyResourceBackupId.rehydrate("drb_1"),
      ).isSatisfiedBy(dependencyBackup),
    ).toBe(true);
    expect(
      DependencyResourceBackupsByDependencyResourceSpec.create(
        ResourceInstanceId.rehydrate("rsi_pg"),
      ).isSatisfiedBy(dependencyBackup),
    ).toBe(true);
    expect(
      DependencyResourceBackupsByDependencyResourceSpec.create(
        ResourceInstanceId.rehydrate("rsi_pg"),
      ).isSatisfiedBy(otherDependencyBackup),
    ).toBe(false);

    const volumeBackup = StorageVolumeBackup.createPending({
      id: StorageVolumeBackupId.rehydrate("svb_demo"),
      storageVolumeId: StorageVolumeId.rehydrate("stv_demo"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      storageVolumeKind: StorageVolumeKindValue.rehydrate("named-volume"),
      sourceAdapterKey: StorageVolumeBackupSourceAdapterKeyValue.rehydrate("tar-volume"),
      targetProviderKey: StorageVolumeBackupTargetProviderKeyValue.rehydrate("local-filesystem"),
      targetRef: DescriptionText.rehydrate("file:///backups/stv_demo"),
      consistency: StorageVolumeBackupConsistencyLevelValue.rehydrate("crash-consistent"),
      attemptId: StorageVolumeBackupAttemptId.rehydrate("sba_1"),
      requestedAt: OccurredAt.rehydrate("2026-07-20T00:00:00.000Z"),
      localOnly: true,
      createdAt,
    })._unsafeUnwrap();
    const otherVolumeBackup = StorageVolumeBackup.createPending({
      id: StorageVolumeBackupId.rehydrate("svb_other"),
      storageVolumeId: StorageVolumeId.rehydrate("stv_other"),
      projectId: ProjectId.rehydrate("prj_demo"),
      environmentId: EnvironmentId.rehydrate("env_demo"),
      storageVolumeKind: StorageVolumeKindValue.rehydrate("named-volume"),
      sourceAdapterKey: StorageVolumeBackupSourceAdapterKeyValue.rehydrate("tar-volume"),
      targetProviderKey: StorageVolumeBackupTargetProviderKeyValue.rehydrate("local-filesystem"),
      targetRef: DescriptionText.rehydrate("file:///backups/stv_other"),
      consistency: StorageVolumeBackupConsistencyLevelValue.rehydrate("crash-consistent"),
      attemptId: StorageVolumeBackupAttemptId.rehydrate("sba_2"),
      requestedAt: OccurredAt.rehydrate("2026-07-20T00:00:00.000Z"),
      localOnly: true,
      createdAt,
    })._unsafeUnwrap();

    expect(
      StorageVolumeBackupByIdSpec.create(StorageVolumeBackupId.rehydrate("svb_demo")).isSatisfiedBy(
        volumeBackup,
      ),
    ).toBe(true);
    expect(
      StorageVolumeBackupsByStorageVolumeSpec.create(
        StorageVolumeId.rehydrate("stv_demo"),
      ).isSatisfiedBy(volumeBackup),
    ).toBe(true);
    expect(
      StorageVolumeBackupsByStorageVolumeSpec.create(
        StorageVolumeId.rehydrate("stv_demo"),
      ).isSatisfiedBy(otherVolumeBackup),
    ).toBe(false);
  });

  test("[CORE-SPEC-TOKEN-DEPLOY-001] deploy token and deployment/preview visitors carry ids", () => {
    const token = DeployToken.create({
      id: DeployTokenId.rehydrate("dtok_demo"),
      organizationId: OrganizationId.rehydrate("org_demo"),
      displayName: DisplayNameText.rehydrate("GitHub Action"),
      verifierDigest: DeployTokenVerifierDigest.create(
        "sha256:1234567890abcdef1234567890abcdef",
      )._unsafeUnwrap(),
      secretSuffix: DeployTokenSecretSuffix.create("abcd1234")._unsafeUnwrap(),
      scope: DeployTokenScope.create({
        projectIds: [],
        repositoryFullNames: [],
        workflowCommands: [DeployTokenWorkflowCommandValue.rehydrate("source-link-deploy")],
      })._unsafeUnwrap(),
      createdAt,
    })._unsafeUnwrap();

    expect(
      DeployTokenByIdSpec.create(DeployTokenId.rehydrate("dtok_demo")).accept("query", {
        visitDeployTokenById: (_query, spec) => spec.id.value,
        visitActiveDeployTokenByVerifierDigest: () => "active",
      }),
    ).toBe("dtok_demo");
    expect(
      UpsertDeployTokenSpec.fromDeployToken(token).accept({
        visitUpsertDeployToken: (spec) => spec.state.id.value,
        visitRotateDeployToken: () => "rotate",
        visitRevokeDeployToken: () => "revoke",
        visitMarkDeployTokenUsed: () => "used",
      }),
    ).toBe("dtok_demo");

    expect(
      DeploymentByIdSpec.create(DeploymentId.rehydrate("dep_demo")).accept("query", {
        visitDeploymentById: (_query, spec) => spec.id.value,
        visitLatestDeployment: () => "latest",
        visitLatestRuntimeOwningDeployment: () => "runtime",
      }),
    ).toBe("dep_demo");
    expect(
      LatestDeploymentSpec.forResource(ResourceId.rehydrate("res_demo")).accept("query", {
        visitDeploymentById: () => "id",
        visitLatestDeployment: (_query, spec) => spec.resourceId.value,
        visitLatestRuntimeOwningDeployment: () => "runtime",
      }),
    ).toBe("res_demo");

    expect(
      PreviewEnvironmentByIdSpec.create(
        PreviewEnvironmentId.rehydrate("penv_demo"),
        ResourceId.rehydrate("res_demo"),
      ).accept("query", {
        visitPreviewEnvironmentById: (_query, spec) =>
          `${spec.previewEnvironmentId.value}:${spec.resourceId?.value ?? "none"}`,
        visitPreviewEnvironmentBySourceScope: () => "scope",
      }),
    ).toBe("penv_demo:res_demo");
    expect(
      DeletePreviewEnvironmentSpec.create(
        PreviewEnvironmentId.rehydrate("penv_demo"),
        ResourceId.rehydrate("res_demo"),
      ).accept({
        visitUpsertPreviewEnvironment: () => "upsert",
        visitDeletePreviewEnvironment: (spec) =>
          `${spec.previewEnvironmentId.value}:${spec.resourceId.value}`,
      }),
    ).toBe("penv_demo:res_demo");
  });
});
