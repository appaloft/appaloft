import { describe, expect, test } from "bun:test";

import {
  isOccupancyGitHubCompareUrl,
  isOccupancyGitHubPullRequestUrl,
  isOccupancyHttpUrl,
  occupancyAppResourceId,
  occupancyAvailableDoorHint,
  occupancyChromeForProject,
  occupancyCodeOpenUrl,
  occupancyCompareOrPullUrl,
  occupancyConnectionsUrl,
  occupancyGitHubCompareUrl,
  occupancyLocalEnvironmentId,
  occupancyPullRequestFromPreviewEnvironments,
  parseOccupancyEnvSetAssignment,
  parseOccupancyEnvUnsetAssignment,
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

  test("[WS-REMOTE-OPEN-141] --open-target connections stays on Connections", () => {
    expect(occupancyConnectionsUrl("https://app.appaloft.com/")).toBe(
      "https://app.appaloft.com/account/connections",
    );
    expect(
      occupancyCodeOpenUrl({
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        previewUrl: "http://app-sc156jw98k.127.0.0.1.sslip.io/",
        connectionsUrl: "https://app.appaloft.com/account/connections",
        target: "connections",
      }),
    ).toBe("https://app.appaloft.com/account/connections");
    expect(
      occupancyAvailableDoorHint({
        repositoryIdentity: "github.com/traefik/whoami",
        commitSha: "1ce75d01b6978863647da42557a707a479da3a51",
        previewUrl: "http://app-sc156jw98k.127.0.0.1.sslip.io/",
        connectionsUrl: "https://app.appaloft.com/account/connections",
      }),
    ).toBe("Open · --open-target preview|connections · workspace p/g");
  });
});

describe("occupancy resource logs", () => {
  test("[WS-REMOTE-LOGS-143][WS-REMOTE-HEALTH-145][WS-REMOTE-DIAG-147][WS-REMOTE-RUNTIME-153][WS-REMOTE-TERM-155][WS-REMOTE-SHOW-157][WS-REMOTE-CONFIG-159] copies occupancy Resource app id", () => {
    expect(
      occupancyAppResourceId(
        [
          { id: "res_other", projectId: "prj_web", slug: "worker" },
          { id: "res_am78rpisds2x", projectId: "prj_web", slug: "app" },
        ],
        "prj_web",
      ),
    ).toBe("res_am78rpisds2x");
  });

  test("[WS-REMOTE-LOGS-144][WS-REMOTE-HEALTH-146][WS-REMOTE-DIAG-148][WS-REMOTE-RUNTIME-154][WS-REMOTE-TERM-156][WS-REMOTE-SHOW-158][WS-REMOTE-CONFIG-160] missing occupancy Resource app stays omitted", () => {
    expect(
      occupancyAppResourceId(
        [{ id: "res_other", projectId: "prj_web", slug: "worker" }],
        "prj_web",
      ),
    ).toBeUndefined();
  });
});

describe("occupancy env set", () => {
  test("[WS-REMOTE-ENVSET-161][WS-REMOTE-ENVUNSET-163] copies occupancy Environment local id", () => {
    expect(
      occupancyLocalEnvironmentId(
        [
          { id: "env_other", projectId: "prj_web", name: "preview", status: "active" },
          { id: "env_xc5zlcwxk650", projectId: "prj_web", name: "local", status: "active" },
        ],
        "prj_web",
      ),
    ).toBe("env_xc5zlcwxk650");
  });

  test("[WS-REMOTE-ENVSET-162][WS-REMOTE-ENVUNSET-164] missing occupancy Environment local stays omitted", () => {
    expect(
      occupancyLocalEnvironmentId(
        [{ id: "env_other", projectId: "prj_web", name: "preview", status: "active" }],
        "prj_web",
      ),
    ).toBeUndefined();
  });

  test("[WS-REMOTE-ENVSET-161] parses KEY VALUE without environment id", () => {
    expect(parseOccupancyEnvSetAssignment(["OCCUPANCY_CLI_SMOKE", "1"])).toEqual({
      key: "OCCUPANCY_CLI_SMOKE",
      value: "1",
    });
  });

  test("[WS-REMOTE-ENVSET-161] keeps explicit environment id", () => {
    expect(parseOccupancyEnvSetAssignment(["env_demo", "APP_SECRET", "private-value"])).toEqual({
      environmentId: "env_demo",
      key: "APP_SECRET",
      value: "private-value",
    });
  });

  test("[WS-REMOTE-ENVUNSET-163] parses KEY without environment id", () => {
    expect(parseOccupancyEnvUnsetAssignment(["OCCUPANCY_CLI_SMOKE"])).toEqual({
      key: "OCCUPANCY_CLI_SMOKE",
    });
  });
});
