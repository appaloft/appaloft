import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import type { ExecutionContext } from "@appaloft/application";
import {
  domainError,
  err,
  ok,
  type Result,
  type RuntimePlanState,
} from "@appaloft/core";

import type { KubernetesResolvedConnection } from "./kubernetes-runtime-target-backend";

type RuntimePlanLike = { toState(): RuntimePlanState };

export interface KubernetesHelmIdentityInput {
  organizationId: string;
  projectId: string;
  environmentId: string;
  resourceId: string;
  deploymentId: string;
  targetId: string;
}

export interface KubernetesHelmIntent {
  schemaVersion: "kubernetes.helm-intent/v1";
  namespace: string;
  releaseName: string;
  receipt: string;
  chartReference: string;
  chartVersion: string;
  valuesSecretReferences: string[];
  hookPolicy: "disabled" | "bounded";
  timeoutSeconds: number;
}

export interface KubernetesHelmIntentInput {
  runtimePlan: RuntimePlanLike;
  identity: KubernetesHelmIdentityInput;
}

function digest(value: string, length = 64): string {
  return createHash("sha256").update(value).digest("hex").slice(0, length);
}

function kubernetesName(value: string, fallback: string, maxLength = 63): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safe = normalized || fallback;
  if (safe.length <= maxLength) return safe;
  const suffix = digest(safe, 8);
  return `${safe.slice(0, maxLength - suffix.length - 1).replace(/-+$/g, "")}-${suffix}`;
}

function parseReferences(value: string | undefined): Result<string[]> {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    if (
      !Array.isArray(parsed) ||
      parsed.length > 16 ||
      parsed.some(
        (reference) =>
          typeof reference !== "string" ||
          !/^[a-z][a-z0-9+.-]*:\/\/[^\s]{1,480}$/i.test(reference),
      )
    ) {
      return err(domainError.validation("Helm values references have an unsupported shape"));
    }
    return ok(parsed as string[]);
  } catch {
    return err(domainError.validation("Helm values references are not valid JSON"));
  }
}

export function renderKubernetesHelmIntent(
  input: KubernetesHelmIntentInput,
): Result<KubernetesHelmIntent> {
  const state = input.runtimePlan.toState();
  const metadata = state.execution.metadata ?? {};
  if (
    state.execution.kind !== "helm-release" ||
    state.source.kind !== "helm-chart" ||
    state.target.kind !== "orchestrator-cluster"
  ) {
    return err(
      domainError.runtimeTargetUnsupported("Kubernetes Helm execution requires a typed Helm plan", {
        phase: "kubernetes-helm-intent-resolution",
      }),
    );
  }

  const chartReference = metadata["helm.chartReference"]?.trim();
  const chartVersion = metadata["helm.chartVersion"]?.trim();
  const hookPolicy = metadata["helm.hookPolicy"];
  const timeoutSeconds = Number(metadata["helm.timeoutSeconds"]);
  const references = parseReferences(metadata["helm.valuesSecretReferences"]);
  if (references.isErr()) return err(references.error);
  if (
    !chartReference ||
    (!chartReference.startsWith("oci://") &&
      !chartReference.startsWith("https://") &&
      !chartReference.startsWith("file:///")) ||
    !chartVersion ||
    (hookPolicy !== "disabled" && hookPolicy !== "bounded") ||
    !Number.isInteger(timeoutSeconds) ||
    timeoutSeconds < 30 ||
    timeoutSeconds > 900
  ) {
    return err(
      domainError.validation("Kubernetes Helm plan metadata is incomplete or invalid", {
        phase: "kubernetes-helm-intent-resolution",
      }),
    );
  }

  const stableScope = [
    input.identity.organizationId,
    input.identity.projectId,
    input.identity.environmentId,
    input.identity.resourceId,
    input.identity.targetId,
  ].join(":");
  return ok({
    schemaVersion: "kubernetes.helm-intent/v1",
    namespace: kubernetesName(
      `appaloft-${input.identity.organizationId}-${input.identity.projectId}-${input.identity.environmentId}-${digest(stableScope, 10)}`,
      "appaloft-helm",
    ),
    releaseName: kubernetesName(
      `appaloft-${input.identity.resourceId}-${digest(stableScope, 8)}`,
      "appaloft-release",
      53,
    ),
    receipt: digest(`${stableScope}:${input.identity.deploymentId}`, 32),
    chartReference,
    chartVersion,
    valuesSecretReferences: [...references.value],
    hookPolicy,
    timeoutSeconds,
  });
}

