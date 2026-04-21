import {
  DisplayNameText,
  DockerImageDigest,
  DockerImageName,
  DockerImageTag,
  domainError,
  err,
  GitCommitShaText,
  GitRefText,
  ok,
  type ResourceSourceBindingState,
  type Result,
  SourceBaseDirectory,
  SourceKindValue,
  SourceLocator,
  SourceOriginalLocator,
  SourceRepositoryFullName,
  SourceRepositoryId,
  safeTry,
} from "@appaloft/core";
import { type z } from "zod";

import { type createResourceSourceBindingInputSchema } from "./create-resource.schema";

type ResourceSourceBindingMapperInput = z.input<typeof createResourceSourceBindingInputSchema>;

const gitSourceInputKinds = [
  "remote-git",
  "git-public",
  "git-github-app",
  "git-deploy-key",
  "local-git",
] as const;

const localPathSourceInputKinds = ["local-folder", "local-git", "compose"] as const;

type GitHubTreeNormalizationMode = "infer" | "require-explicit";

function sourceResolutionError(
  message: string,
  details?: Record<string, string | number | boolean>,
) {
  return domainError.validation(message, {
    phase: "resource-source-resolution",
    ...(details ?? {}),
  });
}

function isGitSourceInputKind(kind: string): boolean {
  return gitSourceInputKinds.some((candidate) => candidate === kind);
}

function parseGitHubTreeLocator(locator: string):
  | {
      repositoryLocator: string;
      treeSegments: string[];
    }
  | undefined {
  try {
    const url = new URL(locator);
    const host = url.hostname.toLowerCase();
    const segments = url.pathname.split("/").filter(Boolean);
    if (
      (host !== "github.com" && host !== "www.github.com") ||
      segments.length < 4 ||
      segments[2] !== "tree"
    ) {
      return undefined;
    }

    const owner = segments[0];
    const repository = segments[1]?.replace(/\.git$/, "");
    if (!owner || !repository) {
      return undefined;
    }

    return {
      repositoryLocator: `${url.protocol}//github.com/${owner}/${repository}`,
      treeSegments: segments.slice(3),
    };
  } catch {
    return undefined;
  }
}

function baseDirectoryForExplicitRef(treeSegments: string[], gitRef: string): string | undefined {
  const refSegments = gitRef.split("/").filter(Boolean);
  const matchesRef = refSegments.every((segment, index) => treeSegments[index] === segment);
  if (!matchesRef) {
    return undefined;
  }

  const remaining = treeSegments.slice(refSegments.length);
  return remaining.length > 0 ? `/${remaining.join("/")}` : "/";
}

function rejectUnsafeSourceField(field: string) {
  return err(
    sourceResolutionError("Source profile contains unsafe or secret material", {
      field,
    }),
  );
}

const unsafeSourceFieldNamePattern =
  /(?:token|secret|password|credential|private|deploy[-_ ]?key|ssh[-_ ]?key|registry[-_ ]?password)/i;
const unsafeSourceValuePattern =
  /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9_]+|xox[baprs]-|AKIA[0-9A-Z]{16})/;

function looksLikeAbsoluteHostPath(value: string): boolean {
  return value.startsWith("/") || /^[a-z]:[\\/]/i.test(value) || value.startsWith("\\\\");
}

function hasUrlCredentialsOrSecretQuery(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.username || url.password) {
      return true;
    }

    for (const key of url.searchParams.keys()) {
      if (unsafeSourceFieldNamePattern.test(key)) {
        return true;
      }
    }
  } catch {
    return false;
  }

  return false;
}

function validateSafeTextField(
  field: string,
  value: string | undefined,
  options?: { rejectAbsoluteHostPath?: boolean },
): Result<void> {
  if (!value) {
    return ok(undefined);
  }

  if (unsafeSourceValuePattern.test(value) || hasUrlCredentialsOrSecretQuery(value)) {
    return rejectUnsafeSourceField(field);
  }

  if (options?.rejectAbsoluteHostPath && looksLikeAbsoluteHostPath(value.trim())) {
    return rejectUnsafeSourceField(field);
  }

  return ok(undefined);
}

function sourceKindAllowsAbsoluteHostPath(kind: string): boolean {
  return localPathSourceInputKinds.some((candidate) => candidate === kind);
}

function validateSafeSourceInput(input: ResourceSourceBindingMapperInput): Result<void> {
  const rejectAbsoluteLocatorHostPath = !sourceKindAllowsAbsoluteHostPath(input.kind);

  for (const [field, value, rejectAbsoluteHostPath] of [
    ["source.locator", input.locator, rejectAbsoluteLocatorHostPath],
    ["source.displayName", input.displayName, false],
    ["source.gitRef", input.gitRef, false],
    ["source.commitSha", input.commitSha, false],
    ["source.baseDirectory", input.baseDirectory, false],
    ["source.originalLocator", input.originalLocator, rejectAbsoluteLocatorHostPath],
    ["source.repositoryId", input.repositoryId, false],
    ["source.repositoryFullName", input.repositoryFullName, false],
    ["source.defaultBranch", input.defaultBranch, false],
    ["source.imageName", input.imageName, false],
    ["source.imageTag", input.imageTag, false],
    ["source.imageDigest", input.imageDigest, false],
  ] as const) {
    const validation = validateSafeTextField(field, value, { rejectAbsoluteHostPath });
    if (validation.isErr()) {
      return err(validation.error);
    }
  }

  for (const [key, value] of Object.entries(input.metadata ?? {})) {
    if (unsafeSourceFieldNamePattern.test(key)) {
      return rejectUnsafeSourceField(`source.metadata.${key}`);
    }

    const validation = validateSafeTextField(`source.metadata.${key}`, value, {
      rejectAbsoluteHostPath:
        rejectAbsoluteLocatorHostPath && (key === "locator" || key === "originalLocator"),
    });
    if (validation.isErr()) {
      return err(validation.error);
    }
  }

  return ok(undefined);
}

