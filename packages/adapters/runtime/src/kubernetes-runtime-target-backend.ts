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
      namespace.metadata.labels["appaloft.io/receipt"] === plan.receipt
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
    const connectionResult = await this.resolveConnection(targetResult.value);
    if (connectionResult.isErr()) return err(connectionResult.error);

    const state = requireServerBackedDeploymentState(deployment, "kubernetes execution");
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

    const timeline: DeploymentTimelineJournalEntry[] = [];
    const steps: Array<{
      phase: "deploy" | "verify";
      step: string;
      args: string[];
      stdin?: string;
    }> = [
      {
        phase: "deploy",
        step: "apply-candidate-manifest",
        args: ["apply", "--server-side=true", "--field-manager=appaloft", "-f", "-"],
        stdin: JSON.stringify(manifestResult.value),
      },
      {
        phase: "verify",
        step: "wait-candidate-rollout",
        args: [
          "rollout",
          "status",
          `deployment/${intent.workloadName}`,
          "--namespace",
          intent.namespace,
          "--timeout=180s",
        ],
      },
      {
        phase: "verify",
        step: "observe-candidate-deployment",
        args: [
          "get",
          "deployment",
          intent.workloadName,
          "--namespace",
          intent.namespace,
          "-o",
          "json",
        ],
      },
    ];

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
      if (!failed && step.step === "observe-candidate-deployment") {
        const observation = this.deploymentObservationReady(result.value.stdout);
        if (!observation) {
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
            metadata: this.executionMetadata(intent),
          });
        }
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

    timeline.push(phaseLog("deploy", `Kubernetes candidate ${intent.workloadName} converged`));
    return applyExecutionResult(deployment, {
      status: "succeeded",
      exitCode: 0,
      retryable: false,
      timeline,
      metadata: this.executionMetadata(intent),
    });
  }

  async cancel(
    context: ExecutionContext,
    deployment: Deployment,
  ): Promise<Result<{ timeline: DeploymentTimelineJournalEntry[] }>> {
    const targetResult = await this.targetForDeployment(context, deployment);
    if (targetResult.isErr()) return err(targetResult.error);
    const connectionResult = await this.resolveConnection(targetResult.value);
    if (connectionResult.isErr()) return err(connectionResult.error);
    const state = requireServerBackedDeploymentState(deployment, "kubernetes cleanup");
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
    const cleanup = await this.cancel(context, deployment);
    if (cleanup.isErr()) return err(cleanup.error);
    return applyExecutionResult(deployment, {
      status: "rolled-back",
      exitCode: 0,
      retryable: false,
      timeline: cleanup.value.timeline,
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

  private deploymentObservationReady(stdout: string): boolean {
    try {
      const deployment = JSON.parse(stdout) as {
        spec?: { replicas?: number };
        status?: { availableReplicas?: number; observedGeneration?: number };
        metadata?: { generation?: number };
      };
      const desired = deployment.spec?.replicas ?? 1;
      return (
        (deployment.status?.availableReplicas ?? 0) >= desired &&
        (deployment.status?.observedGeneration ?? 0) >= (deployment.metadata?.generation ?? 1)
      );
    } catch {
      return false;
    }
  }

  private executionMetadata(intent: KubernetesRuntimeIntent): Record<string, string> {
    return {
      "kubernetes.namespace": intent.namespace,
      "kubernetes.workloadName": intent.workloadName,
      "kubernetes.receipt": intent.receipt,
      "kubernetes.intentSchemaVersion": intent.schemaVersion,
    };
  }

  private cleanupIdentity(
    context: ExecutionContext,
    deployment: Deployment,
  ): Result<{ namespace: string; receipt: string }> {
    const state = requireServerBackedDeploymentState(deployment, "kubernetes cleanup identity");
    const metadata = state.runtimePlan.execution.metadata;
    if (metadata?.["kubernetes.namespace"] && metadata["kubernetes.receipt"]) {
      return ok({
        namespace: metadata["kubernetes.namespace"],
        receipt: metadata["kubernetes.receipt"],
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
    }).map((intent) => ({ namespace: intent.namespace, receipt: intent.receipt }));
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
    const deletion = await this.run(
      context,
      targetId,
      connection,
      "delete-candidate-namespace",
      plan.deleteArgs,
    );
    timeline.push(phaseLog("rollback", "delete-candidate-namespace"));
    if (deletion.isErr()) return err(deletion.error);
    if (deletion.value.exitCode !== 0) {
      return err(
        domainError.infra("Kubernetes namespace cleanup failed", {
          phase: "kubernetes-cleanup-delete",
          namespace: plan.namespace,
        }),
      );
    }
    return ok({ timeline });
  }
}
