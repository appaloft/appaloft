import { fileURLToPath } from "node:url";

import {
  DeploymentPhaseValue,
  DeploymentTargetByIdSpec,
  DeploymentTargetId,
  DeploymentTimelineJournalEntry,
  DeploymentTimelineSourceValue,
  ErrorCodeText,
  ExecutionResult,
  ExecutionStatusValue,
  ExitCode,
  FinishedAt,
  LogLevelValue,
  MessageText,
  OccurredAt,
  domainError,
  err,
  ok,
  type Deployment,
  type DeploymentTargetState,
  type Result,
  type RollbackPlan,
} from "@appaloft/core";
import type {
  ControlPlaneSecretProtector,
  DependencyResourceSecretStore,
  ExecutionContext,
  RuntimeTargetBackend,
  RuntimeTargetBackendDescriptor,
  RuntimeTargetReadinessBackendInspection,
  RuntimeTargetReadinessCapability,
  RuntimeTargetReadinessCheck,
  ServerRepository,
} from "@appaloft/application";
import { toRepositoryContext } from "@appaloft/application";

import { requireServerBackedDeploymentState } from "./deployment-target";
import { resolveDependencyRuntimeEnvironment } from "./dependency-runtime-secrets";
import {
  FileKubernetesHelmValuesResolver,
  HelmShellCommandRunner,
  KubernetesHelmLifecycle,
  renderKubernetesHelmIntent,
  type KubernetesHelmIntent,
} from "./kubernetes-helm-lifecycle";
import {
  renderKubernetesCanaryRouteManifest,
  renderKubernetesCleanupPlan,
  renderKubernetesRuntimeIntent,
  renderKubernetesRuntimeManifest,
  type KubernetesCleanupPlan,
  type KubernetesIngressControllerSource,
  type KubernetesResolvedRoutingPolicy,
  type KubernetesRuntimeIntent,
} from "./kubernetes-runtime-intent";

export const K3S_TRAEFIK_ROUTING_POLICY_REFERENCE =
  "builtin://kubernetes/ingress-controller/traefik-k3s" as const;

export interface KubernetesResolvedConnection {
  kubeconfigPath: string;
  contextName?: string;
}

export interface KubernetesConnectionResolverInput {
  context: ExecutionContext;
  connectionReference: string;
  credentialReference?: string;
}

export interface KubernetesConnectionResolver {
  resolve(
    input: KubernetesConnectionResolverInput,
  ): Promise<Result<KubernetesResolvedConnection>>;
}

export class FileKubernetesConnectionResolver implements KubernetesConnectionResolver {
  async resolve(
    input: KubernetesConnectionResolverInput,
  ): Promise<Result<KubernetesResolvedConnection>> {
    if (input.credentialReference) {
      return err(
        domainError.runtimeTargetUnsupported(
          "A credential-aware Kubernetes connection resolver is required",
          {
            phase: "kubernetes-connection-resolution",
            reason: "credential-reference-resolver-unavailable",
          },
        ),
      );
    }

    try {
      const connection = new URL(input.connectionReference);
      if (connection.protocol !== "file:") {
        return err(
          domainError.runtimeTargetUnsupported(
            "The default Kubernetes connection resolver only supports file references",
            {
              phase: "kubernetes-connection-resolution",
              reason: "connection-reference-scheme-unsupported",
            },
          ),
        );
      }

      const kubeconfigPath = fileURLToPath(connection);
      if (!kubeconfigPath.startsWith("/")) {
        return err(
          domainError.validation("Kubernetes kubeconfig file reference must be absolute"),
        );
      }

      return ok({ kubeconfigPath });
    } catch {
      return err(
        domainError.validation("Kubernetes connection reference is not a valid file URI"),
      );
    }
  }
}

export interface KubernetesRoutingPolicyResolverInput {
  routingPolicyReference: string;
}

export interface KubernetesRoutingPolicyResolver {
  resolve(
    input: KubernetesRoutingPolicyResolverInput,
  ): Promise<Result<KubernetesResolvedRoutingPolicy>>;
}

const k3sTraefikRoutingPolicy: KubernetesResolvedRoutingPolicy = {
  schemaVersion: "kubernetes.routing-policy/v1",
  ingressControllerSources: [
    {
      namespace: "kube-system",
      podSelector: { "app.kubernetes.io/name": "traefik" },
    },
  ],
};

export class BuiltinKubernetesRoutingPolicyResolver
  implements KubernetesRoutingPolicyResolver
{
  async resolve(
    input: KubernetesRoutingPolicyResolverInput,
  ): Promise<Result<KubernetesResolvedRoutingPolicy>> {
    if (input.routingPolicyReference !== K3S_TRAEFIK_ROUTING_POLICY_REFERENCE) {
      return err(
        domainError.runtimeTargetUnsupported(
          "The Kubernetes routing policy reference is not supported by the built-in resolver",
          {
            phase: "kubernetes-routing-policy-resolution",
            reason: "routing-policy-reference-unsupported",
          },
        ),
      );
    }

    return ok({
      ...k3sTraefikRoutingPolicy,
      ingressControllerSources: k3sTraefikRoutingPolicy.ingressControllerSources.map(
        (source) => ({
          ...source,
          podSelector: { ...source.podSelector },
        }),
      ),
    });
  }
}