export interface HelmCommandRunnerInput {
  context?: ExecutionContext;
  targetId?: string;
  step: string;
  args: string[];
}

export interface HelmCommandRunnerResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface HelmCommandRunner {
  run(input: HelmCommandRunnerInput): Promise<Result<HelmCommandRunnerResult>>;
}

export class HelmShellCommandRunner implements HelmCommandRunner {
  constructor(private readonly timeoutMs = 15 * 60 * 1_000) {}

  async run(input: HelmCommandRunnerInput): Promise<Result<HelmCommandRunnerResult>> {
    try {
      const process = Bun.spawn(["helm", ...input.args], { stdout: "pipe", stderr: "pipe" });
      const stdoutPromise = new Response(process.stdout).text();
      const stderrPromise = new Response(process.stderr).text();
      let timeout: Timer | undefined;
      const timedOut = new Promise<"timeout">((resolve) => {
        timeout = setTimeout(() => resolve("timeout"), this.timeoutMs);
      });
      const outcome = await Promise.race([process.exited, timedOut]);
      if (timeout) clearTimeout(timeout);
      if (outcome === "timeout") {
        process.kill();
        await Promise.all([stdoutPromise, stderrPromise]);
        return ok({ exitCode: 124, stdout: "", stderr: "Helm command timed out" });
      }
      const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
      return ok({ exitCode: outcome, stdout, stderr });
    } catch (error) {
      return err(
        domainError.infra(error instanceof Error ? error.message : "Helm command failed", {
          phase: "kubernetes-helm-command",
        }),
      );
    }
  }
}

export interface KubernetesResolvedHelmValues {
  filePaths: string[];
  dispose(): Promise<void>;
}

export interface KubernetesHelmValuesResolver {
  resolve(input: {
    context: ExecutionContext;
    targetId: string;
    references: readonly string[];
  }): Promise<Result<KubernetesResolvedHelmValues>>;
}

export class FileKubernetesHelmValuesResolver implements KubernetesHelmValuesResolver {
  async resolve(input: {
    context: ExecutionContext;
    targetId: string;
    references: readonly string[];
  }): Promise<Result<KubernetesResolvedHelmValues>> {
    const filePaths: string[] = [];
    for (const reference of input.references) {
      try {
        const url = new URL(reference);
        if (url.protocol !== "file:") {
          return err(
            domainError.runtimeTargetUnsupported(
              "A credential-aware Helm values resolver is required for non-file references",
              { phase: "kubernetes-helm-values-resolution" },
            ),
          );
        }
        const path = fileURLToPath(url);
        if (!path.startsWith("/")) {
          return err(domainError.validation("Helm values file reference must be absolute"));
        }
        filePaths.push(path);
      } catch {
        return err(domainError.validation("Helm values reference is invalid"));
      }
    }
    return ok({ filePaths, dispose: async () => undefined });
  }
}

interface HelmHistoryEntry {
  revision?: number | string;
  status?: string;
}

function deployedRevision(stdout: string): number | undefined {
  try {
    const entries = JSON.parse(stdout) as HelmHistoryEntry[];
    const revisions = entries
      .filter((entry) => entry.status === "deployed")
      .map((entry) => Number(entry.revision))
      .filter((revision) => Number.isInteger(revision) && revision > 0);
    return revisions.length > 0 ? Math.max(...revisions) : undefined;
  } catch {
    return undefined;
  }
}

function statusRevision(stdout: string): { deployed: boolean; revision?: number } {
  try {
    const status = JSON.parse(stdout) as { info?: { status?: string }; version?: number | string };
    const revision = Number(status.version);
    return {
      deployed: status.info?.status === "deployed",
      ...(Number.isInteger(revision) && revision > 0 ? { revision } : {}),
    };
  } catch {
    return { deployed: false };
  }
}

function connectionArgs(connection: KubernetesResolvedConnection): string[] {
  return [
    "--kubeconfig",
    connection.kubeconfigPath,
    ...(connection.contextName ? ["--kube-context", connection.contextName] : []),
  ];
}

function valuesArgs(filePaths: readonly string[]): string[] {
  return filePaths.flatMap((path) => ["--values", path]);
}

