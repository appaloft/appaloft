import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const quickDeploySheetSource = readFileSync(
  fileURLToPath(new URL("./QuickDeploySheet.svelte", import.meta.url)),
  "utf8",
);
const resourceSourceOptionSource = readFileSync(
  fileURLToPath(new URL("./ResourceSourceOption.svelte", import.meta.url)),
  "utf8",
);
const deployPageSource = readFileSync(
  fileURLToPath(new URL("../../../routes/deploy/+page.svelte", import.meta.url)),
  "utf8",
);

describe("QuickDeploySheet structure", () => {
  test("[QUICK-DEPLOY-UX-001] keeps the lower quick deploy section scoped to variables", () => {
    expect(quickDeploySheetSource).toContain("data-quick-deploy-variables-section");
    expect(quickDeploySheetSource).toContain("<details");
    expect(quickDeploySheetSource).toContain("ontoggle={(event) =>");
    expect(quickDeploySheetSource).toContain("未配置变量");
    expect(quickDeploySheetSource).toContain("已配置 1 项");
    expect(quickDeploySheetSource).not.toContain("<span>部署配置</span>");
    expect(quickDeploySheetSource).not.toContain('{variableContextEnabled ? "跳过" : "编辑"}');
    expect(quickDeploySheetSource).not.toContain('return "跳过";');
    expect(quickDeploySheetSource).not.toContain('return "不创建变量";');
    expect(quickDeploySheetSource).not.toContain("resource-default-static-publish-directory");
    expect(quickDeploySheetSource).not.toContain("resource-default-internal-port");
    expect(quickDeploySheetSource).not.toContain("resource-default-health-path");
    expect(quickDeploySheetSource).not.toContain("deploymentCommandPreview");
    expect(quickDeploySheetSource).not.toContain("appaloft deploy");
  });

  test("[QUICK-DEPLOY-UX-002] docks the submit action inside the right summary panel", () => {
    expect(quickDeploySheetSource).toContain("data-quick-deploy-action-panel");
    expect(quickDeploySheetSource).not.toContain("fixed inset-x-0 bottom-0");
    expect(quickDeploySheetSource).not.toContain("min-h-16 w-full items-center justify-between");
    expect(quickDeploySheetSource).toContain('class="w-full"');
  });

  test("[QUICK-DEPLOY-UX-003] keeps the deploy entry readable at constrained console widths", () => {
    expect(deployPageSource).toContain('<ConsoleResourceCanvas class="max-w-6xl">');
    expect(quickDeploySheetSource).toContain("lg:grid-cols-[minmax(0,1fr)_20rem]");
    expect(quickDeploySheetSource).not.toContain("md:grid-cols-[minmax(0,1fr)_20rem]");
    expect(quickDeploySheetSource).toContain("grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3");
    expect(quickDeploySheetSource).not.toContain("sm:grid-cols-2 xl:grid-cols-5");
    expect(quickDeploySheetSource).toContain("lg:sticky");
    expect(quickDeploySheetSource).not.toContain("md:sticky");
    expect(resourceSourceOptionSource).toContain("min-h-24");
    expect(resourceSourceOptionSource).toContain("px-4 py-4");
    expect(resourceSourceOptionSource).toContain("text-sm font-medium leading-5");
    expect(resourceSourceOptionSource).not.toContain("block truncate text-sm font-medium");
  });

  test("[QD-GHA-001] shows hosted GitHub App install without requiring GitHub OAuth", () => {
    expect(quickDeploySheetSource).toContain("data-github-app-install-panel");
    expect(quickDeploySheetSource).toContain("data-github-app-install-action");
    expect(quickDeploySheetSource).toContain("githubUsesHostedProviderApp && !githubAppConnected");
    expect(quickDeploySheetSource).not.toContain(
      "githubUsesHostedProviderApp && !githubProvider?.connected",
    );
  });

  test("[QD-GHA-002] shows installed GitHub App status before the repository picker", () => {
    expect(quickDeploySheetSource).toContain("data-github-app-connected-panel");
    expect(quickDeploySheetSource).toContain("githubAppAccountLabel");
    expect(quickDeploySheetSource).toContain("githubAppRepositoryAccessLabel");
    expect(quickDeploySheetSource).toContain("githubRepositoriesQuery.isPending");
  });

  test("[QD-GHA-003] preserves public Git URL mode in hosted GitHub App mode", () => {
    expect(quickDeploySheetSource).toContain("data-github-public-url-mode");
    expect(quickDeploySheetSource).toContain("githubSourceUrlModeHint");
    expect(quickDeploySheetSource).not.toContain(
      'if (sourceKind === "github" && githubUsesHostedProviderApp && githubSourceMode !== "browser")',
    );
    expect(quickDeploySheetSource).not.toContain(
      'if (githubUsesHostedProviderApp && mode === "url")',
    );
  });

  test("[QD-GHA-004] provides GitHub configuration actions without exposing operator secrets", () => {
    expect(quickDeploySheetSource).toContain("data-github-app-configure-action");
    expect(quickDeploySheetSource).toContain("data-github-app-configure-empty-action");
    expect(quickDeploySheetSource).toContain("githubNoAppRepositoryResults");
    expect(quickDeploySheetSource).not.toContain("APPALOFT_CLOUD_GITHUB_APP_PRIVATE_KEY");
    expect(quickDeploySheetSource).not.toContain("webhookSecret");
    expect(quickDeploySheetSource).not.toContain("clientSecret");
  });

  test("[QD-GHA-005] defers source build settings until a GitHub App repository is selected", () => {
    expect(quickDeploySheetSource).toContain("const showSourceBuildSettings = $derived.by");
    expect(quickDeploySheetSource).toContain(
      'sourceKind === "github" && githubSourceMode === "browser"',
    );
    expect(quickDeploySheetSource).toContain("return Boolean(selectedGitHubRepository)");
    expect(quickDeploySheetSource).toContain("data-source-build-settings");
    expect(quickDeploySheetSource).toContain("data-github-repository-scoped-settings");
    expect(quickDeploySheetSource).toContain("repositoryBaseDirectory");
    expect(quickDeploySheetSource).not.toContain(
      'sourceKind !== "docker-image" && sourceKind !== "blueprint"',
    );
  });
});
