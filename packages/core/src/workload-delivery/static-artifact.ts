import { domainError } from "../shared/errors";
import { type ProjectId, type ResourceId } from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import { type ProviderKey } from "../shared/text-values";
import { ScalarValueObject, ValueObject } from "../shared/value-object";

function requireText(value: string, label: string): Result<string> {
  const normalized = value.trim();
  if (!normalized) {
    return err(domainError.validation(`${label} is required`));
  }
  return ok(normalized);
}

function requirePositiveInteger(value: number, label: string): Result<number> {
  if (!Number.isInteger(value) || value < 1) {
    return err(domainError.validation(`${label} must be a positive integer`));
  }
  return ok(value);
}

function requireNonNegativeInteger(value: number, label: string): Result<number> {
  if (!Number.isInteger(value) || value < 0) {
    return err(domainError.validation(`${label} must be a non-negative integer`));
  }
  return ok(value);
}

const staticArtifactIdBrand: unique symbol = Symbol("StaticArtifactId");
export class StaticArtifactId extends ScalarValueObject<string> {
  private [staticArtifactIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<StaticArtifactId> {
    return requireText(value, "Static artifact ID").map(
      (normalized) => new StaticArtifactId(normalized),
    );
  }

  static rehydrate(value: string): StaticArtifactId {
    return new StaticArtifactId(value.trim());
  }
}

const staticArtifactPublicationIdBrand: unique symbol = Symbol("StaticArtifactPublicationId");
export class StaticArtifactPublicationId extends ScalarValueObject<string> {
  private [staticArtifactPublicationIdBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<StaticArtifactPublicationId> {
    return requireText(value, "Static artifact publication ID").map(
      (normalized) => new StaticArtifactPublicationId(normalized),
    );
  }

  static rehydrate(value: string): StaticArtifactPublicationId {
    return new StaticArtifactPublicationId(value.trim());
  }
}

const staticArtifactDigestBrand: unique symbol = Symbol("StaticArtifactDigest");
export class StaticArtifactDigest extends ScalarValueObject<string> {
  private [staticArtifactDigestBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<StaticArtifactDigest> {
    return requireText(value, "Static artifact digest").map(
      (normalized) => new StaticArtifactDigest(normalized),
    );
  }

  static rehydrate(value: string): StaticArtifactDigest {
    return new StaticArtifactDigest(value.trim());
  }
}

const staticArtifactStorageRefBrand: unique symbol = Symbol("StaticArtifactStorageRef");
export class StaticArtifactStorageRef extends ScalarValueObject<string> {
  private [staticArtifactStorageRefBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<StaticArtifactStorageRef> {
    return requireText(value, "Static artifact storage reference").map(
      (normalized) => new StaticArtifactStorageRef(normalized),
    );
  }

  static rehydrate(value: string): StaticArtifactStorageRef {
    return new StaticArtifactStorageRef(value.trim());
  }
}

const staticArtifactRouteUrlBrand: unique symbol = Symbol("StaticArtifactRouteUrl");
export class StaticArtifactRouteUrl extends ScalarValueObject<string> {
  private [staticArtifactRouteUrlBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<StaticArtifactRouteUrl> {
    return requireText(value, "Static artifact route URL")
      .andThen((normalized) =>
        /^https?:\/\//i.test(normalized)
          ? ok(normalized)
          : err(domainError.validation("Static artifact route URL must be an HTTP(S) URL")),
      )
      .map((normalized) => new StaticArtifactRouteUrl(normalized));
  }

  static rehydrate(value: string): StaticArtifactRouteUrl {
    return new StaticArtifactRouteUrl(value.trim());
  }
}

const staticArtifactMimeTypeBrand: unique symbol = Symbol("StaticArtifactMimeType");
export class StaticArtifactMimeType extends ScalarValueObject<string> {
  private [staticArtifactMimeTypeBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<StaticArtifactMimeType> {
    return requireText(value, "Static artifact MIME type")
      .andThen((normalized) =>
        /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(normalized)
          ? ok(normalized.toLowerCase())
          : err(domainError.validation("Static artifact MIME type must be a type/subtype value")),
      )
      .map((normalized) => new StaticArtifactMimeType(normalized));
  }

  static rehydrate(value: string): StaticArtifactMimeType {
    return new StaticArtifactMimeType(value.trim().toLowerCase());
  }
}

const staticArtifactByteSizeBrand: unique symbol = Symbol("StaticArtifactByteSize");
export class StaticArtifactByteSize extends ScalarValueObject<number> {
  private [staticArtifactByteSizeBrand]!: void;

  private constructor(value: number) {
    super(value);
  }

  static create(value: number): Result<StaticArtifactByteSize> {
    return requireNonNegativeInteger(value, "Static artifact byte size").map(
      (validated) => new StaticArtifactByteSize(validated),
    );
  }

  static rehydrate(value: number): StaticArtifactByteSize {
    return new StaticArtifactByteSize(value);
  }
}

const staticArtifactFileCountBrand: unique symbol = Symbol("StaticArtifactFileCount");
export class StaticArtifactFileCount extends ScalarValueObject<number> {
  private [staticArtifactFileCountBrand]!: void;

  private constructor(value: number) {
    super(value);
  }

  static create(value: number): Result<StaticArtifactFileCount> {
    return requirePositiveInteger(value, "Static artifact file count").map(
      (validated) => new StaticArtifactFileCount(validated),
    );
  }