function redactedManifestDigest(manifest: string): string {
  return digest(
    manifest.replace(
      /(^|\n)(data|stringData):\s*\n(?:(?:[ \t]+.*(?:\n|$))*)/g,
      "$1$2:\n  <redacted>\n",
    ),
  );
}

function chartArgument(reference: string): Result<string> {
  if (!reference.startsWith("file:")) return ok(reference);
  try {
    const path = fileURLToPath(reference);
    return path.startsWith("/")
      ? ok(path)
      : err(domainError.validation("Local Helm chart reference must be absolute"));
  } catch {
    return err(domainError.validation("Local Helm chart reference is invalid"));
  }
}

export interface KubernetesHelmDeployResult {
  status: "succeeded" | "failed";
  previousRevision?: number;
  currentRevision?: number;
  rollbackVerified: boolean;
  renderedDigest: string;
  renderedDocumentCount: number;
}

export class KubernetesHelmLifecycle {
  constructor(
    private readonly runner: HelmCommandRunner,
    private readonly valuesResolver: KubernetesHelmValuesResolver,
  ) {}

  async deploy(input: {
    context: ExecutionContext;
    targetId: string;
    connection: KubernetesResolvedConnection;
    intent: KubernetesHelmIntent;
  }): Promise<Result<KubernetesHelmDeployResult>> {
    const resolvedValues = await this.valuesResolver.resolve({
      context: input.context,
      targetId: input.targetId,
      references: input.intent.valuesSecretReferences,
    });
    if (resolvedValues.isErr()) return err(resolvedValues.error);
    const chart = chartArgument(input.intent.chartReference);
    if (chart.isErr()) return err(chart.error);
    const run = async (step: string, args: string[]) =>
      await this.runner.run({
        context: input.context,
        targetId: input.targetId,
        step,
        args: [...connectionArgs(input.connection), ...args],
      });

    try {
      const history = await run("read-helm-history", [
        "history",
        input.intent.releaseName,
        "--namespace",
        input.intent.namespace,
        "--output",
        "json",
      ]);
      const previousRevision = history.isOk() && history.value.exitCode === 0
        ? deployedRevision(history.value.stdout)
        : undefined;
      const previousManifest = previousRevision
        ? await run("read-current-helm-manifest", [
            "get",
            "manifest",
            input.intent.releaseName,
            "--namespace",
            input.intent.namespace,
            "--revision",
            String(previousRevision),
          ])
        : undefined;
      const previousManifestDigest =
        previousManifest?.isOk() && previousManifest.value.exitCode === 0
          ? redactedManifestDigest(previousManifest.value.stdout)
          : undefined;
      const commonChartArgs = [
        input.intent.releaseName,
        chart.value,
        "--namespace",
        input.intent.namespace,
        "--version",
        input.intent.chartVersion,
        ...valuesArgs(resolvedValues.value.filePaths),
        ...(input.intent.hookPolicy === "disabled" ? ["--no-hooks"] : []),
      ];
      const rendered = await run("render-helm-diff", ["template", ...commonChartArgs, "--include-crds"]);
      if (rendered.isErr()) return err(rendered.error);
      if (rendered.value.exitCode !== 0) {
        return err(
          domainError.infra("Helm chart rendering failed", {
            phase: "kubernetes-helm-render",
          }),
        );
      }
      const renderedDocumentCount = rendered.value.stdout
        .split(/^---\s*$/m)
        .filter((document) => document.trim().length > 0).length;
      const renderedDigest = redactedManifestDigest(rendered.value.stdout);

      const applied = await run("apply-helm-release", [
        "upgrade",
        ...commonChartArgs,
        "--install",
        "--create-namespace",
        "--atomic",
        "--wait",
        "--timeout",
        `${input.intent.timeoutSeconds}s`,
        "--description",
        `appaloft-receipt:${input.intent.receipt}`,
      ]);
      if (applied.isErr()) return err(applied.error);
      const verified = await run("verify-helm-release", [
        "status",
        input.intent.releaseName,
        "--namespace",
        input.intent.namespace,
        "--output",
        "json",
      ]);
      if (verified.isErr()) return err(verified.error);
      const observed = statusRevision(verified.value.stdout);
      const succeeded = applied.value.exitCode === 0 && verified.value.exitCode === 0 && observed.deployed;
      const rolledBackManifest =
        !succeeded && previousManifestDigest
          ? await run("read-rolled-back-helm-manifest", [
              "get",
              "manifest",
              input.intent.releaseName,
              "--namespace",
              input.intent.namespace,
            ])
          : undefined;
      const rollbackVerified = Boolean(
        !succeeded &&
          previousRevision !== undefined &&
          observed.deployed &&
          previousManifestDigest &&
          rolledBackManifest?.isOk() &&
          rolledBackManifest.value.exitCode === 0 &&
          redactedManifestDigest(rolledBackManifest.value.stdout) === previousManifestDigest,
      );
      return ok({
        status: succeeded ? "succeeded" : "failed",
        ...(previousRevision ? { previousRevision } : {}),
        ...(observed.revision ? { currentRevision: observed.revision } : {}),
        rollbackVerified,
        renderedDigest,
        renderedDocumentCount,
      });
    } finally {
      await resolvedValues.value.dispose();
    }
  }

