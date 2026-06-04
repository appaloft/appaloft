import { domainError } from "./errors";
import { err, ok, type Result } from "./result";
import { ScalarValueObject, ValueObject } from "./value-object";

export const versionSourceKinds = [
  "git",
  "docker-image",
  "static-artifact",
  "blueprint",
  "dependency-resource",
  "generic",
  "unknown",
] as const;

export const versionReferenceKinds = [
  "branch",
  "tag",
  "commit-sha",
  "image-tag",
  "image-digest",
  "content-digest",
  "release",
  "literal",
  "unknown",
] as const;

export type VersionSourceKind = (typeof versionSourceKinds)[number];
export type VersionReferenceKind = (typeof versionReferenceKinds)[number];

function versionError(message: string, details?: Record<string, string | number | boolean>) {
  return domainError.validation(message, {
    phase: "version-resolution",
    ...(details ?? {}),
  });
}

function validateVersionText(value: string, label: string): Result<string> {
  const normalized = value.trim();
  if (!normalized) {
    return err(versionError(`${label} is required`));
  }

  if (
    Array.from(normalized).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    return err(versionError(`${label} must be a single line of printable text`));
  }

  if (normalized.length > 512) {
    return err(versionError(`${label} must be at most 512 characters`));
  }

  return ok(normalized);
}

function validateVersionEnum<TValue extends string>(
  value: string,
  allowed: readonly TValue[],
  label: string,
): Result<TValue> {
  const match = allowed.find((candidate) => candidate === value);
  if (!match) {
    return err(versionError(`${label} must be one of ${allowed.join(", ")}`, { value }));
  }

  return ok(match);
}

const sourceVersionTextBrand: unique symbol = Symbol("SourceVersionText");
export class SourceVersionText extends ScalarValueObject<string> {
  private [sourceVersionTextBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<SourceVersionText> {
    return validateVersionText(value, "Version text").map(
      (normalized) => new SourceVersionText(normalized),
    );
  }

  static rehydrate(value: string): SourceVersionText {
    return new SourceVersionText(value.trim());
  }
}

const versionSourceKindBrand: unique symbol = Symbol("VersionSourceKindValue");
export class VersionSourceKindValue extends ScalarValueObject<VersionSourceKind> {
  private [versionSourceKindBrand]!: void;

  private constructor(value: VersionSourceKind) {
    super(value);
  }

  static create(value: string): Result<VersionSourceKindValue> {
    return validateVersionEnum(value, versionSourceKinds, "Version source kind").map(
      (validated) => new VersionSourceKindValue(validated),
    );
  }

  static rehydrate(value: VersionSourceKind): VersionSourceKindValue {
    return new VersionSourceKindValue(value);
  }
}

const versionReferenceKindBrand: unique symbol = Symbol("VersionReferenceKindValue");
export class VersionReferenceKindValue extends ScalarValueObject<VersionReferenceKind> {
  private [versionReferenceKindBrand]!: void;

  private constructor(value: VersionReferenceKind) {
    super(value);
  }

  static create(value: string): Result<VersionReferenceKindValue> {
    return validateVersionEnum(value, versionReferenceKinds, "Version reference kind").map(
      (validated) => new VersionReferenceKindValue(validated),
    );
  }

  static rehydrate(value: VersionReferenceKind): VersionReferenceKindValue {
    return new VersionReferenceKindValue(value);
  }

  isFloating(): boolean {
    return this.value === "branch" || this.value === "image-tag" || this.value === "tag";
  }

