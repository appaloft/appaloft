import "reflect-metadata";

import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type KubernetesHelmValuesResolver } from "@appaloft/adapter-runtime";
import {
  createExecutionContext,
  type RuntimeTargetBackendRegistry,
  type ServerRepository,
  tokens,
  toRepositoryContext,
} from "@appaloft/application";
import {
  BuildStrategyKindValue,
  CreatedAt,
  Deployment,
  DeploymentId,
  DeploymentTarget,
  DeploymentTargetDescriptor,
  DeploymentTargetId,
  DeploymentTargetName,
  DestinationId,
  DetectSummary,
  DisplayNameText,
  domainError,
  EnvironmentConfigSnapshot,
  EnvironmentId,
  EnvironmentSnapshotId,
  ExecutionStrategyKindValue,
  err,
  GeneratedAt,
  HostAddress,
  ok,
  PackagingModeValue,
  PlanStepText,
  PortNumber,
  ProjectId,
  ProviderKey,
  ResourceId,
  RuntimeArtifactIntentValue,
  RuntimeArtifactKindValue,
  RuntimeArtifactSnapshot,
  RuntimeExecutionPlan,
  RuntimePlan,
  RuntimePlanId,
  RuntimeTargetProfile,
  SourceDescriptor,
  SourceKindValue,
  SourceLocator,
  StartedAt,
  TargetKindValue,
  UpdatedAt,
  UpsertServerSpec,
} from "@appaloft/core";
import { createAppaloftServer } from "@appaloft/server";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test("[K8S-HELM-013] server composition forwards the credential-aware Helm values resolver", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "appaloft-server-helm-values-"));
  tempRoots.push(dataDir);
  const resolvedReferences: string[][] = [];
  const helmValuesResolver: KubernetesHelmValuesResolver = {
    resolve: async (input) => {
      resolvedReferences.push([...input.references]);
      return err(
        domainError.operationAuthorizationDenied("Injected Helm values resolver denied access"),
      );
    },
  };
  const server = await createAppaloftServer({
    flags: {
      appVersion: "0.1.0-test",
      authProvider: "none",
      dataDir,
      docsStaticDir: "",
      httpHost: "localhost",
      httpPort: 3001,
      pgliteDataDir: join(dataDir, "pglite"),
      webStaticDir: "",
    },
    kubernetesConnectionResolver: {
      resolve: async () => ok({ kubeconfigPath: join(dataDir, "cluster.kubeconfig") }),
    },
    kubernetesHelmValuesResolver: helmValuesResolver,
  });

  try {
    const context = createExecutionContext({
      requestId: "req_server_helm_values",
      entrypoint: "system",
      tenant: { tenantId: "org_acme", organizationId: "org_acme" },
    });
    const target = DeploymentTarget.register({
      id: DeploymentTargetId.rehydrate("srv_helm_values"),
      name: DeploymentTargetName.rehydrate("Helm values cluster"),
      host: HostAddress.rehydrate("kubernetes.invalid"),
      port: PortNumber.rehydrate(6443),
      providerKey: ProviderKey.rehydrate("kubernetes"),
      targetKind: TargetKindValue.rehydrate("orchestrator-cluster"),
      createdAt: CreatedAt.rehydrate("2026-08-14T00:00:00.000Z"),
    })._unsafeUnwrap();
    target
      .configureRuntimeTargetProfile({
        profile: RuntimeTargetProfile.create({
          connectionReference: "connection://cluster/r5c",
          credentialReference: "secret://cluster/r5c",
        })._unsafeUnwrap(),
        configuredAt: UpdatedAt.rehydrate("2026-08-14T00:01:00.000Z"),
      })
      ._unsafeUnwrap();
    const repository = server.container.resolve<ServerRepository>(tokens.serverRepository);
    await repository.upsert(
      toRepositoryContext(context),
      target,
      UpsertServerSpec.fromServer(target),
    );
    const generatedAt = GeneratedAt.rehydrate("2026-08-14T00:00:00.000Z");
    const runtimePlan = RuntimePlan.rehydrate({
      id: RuntimePlanId.rehydrate("rtp_server_helm_values"),
      source: SourceDescriptor.rehydrate({
        kind: SourceKindValue.rehydrate("helm-chart"),
        locator: SourceLocator.rehydrate("oci://registry.example.com/charts/storefront"),
        displayName: DisplayNameText.rehydrate("storefront"),
      }),
      buildStrategy: BuildStrategyKindValue.rehydrate("helm-package"),
      packagingMode: PackagingModeValue.rehydrate("helm-chart"),
      execution: RuntimeExecutionPlan.rehydrate({
        kind: ExecutionStrategyKindValue.rehydrate("helm-release"),
        metadata: {
          "helm.chartReference": "oci://registry.example.com/charts/storefront",
          "helm.chartVersion": "1.7.3",
          "helm.valuesSecretReferences": JSON.stringify(["secret://helm/storefront/production"]),
          "helm.hookPolicy": "disabled",
          "helm.timeoutSeconds": "300",
        },
      }),
      runtimeArtifact: RuntimeArtifactSnapshot.rehydrate({
        kind: RuntimeArtifactKindValue.rehydrate("helm-chart"),
        intent: RuntimeArtifactIntentValue.rehydrate("helm-chart"),
      }),
      target: DeploymentTargetDescriptor.rehydrate({
        kind: TargetKindValue.rehydrate("orchestrator-cluster"),
        providerKey: ProviderKey.rehydrate("kubernetes"),
        serverIds: [DeploymentTargetId.rehydrate("srv_helm_values")],
      }),
      detectSummary: DetectSummary.rehydrate("Typed Helm chart"),
      steps: [PlanStepText.rehydrate("Apply Helm release")],
      generatedAt,
    });
    const deployment = Deployment.create({
      id: DeploymentId.rehydrate("dep_server_helm_values"),
      projectId: ProjectId.rehydrate("prj_shop"),
      environmentId: EnvironmentId.rehydrate("env_prod"),
      resourceId: ResourceId.rehydrate("res_storefront"),
      serverId: DeploymentTargetId.rehydrate("srv_helm_values"),
      destinationId: DestinationId.rehydrate("dst_prod"),
      runtimePlan,
      environmentSnapshot: EnvironmentConfigSnapshot.rehydrate({
        id: EnvironmentSnapshotId.rehydrate("envsnap_server_helm_values"),
        environmentId: EnvironmentId.rehydrate("env_prod"),
        createdAt: generatedAt,
        precedence: [],
        variables: [],
      }),
      createdAt: CreatedAt.rehydrate("2026-08-14T00:00:00.000Z"),
    })._unsafeUnwrap();
    const startedAt = StartedAt.rehydrate("2026-08-14T00:01:00.000Z");
    deployment.markPlanning(startedAt)._unsafeUnwrap();
    deployment.markPlanned(startedAt)._unsafeUnwrap();
    deployment.start(startedAt)._unsafeUnwrap();
    const registry = server.container.resolve<RuntimeTargetBackendRegistry>(
      tokens.runtimeTargetBackendRegistry,
    );
    const backend = registry.find({
      targetKind: "orchestrator-cluster",
      providerKey: "kubernetes",
      requiredCapabilities: ["runtime.helm"],
    });

    expect(backend.isOk()).toBe(true);
    expect((await backend._unsafeUnwrap().execute(context, deployment)).isOk()).toBe(true);
    expect(resolvedReferences).toEqual([["secret://helm/storefront/production"]]);
    expect(deployment.toState().status.value).toBe("failed");
  } finally {
    await server.shutdown();
  }
}, 45_000);
