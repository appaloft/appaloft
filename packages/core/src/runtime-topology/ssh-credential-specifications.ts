import { type SshCredentialId } from "../shared/identifiers";
import { type SshCredential, type SshCredentialState } from "./ssh-credential";

export interface SshCredentialSelectionSpecVisitor<TResult> {
  visitSshCredentialById(query: TResult, spec: SshCredentialByIdSpec): TResult;
}

export interface SshCredentialMutationSpecVisitor<TResult> {
  visitUpsertSshCredential(spec: UpsertSshCredentialSpec): TResult;
}

export interface SshCredentialSelectionSpec {
  accept<TResult>(query: TResult, visitor: SshCredentialSelectionSpecVisitor<TResult>): TResult;
}

export interface SshCredentialMutationSpec {
  accept<TResult>(visitor: SshCredentialMutationSpecVisitor<TResult>): TResult;
}

export class SshCredentialByIdSpec implements SshCredentialSelectionSpec {
  private constructor(public readonly id: SshCredentialId) {}

  static create(id: SshCredentialId): SshCredentialByIdSpec {
    return new SshCredentialByIdSpec(id);
  }

  accept<TResult>(query: TResult, visitor: SshCredentialSelectionSpecVisitor<TResult>): TResult {
    return visitor.visitSshCredentialById(query, this);
  }
}

export class UpsertSshCredentialSpec implements SshCredentialMutationSpec {
  private constructor(public readonly state: SshCredentialState) {}

  static fromSshCredential(credential: SshCredential): UpsertSshCredentialSpec {
    return new UpsertSshCredentialSpec(credential.toState());
  }

  accept<TResult>(visitor: SshCredentialMutationSpecVisitor<TResult>): TResult {
    return visitor.visitUpsertSshCredential(this);
  }
}