const kubernetesDnsLabel = /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/;
const kubernetesLabelName = /^[A-Za-z0-9](?:[-_.A-Za-z0-9]*[A-Za-z0-9])?$/;
const kubernetesLabelPrefix = /^(?:[a-z0-9](?:[-a-z0-9]*[a-z0-9])?\.)*[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/;

function validLabelKey(key: string): boolean {
  const parts = key.split("/");
  if (parts.length > 2) return false;
  const name = parts.at(-1) ?? "";
  const prefix = parts.length === 2 ? parts[0] : undefined;
  return (
    name.length > 0 &&
    name.length <= 63 &&
    kubernetesLabelName.test(name) &&
    (prefix === undefined ||
      (prefix.length > 0 && prefix.length <= 253 && kubernetesLabelPrefix.test(prefix)))
  );
}

function validLabelValue(value: string): boolean {
  return value.length <= 63 && (value.length === 0 || kubernetesLabelName.test(value));
}

function validateRoutingPolicy(
  policy: KubernetesResolvedRoutingPolicy,
): Result<KubernetesResolvedRoutingPolicy> {
  if (
    policy.schemaVersion !== "kubernetes.routing-policy/v1" ||
    policy.ingressControllerSources.length === 0 ||
    policy.ingressControllerSources.length > 8
  ) {
    return err(
      domainError.validation("Kubernetes routing policy must contain one to eight exact sources"),
    );
  }

  for (const source of policy.ingressControllerSources) {
    const labels = Object.entries(source.podSelector);
    if (
      source.namespace.length > 63 ||
      !kubernetesDnsLabel.test(source.namespace) ||
      labels.length === 0 ||
      labels.length > 8 ||
      labels.some(([key, value]) => !validLabelKey(key) || !validLabelValue(value))
    ) {
      return err(
        domainError.validation(
          "Kubernetes routing policy sources require an exact namespace and non-empty exact pod labels",
        ),
      );
    }
  }

  return ok(policy);
}

function selectorFor(source: KubernetesIngressControllerSource): string {
  return Object.entries(source.podSelector)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join(",");
}

function podListHasItems(stdout: string): boolean {
  try {
    const payload = JSON.parse(stdout) as { items?: unknown[] };
    return Array.isArray(payload.items) && payload.items.length > 0;
  } catch {
    return false;
  }
}

export interface KubernetesCommandRunnerInput {
  context?: ExecutionContext;
  targetId?: string;
  step: string;
  args: string[];
  stdin?: string;
}

export interface KubernetesCommandRunnerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface KubernetesCommandRunner {
  run(input: KubernetesCommandRunnerInput): Promise<Result<KubernetesCommandRunnerResult>>;
}

export interface KubernetesProcessRunnerInput {
  executable: string;
  args: string[];
  stdin?: string;
  timeoutMs: number;
}

export interface KubernetesProcessRunner {
  run(input: KubernetesProcessRunnerInput): Promise<Result<KubernetesCommandRunnerResult>>;
}

export interface KubernetesRolloutClock {
  wait(milliseconds: number): Promise<void>;
}

export interface KubernetesCanaryRouteProbe {
  prove(input: {
    intent: KubernetesRuntimeIntent;
    expectedDeploymentId: string;
  }): Promise<Result<void>>;
}

class SystemKubernetesRolloutClock implements KubernetesRolloutClock {
  async wait(milliseconds: number): Promise<void> {
    await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  }
}

class FetchKubernetesCanaryRouteProbe implements KubernetesCanaryRouteProbe {
  async prove(input: {
    intent: KubernetesRuntimeIntent;
    expectedDeploymentId: string;
  }): Promise<Result<void>> {
    const route = input.intent.routes[0];
    const domain = route?.domains[0];
    if (!route || !domain) {
      return err(
        domainError.runtimeTargetUnsupported("Kubernetes canary route is unavailable", {
          phase: "kubernetes-canary-route-proof",
        }),
      );
    }
    const protocol = route.tlsMode === "disabled" ? "http" : "https";
    const url = new URL(route.pathPrefix, `${protocol}://${domain}`);
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        const response = await fetch(url, {
          redirect: "manual",
          signal: AbortSignal.timeout(1_000),
        });
        if (
          response.ok &&
          response.headers.get("x-appaloft-deployment-id") === input.expectedDeploymentId
        ) {
          await response.body?.cancel();
          return ok(undefined);
        }
        await response.body?.cancel();
      } catch {
        // The route may still be converging in the ingress controller.
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
    }
    return err(
      domainError.infra("Kubernetes canary route did not converge", {
        phase: "kubernetes-canary-route-proof",
        expectedDeploymentId: input.expectedDeploymentId,
      }),
    );
  }
}

class BunKubernetesProcessRunner implements KubernetesProcessRunner {
  async run(input: KubernetesProcessRunnerInput): Promise<Result<KubernetesCommandRunnerResult>> {
    try {
      const process = Bun.spawn([input.executable, ...input.args], {
        stdout: "pipe",
        stderr: "pipe",
        ...(input.stdin === undefined ? {} : { stdin: new Blob([input.stdin]) }),
      });
      const stdoutPromise = new Response(process.stdout).text();
      const stderrPromise = new Response(process.stderr).text();
      let timeout: Timer | undefined;
      const timedOut = new Promise<"timeout">((resolve) => {
        timeout = setTimeout(() => resolve("timeout"), input.timeoutMs);
      });
      const outcome = await Promise.race([process.exited, timedOut]);
      if (timeout) clearTimeout(timeout);

      if (outcome === "timeout") {
        process.kill();
        const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
        return ok({
          exitCode: 124,
          stdout,
          stderr: stderr || "Kubernetes command timed out",
        });
      }

      const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
      return ok({ exitCode: outcome, stdout, stderr });
    } catch (error) {
      return err(
        domainError.infra(
          error instanceof Error ? error.message : "Kubernetes command runner failed",
          { phase: "kubernetes-command" },
        ),
      );
    }
  }
}

export class KubernetesShellCommandRunner implements KubernetesCommandRunner {
  constructor(
    private readonly processRunner: KubernetesProcessRunner = new BunKubernetesProcessRunner(),
    private readonly timeoutMs = 30_000,
  ) {}

  async run(input: KubernetesCommandRunnerInput): Promise<Result<KubernetesCommandRunnerResult>> {
    return await this.processRunner.run({
      executable: "kubectl",
      args: [...input.args],
      ...(input.stdin === undefined ? {} : { stdin: input.stdin }),
      timeoutMs: this.timeoutMs,
    });
  }
}

const readinessCapabilities: RuntimeTargetReadinessCapability[] = [
  "api-reachability",
  "version",
  "authorization",
  "namespace-isolation",
  "routing",
  "storage",
];

function blockedChecks(reasonCode: string, message?: string): RuntimeTargetReadinessCheck[] {
  return readinessCapabilities.map((capability, index) => ({
    capability,
    status: "blocked",
    reasonCode,
    ...(index === 0 && message ? { message } : {}),
  }));
}

function commandReady(result: KubernetesCommandRunnerResult): boolean {
  return result.exitCode === 0 && result.stdout.trim().toLowerCase() === "yes";
}

function discoveredResource(stdout: string, resourceName: string): boolean {
  return stdout
    .split(/\s+/)
    .some((name) => name === resourceName || name.startsWith(`${resourceName}.`));
}

function versionFrom(stdout: string): string | undefined {
  try {
    const payload = JSON.parse(stdout) as { serverVersion?: { gitVersion?: unknown } };
    const value = payload.serverVersion?.gitVersion;
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  } catch {
    return undefined;
  }
}

function connectionArgs(connection: KubernetesResolvedConnection): string[] {
  return [
    "--kubeconfig",
    connection.kubeconfigPath,
    ...(connection.contextName ? ["--context", connection.contextName] : []),
  ];
}

function phaseLog(
  phase: "deploy" | "verify" | "rollback",
  message: string,
  level: "info" | "warn" | "error" = "info",
): DeploymentTimelineJournalEntry {
  return DeploymentTimelineJournalEntry.rehydrate({
    timestamp: OccurredAt.rehydrate(new Date().toISOString()),
    source: DeploymentTimelineSourceValue.rehydrate("provider"),
    phase: DeploymentPhaseValue.rehydrate(phase),
    level: LogLevelValue.rehydrate(level),
    message: MessageText.rehydrate(message),
  });
}

function applyExecutionResult(
  deployment: Deployment,
  input: {
    status: "succeeded" | "failed" | "rolled-back";
    exitCode: number;
    retryable: boolean;
    timeline: DeploymentTimelineJournalEntry[];
    errorCode?: string;
    metadata?: Record<string, string>;
  },
): Result<{ deployment: Deployment }> {
  const result = ExecutionResult.rehydrate({
    status: ExecutionStatusValue.rehydrate(input.status),
    exitCode: ExitCode.rehydrate(input.exitCode),
    timeline: input.timeline,
    retryable: input.retryable,
    ...(input.errorCode ? { errorCode: ErrorCodeText.rehydrate(input.errorCode) } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {}),
  });
  return deployment
    .applyExecutionResult(FinishedAt.rehydrate(new Date().toISOString()), result)
    .map(() => ({ deployment }));
}

function organizationId(context: ExecutionContext): string {
  return (
    context.tenant?.organizationId ??
    context.principal?.activeOrganization?.organizationId ??
    context.tenant?.tenantId ??
    "tenant_instance"
  );
}

function secretValuesFromRuntimeEnvironment(
  intent: KubernetesRuntimeIntent,
  env: NodeJS.ProcessEnv,
): Record<string, string> {
  return Object.fromEntries(
    intent.environment
      .filter((variable) => variable.secret && typeof env[variable.name] === "string")
      .map((variable) => [variable.name, env[variable.name] as string]),
  );
}

