import { AggregateRoot } from "../shared/entity";
import { type SshCredentialId } from "../shared/identifiers";
import { ok, type Result } from "../shared/result";
import { type DeploymentTargetCredentialKindValue } from "../shared/state-machine";
import { type CreatedAt, type RotatedAt } from "../shared/temporal";
import {
  type DeploymentTargetUsername,
  type SshCredentialName,
  type SshPrivateKeyText,
  type SshPublicKeyText,
} from "../shared/text-values";

export interface SshCredentialState {
  id: SshCredentialId;
  name: SshCredentialName;
  kind: DeploymentTargetCredentialKindValue;
  username?: DeploymentTargetUsername;
  publicKey?: SshPublicKeyText;
  privateKey: SshPrivateKeyText;
  createdAt: CreatedAt;
  rotatedAt?: RotatedAt;
}

export interface RotateSshCredentialInput {
  privateKey: SshPrivateKeyText;
  publicKey?: SshPublicKeyText | null;
  username?: DeploymentTargetUsername | null;
  rotatedAt: RotatedAt;
}

export interface SshCredentialVisitor<TContext, TResult> {
  visitSshCredential(credential: SshCredential, context: TContext): TResult;
}

export class SshCredential extends AggregateRoot<SshCredentialState> {
  private constructor(state: SshCredentialState) {
    super(state);
  }

  static create(input: SshCredentialState): Result<SshCredential> {
    const credential = new SshCredential(input);

    credential.recordDomainEvent("ssh_credential.created", input.createdAt, {
      kind: input.kind.value,
      usernameConfigured: Boolean(input.username),
      publicKeyConfigured: Boolean(input.publicKey),
      privateKeyConfigured: Boolean(input.privateKey),
    });

    return ok(credential);
  }

  static rehydrate(state: SshCredentialState): SshCredential {
    return new SshCredential(state);
  }

  accept<TContext, TResult>(
    visitor: SshCredentialVisitor<TContext, TResult>,
    context: TContext,
  ): TResult {
    return visitor.visitSshCredential(this, context);
  }

  toState(): SshCredentialState {
    return { ...this.state };
  }

  rotate(input: RotateSshCredentialInput): Result<void> {
    this.state.privateKey = input.privateKey;
    this.state.rotatedAt = input.rotatedAt;

    if (input.publicKey !== undefined) {
      if (input.publicKey) {
        this.state.publicKey = input.publicKey;
      } else {
        delete this.state.publicKey;
      }
    }

    if (input.username !== undefined) {
      if (input.username) {
        this.state.username = input.username;
      } else {
        delete this.state.username;
      }
    }

    return ok(undefined);
  }
}
