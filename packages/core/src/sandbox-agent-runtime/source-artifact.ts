import { type SandboxId } from "../execution-sandbox";
import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { type CreatedAt } from "../shared/temporal";
import { ScalarValueObject, ValueObject } from "../shared/value-object";
import {
  type SourceArtifactDigest,
  type SourceArtifactId,
  SourceArtifactRoot,
  type SourceArtifactStoreReference,
  type WorkspaceRevision,
} from "./values";

export type SourceArtifactManifestEntryMode = "file" | "directory";
export interface SourceArtifactManifestEntry {
  path: string;
  digest: string;
  sizeBytes: number;
  mode: SourceArtifactManifestEntryMode;
}

export class SourceArtifactManifest extends ValueObject<readonly SourceArtifactManifestEntry[]> {
  private constructor(entries: readonly SourceArtifactManifestEntry[]) {
    super(Object.freeze(entries.map((entry) => Object.freeze({ ...entry }))));
  }

  static create(entries: readonly SourceArtifactManifestEntry[]): Result<SourceArtifactManifest> {
    if (entries.length === 0 || entries.length > 100_000) {
      return err(domainError.validation("Source Artifact manifest entry count is invalid"));
    }
    const seen = new Set<string>();
    const normalized: SourceArtifactManifestEntry[] = [];
    for (const entry of entries) {
      const path = SourceArtifactRoot.create(entry.path);
      if (path.isErr()) return err(path.error);
      if (seen.has(path.value.value)) {
        return err(domainError.validation("Source Artifact manifest contains duplicate path"));
      }
      if (!Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 0) {
        return err(domainError.validation("Source Artifact manifest size is invalid"));
      }
      if (!entry.digest.trim() || entry.digest.length > 256) {
        return err(domainError.validation("Source Artifact manifest digest is invalid"));
      }
      seen.add(path.value.value);
      normalized.push({ ...entry, path: path.value.value });
    }
    normalized.sort((left, right) => left.path.localeCompare(right.path));
    return ok(new SourceArtifactManifest(normalized));
  }

  static rehydrate(entries: readonly SourceArtifactManifestEntry[]): SourceArtifactManifest {
    return new SourceArtifactManifest(entries);
  }

  entries(): SourceArtifactManifestEntry[] {
    return this.state.map((entry) => ({ ...entry }));
  }

  totalBytes(): number {
    return this.state.reduce((total, entry) => total + entry.sizeBytes, 0);
  }
}

export type SourceArtifactStatus = "available" | "deleted";
const artifactStatusBrand: unique symbol = Symbol("SourceArtifactStatusValue");
export class SourceArtifactStatusValue extends ScalarValueObject<SourceArtifactStatus> {
  private [artifactStatusBrand]!: void;
  private constructor(value: SourceArtifactStatus) {
    super(value);
  }
  static available(): SourceArtifactStatusValue {
    return new SourceArtifactStatusValue("available");
  }
  static rehydrate(value: SourceArtifactStatus): SourceArtifactStatusValue {
    return new SourceArtifactStatusValue(value);
  }
}

const referenceCountBrand: unique symbol = Symbol("SourceArtifactReferenceCount");
export class SourceArtifactReferenceCount extends ScalarValueObject<number> {
  private [referenceCountBrand]!: void;
  private constructor(value: number) {
    super(value);
  }
  static zero(): SourceArtifactReferenceCount {
    return new SourceArtifactReferenceCount(0);
  }
  static rehydrate(value: number): SourceArtifactReferenceCount {
    return new SourceArtifactReferenceCount(value);
  }
  increment(): SourceArtifactReferenceCount {
    return new SourceArtifactReferenceCount(this.value + 1);
  }
}

export interface SourceArtifactState {
  id: SourceArtifactId;
  sandboxId: SandboxId;
  digest: SourceArtifactDigest;
  manifest: SourceArtifactManifest;
  sourceRoot: SourceArtifactRoot;
  workspaceRevision: WorkspaceRevision;
  storeReference: SourceArtifactStoreReference;
  status: SourceArtifactStatusValue;
  referenceCount: SourceArtifactReferenceCount;
  createdAt: CreatedAt;
}

export class SourceArtifact extends AggregateRoot<SourceArtifactState, SourceArtifactId> {
  private constructor(state: SourceArtifactState) {
    super(state);
  }

  static create(input: {
    id: SourceArtifactId;
    sandboxId: SandboxId;
    digest: SourceArtifactDigest;
    manifest: SourceArtifactManifest;
    sourceRoot: string;
    workspaceRevision: WorkspaceRevision;
    storeReference: SourceArtifactStoreReference;
    createdAt: CreatedAt;
  }): Result<SourceArtifact> {
    const sourceRoot = SourceArtifactRoot.create(input.sourceRoot);
    if (sourceRoot.isErr()) return err(sourceRoot.error);
    const artifact = new SourceArtifact({
      ...input,
      sourceRoot: sourceRoot.value,
      status: SourceArtifactStatusValue.available(),
      referenceCount: SourceArtifactReferenceCount.zero(),
    });
    artifact.recordDomainEvent("source-artifact-captured", input.createdAt, {
      sandboxId: input.sandboxId.value,
      digest: input.digest.value,
      entryCount: input.manifest.entries().length,
      totalBytes: input.manifest.totalBytes(),
    });
    return ok(artifact);
  }

  static rehydrate(state: SourceArtifactState): SourceArtifact {
    return new SourceArtifact(state);
  }

  toState(): SourceArtifactState {
    return { ...this.state };
  }

  protectReference(): Result<void> {
    if (this.state.status.value !== "available") {
      return err(domainError.conflict("Deleted Source Artifact cannot be referenced"));
    }
    this.state.referenceCount = this.state.referenceCount.increment();
    return ok(undefined);
  }

  delete(): Result<void> {
    if (this.state.status.value === "deleted") return ok(undefined);
    if (this.state.referenceCount.value > 0) {
      return err(
        domainError.conflict("Source Artifact is referenced", {
          code: "source_artifact_referenced",
          referenceCount: this.state.referenceCount.value,
        }),
      );
    }
    this.state.status = SourceArtifactStatusValue.rehydrate("deleted");
    return ok(undefined);
  }
}