function ownedNamespace(result: KubernetesCommandRunnerResult, plan: KubernetesCleanupPlan): boolean {
  if (result.exitCode !== 0) return false;
  try {
    const namespace = JSON.parse(result.stdout) as {
      metadata?: { labels?: Record<string, string> };
    };
    return (
      namespace.metadata?.labels?.["appaloft.io/managed-by"] === "appaloft" &&
      (plan.storageScopeReceipt
        ? namespace.metadata.labels["appaloft.io/storage-scope-receipt"] ===
          plan.storageScopeReceipt
        : namespace.metadata.labels["appaloft.io/receipt"] === plan.receipt)
    );
  } catch {
    return false;
  }
}

export class KubernetesRuntimeTargetBackend implements RuntimeTargetBackend {
  readonly descriptor: RuntimeTargetBackendDescriptor = {
    key: "kubernetes",
    providerKey: "kubernetes",
    targetKinds: ["orchestrator-cluster"],
    capabilities: [
      "runtime.readiness",
      "runtime.apply",
      "runtime.verify",
      "runtime.cleanup",
      "runtime.logs",
      "runtime.health",
      "runtime.scale",
      "runtime.autoscale",
      "runtime.rollout",
      "runtime.stateful",
      "runtime.helm",
      "proxy.route",
    ],
  };

  constructor(
    private readonly runner: KubernetesCommandRunner,
    private readonly connectionResolver: KubernetesConnectionResolver,
    private readonly serverRepository?: ServerRepository,
    private readonly dependencyResourceSecretStore?: DependencyResourceSecretStore,
    private readonly controlPlaneSecretProtector?: ControlPlaneSecretProtector,
    private readonly routingPolicyResolver: KubernetesRoutingPolicyResolver =
      new BuiltinKubernetesRoutingPolicyResolver(),
    private readonly rolloutClock: KubernetesRolloutClock = new SystemKubernetesRolloutClock(),
    private readonly canaryRouteProbe: KubernetesCanaryRouteProbe =
      new FetchKubernetesCanaryRouteProbe(),
    private readonly helmLifecycle: KubernetesHelmLifecycle = new KubernetesHelmLifecycle(
      new HelmShellCommandRunner(),
      new FileKubernetesHelmValuesResolver(),
    ),
  ) {}

  async inspectReadiness(
    context: ExecutionContext,
    target: DeploymentTargetState,
  ): Promise<Result<RuntimeTargetReadinessBackendInspection>> {
    const profile = target.runtimeTargetProfile?.toSnapshot();
    if (!profile) {
      return ok({
        checks: blockedChecks(
          "runtime-target-profile-missing",
          "Configure the runtime target profile before inspecting readiness",
        ),
      });
    }

    const resolved = await this.connectionResolver.resolve({
      context,
      connectionReference: profile.connectionReference,
      ...(profile.credentialReference
        ? { credentialReference: profile.credentialReference }
        : {}),
    });
    if (resolved.isErr()) {
      return ok({
        checks: blockedChecks(
          "kubernetes-connection-reference-unresolved",
          "Kubernetes connection references could not be resolved",
        ),
      });
    }

    const baseArgs = connectionArgs(resolved.value);
    const run = async (step: string, args: string[]) =>
      await this.runner.run({
        context,
        targetId: target.id.value,
        step,
        args: [...baseArgs, ...args],
      });

    const versionResult = await run("read-server-version", ["version", "-o", "json"]);
    if (versionResult.isErr() || versionResult.value.exitCode !== 0) {
      return ok({
        checks: blockedChecks(
          "kubernetes-api-unreachable",
          "Kubernetes API is unreachable",
        ),
      });
    }

    const version = versionFrom(versionResult.value.stdout);
    const workloadAuthorization = await run("check-workload-authorization", [
      "auth",
      "can-i",
      "create",
      "deployments.apps",
      "--all-namespaces",
    ]);
    const namespaceAuthorization = await run("check-namespace-authorization", [
      "auth",
      "can-i",
      "create",
      "namespaces",
    ]);
    const discovery = await run("discover-namespaced-resources", [
      "api-resources",
      "--verbs=create",
      "--namespaced=true",
      "-o",
      "name",
    ]);
    const resources =
      discovery.isOk() && discovery.value.exitCode === 0
        ? new Set(
            discovery.value.stdout
              .split(/\r?\n/)
              .map((value) => value.trim())
              .filter(Boolean),
          )
        : new Set<string>();
    const hasIngress = resources.has("ingresses.networking.k8s.io");
    const hasTraefikIdentityMiddleware = resources.has("middlewares.traefik.io");
    const hasRouting = hasIngress && hasTraefikIdentityMiddleware;
    const hasStorage = resources.has("persistentvolumeclaims");
    const routingPolicy = await this.resolveRoutingPolicy(target);
    const routingControllerChecks =
      hasRouting && routingPolicy.isOk()
        ? await Promise.all(
            routingPolicy.value.ingressControllerSources.map(async (source) =>
              await run("verify-routing-controller-source", [
                "get",
                "pods",
                "--namespace",
                source.namespace,
                "--selector",
                selectorFor(source),
                "-o",
                "json",
              ]),
            ),
          )
        : [];
    const routingControllerReady =
      routingControllerChecks.length > 0 &&
      routingControllerChecks.every(
        (result) =>
          result.isOk() &&
          result.value.exitCode === 0 &&
          podListHasItems(result.value.stdout),
      );

    return ok({
      checks: [
        { capability: "api-reachability", status: "ready" },
        version
          ? { capability: "version", status: "ready", message: `Kubernetes ${version}` }
          : {
              capability: "version",
              status: "blocked",
              reasonCode: "kubernetes-version-unavailable",
            },
        workloadAuthorization.isOk() && commandReady(workloadAuthorization.value)
          ? { capability: "authorization", status: "ready" }
          : {
              capability: "authorization",
              status: "blocked",
              reasonCode: "kubernetes-workload-authorization-denied",
            },
        namespaceAuthorization.isOk() && commandReady(namespaceAuthorization.value)
          ? { capability: "namespace-isolation", status: "ready" }
          : {
              capability: "namespace-isolation",
              status: "blocked",
              reasonCode: "kubernetes-namespace-authorization-denied",
            },
        !profile.routingPolicyReference
          ? {
              capability: "routing",
              status: "blocked",
              reasonCode: "kubernetes-routing-policy-reference-missing",
            }
          : routingPolicy.isErr()
            ? {
                capability: "routing",
                status: "blocked",
                reasonCode: "kubernetes-routing-policy-reference-unresolved",
              }
            : !hasRouting
              ? {
                  capability: "routing",
                  status: "unsupported",
                  reasonCode: "kubernetes-traefik-route-identity-unavailable",
                }
              : routingControllerReady
          ? {
              capability: "routing",
              status: "ready",
                    message:
                      "Ingress API, Traefik identity middleware, and exact controller source are available",
            }
          : {
              capability: "routing",
                  status: "blocked",
                  reasonCode: "kubernetes-routing-controller-source-unavailable",
            },
        hasStorage
          ? {
              capability: "storage",
              status: "ready",
              message: "PersistentVolumeClaim API is available",
            }
          : {
              capability: "storage",
              status: "unsupported",
              reasonCode: "kubernetes-storage-api-unavailable",
            },
      ],
    });
  }