  static rehydrate(value: number): StaticArtifactFileCount {
    return new StaticArtifactFileCount(value);
  }
}

export interface StaticArtifactFileDigestState {
  pathDigest: StaticArtifactDigest;
  contentDigest: StaticArtifactDigest;
  sizeBytes: StaticArtifactByteSize;
  mimeType: StaticArtifactMimeType;
}

export class StaticArtifactFileDigest extends ValueObject<StaticArtifactFileDigestState> {
  private constructor(state: StaticArtifactFileDigestState) {
    super(state);
  }

  static create(input: StaticArtifactFileDigestState): Result<StaticArtifactFileDigest> {
    return ok(new StaticArtifactFileDigest(input));
  }

  static rehydrate(state: StaticArtifactFileDigestState): StaticArtifactFileDigest {
    return new StaticArtifactFileDigest(state);
  }

  get sizeBytes(): number {
    return this.state.sizeBytes.value;
  }

  toState(): StaticArtifactFileDigestState {
    return { ...this.state };
  }
}

export interface StaticArtifactManifestState {
  artifactId: StaticArtifactId;
  manifestDigest: StaticArtifactDigest;
  fileCount: StaticArtifactFileCount;
  totalBytes: StaticArtifactByteSize;
  files: StaticArtifactFileDigest[];
}

export class StaticArtifactManifest extends ValueObject<StaticArtifactManifestState> {
  private constructor(state: StaticArtifactManifestState) {
    super(state);
  }

  static create(input: StaticArtifactManifestState): Result<StaticArtifactManifest> {
    if (input.files.length !== input.fileCount.value) {
      return err(
        domainError.validation("Static artifact file count must match file digest count", {
          fileCount: input.fileCount.value,
          fileDigestCount: input.files.length,
        }),
      );
    }

    const totalBytes = input.files.reduce((sum, file) => sum + file.sizeBytes, 0);
    if (totalBytes !== input.totalBytes.value) {
      return err(
        domainError.validation("Static artifact total bytes must match file digest bytes", {
          totalBytes: input.totalBytes.value,
          fileDigestBytes: totalBytes,
        }),
      );
    }

    return ok(new StaticArtifactManifest(input));
  }

  static rehydrate(state: StaticArtifactManifestState): StaticArtifactManifest {
    return new StaticArtifactManifest(state);
  }

  get artifactId(): string {
    return this.state.artifactId.value;
  }

  get manifestDigest(): string {
    return this.state.manifestDigest.value;
  }

  get totalBytes(): number {
    return this.state.totalBytes.value;
  }

  toState(): StaticArtifactManifestState {
    return {
      ...this.state,
      files: [...this.state.files],
    };
  }
}

export interface StaticArtifactStoredManifestState {
  artifactId: StaticArtifactId;
  manifestDigest: StaticArtifactDigest;
  storageRef: StaticArtifactStorageRef;
  providerKey: ProviderKey;
}

export class StaticArtifactStoredManifest extends ValueObject<StaticArtifactStoredManifestState> {
  private constructor(state: StaticArtifactStoredManifestState) {
    super(state);
  }

  static create(input: StaticArtifactStoredManifestState): Result<StaticArtifactStoredManifest> {
    return ok(new StaticArtifactStoredManifest(input));
  }

  static rehydrate(state: StaticArtifactStoredManifestState): StaticArtifactStoredManifest {
    return new StaticArtifactStoredManifest(state);
  }

  get storageRef(): string {
    return this.state.storageRef.value;
  }

  toState(): StaticArtifactStoredManifestState {
    return { ...this.state };
  }
}

export interface StaticArtifactRouteActivationState {
  publicationId: StaticArtifactPublicationId;
  url: StaticArtifactRouteUrl;
  providerKey: ProviderKey;
}

export class StaticArtifactRouteActivation extends ValueObject<StaticArtifactRouteActivationState> {
  private constructor(state: StaticArtifactRouteActivationState) {
    super(state);
  }

  static create(input: StaticArtifactRouteActivationState): Result<StaticArtifactRouteActivation> {
    return ok(new StaticArtifactRouteActivation(input));
  }

  static rehydrate(state: StaticArtifactRouteActivationState): StaticArtifactRouteActivation {
    return new StaticArtifactRouteActivation(state);
  }

  get url(): string {
    return this.state.url.value;
  }

  toState(): StaticArtifactRouteActivationState {
    return { ...this.state };
  }
}

export interface StaticArtifactPublicationState {
  publicationId: StaticArtifactPublicationId;
  projectId: ProjectId;
  resourceId: ResourceId;
  manifest: StaticArtifactManifest;
  storedManifest: StaticArtifactStoredManifest;
  routeActivation?: StaticArtifactRouteActivation;
}

export class StaticArtifactPublication extends ValueObject<StaticArtifactPublicationState> {
  private constructor(state: StaticArtifactPublicationState) {
    super(state);
  }

  static create(input: StaticArtifactPublicationState): Result<StaticArtifactPublication> {
    const manifestState = input.manifest.toState();
    const storedManifestState = input.storedManifest.toState();
    if (!manifestState.artifactId.equals(storedManifestState.artifactId)) {
      return err(
        domainError.validation("Published static artifact must store the same artifact ID"),
      );
    }
    if (!manifestState.manifestDigest.equals(storedManifestState.manifestDigest)) {
      return err(
        domainError.validation("Published static artifact must store the same manifest digest"),
      );
    }
    return ok(new StaticArtifactPublication(input));
  }

  static rehydrate(state: StaticArtifactPublicationState): StaticArtifactPublication {
    return new StaticArtifactPublication(state);
  }

  get publicationId(): string {
    return this.state.publicationId.value;
  }

  get url(): string | undefined {
    return this.state.routeActivation?.url;
  }

  toState(): StaticArtifactPublicationState {
    return { ...this.state };
  }
}
