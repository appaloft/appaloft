import { describe, expect, test } from "bun:test";

import {
  CreatedAt,
  DeploymentTargetCredentialKindValue,
  DeploymentTargetUsername,
  RotatedAt,
  SshCredential,
  SshCredentialId,
  SshCredentialName,
  SshPrivateKeyText,
  SshPublicKeyText,
} from "../src";

const createdAt = CreatedAt.rehydrate("2026-07-20T00:00:00.000Z");
const rotatedAt = RotatedAt.rehydrate("2026-07-20T00:10:00.000Z");

const PRIVATE_KEY_V1 = "-----BEGIN OPENSSH PRIVATE KEY-----\nv1\n-----END OPENSSH PRIVATE KEY-----";
const PRIVATE_KEY_V2 = "-----BEGIN OPENSSH PRIVATE KEY-----\nv2\n-----END OPENSSH PRIVATE KEY-----";
const PUBLIC_KEY_V1 = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDemoKeyOne comment";
const PUBLIC_KEY_V2 = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDemoKeyTwo comment";

function createCredential(input?: {
  username?: string;
  publicKey?: string;
  privateKey?: string;
  kind?: "local-ssh-agent" | "ssh-private-key";
}) {
  return SshCredential.create({
    id: SshCredentialId.rehydrate("ssh_demo"),
    name: SshCredentialName.rehydrate("Deploy Key"),
    kind: DeploymentTargetCredentialKindValue.rehydrate(input?.kind ?? "ssh-private-key"),
    ...(input?.username ? { username: DeploymentTargetUsername.rehydrate(input.username) } : {}),
    ...(input?.publicKey ? { publicKey: SshPublicKeyText.rehydrate(input.publicKey) } : {}),
    privateKey: SshPrivateKeyText.rehydrate(input?.privateKey ?? PRIVATE_KEY_V1),
    createdAt,
  });
}

describe("SshCredential", () => {
  test("[CORE-SSH-001] creates a credential and emits a redacted created event", () => {
    const created = createCredential({
      username: "deploy",
      publicKey: PUBLIC_KEY_V1,
    });
    expect(created.isOk()).toBe(true);

    const credential = created._unsafeUnwrap();
    expect(credential.toState().privateKey.value).toBe(PRIVATE_KEY_V1);
    const events = credential.pullDomainEvents();
    expect(events).toEqual([
      expect.objectContaining({
        type: "ssh_credential.created",
        aggregateId: "ssh_demo",
        payload: {
          kind: "ssh-private-key",
          usernameConfigured: true,
          publicKeyConfigured: true,
          privateKeyConfigured: true,
        },
      }),
    ]);

    expect(JSON.stringify(events)).not.toContain(PRIVATE_KEY_V1);
    expect(JSON.stringify(events)).not.toContain(PUBLIC_KEY_V1);
  });

  test("[CORE-SSH-002] rotates private key material and optional public metadata", () => {
    const credential = createCredential({
      username: "deploy",
      publicKey: PUBLIC_KEY_V1,
    })._unsafeUnwrap();
    credential.pullDomainEvents();

    const rotated = credential.rotate({
      privateKey: SshPrivateKeyText.rehydrate(PRIVATE_KEY_V2),
      publicKey: SshPublicKeyText.rehydrate(PUBLIC_KEY_V2),
      username: DeploymentTargetUsername.rehydrate("deployer"),
      rotatedAt,
    });

    expect(rotated.isOk()).toBe(true);
    expect(credential.toState()).toMatchObject({
      privateKey: expect.objectContaining({ value: PRIVATE_KEY_V2 }),
      publicKey: expect.objectContaining({ value: PUBLIC_KEY_V2 }),
      username: expect.objectContaining({ value: "deployer" }),
      rotatedAt: expect.objectContaining({ value: rotatedAt.value }),
    });
    expect(credential.pullDomainEvents()).toEqual([]);
  });

  test("[CORE-SSH-003] clears optional public key and username when rotate passes null", () => {
    const credential = createCredential({
      username: "deploy",
      publicKey: PUBLIC_KEY_V1,
    })._unsafeUnwrap();

    const rotated = credential.rotate({
      privateKey: SshPrivateKeyText.rehydrate(PRIVATE_KEY_V2),
      publicKey: null,
      username: null,
      rotatedAt,
    });

    expect(rotated.isOk()).toBe(true);
    expect(credential.toState().publicKey).toBeUndefined();
    expect(credential.toState().username).toBeUndefined();
    expect(credential.toState().privateKey.value).toBe(PRIVATE_KEY_V2);
  });

  test("[CORE-SSH-004] keeps omitted optional fields unchanged during rotate", () => {
    const credential = createCredential({
      username: "deploy",
      publicKey: PUBLIC_KEY_V1,
    })._unsafeUnwrap();

    credential
      .rotate({
        privateKey: SshPrivateKeyText.rehydrate(PRIVATE_KEY_V2),
        rotatedAt,
      })
      ._unsafeUnwrap();

    expect(credential.toState().username?.value).toBe("deploy");
    expect(credential.toState().publicKey?.value).toBe(PUBLIC_KEY_V1);
  });

  test("[CORE-SSH-005] rehydrates credentials without inventing domain events", () => {
    const credential = SshCredential.rehydrate({
      id: SshCredentialId.rehydrate("ssh_rehydrated"),
      name: SshCredentialName.rehydrate("Legacy Key"),
      kind: DeploymentTargetCredentialKindValue.rehydrate("local-ssh-agent"),
      privateKey: SshPrivateKeyText.rehydrate(PRIVATE_KEY_V1),
      createdAt,
      rotatedAt,
    });

    expect(credential.pullDomainEvents()).toEqual([]);
    expect(credential.toState().kind.value).toBe("local-ssh-agent");
    expect(credential.toState().rotatedAt?.value).toBe(rotatedAt.value);
  });

  test("[CORE-SSH-006] visitor accept does not mutate credential state", () => {
    const credential = createCredential()._unsafeUnwrap();
    credential.pullDomainEvents();

    const label = credential.accept(
      {
        visitSshCredential(current, context: { prefix: string }) {
          return `${context.prefix}:${current.toState().id.value}`;
        },
      },
      { prefix: "audit" },
    );

    expect(label).toBe("audit:ssh_demo");
    expect(credential.toState().privateKey.value).toBe(PRIVATE_KEY_V1);
    expect(credential.pullDomainEvents()).toEqual([]);
  });
});
