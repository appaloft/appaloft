import { describe, expect, test } from "bun:test";
import { type DomainError } from "@appaloft/core";
import { formatSafeCliError, safeCliErrorEvidence } from "../src/runtime";

describe("CLI safe error evidence", () => {
  test("[CPS-SAFE-016] emits an exact machine-readable allowlist", () => {
    const error: DomainError = {
      code: "infra_error",
      category: "infra",
      message: "secret-value ciphertext-value /private/operator/key",
      retryable: true,
      details: {
        phase: "remote-state-sync-download",
        reason: "remote_pglite_composition_failed",
        stateBackend: "ssh-pglite",
        host: "203.0.113.10",
        stderr: "secret-value ciphertext-value",
        message: "/private/operator/key",
        exitCode: 23,
      },
    };

    const evidence = safeCliErrorEvidence(error);
    expect(evidence).toEqual({
      schemaVersion: "appaloft.cli-error/v1",
      code: "infra_error",
      category: "infra",
      phase: "remote-state-sync-download",
      reason: "remote_pglite_composition_failed",
      stateBackend: "ssh-pglite",
      exitCode: 23,
      retryable: true,
    });

    const output = formatSafeCliError(error);
    expect(JSON.parse(output)).toEqual(evidence);
    expect(output).not.toContain("secret-value");
    expect(output).not.toContain("ciphertext-value");
    expect(output).not.toContain("203.0.113.10");
    expect(output).not.toContain("/private/operator/key");
  });

  test("[CPS-SAFE-016] classifies unknown failures without serializing them", () => {
    const output = formatSafeCliError(
      new Error("secret-value ciphertext-value /private/operator/key"),
    );

    expect(JSON.parse(output)).toEqual({
      schemaVersion: "appaloft.cli-error/v1",
      code: "cli_error_unclassified",
      category: "infra",
      phase: null,
      reason: null,
      stateBackend: null,
      exitCode: null,
      retryable: false,
    });
    expect(output).not.toContain("secret-value");
    expect(output).not.toContain("ciphertext-value");
    expect(output).not.toContain("/private/operator/key");
  });
});