  async execute(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ deployment: Deployment }>> {
    const targetResult = await this.targetForDeployment(context, deployment);
    if (targetResult.isErr()) return err(targetResult.error);
    const connectionResult = await this.resolveConnection(context, targetResult.value);
    if (connectionResult.isErr()) return err(connectionResult.error);

    const state = requireServerBackedDeploymentState(deployment, "kubernetes execution");
    if (state.runtimePlan.execution.kind === "helm-release") {
      return await this.executeHelm(
        context,
        deployment,
        state.serverId.value,
        connectionResult.value,
      );
    }
    const intentResult = renderKubernetesRuntimeIntent({
      runtimePlan: state.runtimePlan,
      environmentSnapshot: state.environmentSnapshot,
      dependencyBindingReferences: state.dependencyBindingReferences,
      identity: {
        organizationId: organizationId(context),
        projectId: state.projectId.value,
        environmentId: state.environmentId.value,
        resourceId: state.resourceId.value,
        deploymentId: state.id.value,
        targetId: state.serverId.value,
      },
    });
    if (intentResult.isErr()) return err(intentResult.error);
    const intent = intentResult.value;
    const routingPolicyResult =
      intent.routes.length > 0
        ? await this.resolveRoutingPolicy(targetResult.value)
        : ok<KubernetesResolvedRoutingPolicy | undefined>(undefined);
    if (routingPolicyResult.isErr()) return err(routingPolicyResult.error);
    const runtimeEnvironment = await resolveDependencyRuntimeEnvironment({
      context,
      deployment,
      dependencyResourceSecretStore: this.dependencyResourceSecretStore,
      controlPlaneSecretProtector: this.controlPlaneSecretProtector,
      port: intent.port,
      baseEnv: {},
    });
    if (runtimeEnvironment.isErr()) return err(runtimeEnvironment.error);
    const manifestResult = renderKubernetesRuntimeManifest(
      intent,
      secretValuesFromRuntimeEnvironment(intent, runtimeEnvironment.value.env),
      routingPolicyResult.value,
    );
    if (manifestResult.isErr()) return err(manifestResult.error);

    if (intent.scale.horizontal) {
      const autoscaleCapability = await this.inspectAutoscaleCapability(
        context,
        state.serverId.value,
        connectionResult.value,
      );
      if (autoscaleCapability.isErr()) return err(autoscaleCapability.error);
    }
    const canaryPlan =
      intent.rollout.strategy === "canary"
        ? await this.prepareCanary(
            context,
            deployment,
            intent,
            connectionResult.value,
            routingPolicyResult.value,
          )
        : ok<
            | {
                stableIntent: KubernetesRuntimeIntent;
                trafficSteps: number[];
              }
            | undefined
          >(undefined);
    if (canaryPlan.isErr()) return err(canaryPlan.error);

    const timeline: DeploymentTimelineJournalEntry[] = [];
    const workloadNames = intent.services?.map((service) => service.workloadName) ?? [intent.workloadName];
    const workloadKind = intent.storage?.length ? "statefulset" : "deployment";
    const steps: Array<{
      phase: "deploy" | "verify";
      step: string;
      args: string[];
      stdin?: string;
      workloadIndex?: number;
    }> = [
      {
        phase: "deploy",
        step: "apply-candidate-manifest",
        args: ["apply", "--server-side=true", "--field-manager=appaloft", "-f", "-"],
        stdin: JSON.stringify(manifestResult.value),
      },
      ...workloadNames.flatMap((workloadName, index) => [
        {
          phase: "verify" as const,
          step:
            workloadNames.length === 1
              ? intent.storage?.length
                ? "wait-candidate-statefulset-rollout"
                : "wait-candidate-rollout"
              : `wait-candidate-rollout:${workloadName}`,
          args: [
            "rollout",
            "status",
            `${workloadKind}/${workloadName}`,
            "--namespace",
            intent.namespace,
            "--timeout=180s",
          ],
        },
        {
          phase: "verify" as const,
          step:
            workloadNames.length === 1
              ? intent.storage?.length
                ? "observe-candidate-statefulset"
                : "observe-candidate-deployment"
              : `observe-candidate-deployment:${workloadName}`,
          args: [
            "get",
            workloadKind,
            workloadName,
            "--namespace",
            intent.namespace,
            "-o",
            "json",
          ],
          workloadIndex: index,
        },
      ]),
      ...(intent.scale.horizontal
        ? [
            {
              phase: "verify" as const,
              step: "observe-candidate-autoscaler",
              args: [
                "get",
                "horizontalpodautoscaler",
                intent.workloadName,
                "--namespace",
                intent.namespace,
                "-o",
                "json",
              ],
            },
          ]
        : []),
    ];

    let scaleObservation: ReturnType<KubernetesRuntimeTargetBackend["deploymentObservation"]>;
    for (const step of steps) {
      timeline.push(phaseLog(step.phase, step.step));
      const result = await this.run(
        context,
        state.serverId.value,
        connectionResult.value,
        step.step,
        step.args,
        step.stdin,
      );
      const failed = result.isErr() || result.value.exitCode !== 0;
      if (
        !failed &&
        (step.step.startsWith("observe-candidate-deployment") ||
          step.step === "observe-candidate-statefulset")
      ) {
        const workloadIndex = step.workloadIndex ?? 0;
        const expectedReplicas = intent.services?.[workloadIndex]?.replicas ?? intent.scale.replicas;
        const observation = this.deploymentObservation(
          result.value.stdout,
          intent,
          expectedReplicas,
        );
        scaleObservation = observation
          ? {
              desiredReplicas:
                (scaleObservation?.desiredReplicas ?? 0) + observation.desiredReplicas,
              currentReplicas:
                (scaleObservation?.currentReplicas ?? 0) + observation.currentReplicas,
              readyReplicas: (scaleObservation?.readyReplicas ?? 0) + observation.readyReplicas,
              ready: (scaleObservation?.ready ?? true) && observation.ready,
              metricDecision: observation.metricDecision,
            }
          : undefined;
        if (!observation?.ready) {
          timeline.push(phaseLog("verify", "candidate deployment is not available", "error"));
          await this.cleanupFailedCandidate(
            context,
            state.serverId.value,
            connectionResult.value,
            intent,
            timeline,
          );
          return applyExecutionResult(deployment, {
            status: "failed",
            exitCode: 1,
            retryable: true,
            timeline,
            errorCode: "kubernetes_candidate_not_ready",
            metadata: {
              ...this.executionMetadata(intent),
              ...(observation ? this.scaleObservationMetadata(observation) : {}),
            },
          });
        }
      }
      if (!failed && step.step === "observe-candidate-autoscaler" && scaleObservation) {
        scaleObservation.metricDecision = this.autoscaleMetricDecision(
          result.value.stdout,
          intent.scale.horizontal?.targetCpuUtilizationPercent ?? 0,
        );
      }
      if (failed) {
        timeline.push(phaseLog(step.phase, `Kubernetes command failed at ${step.step}`, "error"));
        await this.cleanupFailedCandidate(
          context,
          state.serverId.value,
          connectionResult.value,
          intent,
          timeline,
        );
        return applyExecutionResult(deployment, {
          status: "failed",
          exitCode: result.isOk() ? result.value.exitCode : 1,
          retryable: true,
          timeline,
          errorCode: "kubernetes_command_failed",
          metadata: this.executionMetadata(intent),
        });
      }
    }

    let rolloutMetadata: Record<string, string> = {};
    if (canaryPlan.value) {
      const promotion = await this.promoteCanary(
        context,
        state.serverId.value,
        connectionResult.value,
        intent,
        canaryPlan.value,
        timeline,
      );
      if (promotion.isErr()) {
        timeline.push(phaseLog("verify", "Kubernetes canary promotion proof failed", "error"));
        await this.cleanupFailedCandidate(
          context,
          state.serverId.value,
          connectionResult.value,
          intent,
          timeline,
        );
        return applyExecutionResult(deployment, {
          status: "failed",
          exitCode: 1,
          retryable: true,
          timeline,
          errorCode: "kubernetes_canary_promotion_failed",
          metadata: {
            ...this.executionMetadata(intent),
            "runtime.rollout.stableNamespace": canaryPlan.value.stableIntent.namespace,
          },
        });
      }
      rolloutMetadata = promotion.value;
    }

    timeline.push(phaseLog("deploy", `Kubernetes candidate ${intent.workloadName} converged`));
    return applyExecutionResult(deployment, {
      status: "succeeded",
      exitCode: 0,
      retryable: false,
      timeline,
      metadata: {
        ...this.executionMetadata(intent),
        ...rolloutMetadata,
        ...(scaleObservation ? this.scaleObservationMetadata(scaleObservation) : {}),
      },
    });
  }

