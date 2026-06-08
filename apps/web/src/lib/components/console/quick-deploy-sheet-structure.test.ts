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
const projectDetailPageSource = readFileSync(
  fileURLToPath(new URL("../../../routes/projects/[projectId]/+page.svelte", import.meta.url)),
  "utf8",
);
const legacyResourceCreatePageSource = readFileSync(
  fileURLToPath(
    new URL("../../../routes/projects/[projectId]/resources/new/+page.svelte", import.meta.url),
  ),
  "utf8",
);
const legacyResourceCreateRouteSource = readFileSync(
  fileURLToPath(
    new URL("../../../routes/projects/[projectId]/resources/new/+page.ts", import.meta.url),
  ),
  "utf8",
);
const consoleUtilsSource = readFileSync(
  fileURLToPath(new URL("../../console/utils.ts", import.meta.url)),
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

  test("[QUICK-DEPLOY-UX-002B] opens project quick deploy as a URL-addressable locked modal", () => {
    expect(quickDeploySheetSource).toContain("lockedProjectId");
    expect(quickDeploySheetSource).toContain('setSearchParam(params, "modal", stateModal)');
    expect(quickDeploySheetSource).toContain('url.pathname = statePath || "/deploy"');
    expect(quickDeploySheetSource).toContain(
      'setSearchParam(params, "projectMode", lockedProjectId ? "existing" : projectMode, "existing")',
    );
    expect(quickDeploySheetSource).toContain("selectedProjectId = lockedProjectId");
    expect(projectDetailPageSource).toContain('modalIsOpen(page, "quick-deploy")');
    expect(projectDetailPageSource).toContain("projectQuickDeployHref(project.id)");
    expect(projectDetailPageSource).toContain("<Dialog.Root bind:open={quickDeployDialogOpen}");
    expect(projectDetailPageSource).toContain("<QuickDeploySheet");
    expect(projectDetailPageSource).toContain("lockedProjectId={project.id}");
    expect(projectDetailPageSource).not.toContain("projectCreateResourceHref(project.id)");
    expect(consoleUtilsSource).toContain("projectQuickDeployHref");
    expect(consoleUtilsSource).toContain('modal: "quick-deploy"');
    expect(consoleUtilsSource).not.toContain("/resources/new");
    expect(legacyResourceCreateRouteSource).toContain('searchParams.set("modal", "quick-deploy")');
    expect(legacyResourceCreateRouteSource).toContain(
      'searchParams.set("projectMode", "existing")',
    );
    expect(legacyResourceCreateRouteSource).toContain("throw redirect");
    expect(legacyResourceCreatePageSource).not.toContain("CreateResourceInput");
    expect(legacyResourceCreatePageSource).not.toContain("ResourceSourceOption");
  });

  test("[QUICK-DEPLOY-UX-003] keeps the deploy entry readable at constrained console widths", () => {
    expect(deployPageSource).toContain('<ConsoleResourceCanvas class="max-w-6xl">');
    expect(quickDeploySheetSource).toContain("lg:grid-cols-[minmax(0,1fr)_20rem]");
    expect(quickDeploySheetSource).not.toContain("md:grid-cols-[minmax(0,1fr)_20rem]");
    expect(quickDeploySheetSource).toContain("grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4");
    expect(quickDeploySheetSource).toContain("visibleSourceGroups");
    expect(quickDeploySheetSource).toContain("gitSourceOptions");
    expect(quickDeploySheetSource).toContain("dockerSourceOptions");
    expect(quickDeploySheetSource).toContain('value === "local-folder"');
    expect(quickDeploySheetSource).toContain('return "dockerfile";');
    expect(quickDeploySheetSource).not.toContain("sm:grid-cols-2 xl:grid-cols-5");
    expect(quickDeploySheetSource).toContain("data-quick-deploy-source-picker");
    expect(quickDeploySheetSource).toContain("lg:sticky");
    expect(quickDeploySheetSource).not.toContain("md:sticky");
    expect(resourceSourceOptionSource).toContain("min-h-24");
    expect(resourceSourceOptionSource).toContain("px-4 py-4");
    expect(resourceSourceOptionSource).toContain("text-sm font-medium leading-5");
    expect(resourceSourceOptionSource).not.toContain("block truncate text-sm font-medium");
  });

  test("[QUICK-DEPLOY-UX-004] locks the source picker after a Blueprint is selected", () => {
    expect(quickDeploySheetSource).toContain("selectedBlueprintSourceLocked");
    expect(quickDeploySheetSource).toContain("initialBlueprintSourceLocked");
    expect(quickDeploySheetSource).toContain("blueprintSourceLockedByEntry");
    expect(quickDeploySheetSource).toContain("isLockedBlueprintSourceEntry(page.url.searchParams)");
    expect(quickDeploySheetSource).toContain('params.get("source") === "blueprint"');
    expect(quickDeploySheetSource).toContain(
      'parseDeploymentStep(params.get("step")) !== "source"',
    );
    expect(quickDeploySheetSource).toContain(
      'blueprintSourceLockedByEntry && sourceKind === "blueprint" && Boolean(selectedBlueprintSlug.trim())',
    );
    expect(quickDeploySheetSource).toContain('if (kind !== "blueprint")');
    expect(quickDeploySheetSource).toContain("blueprintSourceLockedByEntry = false");
    expect(quickDeploySheetSource).toContain("{#if !selectedBlueprintSourceLocked}");
    expect(quickDeploySheetSource).toContain(
      'selectedSourceGroupKey === "git" && !selectedBlueprintSourceLocked',
    );
    expect(quickDeploySheetSource).toContain(
      'selectedSourceGroupKey === "docker" && !selectedBlueprintSourceLocked',
    );
    expect(quickDeploySheetSource).toContain(
      "quickDeploySourceExtensions.length > 1 && !selectedBlueprintSourceLocked",
    );
    expect(quickDeploySheetSource).toContain(
      "selectedBlueprintSourceExtension && !selectedBlueprintSourceLocked",
    );
    expect(quickDeploySheetSource).not.toContain(
      "{selectedBlueprintSourceExtension.pluginDisplayName}",
    );
    expect(quickDeploySheetSource).not.toContain("<style>");
    expect(quickDeploySheetSource).not.toContain("dependency-kind-logo");
  });

  test("[QUICK-DEPLOY-UX-005] renders the selected Blueprint with its product icon", () => {
    expect(quickDeploySheetSource).toContain("selectedBlueprintDisplayTitle");
    expect(quickDeploySheetSource).toContain("selectedBlueprintListing?.title");
    expect(quickDeploySheetSource).toContain("<BlueprintProductIcon");
    expect(quickDeploySheetSource).toContain("icon={selectedBlueprintListing?.icon}");
    expect(quickDeploySheetSource).toContain('imageClass="size-6"');
    expect(quickDeploySheetSource).toContain('icon?: "blueprint"');
    expect(quickDeploySheetSource).toContain("data-blueprint-summary-icon");
    expect(quickDeploySheetSource).toContain("data-blueprint-variable-list");
    expect(quickDeploySheetSource).toContain("data-blueprint-variable-key");
    expect(quickDeploySheetSource).toContain("readonly");
    expect(quickDeploySheetSource).not.toContain(
      'value: selectedBlueprintSourceExtension?.path ?? "/marketplace"',
    );
    expect(quickDeploySheetSource).not.toContain(
      '<Package class="size-4 shrink-0 text-muted-foreground" />',
    );
  });

  test("[QD-GHA-001] shows hosted GitHub App install without requiring GitHub OAuth", () => {
    expect(quickDeploySheetSource).toContain("data-github-app-install-panel");
    expect(quickDeploySheetSource).toContain("data-github-app-install-action");
    expect(quickDeploySheetSource).toContain("githubUsesHostedProviderApp && !githubAppConnected");
    expect(quickDeploySheetSource).toContain(
      "githubAppConnectionQuery.isError && !githubAppInstallUrl",
    );
    expect(quickDeploySheetSource).not.toContain(
      "githubUsesHostedProviderApp && !githubProvider?.connected",
    );
    expect(quickDeploySheetSource).not.toContain(
      "{readErrorMessage(githubAppConnectionQuery.error)}",
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
    expect(quickDeploySheetSource).toContain("githubAppConfigurationDiagnostics");
    expect(quickDeploySheetSource).toContain("githubAppDiagnosticMessage");
    expect(quickDeploySheetSource).toContain("cloud-github-app-env-missing");
    expect(quickDeploySheetSource).toContain("cloud-github-app-permissions-review-pending");
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

  test("[QD-STATIC-001] treats static sites as uploaded artifacts with optional server hosting", () => {
    expect(quickDeploySheetSource).toContain("data-static-site-upload-source");
    expect(quickDeploySheetSource).toContain("data-static-publish-target");
    expect(quickDeploySheetSource).toContain('type="file"');
    expect(quickDeploySheetSource).toContain('staticPublishTarget === "managed"');
    expect(quickDeploySheetSource).toContain("serverRequiredForQuickDeploy");
    expect(quickDeploySheetSource).toContain("publishUploadedStaticSite");
    expect(quickDeploySheetSource).toContain("orpcClient.staticArtifacts.publishPayload");
    expect(quickDeploySheetSource).toContain("orpcClient.staticArtifacts.publishArchive");
    expect(quickDeploySheetSource).toContain(
      'sourceKind === "blueprint" || sourceKind === "static-site" ? "" : sourceLocator',
    );
    expect(quickDeploySheetSource).not.toContain('serverName") ?? "local-machine"');
    expect(quickDeploySheetSource).not.toContain('serverHost") ?? "127.0.0.1"');
    expect(quickDeploySheetSource).not.toContain('serverPort") ?? "22"');
    expect(quickDeploySheetSource).not.toContain(
      'sourceKind === "static-site" && !staticPublishDirectory.trim()',
    );
  });

  test("[QD-SOURCE-VERSION-001] exposes optional Git and Docker source version inputs", () => {
    expect(quickDeploySheetSource).toContain("gitSourceVersionKinds");
    expect(quickDeploySheetSource).toContain('"commit-sha"');
    expect(quickDeploySheetSource).toContain("dockerSourceVersionKinds");
    expect(quickDeploySheetSource).toContain('"image-digest"');
    expect(quickDeploySheetSource).toContain("sourceVersionEditable");
    expect(quickDeploySheetSource).toContain('id="source-version"');
    expect(quickDeploySheetSource).toContain('id="source-version-kind"');
    expect(quickDeploySheetSource).toContain(
      'setSearchParam(params, "sourceVersion", sourceVersion)',
    );
    expect(quickDeploySheetSource).toContain("requestedSourceVersionInput");
    expect(quickDeploySheetSource).toContain("...requestedVersion");
  });
});
