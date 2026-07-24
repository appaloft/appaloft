import { domainError } from "../shared/errors";
import { IdentifierValue } from "../shared/identifiers";
import { err, ok, type Result } from "../shared/result";
import { ScalarValueObject } from "../shared/value-object";

function collaborationValidation(message: string, details: Record<string, string | number> = {}) {
  return domainError.validation(message, {
    phase: "workspace-collaboration-admission",
    ...details,
  });
}

abstract class CollaborationIdentifier extends IdentifierValue {
  protected constructor(value: string) {
    super(value);
  }

  protected static normalize(value: string, field: string): Result<string> {
    const normalized = value.trim();
    if (
      !normalized ||
      normalized.length > 160 ||
      !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(normalized)
    ) {
      return err(collaborationValidation(`${field} is invalid`, { field }));
    }
    return ok(normalized);
  }
}

const collaborationIdBrand: unique symbol = Symbol("WorkspaceCollaborationId");
export class WorkspaceCollaborationId extends CollaborationIdentifier {
  private [collaborationIdBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<WorkspaceCollaborationId> {
    return CollaborationIdentifier.normalize(value, "collaborationId").map(
      (normalized) => new WorkspaceCollaborationId(normalized),
    );
  }
  static rehydrate(value: string): WorkspaceCollaborationId {
    return new WorkspaceCollaborationId(value.trim());
  }
}

const participantIdBrand: unique symbol = Symbol("WorkspaceCollaborationParticipantId");
export class WorkspaceCollaborationParticipantId extends CollaborationIdentifier {
  private [participantIdBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<WorkspaceCollaborationParticipantId> {
    return CollaborationIdentifier.normalize(value, "participantId").map(
      (normalized) => new WorkspaceCollaborationParticipantId(normalized),
    );
  }
  static rehydrate(value: string): WorkspaceCollaborationParticipantId {
    return new WorkspaceCollaborationParticipantId(value.trim());
  }
}

const laneIdBrand: unique symbol = Symbol("WorkspaceCollaborationLaneId");
export class WorkspaceCollaborationLaneId extends CollaborationIdentifier {
  private [laneIdBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<WorkspaceCollaborationLaneId> {
    return CollaborationIdentifier.normalize(value, "laneId").map(
      (normalized) => new WorkspaceCollaborationLaneId(normalized),
    );
  }
  static rehydrate(value: string): WorkspaceCollaborationLaneId {
    return new WorkspaceCollaborationLaneId(value.trim());
  }
}

const leaseIdBrand: unique symbol = Symbol("WorkspaceWriterLeaseId");
export class WorkspaceWriterLeaseId extends CollaborationIdentifier {
  private [leaseIdBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<WorkspaceWriterLeaseId> {
    return CollaborationIdentifier.normalize(value, "leaseId").map(
      (normalized) => new WorkspaceWriterLeaseId(normalized),
    );
  }
  static rehydrate(value: string): WorkspaceWriterLeaseId {
    return new WorkspaceWriterLeaseId(value.trim());
  }
}

const handoffIdBrand: unique symbol = Symbol("WorkspaceCollaborationHandoffId");
export class WorkspaceCollaborationHandoffId extends CollaborationIdentifier {
  private [handoffIdBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<WorkspaceCollaborationHandoffId> {
    return CollaborationIdentifier.normalize(value, "handoffId").map(
      (normalized) => new WorkspaceCollaborationHandoffId(normalized),
    );
  }
  static rehydrate(value: string): WorkspaceCollaborationHandoffId {
    return new WorkspaceCollaborationHandoffId(value.trim());
  }
}

const nameBrand: unique symbol = Symbol("WorkspaceCollaborationName");
export class WorkspaceCollaborationName extends ScalarValueObject<string> {
  private [nameBrand]!: void;
  private constructor(value: string) {
    super(value);
  }
  static create(value: string): Result<WorkspaceCollaborationName> {
    const normalized = value.trim();
    if (!normalized || normalized.length > 160 || normalized.includes("\0")) {
      return err(collaborationValidation("Workspace Collaboration name is invalid"));
    }
    return ok(new WorkspaceCollaborationName(normalized));
  }
  static rehydrate(value: string): WorkspaceCollaborationName {
    return new WorkspaceCollaborationName(value.trim());
  }
}