  isImmutable(): boolean {
    return (
      this.value === "commit-sha" ||
      this.value === "image-digest" ||
      this.value === "content-digest"
    );
  }
}

export interface VersionReferenceState {
  sourceKind: VersionSourceKindValue;
  referenceKind: VersionReferenceKindValue;
  value: SourceVersionText;
}

function allowedReferenceKindsForSource(
  sourceKind: VersionSourceKind,
): readonly VersionReferenceKind[] {
  switch (sourceKind) {
    case "git":
      return ["branch", "tag", "commit-sha", "release"];
    case "docker-image":
      return ["image-tag", "image-digest"];
    case "static-artifact":
      return ["content-digest"];
    case "blueprint":
      return ["tag", "release", "literal", "content-digest"];
    case "dependency-resource":
      return ["tag", "release", "literal", "content-digest"];
    case "generic":
      return ["literal", "tag", "release", "content-digest"];
    case "unknown":
      return ["unknown"];
  }

  const unhandled: never = sourceKind;
  return unhandled;
}

function inferReferenceKindForSource(input: {
  sourceKind: VersionSourceKind;
  value: string;
}): Result<VersionReferenceKind> {
  const value = input.value.trim();

  switch (input.sourceKind) {
    case "git":
      if (/^[0-9a-f]{40}$/i.test(value)) {
        return ok("commit-sha");
      }

      if (
        value.startsWith("refs/tags/") ||
        /^v?\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?$/.test(value)
      ) {
        return ok("tag");
      }

      return ok("branch");
    case "docker-image":
      return ok(/^sha256:[0-9a-f]{64}$/i.test(value) ? "image-digest" : "image-tag");
    case "static-artifact":
      return err(
        versionError("Static artifact versions are detected from content digest", {
          sourceKind: input.sourceKind,
        }),
      );
    case "blueprint":
    case "dependency-resource":
    case "generic":
      if (/^sha256:[0-9a-f]{64}$/i.test(value)) {
        return ok("content-digest");
      }

      if (
        value.startsWith("release:") ||
        value.startsWith("refs/releases/") ||
        /^release[-/]/.test(value)
      ) {
        return ok("release");
      }

      if (/^v?\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?$/.test(value)) {
        return ok("tag");
      }

      return ok("literal");
    case "unknown":
      return ok("unknown");
  }

  const unhandled: never = input.sourceKind;
  return unhandled;
}

function isFloatingReference(
  sourceKind: VersionSourceKind,
  referenceKind: VersionReferenceKind,
): boolean {
  switch (sourceKind) {
    case "git":
      return referenceKind === "branch" || referenceKind === "tag" || referenceKind === "release";
    case "docker-image":
      return referenceKind === "image-tag";
    case "blueprint":
    case "dependency-resource":
    case "generic":
      return referenceKind === "tag" || referenceKind === "release" || referenceKind === "literal";
    case "static-artifact":
    case "unknown":
      return false;
  }

  const unhandled: never = sourceKind;
  return unhandled;
}

function isImmutableReference(referenceKind: VersionReferenceKind): boolean {
  return (
    referenceKind === "commit-sha" ||
    referenceKind === "image-digest" ||
    referenceKind === "content-digest"
  );
}

export class VersionReference extends ValueObject<VersionReferenceState> {
  private constructor(state: VersionReferenceState) {
    super(state);
  }

  static create(input: {
    sourceKind: string;
    referenceKind: string;
    value: string;
  }): Result<VersionReference> {
    return VersionSourceKindValue.create(input.sourceKind).andThen((sourceKind) =>
      VersionReferenceKindValue.create(input.referenceKind).andThen((referenceKind) =>
        SourceVersionText.create(input.value).andThen((value) =>
          VersionReference.createFromValues({ sourceKind, referenceKind, value }),
        ),
      ),
    );
  }

  static inferForSource(input: { sourceKind: string; value: string }): Result<VersionReference> {
    return VersionReference.createForSource(input);
  }

  static createForSource(input: {
    sourceKind: string;
    value: string;
    referenceKind?: string;
  }): Result<VersionReference> {
    return VersionSourceKindValue.create(input.sourceKind).andThen((sourceKind) =>
      SourceVersionText.create(input.value).andThen((value) =>
        (input.referenceKind
          ? VersionReferenceKindValue.create(input.referenceKind).map(
              (referenceKind) => referenceKind.value,
            )
          : inferReferenceKindForSource({ sourceKind: sourceKind.value, value: value.value })
        ).andThen((referenceKind) => {
          if (sourceKind.value === "static-artifact") {
            return err(
              versionError("Static artifact versions are detected from content digest", {
                sourceKind: sourceKind.value,
              }),
            );
          }

          return VersionReference.createFromValues({
            sourceKind,
            referenceKind: VersionReferenceKindValue.rehydrate(referenceKind),
            value,
          });
        }),
      ),
    );
  }

  static createDetected(input: {
    sourceKind: string;
    referenceKind: string;
    value: string;
  }): Result<VersionReference> {
    return VersionSourceKindValue.create(input.sourceKind).andThen((sourceKind) =>
      VersionReferenceKindValue.create(input.referenceKind).andThen((referenceKind) =>
        SourceVersionText.create(input.value).andThen((value) =>
          VersionReference.createFromValues({
            sourceKind,
            referenceKind,
            value,
          }),
        ),
      ),
    );
  }

