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

describe("QuickDeploySheet structure", () => {
  test("[QUICK-DEPLOY-UX-001] keeps the lower quick deploy section scoped to variables", () => {
    expect(quickDeploySheetSource).toContain("data-quick-deploy-variables-section");
    expect(quickDeploySheetSource).toContain("data-quick-deploy-variable-editor");
    expect(quickDeploySheetSource).toContain("data-quick-deploy-variable-tabs");
    expect(quickDeploySheetSource).toContain("data-quick-deploy-env-paste");
    expect(quickDeploySheetSource).toContain("data-quick-deploy-variable-rows");
    expect(quickDeploySheetSource).toContain("data-quick-deploy-variable-row");
    expect(quickDeploySheetSource).toContain("parseEnvVariableEntries");
    expect(quickDeploySheetSource).toContain("applyEnvVariableText");
    expect(quickDeploySheetSource).toContain("addVariableDraft");
    expect(quickDeploySheetSource).toContain("removeVariableDraft");
    expect(quickDeploySheetSource).toContain("{#each variableDrafts as variable (variable.id)}");
    expect(quickDeploySheetSource).toContain(
      "sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)_auto_auto]",
    );
    expect(quickDeploySheetSource).toContain("variableRowsMode");
    expect(quickDeploySheetSource).toContain("variableEnvMode");
    expect(quickDeploySheetSource).toContain("variableAdd");
    expect(quickDeploySheetSource).toContain("variableApplyParsedEnv");
    expect(quickDeploySheetSource).toContain("variableEnvPasteHint");
    expect(quickDeploySheetSource).toContain("variableEnvPlaceholder");
    expect(quickDeploySheetSource).toContain("variableNameLabel");
    expect(quickDeploySheetSource).toContain("variableValueLabel");
    expect(quickDeploySheetSource).toContain("variableRemove");
    expect(quickDeploySheetSource).toContain("<details");
    expect(quickDeploySheetSource).toContain("ontoggle={(event) =>");
    expect(quickDeploySheetSource).toContain("未配置变量");
    expect(quickDeploySheetSource).toContain("已配置 1 项");
    expect(quickDeploySheetSource).not.toContain("let variableKey = $state");
    expect(quickDeploySheetSource).not.toContain("let variableValue = $state");
    expect(quickDeploySheetSource).not.toContain("let variableIsSecret = $state");
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
    expect(quickDeploySheetSource).toContain("data-quick-deploy-summary-panel");
    expect(quickDeploySheetSource).toContain("lg:mt-20 lg:sticky lg:top-0 lg:flex");
    expect(quickDeploySheetSource).toContain("lg:max-h-[calc(100svh-17rem)]");
    expect(quickDeploySheetSource).toContain("lg:min-h-0 lg:overflow-y-auto");
    expect(quickDeploySheetSource).toContain("lg:shrink-0");
    expect(quickDeploySheetSource).not.toContain("lg:top-20");
    expect(quickDeploySheetSource).not.toContain("lg:overflow-y-auto lg:pb-3");
    expect(quickDeploySheetSource).not.toContain("data-quick-deploy-readiness-panel");
    expect(quickDeploySheetSource).not.toContain("安装前置配置已完成");
    expect(quickDeploySheetSource).not.toContain("fixed inset-x-0 bottom-0");
    expect(quickDeploySheetSource).not.toContain("min-h-16 w-full items-center justify-between");
    expect(quickDeploySheetSource).toContain("还差 {quickDeployReadinessIssues.length} 项才能继续");
    expect(quickDeploySheetSource).toContain("{#each quickDeployReadinessIssues as issue (issue)}");
    expect(quickDeploySheetSource).toContain('class="w-full"');
  });

  test("[QUICK-DEPLOY-UX-002C] uses neutral pending status for incomplete quick deploy steps", () => {
    expect(quickDeploySheetSource).toContain("Circle,");
    expect(quickDeploySheetSource).toContain(
      'return complete ? "text-emerald-600" : "text-muted-foreground";',
    );
    expect(quickDeploySheetSource).toContain(
      "<Circle class={`size-4 $" + "{statusIconClasses(false)}`} />",
    );
    expect(quickDeploySheetSource).toContain(
      "<Circle class={`mt-0.5 size-4 shrink-0 $" + "{statusIconClasses(false)}`} />",
    );
    expect(quickDeploySheetSource).not.toContain(
      "<AlertCircle class={`size-4 $" + "{statusIconClasses(false)}`} />",
    );
    expect(quickDeploySheetSource).not.toContain(
      "<AlertCircle class={`mt-0.5 size-4 shrink-0 $" + "{statusIconClasses(false)}`} />",
    );
    expect(quickDeploySheetSource).not.toContain(
      'return complete ? "text-emerald-600" : "text-destructive";',
    );
  });

  test("[QUICK-DEPLOY-UX-002B] keeps modal state URL-addressable inside QuickDeploySheet", () => {
    expect(quickDeploySheetSource).toContain("lockedProjectId");
    expect(quickDeploySheetSource).toContain("onProgressDialogOpenChange");
    expect(quickDeploySheetSource).toContain('setSearchParam(params, "modal", stateModal)');
    expect(quickDeploySheetSource).toContain('statePath = "/"');
    expect(quickDeploySheetSource).toContain('stateBaseSearch = ""');
    expect(quickDeploySheetSource).toContain('stateModal = "quick-deploy"');
    expect(quickDeploySheetSource).toContain('url.pathname = statePath || "/"');
    expect(quickDeploySheetSource).toContain("url.search = stateBaseSearch");
    expect(quickDeploySheetSource).toContain(
      'setSearchParam(params, "projectMode", lockedProjectId ? "existing" : projectMode, "existing")',
    );
    expect(quickDeploySheetSource).toContain("selectedProjectId = lockedProjectId");
  });

  test("[QUICK-DEPLOY-BLUEPRINT-001] generates a fresh default Blueprint resource slug per install", () => {
    expect(quickDeploySheetSource).toContain("function createBlueprintInstallResourceSlugPrefix()");
    expect(quickDeploySheetSource).toContain(
      "const nextResourceName = createQuickDeployGeneratedResourceName(baseName)",
    );
    expect(quickDeploySheetSource).toContain("generatedResourceName = nextResourceName");
    expect(quickDeploySheetSource).toContain(
      "target: blueprintInstallTarget(target, resourceSlugPrefix)",
    );
    expect(quickDeploySheetSource).not.toContain(
      "resourceSlugPrefix:\n        selectedBlueprintSlug.trim()",
    );
  });

  test("[QUICK-DEPLOY-BLUEPRINT-002] keeps the Blueprint selector dialog usable on narrow viewports", () => {
    expect(quickDeploySheetSource).toContain("h-[calc(100svh-0.75rem)]");
    expect(quickDeploySheetSource).toContain("w-[calc(100%-0.75rem)]");
    expect(quickDeploySheetSource).toContain("grid-rows-[auto_minmax(0,1fr)]");
    expect(quickDeploySheetSource).toContain("overflow-hidden");
    expect(quickDeploySheetSource).toContain("min-h-0 overflow-y-auto px-3 pb-3");
    expect(quickDeploySheetSource).toContain('surface="dialog"');
  });

  test("[QUICK-DEPLOY-UX-003] keeps the source picker readable at constrained console widths", () => {
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
    expect(resourceSourceOptionSource).toContain("flex-col items-start");
    expect(resourceSourceOptionSource).toContain("px-4 py-4");
    expect(resourceSourceOptionSource).toContain("flex w-full min-w-0 items-center gap-3");
    expect(resourceSourceOptionSource).toContain("truncate text-sm font-medium leading-5");
    expect(resourceSourceOptionSource).toContain("block w-full text-xs font-normal leading-5");
    expect(resourceSourceOptionSource).not.toContain("space-y-1");
    expect(resourceSourceOptionSource).not.toContain("block truncate text-sm font-medium");
  });

  test("[QUICK-DEPLOY-UX-003B] aligns nested source method cards with source picker cards", () => {
    expect(quickDeploySheetSource).toContain("sourceOptionSelected");
    expect(quickDeploySheetSource).toContain(
      'class="h-auto min-h-20 flex-col items-start justify-start gap-2 whitespace-normal px-3 py-3 text-left"',
    );
    expect(quickDeploySheetSource).toContain('class="flex w-full min-w-0 items-center gap-2"');
    expect(quickDeploySheetSource).toContain(
      'class="min-w-0 truncate text-sm font-medium leading-5"',
    );
    expect(quickDeploySheetSource).toContain(
      'class="block w-full text-xs font-normal leading-5 text-muted-foreground"',
    );
    expect(quickDeploySheetSource).toContain('<SourceIcon class="size-3.5" />');
    expect(quickDeploySheetSource).not.toContain('<SourceIcon class="size-4 shrink-0" />');
  });

  test("[QUICK-DEPLOY-UX-003C] renders GitHub access mode as a secondary radio list", () => {
    expect(quickDeploySheetSource).toContain("data-github-source-mode-radios");
    expect(quickDeploySheetSource).toContain('role="radiogroup"');
    expect(quickDeploySheetSource).toContain('id="github-source-mode-url"');
    expect(quickDeploySheetSource).toContain('id="github-source-mode-browser"');
    expect(quickDeploySheetSource).toContain('type="radio"');
    expect(quickDeploySheetSource).toContain('name="github-source-mode"');
    expect(quickDeploySheetSource).toContain('class="mt-0.5 size-4 shrink-0 accent-primary"');
    expect(quickDeploySheetSource).toContain('checked={githubSourceMode === "url"}');
    expect(quickDeploySheetSource).toContain('checked={githubSourceMode === "browser"}');
    expect(quickDeploySheetSource).not.toContain(
      'variant={githubSourceMode === "url" ? "selected" : "outline"}',
    );
    expect(quickDeploySheetSource).not.toContain(
      'variant={githubSourceMode === "browser" ? "selected" : "outline"}',
    );
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
      "Boolean(selectedBlueprintSlug.trim()) || Boolean(selectedBlueprintUrl.trim())",
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

  test("[QD-CHOICE-LIST-001] keeps quick deploy selectable object lists on Tailwind white and blue surfaces", () => {
    expect(quickDeploySheetSource).toContain("rounded-md border border-input bg-card p-2");
    expect(quickDeploySheetSource).toContain("bg-card text-foreground");
    expect(quickDeploySheetSource).toContain("hover:bg-primary/5");
    expect(quickDeploySheetSource).toContain("data-[selected=true]:border-primary/40");
    expect(quickDeploySheetSource).toContain("data-[selected=true]:bg-primary/5");
    expect(quickDeploySheetSource).toContain(
      "data-selected={selectedGitHubRepositoryId === repository.id",
    );
    expect(quickDeploySheetSource).toContain("{#each deployableServers as server (server.id)}");
    expect(quickDeploySheetSource).toContain("data-quick-deploy-server-option");
    expect(quickDeploySheetSource).toContain("h-auto min-h-14 w-full justify-start");
    expect(quickDeploySheetSource).toContain("flex w-full min-w-0 flex-col items-start");
    expect(quickDeploySheetSource).not.toContain(
      '<span class="block truncate text-xs text-muted-foreground">',
    );
    expect(quickDeploySheetSource).not.toContain("hover:bg-muted/50");
    expect(quickDeploySheetSource).not.toContain(
      'variant={selectedServerId === server.id ? "selected" : "ghost"}',
    );
    expect(quickDeploySheetSource).not.toContain(
      'variant={selectedProjectId === project.id ? "selected" : "ghost"}',
    );
    expect(quickDeploySheetSource).not.toContain(
      'variant={selectedEnvironmentId === environment.id ? "selected" : "ghost"}',
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
    expect(quickDeploySheetSource).toContain('import * as Select from "$lib/components/ui/select"');
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
    expect(quickDeploySheetSource).toContain(
      '<Select.Root bind:value={sourceVersionKind} type="single">',
    );
    expect(quickDeploySheetSource).toContain(
      '<Select.Root bind:value={selectedBlueprintVariant} type="single">',
    );
    expect(quickDeploySheetSource).not.toContain("<select");
    expect(quickDeploySheetSource).not.toContain("<option");
  });
});