  async uninstall(input: {
    context: ExecutionContext;
    targetId: string;
    connection: KubernetesResolvedConnection;
    intent: KubernetesHelmIntent;
  }): Promise<Result<void>> {
    const result = await this.runner.run({
      context: input.context,
      targetId: input.targetId,
      step: "uninstall-helm-release",
      args: [
        ...connectionArgs(input.connection),
        "uninstall",
        input.intent.releaseName,
        "--namespace",
        input.intent.namespace,
        "--cascade",
        "foreground",
        "--wait",
        "--timeout",
        `${input.intent.timeoutSeconds}s`,
      ],
    });
    if (result.isErr()) return err(result.error);
    if (result.value.exitCode !== 0 && !/release: not found/i.test(result.value.stderr)) {
      return err(
        domainError.infra("Helm release cleanup failed", {
          phase: "kubernetes-helm-cleanup",
        }),
      );
    }
    return ok(undefined);
  }

  async rollback(input: {
    context: ExecutionContext;
    targetId: string;
    connection: KubernetesResolvedConnection;
    intent: KubernetesHelmIntent;
  }): Promise<Result<number | undefined>> {
    const run = async (step: string, args: string[]) =>
      await this.runner.run({
        context: input.context,
        targetId: input.targetId,
        step,
        args: [...connectionArgs(input.connection), ...args],
      });
    const history = await run("read-helm-history", [
      "history",
      input.intent.releaseName,
      "--namespace",
      input.intent.namespace,
      "--output",
      "json",
    ]);
    if (history.isErr()) return err(history.error);
    if (history.value.exitCode !== 0) {
      return err(domainError.infra("Helm release history is unavailable", {
        phase: "kubernetes-helm-rollback",
      }));
    }
    let revisions: number[] = [];
    try {
      revisions = (JSON.parse(history.value.stdout) as HelmHistoryEntry[])
        .map((entry) => Number(entry.revision))
        .filter((revision) => Number.isInteger(revision) && revision > 0)
        .sort((left, right) => right - left);
    } catch {
      return err(domainError.infra("Helm release history is invalid", {
        phase: "kubernetes-helm-rollback",
      }));
    }
    const targetRevision = revisions[1];
    if (!targetRevision) {
      const uninstalled = await this.uninstall(input);
      return uninstalled.map(() => undefined);
    }
    const rolledBack = await run("rollback-helm-release", [
      "rollback",
      input.intent.releaseName,
      String(targetRevision),
      "--namespace",
      input.intent.namespace,
      "--wait",
      "--timeout",
      `${input.intent.timeoutSeconds}s`,
      ...(input.intent.hookPolicy === "disabled" ? ["--no-hooks"] : []),
    ]);
    if (rolledBack.isErr()) return err(rolledBack.error);
    if (rolledBack.value.exitCode !== 0) {
      return err(domainError.infra("Helm release rollback failed", {
        phase: "kubernetes-helm-rollback",
      }));
    }
    const verified = await run("verify-helm-release", [
      "status",
      input.intent.releaseName,
      "--namespace",
      input.intent.namespace,
      "--output",
      "json",
    ]);
    if (verified.isErr()) return err(verified.error);
    const status = statusRevision(verified.value.stdout);
    if (verified.value.exitCode !== 0 || !status.deployed) {
      return err(domainError.infra("Helm rollback readback did not converge", {
        phase: "kubernetes-helm-rollback-proof",
      }));
    }
    return ok(targetRevision);
  }
}
