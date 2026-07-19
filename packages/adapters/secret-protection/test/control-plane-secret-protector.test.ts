import { describe, expect, test } from "bun:test";

import { AesGcmControlPlaneSecretProtector, UnavailableControlPlaneSecretProtector } from "../src";

const key = (fill: number): string => Buffer.alloc(32, fill).toString("base64");
const context = {
  purpose: "resource-variable" as const,
};

describe("control-plane secret protector", () => {
  test("[CPS-PROTECT-001] protects and authenticates one secret envelope", async () => {
    const created = AesGcmControlPlaneSecretProtector.create({
      activeKeyId: "key-v1",
      keys: { "key-v1": key(1) },
    });
    expect(created.isOk()).toBe(true);
    const protector = created._unsafeUnwrap();
    const protectedValue = await protector.protect(context, "AUDIT_MARKER_VALUE");

    expect(protectedValue.isOk()).toBe(true);
    expect(protectedValue._unsafeUnwrap()).toMatchObject({ keyId: "key-v1" });
    expect(protectedValue._unsafeUnwrap().envelope).not.toContain("AUDIT_MARKER_VALUE");

    const resolved = await protector.unprotect(context, protectedValue._unsafeUnwrap().envelope);
    expect(resolved._unsafeUnwrap()).toEqual({
      keyId: "key-v1",
      plaintext: "AUDIT_MARKER_VALUE",
    });
  });

  test("[CPS-FAIL-002] missing keyring fails closed", async () => {
    const result = await new UnavailableControlPlaneSecretProtector().unprotect(
      context,
      "appaloft-secret:v1:key-v1:invalid",
    );
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "control_plane_secret_keyring_unavailable",
      details: { phase: "control-plane-secret-materialization" },
    });
  });

  test("[CPS-FAIL-003] wrong key and [CPS-FAIL-004] corrupt ciphertext fail without leaking material", async () => {
    const original = AesGcmControlPlaneSecretProtector.create({
      activeKeyId: "key-v1",
      keys: { "key-v1": key(2) },
    })._unsafeUnwrap();
    const wrong = AesGcmControlPlaneSecretProtector.create({
      activeKeyId: "key-v1",
      keys: { "key-v1": key(3) },
    })._unsafeUnwrap();
    const marker = "WRONG_KEY_MARKER_VALUE";
    const envelope = (await original.protect(context, marker))._unsafeUnwrap().envelope;

    const wrongKey = await wrong.unprotect(context, envelope);
    const corrupt = await original.unprotect(
      context,
      `${envelope.slice(0, -1)}${envelope.endsWith("A") ? "B" : "A"}`,
    );

    expect(wrongKey.isErr()).toBe(true);
    expect(corrupt.isErr()).toBe(true);
    for (const result of [wrongKey, corrupt]) {
      const serialized = JSON.stringify(result._unsafeUnwrapErr());
      expect(serialized).not.toContain(marker);
      expect(serialized).not.toContain(envelope);
      expect(serialized).not.toContain(key(2));
      expect(serialized).not.toContain(key(3));
    }
  });

  test("[CPS-COMPAT-012] retained old key decrypts and rewraps to the active key", async () => {
    const oldProtector = AesGcmControlPlaneSecretProtector.create({
      activeKeyId: "key-v1",
      keys: { "key-v1": key(4) },
    })._unsafeUnwrap();
    const keyring = AesGcmControlPlaneSecretProtector.create({
      activeKeyId: "key-v2",
      keys: { "key-v1": key(4), "key-v2": key(5) },
    })._unsafeUnwrap();
    const oldEnvelope = (
      await oldProtector.protect(context, "ROTATION_MARKER_VALUE")
    )._unsafeUnwrap().envelope;

    const retained = await keyring.unprotect(context, oldEnvelope);
    const rewrapped = await keyring.rewrap(context, oldEnvelope, { allowLegacyPlaintext: false });

    expect(retained._unsafeUnwrap().keyId).toBe("key-v1");
    expect(rewrapped._unsafeUnwrap()).toMatchObject({
      previousState: "retained-key",
      keyId: "key-v2",
      changed: true,
    });
    expect(
      (await keyring.unprotect(context, rewrapped._unsafeUnwrap().envelope))._unsafeUnwrap(),
    ).toEqual({ keyId: "key-v2", plaintext: "ROTATION_MARKER_VALUE" });
  });

  test("[CPS-ROTATE-008] legacy plaintext is classified but never decrypted implicitly", async () => {
    const protector = AesGcmControlPlaneSecretProtector.create({
      activeKeyId: "key-v1",
      keys: { "key-v1": key(6) },
    })._unsafeUnwrap();

    expect(protector.inspect("LEGACY_MARKER_VALUE")).toEqual({ state: "legacy-plaintext" });
    const blocked = await protector.unprotect(context, "LEGACY_MARKER_VALUE");
    expect(blocked.isErr()).toBe(true);
    expect(blocked._unsafeUnwrapErr().code).toBe("control_plane_secret_legacy_migration_required");
    const migrated = await protector.rewrap(context, "LEGACY_MARKER_VALUE", {
      allowLegacyPlaintext: true,
    });
    expect(migrated._unsafeUnwrap()).toMatchObject({
      previousState: "legacy-plaintext",
      keyId: "key-v1",
      changed: true,
    });
  });

  test("[CPS-COMPAT-036] empty legacy secret migrates to an authenticated envelope", async () => {
    const protector = AesGcmControlPlaneSecretProtector.create({
      activeKeyId: "key-v1",
      keys: { "key-v1": key(7) },
    })._unsafeUnwrap();

    const migrated = await protector.rewrap(context, "", { allowLegacyPlaintext: true });
    const envelope = migrated._unsafeUnwrap().envelope;

    expect(migrated._unsafeUnwrap()).toMatchObject({
      previousState: "legacy-plaintext",
      keyId: "key-v1",
      changed: true,
    });
    expect(protector.inspect(envelope)).toEqual({ state: "active-key", keyId: "key-v1" });
    expect((await protector.unprotect(context, envelope))._unsafeUnwrap()).toEqual({
      keyId: "key-v1",
      plaintext: "",
    });
  });
});
