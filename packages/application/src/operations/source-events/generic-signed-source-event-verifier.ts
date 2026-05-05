import { domainError, err, ok, type Result } from "@appaloft/core";
import { injectable } from "tsyringe";

import { type ExecutionContext } from "../../execution-context";
import {
  type SourceEventVerificationInput,
  type SourceEventVerificationPort,
  type VerifiedSourceEventInput,
} from "../../ports";

@injectable()
export class GenericSignedSourceEventVerifier implements SourceEventVerificationPort {
  async verify(
    _context: ExecutionContext,
    input: SourceEventVerificationInput,
  ): Promise<Result<VerifiedSourceEventInput>> {
    if (input.sourceKind !== "generic-signed" || input.method !== "generic-hmac") {
      return err(
        domainError.sourceEventUnsupportedKind("Source event verification kind is unsupported", {
          phase: "source-event-normalization",
          sourceKind: input.sourceKind,
          eventKind: input.eventKind,
          verificationMethod: input.method,
        }),
      );
    }

    const expectedSignature = await hmacSha256Hex(input.secretValue, input.rawBody);
    const suppliedSignature = normalizeSha256Signature(input.signature);
    if (!suppliedSignature || !constantTimeEqualHex(expectedSignature, suppliedSignature)) {
      return err(
        domainError.sourceEventSignatureInvalid("Source event signature is invalid", {
          phase: "source-event-verification",
          sourceKind: input.sourceKind,
          eventKind: input.eventKind,
          ...(input.deliveryId ? { deliveryId: input.deliveryId } : {}),
          ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
        }),
      );
    }

    return ok({
      sourceKind: input.sourceKind,
      eventKind: input.eventKind,
      sourceIdentity: {
        locator: input.sourceIdentity.locator,
        ...(input.sourceIdentity.providerRepositoryId
          ? { providerRepositoryId: input.sourceIdentity.providerRepositoryId }
          : {}),
        ...(input.sourceIdentity.repositoryFullName
          ? { repositoryFullName: input.sourceIdentity.repositoryFullName }
          : {}),
      },
      ref: input.ref,
      revision: input.revision,
      ...(input.deliveryId ? { deliveryId: input.deliveryId } : {}),
      ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      verification: {
        status: "verified",
        method: "generic-hmac",
        ...(input.keyVersion ? { keyVersion: input.keyVersion } : {}),
      },
      ...(input.receivedAt ? { receivedAt: input.receivedAt } : {}),
    });
  }
}

async function hmacSha256Hex(secretValue: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretValue),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return bytesToHex(new Uint8Array(signature));
}

function normalizeSha256Signature(signature: string): string | null {
  const trimmed = signature.trim().toLowerCase();
  const withoutPrefix = trimmed.startsWith("sha256=") ? trimmed.slice("sha256=".length) : trimmed;
  return /^[a-f0-9]{64}$/.test(withoutPrefix) ? withoutPrefix : null;
}

function constantTimeEqualHex(left: string, right: string): boolean {
  const leftBytes = hexToBytes(left);
  const rightBytes = hexToBytes(right);
  if (!leftBytes || !rightBytes || leftBytes.length !== rightBytes.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= (leftBytes.at(index) ?? 0) ^ (rightBytes.at(index) ?? 0);
  }

  return difference === 0;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[a-f0-9]+$/.test(hex) || hex.length % 2 !== 0) {
    return null;
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
}
