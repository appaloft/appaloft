import { type SourceKind } from "../shared/enums";
import { domainError } from "../shared/errors";
import { err, ok, type Result, safeTry } from "../shared/result";
import { type SourceKindValue } from "../shared/state-machine";
import { type DisplayNameText, type SourceLocator } from "../shared/text-values";
import { ScalarValueObject, ValueObject } from "../shared/value-object";

const gitSourceKinds = [
  "remote-git",
  "git-public",
  "git-github-app",
  "git-deploy-key",
  "local-git",
] as const satisfies readonly SourceKind[];

type GitSourceKind = (typeof gitSourceKinds)[number];

function isGitSourceKind(kind: SourceKind): kind is GitSourceKind {
  return gitSourceKinds.includes(kind as GitSourceKind);
}

function sourceResolutionError(
  message: string,
  details?: Record<string, string | number | boolean>,
) {
  return domainError.validation(message, {
    phase: "resource-source-resolution",
    ...(details ?? {}),
  });
}

function validateRequiredText(value: string, label: string): Result<string> {
  const normalized = value.trim();
  if (!normalized) {
    return err(sourceResolutionError(`${label} is required`));
  }

  return ok(normalized);
}

function isGitHubTreeLocator(locator: string): boolean {
  try {
    const url = new URL(locator);
    const host = url.hostname.toLowerCase();
    const segments = url.pathname.split("/").filter(Boolean);
    return (
      (host === "github.com" || host === "www.github.com") &&
      segments.length >= 4 &&
      segments[2] === "tree"
    );
  } catch {
    return false;
  }
}