  static createFromValues(state: VersionReferenceState): Result<VersionReference> {
    const allowedReferenceKinds = allowedReferenceKindsForSource(state.sourceKind.value);
    if (!allowedReferenceKinds.includes(state.referenceKind.value)) {
      return err(
        versionError("Version reference kind is not valid for this source kind", {
          sourceKind: state.sourceKind.value,
          referenceKind: state.referenceKind.value,
        }),
      );
    }

    if (state.referenceKind.value === "unknown" && state.sourceKind.value !== "unknown") {
      return err(
        versionError("Unknown version references must use unknown source kind", {
          sourceKind: state.sourceKind.value,
        }),
      );
    }

    if (state.referenceKind.value !== "unknown" && state.value.value.toLowerCase() === "unknown") {
      return err(versionError("Only unknown version references may use unknown as value"));
    }

    return ok(new VersionReference({ ...state }));
  }

  static rehydrate(state: VersionReferenceState): VersionReference {
    return new VersionReference({ ...state });
  }

  static unknown(): VersionReference {
    return new VersionReference({
      sourceKind: VersionSourceKindValue.rehydrate("unknown"),
      referenceKind: VersionReferenceKindValue.rehydrate("unknown"),
      value: SourceVersionText.rehydrate("unknown"),
    });
  }

  get sourceKind(): VersionSourceKind {
    return this.state.sourceKind.value;
  }

  get referenceKind(): VersionReferenceKind {
    return this.state.referenceKind.value;
  }

  get value(): string {
    return this.state.value.value;
  }

  isFloating(): boolean {
    return isFloatingReference(this.sourceKind, this.referenceKind);
  }

  isImmutable(): boolean {
    return isImmutableReference(this.referenceKind);
  }

  equals(other: VersionReference): boolean {
    return (
      this.sourceKind === other.sourceKind &&
      this.referenceKind === other.referenceKind &&
      this.value === other.value
    );
  }

  toState(): VersionReferenceState {
    return { ...this.state };
  }
}

export interface VersionState {
  reference: VersionReference;
  fixedIdentifier?: VersionReference;
  aliases: VersionReference[];
  detected: boolean;
}

export class Version extends ValueObject<VersionState> {
  private constructor(state: VersionState) {
    super(state);
  }

  static fixed(input: {
    reference?: VersionReference;
    fixedIdentifier: VersionReference;
    aliases?: VersionReference[];
    detected?: boolean;
  }): Result<Version> {
    if (!input.fixedIdentifier.isImmutable()) {
      return err(
        versionError("Fixed version identifier must be immutable", {
          referenceKind: input.fixedIdentifier.referenceKind,
        }),
      );
    }

    return Version.create({
      reference: input.reference ?? input.fixedIdentifier,
      fixedIdentifier: input.fixedIdentifier,
      aliases: input.aliases ?? [],
      detected: input.detected ?? true,
    });
  }

  static floating(input: {
    reference: VersionReference;
    aliases?: VersionReference[];
  }): Result<Version> {
    if (!input.reference.isFloating()) {
      return err(
        versionError("Floating version must use a floating reference", {
          referenceKind: input.reference.referenceKind,
        }),
      );
    }

    return Version.create({
      reference: input.reference,
      aliases: input.aliases ?? [],
      detected: false,
    });
  }

  static unknown(): Version {
    return new Version({
      reference: VersionReference.unknown(),
      aliases: [],
      detected: false,
    });
  }

  static create(state: VersionState): Result<Version> {
    if (state.reference.referenceKind === "unknown") {
      if (state.fixedIdentifier || state.aliases.length > 0 || state.detected) {
        return err(versionError("Unknown version must not carry fixed identifiers or aliases"));
      }

      return ok(Version.unknown());
    }

    if (state.fixedIdentifier && !state.fixedIdentifier.isImmutable()) {
      return err(
        versionError("Fixed version identifier must be immutable", {
          referenceKind: state.fixedIdentifier.referenceKind,
        }),
      );
    }

    const aliases = dedupeVersionReferences([
      ...state.aliases,
      ...(state.fixedIdentifier && !state.fixedIdentifier.equals(state.reference)
        ? [state.fixedIdentifier]
        : []),
    ]);

    return ok(
      new Version({
        reference: state.reference,
        ...(state.fixedIdentifier ? { fixedIdentifier: state.fixedIdentifier } : {}),
        aliases,
        detected: state.detected,
      }),
    );
  }

