import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { createExecutionContext } from "@appaloft/application";
import { createGitHubPreviewPrCommentFeedbackWriter } from "../src";

const smokeEnabled = ["1", "true"].includes(
  (Bun.env.APPALOFT_GITHUB_PREVIEW_PROVIDER_SMOKE ?? "").toLowerCase(),
);

const marker = "<!-- appaloft-preview-provider-smoke -->";

function requiredEnv(name: string): string {
  const value = Bun.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when APPALOFT_GITHUB_PREVIEW_PROVIDER_SMOKE=true`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function repositoryPath(repositoryFullName: string): { owner: string; repo: string } {
  const [owner, repo] = repositoryFullName.split("/");
  if (!owner || !repo || repositoryFullName.split("/").length !== 2) {
    throw new Error("APPALOFT_GITHUB_PREVIEW_SMOKE_REPOSITORY must be owner/repo");
  }
  return { owner, repo };
}

async function findExistingSmokeComment(input: {
  apiBaseUrl: string;
  repositoryFullName: string;
  pullRequestNumber: number;
  token: string;
}): Promise<string | undefined> {
  const repository = repositoryPath(input.repositoryFullName);
  const url = new URL(
    `/repos/${repository.owner}/${repository.repo}/issues/${input.pullRequestNumber}/comments`,
    input.apiBaseUrl,
  );
  url.searchParams.set("per_page", "100");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${input.token}`,
      "user-agent": "appaloft-control-plane",
      "x-github-api-version": "2022-11-28",
    },
  });
  expect(response.ok, `GitHub comments lookup failed with ${response.status}`).toBe(true);

  const payload: unknown = await response.json();
  expect(Array.isArray(payload)).toBe(true);
  if (!Array.isArray(payload)) {
    return undefined;
  }

  const existing = payload.find((comment) => {
    if (!isRecord(comment) || typeof comment.body !== "string") {
      return false;
    }
    return comment.body.includes(marker);
  });
  if (!isRecord(existing)) {
    return undefined;
  }

  const id = existing.id;
  return typeof id === "number" || typeof id === "string" ? String(id) : undefined;
}

describe("GitHub preview provider smoke", () => {
  if (!smokeEnabled) {
    test.skip("[PG-PREVIEW-PROVIDER-001] live GitHub PR comment feedback requires APPALOFT_GITHUB_PREVIEW_PROVIDER_SMOKE=true", () => {});
  } else {
    test("[PG-PREVIEW-PROVIDER-001] creates or updates a live GitHub PR comment through the preview feedback writer", async () => {
      const token = requiredEnv("APPALOFT_GITHUB_PREVIEW_FEEDBACK_TOKEN");
      const repositoryFullName = requiredEnv("APPALOFT_GITHUB_PREVIEW_SMOKE_REPOSITORY");
      const pullRequestNumber = Number(requiredEnv("APPALOFT_GITHUB_PREVIEW_SMOKE_PR"));
      expect(Number.isInteger(pullRequestNumber)).toBe(true);

      const apiBaseUrl = Bun.env.APPALOFT_GITHUB_API_BASE_URL?.trim() || "https://api.github.com";
      const providerFeedbackId = await findExistingSmokeComment({
        apiBaseUrl,
        repositoryFullName,
        pullRequestNumber,
        token,
      });
      const writer = createGitHubPreviewPrCommentFeedbackWriter(token, fetch, apiBaseUrl);
      const body = [
        marker,
        "",
        "Appaloft live preview provider smoke.",
        `Updated at: ${new Date().toISOString()}`,
      ].join("\n");

      const result = await writer.publish(
        createExecutionContext({
          entrypoint: "system",
          requestId: "req_github_preview_provider_smoke",
        }),
        {
          feedbackKey: "feedback:sevt_preview_provider_smoke:github-pr-comment",
          sourceEventId: "sevt_preview_provider_smoke",
          previewEnvironmentId: "prenv_preview_provider_smoke",
          channel: "github-pr-comment",
          repositoryFullName,
          pullRequestNumber,
          body,
          ...(providerFeedbackId ? { providerFeedbackId } : {}),
        },
      );

      expect(result.isOk()).toBe(true);
      const output = result._unsafeUnwrap();
      expect(output.providerFeedbackId).toBeTruthy();
      expect(JSON.stringify(output)).not.toContain(token);
      expect(JSON.stringify(output)).not.toContain("Appaloft live preview provider smoke.");
    });
  }
});
