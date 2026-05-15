import { isAbsolute, relative } from "node:path";
import { posix } from "node:path";

const generatedSourceStrategies = new Set([
  "remote-git",
  "git-public",
  "git-github-app",
  "git-deploy-key",
  "dockerfile-inline",
  "docker-compose-inline",
]);

export interface PreviewRuntimeArtifactCleanupPlanInput {
  deploymentId: string;
  buildStrategy: string;
  sourceKind: string;
  executionKind: string;
  imageName: string;
  metadata?: Record<string, string> | undefined;
  runtimeDir?: string | undefined;
  remoteRuntimeRoot?: string | undefined;
  remoteWorkdir?: string | undefined;
}

export interface PreviewRuntimeArtifactCleanupPlan {
  localSourceDir?: string;
  remoteWorkdir?: string;
  imageName?: string;
}

function hasPreviewOwnership(metadata: Record<string, string>): boolean {
  return Boolean(
    metadata["access.sourceFingerprint"] ||
      metadata["context.sourceFingerprint"] ||
      metadata["preview.id"] ||
      metadata["preview.number"] ||
      metadata["preview.mode"],
  );
}

function isLocalChildPath(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path.length > 0 && !path.startsWith("..") && !isAbsolute(path);
}

function normalizeRemotePath(path: string): string {
  return posix.normalize(path.replace(/\/+$/, ""));
}

function isRemoteChildPath(parent: string, child: string): boolean {
  const normalizedParent = normalizeRemotePath(parent);
  const normalizedChild = normalizeRemotePath(child);
  return (
    normalizedChild.length > normalizedParent.length &&
    normalizedChild.startsWith(`${normalizedParent}/`)
  );
}

function canRemoveGeneratedImage(input: PreviewRuntimeArtifactCleanupPlanInput): boolean {
  return (
    input.executionKind === "docker-container" &&
    input.buildStrategy !== "prebuilt-image" &&
    input.sourceKind !== "docker-image"
  );
}

export function createPreviewRuntimeArtifactCleanupPlan(
  input: PreviewRuntimeArtifactCleanupPlanInput,
): PreviewRuntimeArtifactCleanupPlan {
  const metadata = input.metadata ?? {};
  if (!hasPreviewOwnership(metadata)) {
    return {};
  }

  const plan: PreviewRuntimeArtifactCleanupPlan = {};
  const sourceStrategy = metadata.sourceStrategy;
  const sourceDir = metadata.sourceDir;
  if (
    input.runtimeDir &&
    sourceStrategy &&
    sourceDir &&
    generatedSourceStrategies.has(sourceStrategy) &&
    isLocalChildPath(input.runtimeDir, sourceDir)
  ) {
    plan.localSourceDir = sourceDir;
  }

  if (
    input.remoteRuntimeRoot &&
    input.remoteWorkdir &&
    sourceStrategy &&
    sourceStrategy !== "prebuilt-image" &&
    isRemoteChildPath(input.remoteRuntimeRoot, input.remoteWorkdir)
  ) {
    plan.remoteWorkdir = input.remoteWorkdir;
  }

  if (canRemoveGeneratedImage(input)) {
    plan.imageName = input.imageName;
  }

  return plan;
}