  static rehydrate(state: VersionState | undefined): Version {
    if (!state) {
      return Version.unknown();
    }

    return new Version({
      reference: state.reference,
      ...(state.fixedIdentifier ? { fixedIdentifier: state.fixedIdentifier } : {}),
      aliases: [...(state.aliases ?? [])],
      detected: state.detected ?? false,
    });
  }

  get reference(): VersionReference {
    return this.state.reference;
  }

  get fixedIdentifier(): VersionReference | undefined {
    return this.state.fixedIdentifier;
  }

  get aliases(): VersionReference[] {
    return [...this.state.aliases];
  }

  get detected(): boolean {
    return this.state.detected;
  }

  isUnknown(): boolean {
    return this.state.reference.referenceKind === "unknown";
  }

  isFixed(): boolean {
    return Boolean(this.state.fixedIdentifier);
  }

  isFixedForDeployment(): boolean {
    return this.isFixed() || this.isUnknown();
  }

  referencesSameVersion(other: VersionReference): boolean {
    return (
      this.state.reference.equals(other) ||
      Boolean(this.state.fixedIdentifier?.equals(other)) ||
      this.state.aliases.some((alias) => alias.equals(other))
    );
  }

  toState(): VersionState {
    return {
      reference: this.state.reference,
      ...(this.state.fixedIdentifier ? { fixedIdentifier: this.state.fixedIdentifier } : {}),
      aliases: [...this.state.aliases],
      detected: this.state.detected,
    };
  }
}

export interface SourceVersionResolution {
  version: Version;
  reasoning: string[];
}

abstract class SourceVersionResolver {
  protected abstract readonly sourceKind: VersionSourceKind;

  protected validateRequestedVersion(requestedVersion: VersionReference | undefined): Result<void> {
    if (!requestedVersion || requestedVersion.sourceKind === this.sourceKind) {
      return ok(undefined);
    }

    return err(
      versionError("Requested version source kind must match source kind", {
        sourceKind: this.sourceKind,
        versionSourceKind: requestedVersion.sourceKind,
      }),
    );
  }

  protected reference(
    referenceKind: VersionReferenceKind,
    value: string | undefined,
  ): Result<VersionReference | undefined> {
    if (!value) {
      return ok(undefined);
    }

    return VersionReference.create({
      sourceKind: this.sourceKind,
      referenceKind,
      value,
    });
  }

  protected fixed(input: {
    reference?: VersionReference;
    fixedIdentifier: VersionReference;
    aliases?: Array<VersionReference | undefined>;
    reasoning: string;
  }): Result<SourceVersionResolution> {
    return Version.fixed({
      reference: input.reference ?? input.fixedIdentifier,
      fixedIdentifier: input.fixedIdentifier,
      aliases: (input.aliases ?? []).filter((item): item is VersionReference => Boolean(item)),
    }).map((version) => ({
      version,
      reasoning: [input.reasoning],
    }));
  }

  abstract resolve(input: {
    metadata?: Record<string, string>;
    requestedVersion?: VersionReference;
  }): Result<SourceVersionResolution>;
}

export class GitSourceVersion extends SourceVersionResolver {
  protected readonly sourceKind = "git" as const;

  resolve(input: {
    metadata?: Record<string, string>;
    requestedVersion?: VersionReference;
  }): Result<SourceVersionResolution> {
    const requestedVersion = this.validateRequestedVersion(input.requestedVersion);
    if (requestedVersion.isErr()) return err(requestedVersion.error);

    const metadata = input.metadata ?? {};
    const commit = this.reference("commit-sha", metadata.commitSha);
    if (commit.isErr()) return err(commit.error);

    if (commit.value) {
      const gitRef = this.reference("branch", metadata.gitRef);
      if (gitRef.isErr()) return err(gitRef.error);

      return this.fixed({
        reference: input.requestedVersion ?? gitRef.value ?? commit.value,
        fixedIdentifier: commit.value,
        aliases: [input.requestedVersion, gitRef.value],
        reasoning: "Resolved fixed Git version from commit SHA metadata",
      });
    }

    if (input.requestedVersion?.isImmutable()) {
      return this.fixed({
        reference: input.requestedVersion,
        fixedIdentifier: input.requestedVersion,
        reasoning: "Accepted immutable requested Git version",
      });
    }

    return ok({
      version: Version.unknown(),
      reasoning: ["Git version could not be resolved to an immutable commit"],
    });
  }
}

export class DockerImageSourceVersion extends SourceVersionResolver {
  protected readonly sourceKind = "docker-image" as const;

