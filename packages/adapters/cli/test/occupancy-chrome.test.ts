import { describe, expect, test } from "bun:test";

import {
  occupancyChromeForProject,
  occupancyPullRequestFromPreviewEnvironments,
} from "../src/occupancy-chrome.js";

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
    ).toEqual({
      number: 928,
      url: "https://github.com/traefik/whoami/pull/928",
    });
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

  test("[WS-REMOTE-CA-084] GitHub occupancy PR includes pull URL", () => {
    expect(
      occupancyPullRequestFromPreviewEnvironments(
        [
          {
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
        },
      ),
    ).toEqual({
      number: 928,
      url: "https://github.com/traefik/whoami/pull/928",
    });
  });

  test("[WS-REMOTE-CA-085] non-GitHub occupancy PR stays number-only", () => {
    expect(
      occupancyPullRequestFromPreviewEnvironments(
        [
          {
            source: {
              repositoryFullName: "acme/api",
              pullRequestNumber: 12,
              headSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            },
          },
        ],
        {
          repositoryIdentity: "gitlab.com/acme/api",
          commitSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
      ),
    ).toEqual({ number: 12 });
  });
});

describe("occupancy production chrome", () => {
  test("[WS-REMOTE-CA-078][WS-REMOTE-CA-080] copies durable domain as Production", () => {
    expect(
      occupancyChromeForProject(
        [
          {
            projectId: "prj_web",
            slug: "app",
            lastDeploymentId: "dep_rfqfapqwpyjn",
            lastDeploymentStatus: "succeeded",
            accessSummary: {
              latestGeneratedAccessRoute: {
                url: "http://app-sc156jw98k.127.0.0.1.sslip.io",
                deploymentStatus: "succeeded",
              },
              latestDurableDomainRoute: {
                url: "https://whoami.example",
                deploymentStatus: "succeeded",
              },
            },
          },
        ],
        "prj_web",
      ),
    ).toEqual({
      preview: { url: "http://app-sc156jw98k.127.0.0.1.sslip.io" },
      production: { url: "https://whoami.example" },
      deployment: { id: "dep_rfqfapqwpyjn", status: "succeeded" },
    });
  });

  test("[WS-REMOTE-CA-079] missing Production stays omitted", () => {
    expect(
      occupancyChromeForProject(
        [
          {
            projectId: "prj_web",
            slug: "app",
            accessSummary: {
              latestGeneratedAccessRoute: {
                url: "http://app-sc156jw98k.127.0.0.1.sslip.io",
                deploymentStatus: "succeeded",
              },
            },
          },
        ],
        "prj_web",
      ),
    ).toEqual({
      preview: { url: "http://app-sc156jw98k.127.0.0.1.sslip.io" },
    });
  });
});
