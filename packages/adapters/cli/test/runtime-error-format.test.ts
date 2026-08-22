import { describe, expect, test } from "bun:test";
import {
  SAFE_CLI_ERROR_EVIDENCE_FIELDS,
  safeCliErrorEvidence as lightweightSafeCliErrorEvidence,
} from "@appaloft/adapter-cli/safe-error-evidence";
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
    expect(lightweightSafeCliErrorEvidence(error)).toEqual(evidence);
    expect(SAFE_CLI_ERROR_EVIDENCE_FIELDS).toEqual(Object.keys(evidence));
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

  test("[WS-REMOTE-PROFILE-AMBIGUOUS-176] human lists both installationIds when guidance is missing", () => {
    const output = formatHumanCliError({
      code: "conflict",
      category: "user",
      message: "Agent Workspace Profile selector is ambiguous",
      retryable: false,
      details: {
        code: "workspace_open_profile_ambiguous",
        selector: "appaloft-remote",
        installationIds: ["awpi_ptlsoktb2iq1", "awpi_b87sxo84xe7u"],
      },
    } satisfies DomainError);

    expect(output).toContain("Agent Workspace Profile selector is ambiguous");
    expect(output).toContain("awpi_ptlsoktb2iq1");
    expect(output).toContain("awpi_b87sxo84xe7u");
    expect(output).toContain("appaloft code --profile awpi_ptlsoktb2iq1");
    expect(output).not.toContain("Workspace activation context is still unavailable");
  });

  test("keeps ssh_docker_build_failed in human CLI copy", () => {
    const output = formatHumanCliError({
      code: "infra_error",
      category: "infra",
      message: "SSH Docker image build failed",
      retryable: false,
      details: {
        phase: "runtime-execution",
        reason: "deployment_failed",
        errorCode: "ssh_docker_build_failed",
        guidance: "The deployment did not succeed. A live URL is not available.",
      },
    } satisfies DomainError);

    expect(output).toContain("SSH Docker image build failed");
    expect(output).toContain("ssh_docker_build_failed");
    expect(output).toContain("The deployment did not succeed. A live URL is not available.");
    expect(output).not.toContain("infra_error");
  });

  test("[DEP-CREATE-ENTRY-010] surfaces BuildKit last lines from failureLogTail", () => {
    const output = formatHumanCliError({
      code: "infra_error",
      category: "infra",
      message: "SSH Docker image build failed",
      retryable: false,
      details: {
        phase: "runtime-execution",
        reason: "deployment_failed",
        errorCode: "ssh_docker_build_failed",
        guidance: "The deployment did not succeed. A live URL is not available.",
        failureLogTail:
          '#5 ERROR: "/public": not found\nDockerfile line 2: COPY ["public/","/usr/share/nginx/html/"]',
      },
    } satisfies DomainError);

    expect(output).toContain("SSH Docker image build failed");
    expect(output).toContain('"/public": not found');
    expect(output).toContain("ssh_docker_build_failed");
    expect(output).not.toContain("infra_error");
  });

  test("[WS-REMOTE-COMPAT-221] Creating project operationCheckDenied prints operation, reason, and next step", () => {
    const output = formatHumanCliError({
      code: "operation_check_denied",
      category: "user",
      message: "Operation check denied",
      retryable: false,
      details: {
        operationKey: "projects.create",
        operationName: "CreateProjectCommand",
        reason: "missing-organization",
        checkKey: "cloud.admission",
        checkKind: "authorization",
      },
    } satisfies DomainError);

    expect(output.trim()).not.toBe("Operation check denied");
    expect(output).toContain("Cloud denied projects.create");
    expect(output).toContain("cloud.admission");
    expect(output).toContain("missing-organization");
    expect(output).toMatch(/login|organization|retry|Cloud/i);
    expect(output.toLowerCase()).not.toContain("occupancy");
    expect(output).not.toContain("sbx_");
  });

  test("[WS-REMOTE-COMPAT-221] deploy . operationCheckDenied is not the bare string", () => {
    const output = formatHumanCliError({
      code: "operation_check_denied",
      category: "user",
      message: "Operation check denied",
      retryable: false,
      details: {
        operationKey: "deployments.create",
        operationName: "CreateDeploymentCommand",
        reason: "entitlement-denied",
        checkKey: "cloud.entitlement",
        checkKind: "entitlement",
      },
    } satisfies DomainError);

    expect(output.trim()).not.toBe("Operation check denied");
    expect(output).toContain("Cloud denied deployments.create");
    expect(output).toContain("entitlement-denied");
    expect(output).toMatch(/quota|entitlement|retry|Cloud/i);
    expect(output.toLowerCase()).not.toContain("occupancy");
    expect(output).not.toContain("sbx_");
  });

  test("[WS-REMOTE-COMPAT-221] operationCheckDenied with dropped details still names a next step", async () => {
    const { Effect } = await import("effect");
    const { printCliError } = await import("../src/runtime.js");
    const { setWorkspaceTuiScrollbackWriter } = await import("../src/workspace-tui-launch.js");
    const restored: string[] = [];
    setWorkspaceTuiScrollbackWriter((text) => {
      restored.push(text);
    });
    let stdout = "";
    let stderr = "";
    const originalStdout = process.stdout.write.bind(process.stdout);
    const originalStderr = process.stderr.write.bind(process.stderr);
    const originalExitCode = process.exitCode;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      return true;
    }) as typeof process.stderr.write;
    try {
      await Effect.runPromise(
        printCliError({
          code: "operation_check_denied",
          category: "user",
          message: "Operation check denied",
          retryable: false,
          details: {
            phase: "remote-operation-dispatch",
          },
        } satisfies DomainError),
      );
    } finally {
      process.stdout.write = originalStdout;
      process.stderr.write = originalStderr;
      process.exitCode = originalExitCode ?? 0;
      setWorkspaceTuiScrollbackWriter(undefined);
    }

    const printed = `${stdout}${stderr}`;
    expect(restored.join("")).toContain("\x1b[?1049l");
    expect(printed.trim()).not.toBe("error: Operation check denied");
    expect(printed).not.toContain("error: Operation check denied\n");
    expect(printed).toContain("Cloud denied this operation");
    expect(printed).toMatch(/login|retry|Cloud/i);
    expect(printed.toLowerCase()).not.toContain("occupancy");
    expect(printed).not.toContain("sbx_");
  });

  test("[WS-REMOTE-COMPAT-220] folder.local unstructured validation prints a human next step", async () => {
    const { occupancyCloudCompatError } = await import("../src/remote-code-session.js");
    const error = occupancyCloudCompatError(
      {
        code: "bad_request",
        category: "user",
        message: "Input validation failed",
        retryable: false,
        details: {
          phase: "orpc-error-normalization",
          orpcCode: "BAD_REQUEST",
          validationIssuePaths: ["repositoryIdentity"],
          validationIssueMessages: ["Unsupported field: repositoryIdentity"],
        },
      },
      { id: "srv_4lifk0yrcecy", name: "hostinger" },
      {
        repositoryIdentity: "folder.local/cwd/nux-67e3a052-unlinked",
        repository: "https://folder.local/cwd/nux-67e3a052-unlinked.git",
      },
    );
    const output = formatHumanCliError(error);
    expect(output.trim()).not.toBe("Input validation failed");
    expect(output).toContain("Cloud could not start this folder session on hostinger");
    expect(output).toContain("appaloft code --pi --server srv_4lifk0yrcecy");
    expect(output).toContain("repositoryIdentity");
    expect(output).toContain("Unsupported field: repositoryIdentity");
    expect(output).not.toContain("This Cloud does not accept Server targeting");
    expect(output.toLowerCase()).not.toContain("occupancy");
    expect(output).not.toContain("sbx_");
  });

  test("[WS-REMOTE-COMPAT-222] occupy Cloudflare 502 prints a human next step without the contract sentence", async () => {
    const { occupancyCloudCompatError } = await import("../src/remote-code-session.js");
    const omp = occupancyCloudCompatError(
      {
        code: "sdk_unstructured_error",
        category: "infra",
        message:
          "The server returned an error that did not match the Appaloft error contract. HTTP 502 Body: {cloudflare 502 bad gateway, origin invalid or incomplete response}",
        retryable: true,
        details: {
          status: 502,
          bodyPreview: "{cloudflare 502 bad gateway, origin invalid or incomplete response}",
        },
      },
      { id: "srv_4lifk0yrcecy", name: "hostinger" },
      undefined,
      { alias: "omp", harness: "omp" },
    );
    const output = formatHumanCliError(omp);
    expect(output).not.toContain("did not match the Appaloft error contract");
    expect(output).toContain("Cloud is temporarily unreachable");
    expect(output).toContain("HTTP 502");
    expect(output).toContain("appaloft code --omp --server srv_4lifk0yrcecy");
    expect(output).not.toContain("cloudflare 502 bad gateway");
    expect(output).not.toContain("<html");
    expect(output.toLowerCase()).not.toContain("occupancy");
    expect(output).not.toContain("sbx_");
    const pi = occupancyCloudCompatError(
      {
        code: "control_plane_unexpected_html_response",
        category: "infra",
        message: "Control plane returned HTML instead of JSON.",
        retryable: true,
        details: { status: 503, bodyKind: "html" },
      },
      { id: "srv_4lifk0yrcecy", name: "hostinger" },
      undefined,
      { alias: "pi", harness: "pi" },
    );
    const piOutput = formatHumanCliError(pi);
    expect(piOutput).toContain("appaloft code --pi --server srv_4lifk0yrcecy");
    expect(piOutput.toLowerCase()).not.toContain("occupancy");
    expect(piOutput).not.toContain("sbx_");
  });

  test("[WS-REMOTE-COMPAT-222] 502 with folder.local repositoryIdentity does not print Opening folder.local", () => {
    const output = formatHumanCliError({
      code: "workspace_open_cloud_temporarily_unreachable",
      category: "infra",
      message: "Cloud is temporarily unreachable (HTTP 502).",
      retryable: true,
      details: {
        phase: "occupy-preparing-disk",
        status: 502,
        causeCode: "sdk_unstructured_error",
        repositoryIdentity: "folder.local/cwd/appaloft-cloud",
        guidance: "Retry appaloft code --pi --server srv_4lifk0yrcecy.",
      },
    });
    expect(output).toContain("Cloud is temporarily unreachable");
    expect(output).toContain("HTTP 502");
    expect(output).toContain("appaloft code --pi --server srv_4lifk0yrcecy");
    expect(output).not.toContain("Opening folder.local");
    expect(output).not.toContain("Opening folder.local/cwd/appaloft-cloud");
    expect(output).not.toMatch(/occupancy/iu);
    const raw = formatHumanCliError({
      code: "sdk_unstructured_error",
      category: "infra",
      message:
        "The server returned an error that did not match the Appaloft error contract. HTTP 502 Body: {cloudflare 502 bad gateway}",
      retryable: true,
      details: {
        status: 502,
        repositoryIdentity: "folder.local/cwd/appaloft-cloud",
        causeCode: "sdk_unstructured_error",
      },
    });
    expect(raw).not.toContain("Opening folder.local");
    expect(raw).not.toContain("Opening folder.local/cwd/appaloft-cloud");
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