  resolve(input: {
    metadata?: Record<string, string>;
    requestedVersion?: VersionReference;
  }): Result<SourceVersionResolution> {
    const requestedVersion = this.validateRequestedVersion(input.requestedVersion);
    if (requestedVersion.isErr()) return err(requestedVersion.error);

    const metadata = input.metadata ?? {};
    const digest = this.reference("image-digest", metadata.imageDigest);
    if (digest.isErr()) return err(digest.error);

    if (digest.value) {
      const tag = this.reference("image-tag", metadata.imageTag);
      if (tag.isErr()) return err(tag.error);

      return this.fixed({
        reference: input.requestedVersion ?? tag.value ?? digest.value,
        fixedIdentifier: digest.value,
        aliases: [input.requestedVersion, tag.value],
        reasoning: "Resolved fixed Docker image version from digest metadata",
      });
    }

    if (input.requestedVersion?.isImmutable()) {
      return this.fixed({
        reference: input.requestedVersion,
        fixedIdentifier: input.requestedVersion,
        reasoning: "Accepted immutable requested Docker image version",
      });
    }

    return ok({
      version: Version.unknown(),
      reasoning: ["Docker image version could not be resolved to an immutable digest"],
    });
  }
}

export class StaticArtifactSourceVersion extends SourceVersionResolver {
  protected readonly sourceKind = "static-artifact" as const;

  resolve(input: {
    metadata?: Record<string, string>;
    requestedVersion?: VersionReference;
  }): Result<SourceVersionResolution> {
    const requestedVersion = this.validateRequestedVersion(input.requestedVersion);
    if (requestedVersion.isErr()) return err(requestedVersion.error);

    const metadata = input.metadata ?? {};
    const digest = this.reference(
      "content-digest",
      metadata.staticArtifactDigest ?? metadata.manifestDigest ?? metadata.contentDigest,
    );
    if (digest.isErr()) return err(digest.error);

    if (digest.value) {
      return this.fixed({
        reference: input.requestedVersion ?? digest.value,
        fixedIdentifier: digest.value,
        aliases: [input.requestedVersion],
        reasoning: "Resolved fixed static artifact version from content digest metadata",
      });
    }

    return ok({
      version: Version.unknown(),
      reasoning: ["Static artifact version could not be resolved to a content digest"],
    });
  }
}

export class GenericSourceVersion extends SourceVersionResolver {
  protected readonly sourceKind = "generic" as const;

  resolve(input: {
    metadata?: Record<string, string>;
    requestedVersion?: VersionReference;
  }): Result<SourceVersionResolution> {
    const requestedVersion = this.validateRequestedVersion(input.requestedVersion);
    if (requestedVersion.isErr()) return err(requestedVersion.error);

    const digest = this.reference("content-digest", input.metadata?.contentDigest);
    if (digest.isErr()) return err(digest.error);

    if (digest.value) {
      return this.fixed({
        reference: input.requestedVersion ?? digest.value,
        fixedIdentifier: digest.value,
        aliases: [input.requestedVersion],
        reasoning: "Resolved fixed generic source version from content digest metadata",
      });
    }

    if (input.requestedVersion?.isImmutable()) {
      return this.fixed({
        reference: input.requestedVersion,
        fixedIdentifier: input.requestedVersion,
        reasoning: "Accepted immutable requested generic source version",
      });
    }

    return ok({
      version: Version.unknown(),
      reasoning: ["Source version could not be resolved to an immutable identity"],
    });
  }
}

export function sourceVersionResolverFor(
  sourceKind: VersionSourceKind,
):
  | GitSourceVersion
  | DockerImageSourceVersion
  | StaticArtifactSourceVersion
  | GenericSourceVersion {
  switch (sourceKind) {
    case "git":
      return new GitSourceVersion();
    case "docker-image":
      return new DockerImageSourceVersion();
    case "static-artifact":
      return new StaticArtifactSourceVersion();
    case "blueprint":
    case "dependency-resource":
    case "generic":
    case "unknown":
      return new GenericSourceVersion();
  }

  const unhandled: never = sourceKind;
  return unhandled;
}

function dedupeVersionReferences(references: VersionReference[]): VersionReference[] {
  const result: VersionReference[] = [];
  for (const reference of references) {
    if (!result.some((existing) => existing.equals(reference))) {
      result.push(reference);
    }
  }

  return result;
}