  async cancel(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ timeline: DeploymentTimelineJournalEntry[] }>> {
    const targetResult = await this.targetForDeployment(context, deployment);
    if (targetResult.isErr()) return err(targetResult.error);
    const connectionResult = await this.resolveConnection(context, targetResult.value);
    if (connectionResult.isErr()) return err(connectionResult.error);
    const state = requireServerBackedDeploymentState(deployment, "kubernetes cleanup");
    if (state.runtimePlan.execution.kind === "helm-release") {
      const intent = this.helmIntent(context, deployment);
      if (intent.isErr()) return err(intent.error);
      const cleanup = await this.helmLifecycle.uninstall({
        context,
        targetId: state.serverId.value,
        connection: connectionResult.value,
        intent: intent.value,
      });
      if (cleanup.isErr()) return err(cleanup.error);
      return ok({ timeline: [phaseLog("rollback", "Helm release uninstalled")] });
    }
    const cleanupIdentity = this.cleanupIdentity(context, deployment);
    if (cleanupIdentity.isErr()) return err(cleanupIdentity.error);
    return await this.cleanupExact(
      context,
      state.serverId.value,
      connectionResult.value,
      renderKubernetesCleanupPlan(cleanupIdentity.value),
    );
  }

  async rollback(
    context: ExecutionContext,
    deployment: Deployment,
    _plan: RollbackPlan,
  ): Promise<Result<{ deployment: Deployment }>> {
    const state = requireServerBackedDeploymentState(deployment, "kubernetes rollback");
    if (state.runtimePlan.execution.kind === "helm-release") {
      const targetResult = await this.targetForDeployment(context, deployment);
      if (targetResult.isErr()) return err(targetResult.error);
      const connectionResult = await this.resolveConnection(context, targetResult.value);
      if (connectionResult.isErr()) return err(connectionResult.error);
      const intent = this.helmIntent(context, deployment);
      if (intent.isErr()) return err(intent.error);
      const rollback = await this.helmLifecycle.rollback({
        context,
        targetId: state.serverId.value,
        connection: connectionResult.value,
        intent: intent.value,
      });
      if (rollback.isErr()) return err(rollback.error);
      return applyExecutionResult(deployment, {
        status: "rolled-back",
        exitCode: 0,
        retryable: false,
        timeline: [phaseLog("rollback", "Helm release rollback verified")],
        metadata: {
          ...this.helmExecutionMetadata(intent.value),
          ...(rollback.value ? { "helm.rollbackRevision": String(rollback.value) } : {}),
        },
      });
    }
    const cleanup = await this.cancel(context, deployment);
    if (cleanup.isErr()) return err(cleanup.error);
    return applyExecutionResult(deployment, {
      status: "rolled-back",
      exitCode: 0,
      retryable: false,
      timeline: cleanup.value.timeline,
    });
  }

  private helmIntent(
    context: ExecutionContext,
    deployment: Deployment,
  ): Result<KubernetesHelmIntent> {
    const state = requireServerBackedDeploymentState(deployment, "kubernetes Helm intent");
    return renderKubernetesHelmIntent({
      runtimePlan: state.runtimePlan,
      identity: {
        organizationId: organizationId(context),
        projectId: state.projectId.value,
        environmentId: state.environmentId.value,
        resourceId: state.resourceId.value,
        deploymentId: state.id.value,
        targetId: state.serverId.value,
      },
    });
  }

  private helmExecutionMetadata(intent: KubernetesHelmIntent): Record<string, string> {
    return {
      "kubernetes.namespace": intent.namespace,
      "kubernetes.receipt": intent.receipt,
      "helm.releaseName": intent.releaseName,
      "helm.chartReference": intent.chartReference,
      "helm.chartVersion": intent.chartVersion,
      "helm.intentSchemaVersion": intent.schemaVersion,
    };
  }

  private async executeHelm(
    context: ExecutionContext,
    deployment: Deployment,
    targetId: string,
    connection: KubernetesResolvedConnection,
  ): Promise<Result<{ deployment: Deployment }>> {
    const intent = this.helmIntent(context, deployment);
    if (intent.isErr()) return err(intent.error);
    const timeline = [phaseLog("deploy", "Render redacted Helm release diff")];
    const result = await this.helmLifecycle.deploy({
      context,
      targetId,
      connection,
      intent: intent.value,
    });
    if (result.isErr()) {
      timeline.push(phaseLog("deploy", "Helm release execution failed", "error"));
      return applyExecutionResult(deployment, {
        status: "failed",
        exitCode: 1,
        retryable: true,
        timeline,
        errorCode: "kubernetes_helm_execution_failed",
        metadata: this.helmExecutionMetadata(intent.value),
      });
    }
    const metadata = {
      ...this.helmExecutionMetadata(intent.value),
      "helm.renderedDigest": result.value.renderedDigest,
      "helm.renderedDocumentCount": String(result.value.renderedDocumentCount),
      "helm.rollbackVerified": String(result.value.rollbackVerified),
      ...(result.value.previousRevision
        ? { "helm.previousRevision": String(result.value.previousRevision) }
        : {}),
      ...(result.value.currentRevision
        ? { "helm.currentRevision": String(result.value.currentRevision) }
        : {}),
    };
    if (result.value.status === "failed") {
      timeline.push(
        phaseLog(
          "rollback",
          result.value.rollbackVerified
            ? "Helm atomic rollback verified"
            : "Helm release failed without rollback proof",
          result.value.rollbackVerified ? "warn" : "error",
        ),
      );
      return applyExecutionResult(deployment, {
        status: "failed",
        exitCode: 1,
        retryable: !result.value.rollbackVerified,
        timeline,
        errorCode: result.value.rollbackVerified
          ? "kubernetes_helm_upgrade_rolled_back"
          : "kubernetes_helm_upgrade_failed",
        metadata,
      });
    }
    timeline.push(phaseLog("verify", "Helm release converged"));
    return applyExecutionResult(deployment, {
      status: "succeeded",
      exitCode: 0,
      retryable: false,
      timeline,
      metadata,
    });
  }

