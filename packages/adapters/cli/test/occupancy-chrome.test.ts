import { describe, expect, test } from "bun:test";

import {
  isOccupancyGitHubCompareUrl,
  isOccupancyGitHubPullRequestUrl,
  isOccupancyHttpUrl,
  occupancyAvailableDoorHint,
  occupancyChromeForProject,
  occupancyCodeOpenUrl,
  occupancyCompareOrPullUrl,
  occupancyGitHubCompareUrl,
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

  test("[WS-REMOTE-CA-087] accepts only https GitHub pull URLs", () => {
    expect(isOccupancyGitHubPullRequestUrl("https://github.com/traefik/whoami/pull/928")).toBe(
      true,
    );
    expect(isOccupancyGitHubPullRequestUrl("http://github.com/traefik/whoami/pull/928")).toBe(
      false,
    );
    expect(isOccupancyGitHubPullRequestUrl("https://gitlab.com/acme/api/pull/12")).toBe(false);
    expect(isOccupancyGitHubPullRequestUrl("https://github.com/traefik/whoami/issues/928")).toBe(
      false,
    );
  });

  test("[WS-REMOTE-CA-090] accepts only http occupancy Preview URLs", () => {
    expect(isOccupancyHttpUrl("http://app-sc156jw98k.127.0.0.1.sslip.io/")).toBe(true);
    expect(isOccupancyHttpUrl("https://whoami.example/")).toBe(true);
    expect(isOccupancyHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isOccupancyHttpUrl("file:///etc/passwd")).toBe(false);
    expect(isOccupancyHttpUrl("https://user:pass@whoami.example/")).toBe(false);
  });

  test("[WS-REMOTE-CA-093][WS-REMOTE-CA-094][WS-REMOTE-CA-095] occupancy compare stays GitHub-only", () => {
    expect(
      occupancyGitHubCompareUrl({
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        branch: "feat/occupancy",
      }),
    ).toEqual("https://github.com/traefik/whoami/compare/feat/occupancy?expand=1");
    expect(
      occupancyCompareOrPullUrl(
        {
          repositoryIdentity: "github.com/traefik/whoami",
          commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
          branch: "feat/occupancy",
        },
        "https://github.com/traefik/whoami/pull/928",
      ),
    ).toEqual("https://github.com/traefik/whoami/pull/928");
    expect(
      occupancyGitHubCompareUrl({
        repositoryIdentity: "gitlab.com/acme/api",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        branch: "feat/occupancy",
      }),
    ).toBeUndefined();
    expect(
      occupancyGitHubCompareUrl({
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
      }),
    ).toBeUndefined();
    expect(
      isOccupancyGitHubCompareUrl(
        "https://github.com/traefik/whoami/compare/feat/occupancy?expand=1",
      ),
    ).toBe(true);
    expect(
      isOccupancyGitHubCompareUrl("https://github.com/traefik/whoami/compare/feat/occupancy"),
    ).toBe(false);
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

describe("occupancy code --open", () => {
  test("[WS-REMOTE-OPEN-107] prefers Preview", () => {
    expect(
      occupancyCodeOpenUrl({
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        branch: "feat/occupancy",
        previewUrl: "http://app-sc156jw98k.127.0.0.1.sslip.io/",
        pullRequestNumber: 928,
      }),
    ).toBe("http://app-sc156jw98k.127.0.0.1.sslip.io/");
  });

  test("[WS-REMOTE-OPEN-108] falls back to PR then compare", () => {
    expect(
      occupancyCodeOpenUrl({
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        branch: "feat/occupancy",
        pullRequestNumber: 928,
      }),
    ).toBe("https://github.com/traefik/whoami/pull/928");
    expect(
      occupancyCodeOpenUrl({
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        branch: "feat/occupancy",
      }),
    ).toBe("https://github.com/traefik/whoami/compare/feat/occupancy?expand=1");
  });

  test("[WS-REMOTE-OPEN-109] missing occupancy open stays lean", () => {
    expect(
      occupancyCodeOpenUrl({
        repositoryIdentity: "gitlab.com/acme/api",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
      }),
    ).toBeUndefined();
  });

  test("[WS-REMOTE-OPEN-110][WS-REMOTE-OPEN-111][WS-REMOTE-OPEN-112] --open-target stays on the chosen URL", () => {
    expect(
      occupancyCodeOpenUrl({
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        branch: "feat/occupancy",
        previewUrl: "http://app-sc156jw98k.127.0.0.1.sslip.io/",
        pullRequestNumber: 928,
        target: "preview",
      }),
    ).toBe("http://app-sc156jw98k.127.0.0.1.sslip.io/");
    expect(
      occupancyCodeOpenUrl({
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        branch: "feat/occupancy",
        previewUrl: "http://app-sc156jw98k.127.0.0.1.sslip.io/",
        pullRequestNumber: 928,
        target: "pr",
      }),
    ).toBe("https://github.com/traefik/whoami/pull/928");
    expect(
      occupancyCodeOpenUrl({
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        previewUrl: "http://app-sc156jw98k.127.0.0.1.sslip.io/",
        target: "compare",
      }),
    ).toBeUndefined();
  });

  test("[WS-REMOTE-OPEN-114][WS-REMOTE-OPEN-115] --open-target production stays on Production", () => {
    expect(
      occupancyCodeOpenUrl({
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        previewUrl: "http://app-sc156jw98k.127.0.0.1.sslip.io/",
        productionUrl: "https://whoami.example/",
        target: "production",
      }),
    ).toBe("https://whoami.example/");
    expect(
      occupancyCodeOpenUrl({
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        previewUrl: "http://app-sc156jw98k.127.0.0.1.sslip.io/",
        target: "production",
      }),
    ).toBeUndefined();
  });

  test("[WS-REMOTE-HINT-122][WS-REMOTE-HINT-123][WS-REMOTE-HINT-124] available-door hint lists only present URLs", () => {
    expect(
      occupancyAvailableDoorHint({
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        previewUrl: "http://app-sc156jw98k.127.0.0.1.sslip.io/",
        pullRequestNumber: 928,
      }),
    ).toBe("Open · --open-target preview|pr · workspace p/o");
    expect(
      occupancyAvailableDoorHint({
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        branch: "feat/occupancy",
        pullRequestNumber: 928,
      }),
    ).toBe("Open · --open-target pr · workspace o");
    expect(
      occupancyAvailableDoorHint({
        repositoryIdentity: "gitlab.com/acme/api",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
      }),
    ).toBeUndefined();
  });
});
