import { describe, expect, test } from "bun:test";
import { type DomainError } from "@appaloft/core";
import { formatHumanCliError, formatSafeCliError, safeCliErrorEvidence } from "../src/runtime";

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
        sourcePostgresMajor: "17",
        requiredPostgresMajor: "18",
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
      sourcePostgresMajor: "17",
      requiredPostgresMajor: "18",
      workspaceId: null,
      sandboxId: null,
      exitCode: 23,
      retryable: true,
      causeCode: null,
      detailCode: null,
      repositoryIdentity: null,
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
      sourcePostgresMajor: null,
      requiredPostgresMajor: null,
      workspaceId: null,
      sandboxId: null,
      exitCode: null,
      retryable: false,
      causeCode: null,
      detailCode: null,
      repositoryIdentity: null,
    });
    expect(output).not.toContain("secret-value");
    expect(output).not.toContain("ciphertext-value");
    expect(output).not.toContain("/private/operator/key");
  });

  test("[CPS-COMPAT-031] rejects non-numeric version details from safe evidence", () => {
    const output = formatSafeCliError({
      code: "infra_error",
      category: "infra",
      message: "PGlite version mismatch",
      retryable: false,
      details: {
        sourcePostgresMajor: "17 /private/operator/key",
        requiredPostgresMajor: "secret-value",
      },
    } satisfies DomainError);

    expect(JSON.parse(output)).toMatchObject({
      sourcePostgresMajor: null,
      requiredPostgresMajor: null,
    });
    expect(output).not.toContain("/private/operator/key");
    expect(output).not.toContain("secret-value");
  });

  test("[AGENT-WS-CLI-012] exposes only safe partial Workspace recovery ids", () => {
    const output = formatSafeCliError({
      code: "sandbox_agent_harness_unavailable",
      category: "user",
      message: "secret provider detail",
      retryable: false,
      details: {
        phase: "agent-workspace-runtime-create",
        workspaceId: "sbx_partial",
        sandboxId: "sbx_partial",
        providerHandle: "secret-provider-handle",
      },
    } satisfies DomainError);

    expect(JSON.parse(output)).toMatchObject({
      phase: "agent-workspace-runtime-create",
      workspaceId: "sbx_partial",
      sandboxId: "sbx_partial",
    });
    expect(output).not.toContain("secret-provider-handle");
  });

  test("prints a human DomainError instead of a JSON dump", () => {
    const output = formatHumanCliError({
      code: "validation_error",
      category: "user",
      message: "Git HEAD is detached; check out a pushed branch before opening a Workspace",
      retryable: false,
      details: {
        code: "workspace_git_detached",
        guidance: "Check out a pushed branch, then retry workspace open.",
      },
    } satisfies DomainError);

    expect(output).toBe(
      [
        "Git HEAD is detached; check out a pushed branch before opening a Workspace",
        "Cause: workspace_git_detached",
        "Check out a pushed branch, then retry workspace open.",
        "",
      ].join("\n"),
    );
    expect(output).not.toContain('"error"');
    expect(output).not.toContain("validation_error");
  });

  test("[WS-REMOTE-OPEN-CAUSE-180] human and safe-json keep workspace open cause and repository", () => {
    const error: DomainError = {
      code: "conflict",
      category: "user",
      message: "Repository Binding is missing for github.com/appaloft/appaloft-cloud",
      retryable: false,
      details: {
        code: "workspace_open_repository_not_bound",
        causeCode: "workspace_open_repository_not_bound",
        repositoryIdentity: "github.com/appaloft/appaloft-cloud",
        phase: "remote-operation-dispatch",
        guidance:
          "appaloft repository-binding bind --repository github.com/appaloft/appaloft-cloud --project <projectId>",
        host: "203.0.113.10",
        stderr: "secret-value ciphertext-value",
      },
    };

    const human = formatHumanCliError(error);
    expect(human).toContain("Repository Binding is missing for github.com/appaloft/appaloft-cloud");
    expect(human).toContain("Cause: workspace_open_repository_not_bound");
    expect(human).toContain("appaloft repository-binding bind --repository");
    expect(human).not.toContain("secret-value");
    expect(human).not.toContain("203.0.113.10");

    const evidence = safeCliErrorEvidence(error);
    expect(evidence).toMatchObject({
      code: "conflict",
      category: "user",
      phase: "remote-operation-dispatch",
      causeCode: "workspace_open_repository_not_bound",
      detailCode: "workspace_open_repository_not_bound",
      repositoryIdentity: "github.com/appaloft/appaloft-cloud",
    });
    const output = formatSafeCliError(error);
    expect(JSON.parse(output)).toEqual(evidence);
    expect(output).not.toContain("secret-value");
    expect(output).not.toContain("ciphertext-value");
    expect(output).not.toContain("203.0.113.10");
    expect(output).not.toContain("repository-binding bind");
  });

  test("does not serialize unknown failures in human CLI output", () => {
    const output = formatHumanCliError(
      new Error("secret-value ciphertext-value /private/operator/key"),
    );

    expect(output).toBe("Command failed\n");
    expect(output).not.toContain("secret-value");
    expect(output).not.toContain("/private/operator/key");
  });
});
