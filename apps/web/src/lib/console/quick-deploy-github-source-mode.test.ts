import { describe, expect, test } from "vitest";
import { preferredQuickDeployGitHubSourceMode } from "./quick-deploy-github-source-mode";

describe("Quick Deploy GitHub source mode", () => {
  test("[QUICK-DEPLOY-ENTRY-018] opens repository browsing when the configured connection is ready", () => {
    expect(
      preferredQuickDeployGitHubSourceMode({
        currentMode: "url",
        modeTouched: false,
        sourceLocator: "",
        repositoryBrowsingEnabled: true,
      }),
    ).toBe("browser");
  });

  test("[QUICK-DEPLOY-ENTRY-018] preserves an explicit public URL choice", () => {
    expect(
      preferredQuickDeployGitHubSourceMode({
        currentMode: "url",
        modeTouched: true,
        sourceLocator: "https://github.com/acme/public.git",
        repositoryBrowsingEnabled: true,
      }),
    ).toBe("url");
  });

  test("[QUICK-DEPLOY-ENTRY-018] stays in URL mode while repository browsing is unavailable", () => {
    expect(
      preferredQuickDeployGitHubSourceMode({
        currentMode: "url",
        modeTouched: false,
        sourceLocator: "",
        repositoryBrowsingEnabled: false,
      }),
    ).toBe("url");
  });
});
