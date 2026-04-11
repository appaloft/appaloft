import { AggregateRoot } from "../shared/entity";
import { domainError } from "../shared/errors";
import {
  type EnvironmentId,
  type EnvironmentSnapshotId,
  type ReleaseId,
  type WorkloadId,
} from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import { type CreatedAt, type SealedAt } from "../shared/temporal";
import {
  type ArtifactDigest,
  type ReleaseVersion,
  type SourceRevision,
} from "../shared/text-values";

export interface ReleaseState {
  id: ReleaseId;
  workloadId: WorkloadId;
  environmentId: EnvironmentId;
  version: ReleaseVersion;
  sourceRevision: SourceRevision;
  artifactDigest?: ArtifactDigest;
  configSnapshotId: EnvironmentSnapshotId;
  createdAt: CreatedAt;
  sealedAt?: SealedAt;
}

export class Release extends AggregateRoot<ReleaseState> {
  private constructor(state: ReleaseState) {
    super(state);
  }

  static prepare(input: ReleaseState): Result<Release> {
    const release = new Release({
      ...input,
    });
    release.recordDomainEvent("release.prepared", input.createdAt, {
      workloadId: input.workloadId.value,
      environmentId: input.environmentId.value,
    });
    return ok(release);
  }

  static rehydrate(state: ReleaseState): Release {
    return new Release(state);
  }

  seal(at: SealedAt): Result<void> {
    if (this.state.sealedAt) {
      return err(
        domainError.invariant("Release is already sealed", { releaseId: this.state.id.value }),
      );
    }

    this.state.sealedAt = at;
    this.recordDomainEvent("release.sealed", at, {
      workloadId: this.state.workloadId.value,
      environmentId: this.state.environmentId.value,
    });
    return ok(undefined);
  }

  toState(): ReleaseState {
    return { ...this.state };
  }
}