function normalizeResourceSourceInput(
  input: ResourceSourceBindingMapperInput,
  gitHubTreeMode: GitHubTreeNormalizationMode,
): Result<ResourceSourceBindingMapperInput> {
  if (!isGitSourceInputKind(input.kind)) {
    return ok(input);
  }

  const parsed = parseGitHubTreeLocator(input.locator);
  if (!parsed) {
    return ok(input);
  }

  const explicitGitRef = input.gitRef ?? input.metadata?.gitRef;
  const explicitBaseDirectory = input.baseDirectory ?? input.metadata?.baseDirectory;

  if (gitHubTreeMode === "require-explicit") {
    if (!explicitGitRef || !explicitBaseDirectory) {
      return err(
        sourceResolutionError(
          "GitHub tree URL source changes require explicit gitRef and baseDirectory",
          {
            sourceLocator: input.locator,
          },
        ),
      );
    }

    return ok({
      ...input,
      locator: parsed.repositoryLocator,
      gitRef: explicitGitRef,
      baseDirectory: explicitBaseDirectory,
      originalLocator: input.originalLocator ?? input.locator,
    });
  }

  const gitRef = explicitGitRef ?? parsed.treeSegments[0];
  if (!gitRef) {
    return err(
      sourceResolutionError("GitHub tree URL must include a branch or tag path", {
        sourceLocator: input.locator,
      }),
    );
  }

  const inferredBaseDirectory =
    explicitBaseDirectory ??
    (explicitGitRef
      ? baseDirectoryForExplicitRef(parsed.treeSegments, explicitGitRef)
      : parsed.treeSegments.length > 1
        ? `/${parsed.treeSegments.slice(1).join("/")}`
        : "/");

  if (!inferredBaseDirectory) {
    return err(
      sourceResolutionError("GitHub tree URL ref does not match the supplied gitRef", {
        sourceLocator: input.locator,
        gitRef,
      }),
    );
  }

  return ok({
    ...input,
    locator: parsed.repositoryLocator,
    gitRef,
    baseDirectory: inferredBaseDirectory,
    originalLocator: input.originalLocator ?? input.locator,
  });
}

export function resourceSourceBindingFromInput(
  input: ResourceSourceBindingMapperInput,
  options?: { gitHubTreeMode?: GitHubTreeNormalizationMode },
): Result<ResourceSourceBindingState> {
  return safeTry(function* () {
    yield* validateSafeSourceInput(input);
    const normalizedSourceInput = yield* normalizeResourceSourceInput(
      input,
      options?.gitHubTreeMode ?? "infer",
    );
    yield* validateSafeSourceInput(normalizedSourceInput);

    const sourceKind = yield* SourceKindValue.create(normalizedSourceInput.kind);
    const sourceLocator = yield* SourceLocator.create(normalizedSourceInput.locator);
    const sourceDisplayName = yield* DisplayNameText.create(
      normalizedSourceInput.displayName ?? normalizedSourceInput.locator,
    );
    const metadata = normalizedSourceInput.metadata;
    const gitRef = normalizedSourceInput.gitRef ?? metadata?.gitRef;
    const commitSha = normalizedSourceInput.commitSha ?? metadata?.commitSha;
    const baseDirectory = normalizedSourceInput.baseDirectory ?? metadata?.baseDirectory;
    const originalLocator = normalizedSourceInput.originalLocator ?? metadata?.originalLocator;
    const repositoryId = normalizedSourceInput.repositoryId ?? metadata?.repositoryId;
    const repositoryFullName =
      normalizedSourceInput.repositoryFullName ?? metadata?.repositoryFullName;
    const defaultBranch = normalizedSourceInput.defaultBranch ?? metadata?.defaultBranch;
    const imageName = normalizedSourceInput.imageName ?? metadata?.imageName;
    const imageTag = normalizedSourceInput.imageTag ?? metadata?.imageTag;
    const imageDigest = normalizedSourceInput.imageDigest ?? metadata?.imageDigest;

    return ok({
      kind: sourceKind,
      locator: sourceLocator,
      displayName: sourceDisplayName,
      ...(gitRef ? { gitRef: yield* GitRefText.create(gitRef) } : {}),
      ...(commitSha ? { commitSha: yield* GitCommitShaText.create(commitSha) } : {}),
      ...(baseDirectory ? { baseDirectory: yield* SourceBaseDirectory.create(baseDirectory) } : {}),
      ...(originalLocator
        ? { originalLocator: yield* SourceOriginalLocator.create(originalLocator) }
        : {}),
      ...(repositoryId ? { repositoryId: yield* SourceRepositoryId.create(repositoryId) } : {}),
      ...(repositoryFullName
        ? { repositoryFullName: yield* SourceRepositoryFullName.create(repositoryFullName) }
        : {}),
      ...(defaultBranch ? { defaultBranch: yield* GitRefText.create(defaultBranch) } : {}),
      ...(imageName ? { imageName: yield* DockerImageName.create(imageName) } : {}),
      ...(imageTag ? { imageTag: yield* DockerImageTag.create(imageTag) } : {}),
      ...(imageDigest ? { imageDigest: yield* DockerImageDigest.create(imageDigest) } : {}),
      ...(metadata ? { metadata: { ...metadata } } : {}),
    });
  });
}