  private async targetForDeployment(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<DeploymentTargetState>> {
    if (!this.serverRepository) {
      return err(
        domainError.runtimeTargetUnsupported("Kubernetes target repository is unavailable", {
          phase: "kubernetes-target-resolution",
        }),
      );
    }
    const state = requireServerBackedDeploymentState(deployment, "kubernetes target resolution");
    const target = await this.serverRepository.findOne(
      toRepositoryContext(context),
      DeploymentTargetByIdSpec.create(DeploymentTargetId.rehydrate(state.serverId.value)),
    );
    if (!target || target.toState().lifecycleStatus.isDeleted()) {
      return err(domainError.notFound("server", state.serverId.value));
    }
    const targetState = target.toState();
    if (
      targetState.targetKind.value !== "orchestrator-cluster" ||
      targetState.providerKey.value !== "kubernetes" ||
      !targetState.runtimeTargetProfile
    ) {
      return err(
        domainError.runtimeTargetUnsupported("Kubernetes target profile is unavailable", {
          phase: "kubernetes-target-resolution",
          targetId: state.serverId.value,
        }),
      );
    }
    return ok(targetState);
  }

  private async resolveConnection(
    context: ExecutionContext,
    target: DeploymentTargetState,
  ): Promise<Result<KubernetesResolvedConnection>> {
    const profile = target.runtimeTargetProfile?.toSnapshot();
    if (!profile) {
      return err(
        domainError.runtimeTargetUnsupported("Kubernetes target profile is unavailable", {
          phase: "kubernetes-connection-resolution",
        }),
      );
    }
    return await this.connectionResolver.resolve({
      context,
      connectionReference: profile.connectionReference,
      ...(profile.credentialReference
        ? { credentialReference: profile.credentialReference }
        : {}),
    });
  }

  private async resolveRoutingPolicy(
    target: DeploymentTargetState,
  ): Promise<Result<KubernetesResolvedRoutingPolicy>> {
    const reference = target.runtimeTargetProfile?.toSnapshot().routingPolicyReference;
    if (!reference) {
      return err(
        domainError.runtimeTargetUnsupported(
          "Kubernetes routed workloads require a routing policy reference",
          {
            phase: "kubernetes-routing-policy-resolution",
            reason: "routing-policy-reference-required",
          },
        ),
      );
    }
    const policy = await this.routingPolicyResolver.resolve({
      routingPolicyReference: reference,
    });
    return policy.andThen(validateRoutingPolicy);
  }

  private async run(
    context: ExecutionContext,
    targetId: string,
    connection: KubernetesResolvedConnection,
    step: string,
    args: string[],
    stdin?: string,
  ): Promise<Result<KubernetesCommandRunnerResult>> {
    return await this.runner.run({
      context,
      targetId,
      step,
      args: [...connectionArgs(connection), ...args],
      ...(stdin === undefined ? {} : { stdin }),
    });
  }

  private deploymentObservation(
    stdout: string,
    intent: KubernetesRuntimeIntent,
    expectedReplicas = intent.scale.replicas,
  ):
    | {
        desiredReplicas: number;
        currentReplicas: number;
        readyReplicas: number;
        ready: boolean;
        metricDecision: "disabled" | "below-target" | "at-target" | "above-target" | "unknown";
      }
    | undefined {
    try {
      const deployment = JSON.parse(stdout) as {
        spec?: { replicas?: number };
        status?: {
          replicas?: number;
          readyReplicas?: number;
          availableReplicas?: number;
          observedGeneration?: number;
        };
        metadata?: { generation?: number };
      };
      const desiredReplicas = deployment.spec?.replicas ?? expectedReplicas;
      const currentReplicas = deployment.status?.replicas ?? 0;
      const readyReplicas = deployment.status?.readyReplicas ?? deployment.status?.availableReplicas ?? 0;
      return {
        desiredReplicas,
        currentReplicas,
        readyReplicas,
        ready:
          readyReplicas >= desiredReplicas &&
          (deployment.status?.observedGeneration ?? 0) >= (deployment.metadata?.generation ?? 1),
        metricDecision: intent.scale.horizontal ? "unknown" : "disabled",
      };
    } catch {
      return undefined;
    }
  }

  private async inspectAutoscaleCapability(
    context: ExecutionContext,
    targetId: string,
    connection: KubernetesResolvedConnection,
  ): Promise<Result<void>> {
    const hpa = await this.run(context, targetId, connection, "check-autoscale-api", [
      "api-resources",
      "--api-group=autoscaling",
      "-o",
      "name",
    ]);
    const metrics = await this.run(context, targetId, connection, "check-metrics-api", [
      "get",
      "--raw",
      "/apis/metrics.k8s.io/v1beta1",
    ]);
    if (
      hpa.isErr() ||
      hpa.value.exitCode !== 0 ||
      !discoveredResource(hpa.value.stdout, "horizontalpodautoscalers") ||
      metrics.isErr() ||
      metrics.value.exitCode !== 0
    ) {
      return err(
        domainError.runtimeTargetUnsupported(
          "Kubernetes target does not provide the required autoscaling and metrics APIs",
          {
            phase: "kubernetes-autoscale-capability",
            missingCapability: "horizontal-autoscaling-metrics",
          },
        ),
      );
    }
    return ok(undefined);
  }

  private async prepareCanary(
    context: ExecutionContext,
    deployment: Deployment,
    intent: KubernetesRuntimeIntent,
    connection: KubernetesResolvedConnection,
    routingPolicy: KubernetesResolvedRoutingPolicy | undefined,
  ): Promise<
    Result<{
      stableIntent: KubernetesRuntimeIntent;
      trafficSteps: number[];
    }>
  > {
    const state = requireServerBackedDeploymentState(deployment, "kubernetes canary preparation");
    const supersedesDeploymentId = state.supersedesDeploymentId?.value;
    const canary = intent.rollout.canary;
    if (!supersedesDeploymentId || !canary || !routingPolicy) {
      return err(
        domainError.runtimeTargetUnsupported(
          "Kubernetes canary requires a prior runtime, complete traffic policy, and routing policy",
          {
            phase: "kubernetes-canary-capability",
            missingCapability: "canary-promotion-proof",
          },
        ),
      );
    }
    const stableIntent = renderKubernetesRuntimeIntent({
      runtimePlan: state.runtimePlan,
      environmentSnapshot: state.environmentSnapshot,
      dependencyBindingReferences: state.dependencyBindingReferences,
      identity: {
        organizationId: organizationId(context),
        projectId: state.projectId.value,
        environmentId: state.environmentId.value,
        resourceId: state.resourceId.value,
        deploymentId: supersedesDeploymentId,
        targetId: state.serverId.value,
      },
    });
    if (stableIntent.isErr()) return err(stableIntent.error);
    const resources = await this.run(
      context,
      state.serverId.value,
      connection,
      "check-canary-routing-api",
      ["api-resources", "--api-group=traefik.io", "-o", "name"],
    );
    const endpointSliceResources = await this.run(
      context,
      state.serverId.value,
      connection,
      "check-canary-endpointslice-api",
      ["api-resources", "--api-group=discovery.k8s.io", "-o", "name"],
    );
    const proxyAuthorization = await this.run(
      context,
      state.serverId.value,
      connection,
      "check-canary-proof-authorization",
      ["auth", "can-i", "get", "endpoints", "--all-namespaces"],
    );
    const resourceNames =
      resources.isOk() && resources.value.exitCode === 0
        ? new Set(resources.value.stdout.split(/\s+/).filter(Boolean))
        : new Set<string>();
    const endpointSliceResourceNames =
      endpointSliceResources.isOk() && endpointSliceResources.value.exitCode === 0
        ? new Set(endpointSliceResources.value.stdout.split(/\s+/).filter(Boolean))
        : new Set<string>();
    if (
      !resourceNames.has("ingressroutes.traefik.io") ||
      !resourceNames.has("traefikservices.traefik.io") ||
      !resourceNames.has("middlewares.traefik.io") ||
      !endpointSliceResourceNames.has("endpointslices.discovery.k8s.io") ||
      proxyAuthorization.isErr() ||
      !commandReady(proxyAuthorization.value)
    ) {
      return err(
        domainError.runtimeTargetUnsupported(
          "Kubernetes target does not provide canary routing and proof capabilities",
          {
            phase: "kubernetes-canary-capability",
            missingCapability: "traefik-weighted-routing-or-endpoint-readback",
          },
        ),
      );
    }

    const stableEndpoints = await this.run(
      context,
      state.serverId.value,
      connection,
      "verify-stable-endpoints",
      [
        "get",
        "endpoints",
        stableIntent.value.workloadName,
        "--namespace",
        stableIntent.value.namespace,
        "-o",
        "json",
      ],
    );
    if (
      stableEndpoints.isErr() ||
      stableEndpoints.value.exitCode !== 0 ||
      !this.endpointsReady(stableEndpoints.value.stdout)
    ) {
      return err(
        domainError.runtimeTargetUnsupported(
          "Kubernetes canary requires a prior runtime with ready endpoints",
          {
            phase: "kubernetes-canary-capability",
            missingCapability: "stable-runtime-endpoints",
          },
        ),
      );
    }
    const stableEndpointAddresses = this.endpointAddresses(stableEndpoints.value.stdout);
    const initialRoute = renderKubernetesCanaryRouteManifest({
      intent,
      stableNamespace: stableIntent.value.namespace,
      stableWorkloadName: stableIntent.value.workloadName,
      stableEndpointAddresses,
      candidateTrafficPercent: canary.initialTrafficPercent,
    });
    if (initialRoute.isErr()) return err(initialRoute.error);

    const trafficSteps: number[] = [];
    for (
      let traffic = canary.initialTrafficPercent;
      traffic < 100;
      traffic = Math.min(100, traffic + canary.stepTrafficPercent)
    ) {
      trafficSteps.push(traffic);
    }
    if (trafficSteps.at(-1) !== 100) trafficSteps.push(100);
    return ok({ stableIntent: stableIntent.value, trafficSteps });
  }

  private endpointsReady(stdout: string): boolean {
    return this.endpointAddresses(stdout).length > 0;
  }

  private endpointAddresses(stdout: string): string[] {
    try {
      const endpoints = JSON.parse(stdout) as {
        subsets?: Array<{ addresses?: Array<{ ip?: unknown }>; ports?: unknown[] }>;
      };
      return [
        ...new Set(
          (endpoints.subsets ?? []).flatMap((subset) =>
            (subset.ports?.length ?? 0) > 0
              ? (subset.addresses ?? []).flatMap((address) =>
                  typeof address.ip === "string" ? [address.ip] : [],
                )
              : [],
          ),
        ),
      ];
    } catch {
      return [];
    }
  }

  private canaryRouteReady(
    stdout: string,
    candidateServiceName: string,
    candidateTrafficPercent: number,
  ): boolean {
    try {
      const route = JSON.parse(stdout) as {
        spec?: { weighted?: { services?: Array<{ name?: string; weight?: number }> } };
      };
      const services = route.spec?.weighted?.services ?? [];
      const candidate = services.find((service) => service.name === candidateServiceName);
      if (candidate?.weight !== candidateTrafficPercent) return false;
      if (services.reduce((total, service) => total + (service.weight ?? 0), 0) !== 100) {
        return false;
      }
      return candidateTrafficPercent < 100
        ? services.some(
            (service) =>
              service.name !== candidateServiceName &&
              service.weight === 100 - candidateTrafficPercent,
          )
        : services.length === 1;
    } catch {
      return false;
    }
  }

  private async promoteCanary(
    context: ExecutionContext,
    targetId: string,
    connection: KubernetesResolvedConnection,
    intent: KubernetesRuntimeIntent,
    plan: { stableIntent: KubernetesRuntimeIntent; trafficSteps: number[] },
    timeline: DeploymentTimelineJournalEntry[],
  ): Promise<Result<Record<string, string>>> {
    const canary = intent.rollout.canary;
    if (!canary || !intent.health) {
      return err(
        domainError.runtimeTargetUnsupported("Kubernetes canary promotion proof is unavailable", {
          phase: "kubernetes-canary-promotion",
        }),
      );
    }

    const candidateProofArgs = [
      "get",
      "endpoints",
      intent.workloadName,
      "--namespace",
      intent.namespace,
      "-o",
      "json",
    ];
    const candidateProof = await this.run(
      context,
      targetId,
      connection,
      "prove-canary-candidate",
      candidateProofArgs,
    );
    if (
      candidateProof.isErr() ||
      candidateProof.value.exitCode !== 0 ||
      !this.endpointsReady(candidateProof.value.stdout)
    ) {
      return err(
        domainError.infra("Kubernetes canary candidate proof failed", {
          phase: "kubernetes-canary-promotion",
        }),
      );
    }
    timeline.push(phaseLog("verify", "prove-canary-candidate"));

    for (const [index, candidateTrafficPercent] of plan.trafficSteps.entries()) {
      if (index > 0) {
        await this.rolloutClock.wait(canary.intervalSeconds * 1_000);
      }
      const stableEndpoints = await this.run(
        context,
        targetId,
        connection,
        `refresh-stable-endpoints:${candidateTrafficPercent}`,
        [
          "get",
          "endpoints",
          plan.stableIntent.workloadName,
          "--namespace",
          plan.stableIntent.namespace,
          "-o",
          "json",
        ],
      );
      if (
        stableEndpoints.isErr() ||
        stableEndpoints.value.exitCode !== 0 ||
        !this.endpointsReady(stableEndpoints.value.stdout)
      ) {
        return err(
          domainError.infra("Kubernetes canary stable endpoints became unavailable", {
            phase: "kubernetes-canary-promotion",
            candidateTrafficPercent,
          }),
        );
      }
      const routeManifest = renderKubernetesCanaryRouteManifest({
        intent,
        stableNamespace: plan.stableIntent.namespace,
        stableWorkloadName: plan.stableIntent.workloadName,
        stableEndpointAddresses: this.endpointAddresses(stableEndpoints.value.stdout),
        candidateTrafficPercent,
      });
      if (routeManifest.isErr()) return err(routeManifest.error);
      const weightedRoute = routeManifest.value.items.find(
        (resource) => resource.kind === "TraefikService",
      );
      const weightedRouteName = weightedRoute?.metadata.name;
      if (typeof weightedRouteName !== "string" || weightedRouteName.length === 0) {
        return err(
          domainError.infra("Kubernetes canary route identity is unavailable", {
            phase: "kubernetes-canary-promotion",
            candidateTrafficPercent,
          }),
        );
      }
      const apply = await this.run(
        context,
        targetId,
        connection,
        `apply-canary-traffic:${candidateTrafficPercent}`,
        ["apply", "--server-side=true", "--field-manager=appaloft", "-f", "-"],
        JSON.stringify(routeManifest.value),
      );
      if (apply.isErr() || apply.value.exitCode !== 0) {
        return err(
          domainError.infra("Kubernetes canary traffic update failed", {
            phase: "kubernetes-canary-promotion",
            candidateTrafficPercent,
          }),
        );
      }
      timeline.push(phaseLog("deploy", `canary-traffic:${candidateTrafficPercent}`));
      const proof = await this.run(
        context,
        targetId,
        connection,
        `prove-canary-traffic:${candidateTrafficPercent}`,
        [
          "get",
          "traefikservice",
          weightedRouteName,
          "--namespace",
          intent.namespace,
          "-o",
          "json",
        ],
      );
      if (
        proof.isErr() ||
        proof.value.exitCode !== 0 ||
        !this.canaryRouteReady(
          proof.value.stdout,
          intent.workloadName,
          candidateTrafficPercent,
        )
      ) {
        return err(
          domainError.infra("Kubernetes canary promotion proof failed", {
            phase: "kubernetes-canary-promotion",
            candidateTrafficPercent,
          }),
        );
      }
      timeline.push(phaseLog("verify", `prove-canary-traffic:${candidateTrafficPercent}`));
      const routeProof = await this.canaryRouteProbe.prove({
        intent,
        expectedDeploymentId: intent.annotations["appaloft.io/deployment-id"] ?? "",
      });
      if (routeProof.isErr()) return err(routeProof.error);
      timeline.push(phaseLog("verify", `prove-canary-route:${candidateTrafficPercent}`));
    }

    return ok({
      "runtime.rollout.strategy": "canary",
      "runtime.rollout.candidateTrafficPercent": "100",
      "runtime.rollout.stableNamespace": plan.stableIntent.namespace,
      "runtime.rollout.promotionProof": "passed",
    });
  }

  private scaleObservationMetadata(observation: {
    desiredReplicas: number;
    currentReplicas: number;
    readyReplicas: number;
    metricDecision: string;
  }): Record<string, string> {
    return {
      "runtime.scale.desiredReplicas": String(observation.desiredReplicas),
      "runtime.scale.currentReplicas": String(observation.currentReplicas),
      "runtime.scale.readyReplicas": String(observation.readyReplicas),
      "runtime.scale.metricDecision": observation.metricDecision,
    };
  }

  private autoscaleMetricDecision(
    stdout: string,
    targetCpuUtilizationPercent: number,
  ): "below-target" | "at-target" | "above-target" | "unknown" {
    try {
      const hpa = JSON.parse(stdout) as {
        status?: {
          currentMetrics?: Array<{
            resource?: { name?: string; current?: { averageUtilization?: number } };
          }>;
        };
      };
      const current = hpa.status?.currentMetrics?.find(
        (metric) => metric.resource?.name === "cpu",
      )?.resource?.current?.averageUtilization;
      if (current === undefined) return "unknown";
      if (current < targetCpuUtilizationPercent) return "below-target";
      if (current > targetCpuUtilizationPercent) return "above-target";
      return "at-target";
    } catch {
      return "unknown";
    }
  }

  private executionMetadata(intent: KubernetesRuntimeIntent): Record<string, string> {
    return {
      "kubernetes.namespace": intent.namespace,
      "kubernetes.workloadName": intent.workloadName,
      "kubernetes.receipt": intent.receipt,
      "kubernetes.intentSchemaVersion": intent.schemaVersion,
      "runtime.scale.desiredReplicas": String(intent.scale.replicas),
      "runtime.scale.metricDecision": intent.scale.horizontal ? "unknown" : "disabled",
      "runtime.rollout.strategy": intent.rollout.strategy,
      ...(intent.storageScopeReceipt
        ? { "kubernetes.storageScopeReceipt": intent.storageScopeReceipt }
        : {}),
      ...(intent.storage?.length
        ? { "kubernetes.storageClaims": intent.storage.map((storage) => storage.claimName).join(",") }
        : {}),
    };
  }

  private cleanupIdentity(
    context: ExecutionContext,
    deployment: Deployment,
  ): Result<{ namespace: string; receipt: string; storageScopeReceipt?: string }> {
    const state = requireServerBackedDeploymentState(deployment, "kubernetes cleanup identity");
    const metadata = state.runtimePlan.execution.metadata;
    if (metadata?.["kubernetes.namespace"] && metadata["kubernetes.receipt"]) {
      return ok({
        namespace: metadata["kubernetes.namespace"],
        receipt: metadata["kubernetes.receipt"],
        ...(metadata["kubernetes.storageScopeReceipt"]
          ? { storageScopeReceipt: metadata["kubernetes.storageScopeReceipt"] }
          : {}),
      });
    }
    return renderKubernetesRuntimeIntent({
      runtimePlan: state.runtimePlan,
      environmentSnapshot: state.environmentSnapshot,
      identity: {
        organizationId: organizationId(context),
        projectId: state.projectId.value,
        environmentId: state.environmentId.value,
        resourceId: state.resourceId.value,
        deploymentId: state.id.value,
        targetId: state.serverId.value,
      },
    }).map((intent) => ({
      namespace: intent.namespace,
      receipt: intent.receipt,
      ...(intent.storageScopeReceipt
        ? { storageScopeReceipt: intent.storageScopeReceipt }
        : {}),
    }));
  }

  private async cleanupFailedCandidate(
    context: ExecutionContext,
    targetId: string,
    connection: KubernetesResolvedConnection,
    intent: KubernetesRuntimeIntent,
    timeline: DeploymentTimelineJournalEntry[],
  ): Promise<void> {
    const cleanup = await this.cleanupExact(
      context,
      targetId,
      connection,
      renderKubernetesCleanupPlan(intent),
    );
    if (cleanup.isOk()) {
      timeline.push(...cleanup.value.timeline);
    } else {
      timeline.push(phaseLog("rollback", "Kubernetes candidate cleanup failed", "error"));
    }
  }

  private async cleanupExact(
    context: ExecutionContext,
    targetId: string,
    connection: KubernetesResolvedConnection,
    plan: KubernetesCleanupPlan,
  ): Promise<Result<{ timeline: DeploymentTimelineJournalEntry[] }>> {
    const timeline = [phaseLog("rollback", "verify-candidate-namespace-ownership")];
    const verification = await this.run(
      context,
      targetId,
      connection,
      "verify-candidate-namespace-ownership",
      plan.verifyArgs,
    );
    if (verification.isErr()) return err(verification.error);
    if (verification.value.exitCode !== 0) {
      if (/notfound|not found/i.test(verification.value.stderr)) return ok({ timeline });
      return err(
        domainError.infra("Kubernetes namespace ownership verification failed", {
          phase: "kubernetes-cleanup-ownership",
          namespace: plan.namespace,
        }),
      );
    }
    if (!ownedNamespace(verification.value, plan)) {
      return err(
        domainError.conflict("Kubernetes namespace is not owned by the deployment receipt", {
          phase: "kubernetes-cleanup-ownership",
          namespace: plan.namespace,
        }),
      );
    }
    const deleteStep = plan.storageScopeReceipt
      ? "delete-candidate-receipt-resources"
      : "delete-candidate-namespace";
    const deletion = await this.run(
      context,
      targetId,
      connection,
      deleteStep,
      plan.deleteArgs,
    );
    timeline.push(phaseLog("rollback", deleteStep));
    if (deletion.isErr()) return err(deletion.error);
    if (deletion.value.exitCode !== 0) {
      return err(
        domainError.infra("Kubernetes namespace cleanup failed", {
          phase: "kubernetes-cleanup-delete",
          namespace: plan.namespace,
        }),
      );
    }
    if (plan.residualArgs) {
      const residual = await this.run(
        context,
        targetId,
        connection,
        "verify-candidate-receipt-residual",
        plan.residualArgs,
      );
      timeline.push(phaseLog("rollback", "verify-candidate-receipt-residual"));
      if (residual.isErr()) return err(residual.error);
      if (residual.value.exitCode !== 0 || residual.value.stdout.trim().length > 0) {
        return err(
          domainError.conflict("Kubernetes receipt cleanup left owned residual resources", {
            phase: "kubernetes-cleanup-residual",
            namespace: plan.namespace,
            receipt: plan.receipt,
          }),
        );
      }
    }
    return ok({ timeline });
  }
}
