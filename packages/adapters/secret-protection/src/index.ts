import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import {
  type ControlPlaneSecretContext,
  type ControlPlaneSecretEnvelopeState,
  type ControlPlaneSecretProtector,
  type ControlPlaneSecretRewrapResult,
} from "@appaloft/application";
import { type DomainError, err, ok, type Result } from "@appaloft/core";

const ENVELOPE_PREFIX = "appaloft-secret:v1";
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const PHASE = "control-plane-secret-materialization";

type SecretKeyMap = ReadonlyMap<string, Buffer>;

export interface ControlPlaneSecretKeyringConfiguration {
  activeKeyId: string;
  keys: Readonly<Record<string, string>>;
}

export interface ControlPlaneSecretEnvironment {
  APPALOFT_CONTROL_PLANE_ACTIVE_SECRET_KEY_ID?: string | undefined;
  APPALOFT_CONTROL_PLANE_SECRET_KEYS?: string | undefined;
}

function safeError(code: string, message: string, reason: string, retryable = false): DomainError {
  return {
    code,
    category: "infra",
    message,
    retryable,
    details: { phase: PHASE, reason },
  };
}

function configurationError(reason: string): DomainError {
  return safeError(
    "control_plane_secret_keyring_invalid",
    "Control-plane secret protection is not configured correctly",
    reason,
  );
}

function materializationError(reason: string): DomainError {
  return safeError(
    "control_plane_secret_materialization_failed",
    "Control-plane secret materialization failed; deployment was blocked",
    reason,
  );
}

function legacyError(): DomainError {
  return safeError(
    "control_plane_secret_legacy_migration_required",
    "Legacy secret material requires an explicit migration before use",
    "legacy-plaintext",
  );
}

function aad(context: ControlPlaneSecretContext): Buffer {
  return Buffer.from(`appaloft-control-plane-secret:v1:${context.purpose}`, "utf8");
}

function decodeKey(encoded: string): Result<Buffer, DomainError> {
  try {
    const key = Buffer.from(encoded, "base64");
    if (key.byteLength !== 32 || key.toString("base64") !== encoded) {
      return err(configurationError("key-must-be-32-byte-canonical-base64"));
    }
    return ok(key);
  } catch {
    return err(configurationError("key-must-be-32-byte-canonical-base64"));
  }
}

function parseEnvelope(value: string):
  | {
      state: "parsed";
      keyId: string;
      iv: Buffer;
      ciphertext: Buffer;
      tag: Buffer;
    }
  | { state: "legacy-plaintext" }
  | { state: "unreadable"; keyId?: string } {
  if (!value.startsWith("appaloft-secret:")) {
    return { state: "legacy-plaintext" };
  }
  const parts = value.split(":");
  if (parts.length !== 7 || `${parts[0]}:${parts[1]}` !== ENVELOPE_PREFIX) {
    return { state: "unreadable" };
  }
  const [, , keyId, ivEncoded, ciphertextEncoded, tagEncoded, terminator] = parts;
  if (
    terminator !== "end" ||
    !keyId ||
    !KEY_ID_PATTERN.test(keyId) ||
    !ivEncoded ||
    ciphertextEncoded === undefined ||
    !tagEncoded
  ) {
    return { state: "unreadable" };
  }
  try {
    const iv = Buffer.from(ivEncoded, "base64url");
    const ciphertext = Buffer.from(ciphertextEncoded, "base64url");
    const tag = Buffer.from(tagEncoded, "base64url");
    if (iv.byteLength !== 12 || tag.byteLength !== 16) {
      return { state: "unreadable", keyId };
    }
    return { state: "parsed", keyId, iv, ciphertext, tag };
  } catch {
    return { state: "unreadable", keyId };
  }
}

export class UnavailableControlPlaneSecretProtector implements ControlPlaneSecretProtector {
  activeKeyId(): null {
    return null;
  }

  inspect(value: string): { state: ControlPlaneSecretEnvelopeState; keyId?: string } {
    const parsed = parseEnvelope(value);
    if (parsed.state === "legacy-plaintext") return { state: parsed.state };
    if (parsed.state === "unreadable") {
      return parsed.keyId ? { state: "unreadable", keyId: parsed.keyId } : { state: "unreadable" };
    }
    return { state: "unreadable", keyId: parsed.keyId };
  }

  async protect(
    _context: ControlPlaneSecretContext,
    _plaintext: string,
  ): Promise<Result<never, DomainError>> {
    return err(this.unavailable());
  }

  async unprotect(
    _context: ControlPlaneSecretContext,
    _envelope: string,
  ): Promise<Result<never, DomainError>> {
    return err(this.unavailable());
  }

  async rewrap(
    _context: ControlPlaneSecretContext,
    _value: string,
    _options: { allowLegacyPlaintext: boolean },
  ): Promise<Result<never, DomainError>> {
    return err(this.unavailable());
  }

  private unavailable(): DomainError {
    return safeError(
      "control_plane_secret_keyring_unavailable",
      "Control-plane secret keyring is unavailable; secret operations are blocked",
      "keyring-unavailable",
    );
  }
}

export class AesGcmControlPlaneSecretProtector implements ControlPlaneSecretProtector {
  private constructor(
    private readonly activeId: string,
    private readonly keys: SecretKeyMap,
  ) {}