function normalizeSourceBaseDirectory(value: string): Result<string> {
  const trimmed = value.trim();
  if (!trimmed) {
    return err(sourceResolutionError("Source base directory is required"));
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) {
    return err(sourceResolutionError("Source base directory must not be a URL"));
  }

  if (/^[a-z]:[\\/]/i.test(trimmed)) {
    return err(sourceResolutionError("Source base directory must not be a host path"));
  }

  if (/[;&|`$<>]/.test(trimmed)) {
    return err(
      sourceResolutionError("Source base directory contains unsupported shell characters"),
    );
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const segments = withLeadingSlash.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    return err(sourceResolutionError("Source base directory must not contain dot segments"));
  }

  if (segments.length === 0) {
    return ok("/");
  }

  return ok(`/${segments.join("/")}`);
}

function validateGitRef(value: string): Result<string> {
  return validateRequiredText(value, "Git ref").andThen((normalized) => {
    if (
      normalized.startsWith("/") ||
      normalized.endsWith("/") ||
      normalized.includes("..") ||
      normalized.includes("@{") ||
      /[\s\\:*?[~^]/.test(normalized)
    ) {
      return err(sourceResolutionError("Git ref has an invalid shape", { gitRef: normalized }));
    }

    return ok(normalized);
  });
}

function validateGitCommitSha(value: string): Result<string> {
  return validateRequiredText(value, "Git commit SHA").andThen((normalized) => {
    if (!/^[a-f0-9]{7,64}$/i.test(normalized)) {
      return err(
        sourceResolutionError("Git commit SHA must be a hexadecimal commit identifier", {
          commitSha: normalized,
        }),
      );
    }

    return ok(normalized);
  });
}

function validateDockerImageTag(value: string): Result<string> {
  return validateRequiredText(value, "Docker image tag").andThen((normalized) => {
    if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/.test(normalized)) {
      return err(
        sourceResolutionError("Docker image tag has an invalid shape", { imageTag: normalized }),
      );
    }

    return ok(normalized);
  });
}

function validateDockerImageDigest(value: string): Result<string> {
  return validateRequiredText(value, "Docker image digest").andThen((normalized) => {
    if (!/^sha256:[a-f0-9]{64}$/i.test(normalized)) {
      return err(
        sourceResolutionError("Docker image digest must be a sha256 digest", {
          imageDigest: normalized,
        }),
      );
    }

    return ok(normalized.toLowerCase());
  });
}

function parseDockerImageReference(locator: string): {
  imageName: string;
  imageTag?: string;
  imageDigest?: string;
} {
  const normalized = locator
    .trim()
    .replace(/^docker:\/\//, "")
    .replace(/^image:\/\//, "");
  const [nameAndMaybeTag = "", digest] = normalized.split("@", 2);
  const lastSlash = nameAndMaybeTag.lastIndexOf("/");
  const lastColon = nameAndMaybeTag.lastIndexOf(":");
  const hasTag = lastColon > lastSlash;
  const imageName = hasTag ? nameAndMaybeTag.slice(0, lastColon) : nameAndMaybeTag;
  const imageTag = hasTag ? nameAndMaybeTag.slice(lastColon + 1) : undefined;

  return {
    imageName,
    ...(imageTag ? { imageTag } : {}),
    ...(digest ? { imageDigest: digest } : {}),
  };
}

const sourceBaseDirectoryBrand: unique symbol = Symbol("SourceBaseDirectory");
export class SourceBaseDirectory extends ScalarValueObject<string> {
  private [sourceBaseDirectoryBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<SourceBaseDirectory> {
    return normalizeSourceBaseDirectory(value).map(
      (normalized) => new SourceBaseDirectory(normalized),
    );
  }

  static rehydrate(value: string): SourceBaseDirectory {
    return new SourceBaseDirectory(value.trim() || "/");
  }

  static root(): SourceBaseDirectory {
    return new SourceBaseDirectory("/");
  }
}

const gitRefBrand: unique symbol = Symbol("GitRefText");
export class GitRefText extends ScalarValueObject<string> {
  private [gitRefBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<GitRefText> {
    return validateGitRef(value).map((normalized) => new GitRefText(normalized));
  }

  static rehydrate(value: string): GitRefText {
    return new GitRefText(value.trim());
  }
}

const gitCommitShaBrand: unique symbol = Symbol("GitCommitShaText");
export class GitCommitShaText extends ScalarValueObject<string> {
  private [gitCommitShaBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<GitCommitShaText> {
    return validateGitCommitSha(value).map((normalized) => new GitCommitShaText(normalized));
  }

  static rehydrate(value: string): GitCommitShaText {
    return new GitCommitShaText(value.trim());
  }
}

const sourceOriginalLocatorBrand: unique symbol = Symbol("SourceOriginalLocator");
export class SourceOriginalLocator extends ScalarValueObject<string> {
  private [sourceOriginalLocatorBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<SourceOriginalLocator> {
    return validateRequiredText(value, "Original source locator").map(
      (normalized) => new SourceOriginalLocator(normalized),
    );
  }

  static rehydrate(value: string): SourceOriginalLocator {
    return new SourceOriginalLocator(value.trim());
  }
}

const sourceRepositoryIdBrand: unique symbol = Symbol("SourceRepositoryId");
export class SourceRepositoryId extends ScalarValueObject<string> {
  private [sourceRepositoryIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<SourceRepositoryId> {
    return validateRequiredText(value, "Repository id").map(
      (normalized) => new SourceRepositoryId(normalized),
    );
  }

  static rehydrate(value: string): SourceRepositoryId {
    return new SourceRepositoryId(value.trim());
  }
}

const sourceRepositoryFullNameBrand: unique symbol = Symbol("SourceRepositoryFullName");
export class SourceRepositoryFullName extends ScalarValueObject<string> {
  private [sourceRepositoryFullNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<SourceRepositoryFullName> {
    return validateRequiredText(value, "Repository full name").map(
      (normalized) => new SourceRepositoryFullName(normalized),
    );
  }

  static rehydrate(value: string): SourceRepositoryFullName {
    return new SourceRepositoryFullName(value.trim());
  }
}

const dockerImageNameBrand: unique symbol = Symbol("DockerImageName");
export class DockerImageName extends ScalarValueObject<string> {
  private [dockerImageNameBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DockerImageName> {
    return validateRequiredText(value, "Docker image name").andThen((normalized) => {
      if (/\s/.test(normalized)) {
        return err(
          sourceResolutionError("Docker image name must not contain whitespace", {
            imageName: normalized,
          }),
        );
      }

      return ok(new DockerImageName(normalized));
    });
  }

  static rehydrate(value: string): DockerImageName {
    return new DockerImageName(value.trim());
  }
}

const dockerImageTagBrand: unique symbol = Symbol("DockerImageTag");
export class DockerImageTag extends ScalarValueObject<string> {
  private [dockerImageTagBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DockerImageTag> {
    return validateDockerImageTag(value).map((normalized) => new DockerImageTag(normalized));
  }

  static rehydrate(value: string): DockerImageTag {
    return new DockerImageTag(value.trim());
  }
}

const dockerImageDigestBrand: unique symbol = Symbol("DockerImageDigest");
export class DockerImageDigest extends ScalarValueObject<string> {
  private [dockerImageDigestBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<DockerImageDigest> {
    return validateDockerImageDigest(value).map((normalized) => new DockerImageDigest(normalized));
  }

  static rehydrate(value: string): DockerImageDigest {
    return new DockerImageDigest(value.trim().toLowerCase());
  }
}

export interface ResourceSourceBindingState {
  kind: SourceKindValue;
  locator: SourceLocator;
  displayName: DisplayNameText;
  gitRef?: GitRefText;
  commitSha?: GitCommitShaText;
  baseDirectory?: SourceBaseDirectory;
  originalLocator?: SourceOriginalLocator;
  repositoryId?: SourceRepositoryId;
  repositoryFullName?: SourceRepositoryFullName;
  defaultBranch?: GitRefText;
  imageName?: DockerImageName;
  imageTag?: DockerImageTag;
  imageDigest?: DockerImageDigest;
  metadata?: Record<string, string>;
}

export class ResourceSourceBinding extends ValueObject<ResourceSourceBindingState> {
  private constructor(state: ResourceSourceBindingState) {
    super(state);
  }

  static create(input: ResourceSourceBindingState): Result<ResourceSourceBinding> {
    return safeTry(function* () {
      const kind = input.kind.value;
      if (isGitSourceKind(kind) && isGitHubTreeLocator(input.locator.value)) {
        return err(
          sourceResolutionError(
            "Git source locator must be a cloneable repository URL, not a GitHub tree URL",
            {
              sourceKind: kind,
              sourceLocator: input.locator.value,
            },
          ),
        );
      }

      if (kind !== "docker-image") {
        return ok(new ResourceSourceBinding(cloneResourceSourceBindingState(input)));
      }

      const parsed = parseDockerImageReference(input.locator.value);
      const imageName = input.imageName ?? (yield* DockerImageName.create(parsed.imageName));
      const imageTag =
        input.imageTag ??
        (parsed.imageTag ? yield* DockerImageTag.create(parsed.imageTag) : undefined);
      const imageDigest =
        input.imageDigest ??
        (parsed.imageDigest ? yield* DockerImageDigest.create(parsed.imageDigest) : undefined);

      if (imageTag && imageDigest) {
        return err(
          sourceResolutionError("Docker image source must not define both tag and digest", {
            imageName: imageName.value,
            imageTag: imageTag.value,
            imageDigest: imageDigest.value,
          }),
        );
      }

      return ok(
        new ResourceSourceBinding(
          cloneResourceSourceBindingState({
            ...input,
            imageName,
            ...(imageTag ? { imageTag } : {}),
            ...(imageDigest ? { imageDigest } : {}),
          }),
        ),
      );
    });
  }

  static rehydrate(state: ResourceSourceBindingState): ResourceSourceBinding {
    return new ResourceSourceBinding(cloneResourceSourceBindingState(state));
  }

  static metadataFromState(state: ResourceSourceBindingState): Record<string, string> | undefined {
    const metadata = {
      ...(state.metadata ?? {}),
      ...(state.gitRef ? { gitRef: state.gitRef.value } : {}),
      ...(state.commitSha ? { commitSha: state.commitSha.value } : {}),
      ...(state.baseDirectory ? { baseDirectory: state.baseDirectory.value } : {}),
      ...(state.originalLocator ? { originalLocator: state.originalLocator.value } : {}),
      ...(state.repositoryId ? { repositoryId: state.repositoryId.value } : {}),
      ...(state.repositoryFullName ? { repositoryFullName: state.repositoryFullName.value } : {}),
      ...(state.defaultBranch ? { defaultBranch: state.defaultBranch.value } : {}),
      ...(state.imageName ? { imageName: state.imageName.value } : {}),
      ...(state.imageTag ? { imageTag: state.imageTag.value } : {}),
      ...(state.imageDigest ? { imageDigest: state.imageDigest.value } : {}),
    };

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  }

  toState(): ResourceSourceBindingState {
    return cloneResourceSourceBindingState(this.state);
  }
}

export function cloneResourceSourceBindingState(
  state: ResourceSourceBindingState,
): ResourceSourceBindingState {
  return {
    kind: state.kind,
    locator: state.locator,
    displayName: state.displayName,
    ...(state.gitRef ? { gitRef: state.gitRef } : {}),
    ...(state.commitSha ? { commitSha: state.commitSha } : {}),
    ...(state.baseDirectory ? { baseDirectory: state.baseDirectory } : {}),
    ...(state.originalLocator ? { originalLocator: state.originalLocator } : {}),
    ...(state.repositoryId ? { repositoryId: state.repositoryId } : {}),
    ...(state.repositoryFullName ? { repositoryFullName: state.repositoryFullName } : {}),
    ...(state.defaultBranch ? { defaultBranch: state.defaultBranch } : {}),
    ...(state.imageName ? { imageName: state.imageName } : {}),
    ...(state.imageTag ? { imageTag: state.imageTag } : {}),
    ...(state.imageDigest ? { imageDigest: state.imageDigest } : {}),
    ...(state.metadata ? { metadata: { ...state.metadata } } : {}),
  };
}
