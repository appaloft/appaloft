import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import {
  type CleanupPreviewResult,
  type CleanupPreviewUseCase,
  createExecutionContext,
  type ExecutionContext,
} from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";

import { ShellPreviewEnvironmentCleaner } from "../src/preview-environment-cleaner";

class CapturingCleanupPreviewUseCase implements Pick<CleanupPreviewUseCase, "execute"> {
  readonly calls: Array<{
    context: ExecutionContext;
    input: Parameters<CleanupPreviewUseCase["execute"]>[1];
  }> = [];

  result: Result<CleanupPreviewResult> = ok({
    sourceFingerprint: "srcfp_pr_42",
    status: "cleaned",
    cleanedRuntime: true,
    removedServerAppliedRoute: true,
    removedSourceLink: true,
  });

  async execute(
    context: ExecutionContext,
    input: Parameters<CleanupPreviewUseCase["execute"]>[1],
  ): ReturnType<CleanupPreviewUseCase["execute"]> {
    this.calls.push({ context, input });
    return this.result;
  }
}

function createContext() {
  return createExecutionContext({
    entrypoint: "system",
    requestId: "req_preview_environment_cleaner",
  });
}

describe("ShellPreviewEnvironmentCleaner", () => {
  test("[PG-PREVIEW-CLEANUP-002] delegates cleanup to source-fingerprint cleanup command", async () => {
    const cleanupPreviewUseCase = new CapturingCleanupPreviewUseCase();
    const cleaner = new ShellPreviewEnvironmentCleaner(cleanupPreviewUseCase);
    const context = createContext();

    const result = await cleaner.cleanup(context, {
      previewEnvironmentId: "penv_42",
      resourceId: "res_api",
      sourceBindingFingerprint: "srcfp_pr_42",
      provider: "github",
      repositoryFullName: "acme/api",
      pullRequestNumber: 42,
    });

    expect(result.isOk()).toBe(true);
    expect(cleanupPreviewUseCase.calls).toEqual([
      {
        context,
        input: {
          sourceFingerprint: "srcfp_pr_42",
        },
      },
    ]);
    expect(result._unsafeUnwrap()).toEqual({
      cleanedRuntime: true,
      removedRoute: true,
      removedSourceLink: true,
      removedProviderMetadata: false,
      updatedFeedback: false,
    });
  });

  test("[PG-PREVIEW-CLEANUP-002] preserves retryable cleanup failures with safe preview scope", async () => {
    const cleanupPreviewUseCase = new CapturingCleanupPreviewUseCase();
    cleanupPreviewUseCase.result = err(
      domainError.provider(
        "Preview runtime cleanup failed",
        {
          phase: "runtime-cleanup",
          deploymentId: "dep_preview",
        },
        true,
      ),
    );
    const cleaner = new ShellPreviewEnvironmentCleaner(cleanupPreviewUseCase);

    const result = await cleaner.cleanup(createContext(), {
      previewEnvironmentId: "penv_42",
      resourceId: "res_api",
      sourceBindingFingerprint: "srcfp_pr_42",
      provider: "github",
      repositoryFullName: "acme/api",
      pullRequestNumber: 42,
    });

    expect(result.isErr()).toBe(true);
    const failure = result._unsafeUnwrapErr();
    expect(failure.retryable).toBe(true);
    expect(failure.details).toEqual({
      phase: "runtime-cleanup",
      deploymentId: "dep_preview",
      previewEnvironmentId: "penv_42",
      resourceId: "res_api",
      sourceBindingFingerprint: "srcfp_pr_42",
      provider: "github",
    });
  });
});
