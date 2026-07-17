import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import {
  createExecutionContext,
  type GitHubAppInstallationToken,
  type GitHubAppRuntime,
} from "@appaloft/application";
import { ok, type Result } from "@appaloft/core";

import { createGitHubSourceEventChangedPathResolver } from "../src/index";

class FakeGitHubAppRuntime implements GitHubAppRuntime {
  readonly installationIds: string[] = [];

  async createInstallationAccessToken(
    _context: Parameters<GitHubAppRuntime["createInstallationAccessToken"]>[0],
    input: Parameters<GitHubAppRuntime["createInstallationAccessToken"]>[1],
  ): Promise<Result<GitHubAppInstallationToken>> {
    this.installationIds.push(input.installationId);
    return ok({ token: "installation-token", expiresAt: "2026-01-01T01:00:00.000Z" });
  }

  async readInstallation(): ReturnType<GitHubAppRuntime["readInstallation"]> {
    throw new Error("not used");
  }
}

describe("GitHub source event changed-path resolver", () => {
  test("[SRC-AUTO-EVENT-009] resolves final before..after files and both sides of a rename", async () => {
    const runtime = new FakeGitHubAppRuntime();
    const requests: { url: string; authorization?: string }[] = [];
    const resolver = createGitHubSourceEventChangedPathResolver({
      githubAppRuntime: runtime,
      fetcher: async (request, init) => {
        requests.push({
          url: String(request),
          ...(new Headers(init?.headers).get("authorization")
            ? { authorization: new Headers(init?.headers).get("authorization") ?? undefined }
            : {}),
        });
        return Response.json({
          files: [
            { filename: "apps/web/src/index.ts", status: "modified" },
            {
              filename: "apps/web/src/new-name.ts",
              previous_filename: "apps/web/src/old-name.ts",
              status: "renamed",
            },
          ],
        });
      },
      apiBaseUrl: "https://api.github.test",
    });

    const result = await resolver.resolve(
      createExecutionContext({ entrypoint: "system", requestId: "req_source_diff_test" }),
      {
        sourceKind: "github",
        sourceIdentity: {
          locator: "https://github.com/appaloft/demo",
          repositoryFullName: "appaloft/demo",
        },
        ref: "main",
        beforeRevision: "before123",
        revision: "after123",
        refChangeKind: "updated",
        forced: false,
        providerConnectionId: "98765",
      },
    );

    expect(result).toEqual(
      ok({
        status: "resolved",
        changedPaths: [
          "apps/web/src/index.ts",
          "apps/web/src/new-name.ts",
          "apps/web/src/old-name.ts",
        ],
      }),
    );
    expect(runtime.installationIds).toEqual(["98765"]);
    expect(requests).toEqual([
      {
        url: "https://api.github.test/repos/appaloft/demo/compare/before123...after123?per_page=100&page=1",
        authorization: "Bearer installation-token",
      },
    ]);
  });

  test("[SRC-AUTO-EVENT-012] resolves a new ref from its final tree", async () => {
    const resolver = createGitHubSourceEventChangedPathResolver({
      fetcher: async () =>
        Response.json({
          truncated: false,
          tree: [
            { path: "apps", type: "tree" },
            { path: "apps/web/src/index.ts", type: "blob" },
            { path: "vendor/lib", type: "commit" },
          ],
        }),
      apiBaseUrl: "https://api.github.test",
    });

    const result = await resolver.resolve(
      createExecutionContext({ entrypoint: "system", requestId: "req_new_ref_diff_test" }),
      {
        sourceKind: "github",
        sourceIdentity: {
          locator: "https://github.com/appaloft/demo",
          repositoryFullName: "appaloft/demo",
        },
        ref: "feature",
        revision: "after123",
        refChangeKind: "created",
        forced: false,
      },
    );

    expect(result).toEqual(
      ok({
        status: "resolved",
        changedPaths: ["apps/web/src/index.ts", "vendor/lib"],
      }),
    );
  });

  test("[SRC-AUTO-EVENT-011] fails closed when provider final-diff output is truncated", async () => {
    const resolver = createGitHubSourceEventChangedPathResolver({
      fetcher: async () =>
        Response.json({
          files: Array.from({ length: 300 }, (_, index) => ({
            filename: `apps/web/file-${index}.ts`,
            status: "modified",
          })),
        }),
    });

    const result = await resolver.resolve(
      createExecutionContext({ entrypoint: "system", requestId: "req_truncated_diff_test" }),
      {
        sourceKind: "github",
        sourceIdentity: {
          locator: "https://github.com/appaloft/demo",
          repositoryFullName: "appaloft/demo",
        },
        ref: "main",
        beforeRevision: "before123",
        revision: "after123",
        refChangeKind: "updated",
        forced: true,
      },
    );

    expect(result).toEqual(ok({ status: "unavailable", reason: "provider-compare-truncated" }));
  });

  test("[SRC-AUTO-EVENT-011] converts provider transport failures into unavailable evidence", async () => {
    const resolver = createGitHubSourceEventChangedPathResolver({
      fetcher: async () => {
        throw new Error("provider connection reset");
      },
    });

    const result = await resolver.resolve(
      createExecutionContext({ entrypoint: "system", requestId: "req_failed_diff_test" }),
      {
        sourceKind: "github",
        sourceIdentity: {
          locator: "https://github.com/appaloft/demo",
          repositoryFullName: "appaloft/demo",
        },
        ref: "main",
        beforeRevision: "before123",
        revision: "after123",
        refChangeKind: "updated",
        forced: false,
      },
    );

    expect(result).toEqual(ok({ status: "unavailable", reason: "provider-compare-unavailable" }));
  });
});
