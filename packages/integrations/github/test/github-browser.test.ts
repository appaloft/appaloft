import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { createExecutionContext } from "@appaloft/application";

import { createGitHubRepositoryBrowser } from "../src";

describe("GitHubApiRepositoryBrowser", () => {
  test("lists and filters repositories from GitHub API payload", async () => {
    const browser = createGitHubRepositoryBrowser(
      async () =>
        new Response(
          JSON.stringify([
            {
              id: 2,
              name: "worker",
              full_name: "acme/worker",
              description: "background jobs",
              private: true,
              default_branch: "main",
              html_url: "https://github.com/acme/worker",
              clone_url: "https://github.com/acme/worker.git",
              updated_at: "2026-04-10T03:00:00.000Z",
              owner: {
                login: "acme",
              },
            },
            {
              id: 1,
              name: "console",
              full_name: "acme/console",
              description: "web console",
              private: false,
              default_branch: "main",
              html_url: "https://github.com/acme/console",
              clone_url: "https://github.com/acme/console.git",
              updated_at: "2026-04-09T03:00:00.000Z",
              owner: {
                login: "acme",
              },
            },
          ]),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
    );

    const repositories = await browser.listRepositories(
      createExecutionContext({ entrypoint: "system" }),
      {
        accessToken: "github-token",
        search: "work",
      },
    );

    expect(repositories).toEqual([
      {
        id: "2",
        name: "worker",
        fullName: "acme/worker",
        ownerLogin: "acme",
        description: "background jobs",
        private: true,
        defaultBranch: "main",
        htmlUrl: "https://github.com/acme/worker",
        cloneUrl: "https://github.com/acme/worker.git",
        updatedAt: "2026-04-10T03:00:00.000Z",
      },
    ]);
  });
});