  static create(
    configuration: ControlPlaneSecretKeyringConfiguration,
  ): Result<AesGcmControlPlaneSecretProtector, DomainError> {
    if (!KEY_ID_PATTERN.test(configuration.activeKeyId)) {
      return err(configurationError("active-key-id-invalid"));
    }
    const keys = new Map<string, Buffer>();
    for (const [keyId, encoded] of Object.entries(configuration.keys)) {
      if (!KEY_ID_PATTERN.test(keyId)) return err(configurationError("key-id-invalid"));
      const decoded = decodeKey(encoded);
      if (decoded.isErr()) return err(decoded.error);
      keys.set(keyId, decoded.value);
    }
    if (!keys.has(configuration.activeKeyId)) {
      return err(configurationError("active-key-not-present"));
    }
    return ok(new AesGcmControlPlaneSecretProtector(configuration.activeKeyId, keys));
  }

  activeKeyId(): string {
    return this.activeId;
  }

  inspect(value: string): { state: ControlPlaneSecretEnvelopeState; keyId?: string } {
    const parsed = parseEnvelope(value);
    if (parsed.state === "legacy-plaintext") return { state: "legacy-plaintext" };
    if (parsed.state === "unreadable") {
      return parsed.keyId ? { state: "unreadable", keyId: parsed.keyId } : { state: "unreadable" };
    }
    if (!this.keys.has(parsed.keyId)) return { state: "unreadable", keyId: parsed.keyId };
    return {
      state: parsed.keyId === this.activeId ? "active-key" : "retained-key",
      keyId: parsed.keyId,
    };
  }

  async protect(
    context: ControlPlaneSecretContext,
    plaintext: string,
  ): Promise<Result<{ envelope: string; keyId: string }, DomainError>> {
    const key = this.keys.get(this.activeId);
    if (!key) return err(configurationError("active-key-not-present"));
    try {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(aad(context));
      const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return ok({
        keyId: this.activeId,
        envelope: [
          ENVELOPE_PREFIX,
          this.activeId,
          iv.toString("base64url"),
          ciphertext.toString("base64url"),
          tag.toString("base64url"),
          "end",
        ].join(":"),
      });
    } catch {
      return err(materializationError("encryption-failed"));
    }
  }

  async unprotect(
    context: ControlPlaneSecretContext,
    envelope: string,
  ): Promise<Result<{ plaintext: string; keyId: string }, DomainError>> {
    const parsed = parseEnvelope(envelope);
    if (parsed.state === "legacy-plaintext") return err(legacyError());
    if (parsed.state === "unreadable") return err(materializationError("envelope-invalid"));
    const key = this.keys.get(parsed.keyId);
    if (!key) return err(materializationError("decrypt-key-unavailable"));
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, parsed.iv);
      decipher.setAAD(aad(context));
      decipher.setAuthTag(parsed.tag);
      const plaintext = Buffer.concat([
        decipher.update(parsed.ciphertext),
        decipher.final(),
      ]).toString("utf8");
      return ok({ plaintext, keyId: parsed.keyId });
    } catch {
      return err(materializationError("authentication-failed"));
    }
  }

  async rewrap(
    context: ControlPlaneSecretContext,
    value: string,
    options: { allowLegacyPlaintext: boolean },
  ): Promise<Result<ControlPlaneSecretRewrapResult, DomainError>> {
    const inspected = this.inspect(value);
    if (inspected.state === "unreadable") return err(materializationError("envelope-unreadable"));
    if (inspected.state === "legacy-plaintext") {
      if (!options.allowLegacyPlaintext) return err(legacyError());
      const protectedValue = await this.protect(context, value);
      if (protectedValue.isErr()) return err(protectedValue.error);
      return ok({ ...protectedValue.value, previousState: "legacy-plaintext", changed: true });
    }
    if (inspected.state === "active-key") {
      const authenticated = await this.unprotect(context, value);
      if (authenticated.isErr()) return err(authenticated.error);
      return ok({
        envelope: value,
        keyId: this.activeId,
        previousState: "active-key",
        changed: false,
      });
    }
    const resolved = await this.unprotect(context, value);
    if (resolved.isErr()) return err(resolved.error);
    const protectedValue = await this.protect(context, resolved.value.plaintext);
    if (protectedValue.isErr()) return err(protectedValue.error);
    return ok({ ...protectedValue.value, previousState: "retained-key", changed: true });
  }
}

export function controlPlaneSecretProtectorFromEnvironment(
  environment: ControlPlaneSecretEnvironment,
): Result<ControlPlaneSecretProtector, DomainError> {
  const activeKeyId = environment.APPALOFT_CONTROL_PLANE_ACTIVE_SECRET_KEY_ID;
  const encodedKeyring = environment.APPALOFT_CONTROL_PLANE_SECRET_KEYS;
  if (!activeKeyId || !encodedKeyring) return ok(new UnavailableControlPlaneSecretProtector());
  let keys: unknown;
  try {
    keys = JSON.parse(encodedKeyring);
  } catch {
    return err(configurationError("keyring-json-invalid"));
  }
  if (!keys || typeof keys !== "object" || Array.isArray(keys)) {
    return err(configurationError("keyring-json-invalid"));
  }
  return AesGcmControlPlaneSecretProtector.create({
    activeKeyId,
    keys: keys as Record<string, string>,
  });
}
