import { describe, expect, test } from "bun:test";

import { occupancyPullRequestFromPreviewEnvironments } from "../src/occupancy-chrome.js";

describe("occupancy PR chrome", () => {
  test("[WS-REMOTE-CA-075] copies matching preview-environment PR", () => {
    expect(
      occupancyPullRequestFromPreviewEnvironments(
        [
          {
            updatedAt: "2026-08-16T00:00:00.000Z",
            source: {
              repositoryFullName: "traefik/whoami",
              pullRequestNumber: 900,
              headSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            },
          },
          {
            updatedAt: "2026-08-16T01:00:00.000Z",
            source: {
              repositoryFullName: "traefik/whoami",
              pullRequestNumber: 928,
              headSha: "1ce75d01b6978863647da42557a707a479da3a51",
            },
          },
        ],
        {
          repositoryIdentity: "github.com/traefik/whoami",
          commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
          branch: "feat/occupancy",
        },
      ),
    ).toEqual({ number: 928 });
  });

  test("[WS-REMOTE-CA-076] missing PR stays omitted", () => {
    expect(
      occupancyPullRequestFromPreviewEnvironments([], {
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
      }),
    ).toBeUndefined();
  });

  test("[WS-REMOTE-CA-077] foreign PR stays out", () => {
    expect(
      occupancyPullRequestFromPreviewEnvironments(
        [
          {
            source: {
              repositoryFullName: "octocat/Hello-World",
              pullRequestNumber: 1,
              headSha: "1ce75d01b6978863647da42557a707a479da3a51",
            },
          },
        ],
        {
          repositoryIdentity: "github.com/traefik/whoami",
          commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        },
      ),
    ).toBeUndefined();
  });
});
