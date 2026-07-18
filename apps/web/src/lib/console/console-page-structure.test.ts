import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const consoleShellSource = readFileSync(
  fileURLToPath(new URL("../components/console/ConsoleShell.svelte", import.meta.url)),
  "utf8",
);
const consoleStatePanelSource = readFileSync(
  fileURLToPath(new URL("../components/console/ConsoleStatePanel.svelte", import.meta.url)),
  "utf8",
);
const consoleResourceCanvasSource = readFileSync(
  fileURLToPath(new URL("../components/console/ConsoleResourceCanvas.svelte", import.meta.url)),
  "utf8",
);
const consoleExtensionPageSource = readFileSync(
  fileURLToPath(new URL("../components/console/ConsoleExtensionPage.svelte", import.meta.url)),
  "utf8",
);
const resourceListTableSource = readFileSync(
  fileURLToPath(new URL("../components/console/ResourceListTable.svelte", import.meta.url)),
  "utf8",
);
const homePageSource = readFileSync(
  fileURLToPath(new URL("../../routes/+page.svelte", import.meta.url)),
  "utf8",
);
const projectDetailPageSource = readFileSync(
  fileURLToPath(
    new URL("../../routes/projects/[projectId=consoleObjectId]/+page.svelte", import.meta.url),
  ),
  "utf8",
);
const projectDetailRouteSource = readFileSync(
  fileURLToPath(
    new URL("../../routes/projects/[projectId=consoleObjectId]/+page.ts", import.meta.url),
  ),
  "utf8",
);
const resourceDetailPageSource = readFileSync(
  fileURLToPath(
    new URL("../../routes/resources/[resourceId=consoleObjectId]/+page.svelte", import.meta.url),
  ),
  "utf8",
);
const runtimeMonitorPanelSource = readFileSync(
  fileURLToPath(new URL("../components/console/RuntimeMonitorPanel.svelte", import.meta.url)),
  "utf8",
);
const runtimeUsagePanelSource = readFileSync(
  fileURLToPath(new URL("../components/console/RuntimeUsagePanel.svelte", import.meta.url)),
  "utf8",
);
const resourceDetailRouteSource = readFileSync(
  fileURLToPath(
    new URL("../../routes/resources/[resourceId=consoleObjectId]/+page.ts", import.meta.url),
  ),
  "utf8",
);
const deploymentsPageSource = readFileSync(
  fileURLToPath(new URL("../../routes/deployments/+page.svelte", import.meta.url)),
  "utf8",
);
const deploymentTableSource = readFileSync(
  fileURLToPath(new URL("../components/console/DeploymentTable.svelte", import.meta.url)),
  "utf8",
);
const deploymentProgressDialogSource = readFileSync(
  fileURLToPath(new URL("../components/console/DeploymentProgressDialog.svelte", import.meta.url)),
  "utf8",
);
const operationProgressPanelSource = readFileSync(
  fileURLToPath(new URL("../components/console/OperationProgressPanel.svelte", import.meta.url)),
  "utf8",
);
const deploymentDetailRouteSource = readFileSync(
  fileURLToPath(
    new URL("../../routes/deployments/[deploymentId=deploymentId]/+page.ts", import.meta.url),
  ),
  "utf8",
);
const deploymentDetailPageSource = readFileSync(
  fileURLToPath(
    new URL("../../routes/deployments/[deploymentId=deploymentId]/+page.svelte", import.meta.url),
  ),
  "utf8",
);
const projectResourceDeploymentDetailRouteSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../routes/projects/[projectId=consoleObjectId]/environments/[environmentId=consoleObjectId]/resources/[resourceId=consoleObjectId]/deployments/[deploymentId=deploymentId]/+page.ts",
      import.meta.url,
    ),
  ),
  "utf8",
);
const projectResourceDetailRouteSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../routes/projects/[projectId=consoleObjectId]/environments/[environmentId=consoleObjectId]/resources/[resourceId=consoleObjectId]/+page.ts",
      import.meta.url,
    ),
  ),
  "utf8",
);
const projectResourcePreviewEnvironmentDetailRouteSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../routes/projects/[projectId=consoleObjectId]/environments/[environmentId=consoleObjectId]/resources/[resourceId=consoleObjectId]/preview-environments/[previewEnvironmentId=consoleObjectId]/+page.ts",
      import.meta.url,
    ),
  ),
  "utf8",
);
const consoleObjectIdParamMatcherSource = readFileSync(
  fileURLToPath(new URL("../../params/consoleObjectId.ts", import.meta.url)),
  "utf8",
);
const deploymentIdParamMatcherSource = readFileSync(
  fileURLToPath(new URL("../../params/deploymentId.ts", import.meta.url)),
  "utf8",
);
const retiredIntentRoutesSource = readFileSync(
  fileURLToPath(new URL("./retired-intent-routes.ts", import.meta.url)),
  "utf8",
);
const consoleLayoutCssSource = readFileSync(
  fileURLToPath(new URL("../../routes/layout.css", import.meta.url)),
  "utf8",
);
const serverDetailPageSource = readFileSync(
  fileURLToPath(
    new URL("../../routes/servers/[serverId=consoleObjectId]/+page.svelte", import.meta.url),
  ),
  "utf8",
);
const serverDetailRouteSource = readFileSync(
  fileURLToPath(
    new URL("../../routes/servers/[serverId=consoleObjectId]/+page.ts", import.meta.url),
  ),
  "utf8",
);
const serversPageSource = readFileSync(
  fileURLToPath(new URL("../../routes/servers/+page.svelte", import.meta.url)),
  "utf8",
);
const dependencyResourcesPageSource = readFileSync(
  fileURLToPath(new URL("../../routes/dependency-resources/+page.svelte", import.meta.url)),
  "utf8",
);
const dependencyResourceDetailPageSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../routes/dependency-resources/[dependencyResourceId=consoleObjectId]/+page.svelte",
      import.meta.url,
    ),
  ),
  "utf8",
);
const domainBindingsPageSource = readFileSync(
  fileURLToPath(new URL("../../routes/domain-bindings/+page.svelte", import.meta.url)),
  "utf8",
);
const domainBindingDetailPageSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../routes/domain-bindings/[domainBindingId=consoleObjectId]/+page.svelte",
      import.meta.url,
    ),
  ),
  "utf8",
);
const domainBindingDetailRouteSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../routes/domain-bindings/[domainBindingId=consoleObjectId]/+page.ts",
      import.meta.url,
    ),
  ),
  "utf8",
);
const marketplaceBlueprintDetailPageSource = readFileSync(
  fileURLToPath(new URL("../../routes/marketplace/[slug]/+page.svelte", import.meta.url)),
  "utf8",
);
const installedApplicationDetailPageSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../routes/installed-applications/[applicationId=consoleObjectId]/+page.svelte",
      import.meta.url,
    ),
  ),
  "utf8",
);
const installedApplicationDetailRouteSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../routes/installed-applications/[applicationId=consoleObjectId]/+page.ts",
      import.meta.url,
    ),
  ),
  "utf8",
);
const previewPoliciesPageSource = readFileSync(
  fileURLToPath(new URL("../../routes/preview-policies/+page.svelte", import.meta.url)),
  "utf8",
);
const previewEnvironmentsPageSource = readFileSync(
  fileURLToPath(new URL("../../routes/preview-environments/+page.svelte", import.meta.url)),
  "utf8",
);
const previewEnvironmentDetailPageSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../routes/preview-environments/[previewEnvironmentId=consoleObjectId]/+page.svelte",
      import.meta.url,
    ),
  ),
  "utf8",
);
const previewEnvironmentDetailRouteSource = readFileSync(
  fileURLToPath(
    new URL(
      "../../routes/preview-environments/[previewEnvironmentId=consoleObjectId]/+page.ts",
      import.meta.url,
    ),
  ),
  "utf8",
);
const accountProfilePageSource = readFileSync(
  fileURLToPath(new URL("../../routes/account/profile/+page.svelte", import.meta.url)),
  "utf8",
);
const accountSecurityPageSource = readFileSync(
  fileURLToPath(new URL("../../routes/account/security/+page.svelte", import.meta.url)),
  "utf8",
);
const accountConnectionsPageSource = readFileSync(
  fileURLToPath(new URL("../../routes/account/connections/+page.svelte", import.meta.url)),
  "utf8",
);
const accountSessionsPageSource = readFileSync(
  fileURLToPath(new URL("../../routes/account/sessions/+page.svelte", import.meta.url)),
  "utf8",
);
const accountDangerZonePageSource = readFileSync(
  fileURLToPath(new URL("../../routes/account/danger-zone/+page.svelte", import.meta.url)),
  "utf8",
);
const organizationPageSource = readFileSync(
  fileURLToPath(new URL("../../routes/organization/+page.svelte", import.meta.url)),
  "utf8",
);
const instancePageSource = readFileSync(
  fileURLToPath(new URL("../../routes/instance/+page.svelte", import.meta.url)),
  "utf8",
);
const consoleExtensionRouteLoadSource = readFileSync(
  fileURLToPath(new URL("../../routes/[...extensionPath]/+page.ts", import.meta.url)),
  "utf8",
);
const legacyResourceCreatePagePath = fileURLToPath(
  new URL(
    "../../routes/projects/[projectId=consoleObjectId]/resources/new/+page.svelte",
    import.meta.url,
  ),
);
const legacyResourceCreateRoutePath = fileURLToPath(
  new URL(
    "../../routes/projects/[projectId=consoleObjectId]/resources/new/+page.ts",
    import.meta.url,
  ),
);
const legacyDeployPagePath = fileURLToPath(
  new URL("../../routes/deploy/+page.svelte", import.meta.url),
);
const legacyDeployRoutePath = fileURLToPath(
  new URL("../../routes/deploy/+page.ts", import.meta.url),
);
const legacyResourceDeploymentCreatePagePath = fileURLToPath(
  new URL(
    "../../routes/projects/[projectId=consoleObjectId]/environments/[environmentId=consoleObjectId]/resources/[resourceId=consoleObjectId]/deployments/new/+page.svelte",
    import.meta.url,
  ),
);
const legacyResourceDeploymentCreateRoutePath = fileURLToPath(
  new URL(
    "../../routes/projects/[projectId=consoleObjectId]/environments/[environmentId=consoleObjectId]/resources/[resourceId=consoleObjectId]/deployments/new/+page.ts",
    import.meta.url,
  ),
);
const legacyServerCreatePagePath = fileURLToPath(
  new URL("../../routes/servers/new/+page.svelte", import.meta.url),
);
const legacyServerCreateRoutePath = fileURLToPath(
  new URL("../../routes/servers/new/+page.ts", import.meta.url),
);
const consoleUtilsSource = readFileSync(
  fileURLToPath(new URL("./utils.ts", import.meta.url)),
  "utf8",
);
const routesRootPath = fileURLToPath(new URL("../../routes", import.meta.url));
const focusedFlowRouteSegments = [
  "/bootstrap/auth/first-admin/",
  "/forgot-password/",
  "/login/",
  "/reset-password/",
  "/sign-up/",
  "/verify-email/",
] as const;

function sourceBetween(source: string, startMarker: string, endMarker: string): string {
  const startIndex = source.indexOf(startMarker);
  if (startIndex < 0) {
    throw new Error(`Missing source marker: ${startMarker}`);
  }

  const endIndex = source.indexOf(endMarker, startIndex);
  if (endIndex < 0) {
    throw new Error(`Missing source marker: ${endMarker}`);
  }

  return source.slice(startIndex, endIndex);
}

function sourceBetweenLast(source: string, startMarker: string, endMarker: string): string {
  const startIndex = source.lastIndexOf(startMarker);
  if (startIndex < 0) {
    throw new Error(`Missing source marker: ${startMarker}`);
  }

  const endIndex = source.indexOf(endMarker, startIndex);
  if (endIndex < 0) {
    throw new Error(`Missing source marker: ${endMarker}`);
  }

  return source.slice(startIndex, endIndex);
}

function assertDisplaySurfaceIsFormFree(source: string): void {
  expect(source).not.toContain("<form");
  expect(source).not.toContain("<Input");
  expect(source).not.toContain("<Textarea");
  expect(source).not.toContain("<Select.Root");
  expect(source).not.toContain("<select");
  expect(source).not.toContain("<InputOTP.Root");
  expect(source).not.toContain('type="submit"');
  expect(source).not.toContain("<Dialog.Root");
}

function componentOpenTagsOutsideDialog(source: string, componentName: string): string[] {
  const outsideTags: string[] = [];
  const openTag = `<${componentName}`;
  let cursor = 0;

  while (true) {
    const componentIndex = source.indexOf(openTag, cursor);
    if (componentIndex < 0) {
      return outsideTags;
    }

    const beforeComponent = source.slice(0, componentIndex);
    const lastDialogOpen = beforeComponent.lastIndexOf("<Dialog.Root");
    const lastDialogClose = beforeComponent.lastIndexOf("</Dialog.Root>");
    if (lastDialogOpen <= lastDialogClose) {
      outsideTags.push(openTag);
    }

    cursor = componentIndex + openTag.length;
  }
}

function formTagsOutsideDialog(source: string): string[] {
  const outsideTags: string[] = [];
  let cursor = 0;

  while (true) {
    const formIndex = source.indexOf("<form", cursor);
    if (formIndex < 0) {
      return outsideTags;
    }

    const beforeForm = source.slice(0, formIndex);
    const lastDialogOpen = beforeForm.lastIndexOf("<Dialog.Root");
    const lastDialogClose = beforeForm.lastIndexOf("</Dialog.Root>");
    if (lastDialogOpen <= lastDialogClose) {
      outsideTags.push(source.slice(formIndex, source.indexOf(">", formIndex) + 1));
    }

    cursor = formIndex + "<form".length;
  }
}

function routePageSources(rootPath: string): Array<{ path: string; source: string }> {
  const entries: Array<{ path: string; source: string }> = [];

  for (const name of readdirSync(rootPath)) {
    const path = join(rootPath, name);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      entries.push(...routePageSources(path));
      continue;
    }

    if (name === "+page.svelte") {
      entries.push({ path, source: readFileSync(path, "utf8") });
    }
  }

  return entries;
}

function destructiveButtonTagsOutsideDialog(source: string): string[] {
  const outsideTags: string[] = [];
  let cursor = 0;

  while (true) {
    const buttonIndex = source.indexOf("<Button", cursor);
    if (buttonIndex < 0) {
      return outsideTags;
    }

    const buttonEndIndex = source.indexOf(">", buttonIndex);
    const buttonTag =
      buttonEndIndex >= 0 ? source.slice(buttonIndex, buttonEndIndex + 1) : "<Button";
    const beforeButton = source.slice(0, buttonIndex);
    const lastDialogOpen = beforeButton.lastIndexOf("<Dialog.Root");
    const lastDialogClose = beforeButton.lastIndexOf("</Dialog.Root>");

    if (buttonTag.includes('variant="destructive"') && lastDialogOpen <= lastDialogClose) {
      outsideTags.push(buttonTag);
    }

    cursor = buttonIndex + "<Button".length;
  }
}

function svelteSources(rootPath: string): Array<{ path: string; source: string }> {
  const entries: Array<{ path: string; source: string }> = [];

  for (const name of readdirSync(rootPath)) {
    const path = join(rootPath, name);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      entries.push(...svelteSources(path));
      continue;
    }

    if (name.endsWith(".svelte")) {
      entries.push({ path, source: readFileSync(path, "utf8") });
    }
  }

  return entries;
}

function literalTextMatches(source: string, pattern: RegExp): string[] {
  const matches: string[] = [];
  const literalPattern = /(["'`])((?:\\.|(?!\1)[\s\S])*?)\1/g;

  for (const literal of source.matchAll(literalPattern)) {
    const text = literal[2] ?? "";
    const match = text.match(pattern);
    if (match) {
      matches.push(match[0]);
    }
  }

  return matches;
}

function localeEntrySource(source: string, key: string): string {
  const keyIndex = source.indexOf(`${key}:`);
  if (keyIndex < 0) {
    throw new Error(`Missing locale key: ${key}`);
  }

  const nextEntryIndex = source.indexOf("\n      ", keyIndex + key.length + 1);
  if (nextEntryIndex < 0) {
    return source.slice(keyIndex);
  }

  return source.slice(keyIndex, nextEntryIndex);
}

function functionBody(source: string, signature: string): string {
  const startIndex = source.indexOf(signature);
  if (startIndex < 0) {
    throw new Error(`Missing function signature: ${signature}`);
  }

  const bodyStartIndex = source.indexOf("{", startIndex);
  if (bodyStartIndex < 0) {
    throw new Error(`Missing function body: ${signature}`);
  }

  let depth = 0;
  for (let index = bodyStartIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  throw new Error(`Unclosed function body: ${signature}`);
}

describe("console page structure", () => {
  test("[CONSOLE-LAYOUT-001] gives collection pages a wider centered canvas", () => {
    expect(consoleResourceCanvasSource).toContain("mx-auto w-full max-w-7xl space-y-6");
    expect(consoleResourceCanvasSource).toContain("consolePageContentClass");
    expect(consoleResourceCanvasSource).not.toContain("max-w-5xl");
    expect(consoleExtensionPageSource).toContain(
      'class={embedded ? "max-w-none space-y-3 p-0 md:p-0" : "max-w-7xl"}',
    );
    expect(consoleExtensionPageSource).toContain("{#if embedded}");
    expect(consoleExtensionPageSource).toContain("{@render content()}");
  });

  test("[CONSOLE-DISPLAY-STATE-IA-000] keeps console routes free of default-page forms", () => {
    const pagesWithDefaultForms = routePageSources(routesRootPath)
      .filter(({ path }) => focusedFlowRouteSegments.every((segment) => !path.includes(segment)))
      .filter(({ source }) => {
        for (
          let formIndex = source.indexOf("<form");
          formIndex >= 0;
          formIndex = source.indexOf("<form", formIndex + "<form".length)
        ) {
          const beforeForm = source.slice(0, formIndex);
          const lastDialogOpen = beforeForm.lastIndexOf("<Dialog.Root");
          const lastDialogClose = beforeForm.lastIndexOf("</Dialog.Root>");

          if (lastDialogOpen <= lastDialogClose) {
            return true;
          }
        }

        return false;
      })
      .map(({ path }) => path.replace(`${routesRootPath}/`, ""));

    expect(pagesWithDefaultForms).toEqual([]);
  });

  test("[CONSOLE-DISPLAY-STATE-IA-000B] keeps console default pages on shared select primitives", () => {
    const pagesWithNativeSelects = routePageSources(routesRootPath)
      .filter(({ path }) => focusedFlowRouteSegments.every((segment) => !path.includes(segment)))
      .filter(({ source }) => source.includes("<select") || source.includes("<option"))
      .map(({ path }) => path.replace(`${routesRootPath}/`, ""));

    expect(pagesWithNativeSelects).toEqual([]);
  });

  test("[CONSOLE-DISPLAY-STATE-IA-000C] keeps form-owning components inside intent dialogs", () => {
    const formOwningComponents = [
      "ProjectCreateForm",
      "EnvironmentCreateForm",
      "ServerCreateForm",
      "ServerRegistrationForm",
    ] as const;
    const pagesWithFormComponentsOutsideDialogs = routePageSources(routesRootPath)
      .filter(({ path }) => focusedFlowRouteSegments.every((segment) => !path.includes(segment)))
      .flatMap(({ path, source }) =>
        formOwningComponents
          .flatMap((componentName) => componentOpenTagsOutsideDialog(source, componentName))
          .map((openTag) => `${path.replace(`${routesRootPath}/`, "")}: ${openTag}`),
      );

    expect(pagesWithFormComponentsOutsideDialogs).toEqual([]);
    expect(componentOpenTagsOutsideDialog(consoleShellSource, "QuickDeploySheet")).toEqual([]);
    expect(componentOpenTagsOutsideDialog(projectDetailPageSource, "QuickDeploySheet")).toEqual([]);
  });

  test("[CONSOLE-DISPLAY-STATE-IA-000C2] keeps Quick Deploy progress dialogs compact", () => {
    expect(consoleShellSource).toContain("quickDeployProgressDialogOpen");
    expect(projectDetailPageSource).toContain("quickDeployProgressDialogOpen");
    expect(consoleShellSource).toContain("showCloseButton={!quickDeployProgressDialogOpen}");
    expect(projectDetailPageSource).toContain("showCloseButton={!quickDeployProgressDialogOpen}");
    expect(consoleShellSource).toContain("function closeQuickDeployDialog()");
    expect(projectDetailPageSource).toContain("function closeQuickDeployDialog()");
    expect(consoleShellSource).toContain("if (!open && quickDeployProgressDialogOpen)");
    expect(projectDetailPageSource).toContain("if (!open && quickDeployProgressDialogOpen)");
    expect(consoleShellSource).toContain("onClose={closeQuickDeployDialog}");
    expect(projectDetailPageSource).toContain("onClose={closeQuickDeployDialog}");
    expect(consoleShellSource).toContain("onProgressDialogOpenChange={(open) =>");
    expect(projectDetailPageSource).toContain("onProgressDialogOpenChange={(open) =>");
  });

  test("[CONSOLE-DISPLAY-STATE-IA-000D] keeps console component forms inside dialogs or explicit form components", () => {
    const formComponentNames = new Set([
      "ProjectCreateForm.svelte",
      "EnvironmentCreateForm.svelte",
      "OrganizationCreateForm.svelte",
      "ServerCreateForm.svelte",
      "ServerRegistrationForm.svelte",
    ]);
    const componentFormsOutsideDialogs = svelteSources(
      fileURLToPath(new URL("../components/console", import.meta.url)),
    )
      .filter(({ path }) => !formComponentNames.has(path.split("/").at(-1) ?? ""))
      .flatMap(({ path, source }) =>
        formTagsOutsideDialog(source).map(
          (formTag) =>
            `${path.replace(fileURLToPath(new URL("../components/console", import.meta.url)), "")}: ${formTag}`,
        ),
      );

    expect(componentFormsOutsideDialogs).toEqual([]);
  });

  test("[CONSOLE-DANGER-IA-000] keeps destructive button treatment inside confirmation dialogs", () => {
    const pagesWithDestructiveButtonsOutsideDialogs = routePageSources(routesRootPath)
      .filter(({ path }) => focusedFlowRouteSegments.every((segment) => !path.includes(segment)))
      .flatMap(({ path, source }) =>
        destructiveButtonTagsOutsideDialog(source).map(
          (buttonTag) => `${path.replace(`${routesRootPath}/`, "")}: ${buttonTag}`,
        ),
      );

    expect(pagesWithDestructiveButtonsOutsideDialogs).toEqual([]);
  });

  test("[CONSOLE-MODAL-IA-000] keeps console interactions off browser-native dialogs", () => {
    const browserNativeDialogPattern =
      /window\.(?:alert|confirm|prompt)\b|\b(?:alert|confirm|prompt)\(/;
    const consoleInteractionSources = [
      ...routePageSources(routesRootPath),
      ...svelteSources(fileURLToPath(new URL("../components/console", import.meta.url))),
    ];
    const browserNativeDialogUsage = consoleInteractionSources
      .filter(({ path }) => focusedFlowRouteSegments.every((segment) => !path.includes(segment)))
      .flatMap(({ path, source }) => {
        const match = source.match(browserNativeDialogPattern);
        return match ? [`${path.replace(routesRootPath, "routes")}: ${match[0]}`] : [];
      });

    expect(browserNativeDialogUsage).toEqual([]);
  });

  test("[CONSOLE-COPY-IA-000] keeps user-visible console copy free of internal implementation terms", () => {
    const forbiddenVisibleCopyPattern =
      /\b(?:read model|later phase|route gap|provider adapter|install worker|focused governed flow|owner links|owner surface|owner view|danger flow|blocker\/check|route intent from Blueprint|service \/ worker \/ static surface|deployment attempt|console intent)\b|待接入|尚未接入|资源 readback|依赖资源 readback|安装 snapshot|owner 面|资源 owner|按 intent/iu;
    const visibleCopyFiles = [
      ...routePageSources(routesRootPath),
      {
        path: fileURLToPath(
          new URL("../../../../../packages/i18n/src/locales/zh-CN.ts", import.meta.url),
        ),
        source: readFileSync(
          fileURLToPath(
            new URL("../../../../../packages/i18n/src/locales/zh-CN.ts", import.meta.url),
          ),
          "utf8",
        ),
      },
      {
        path: fileURLToPath(
          new URL("../../../../../packages/i18n/src/locales/en-US.ts", import.meta.url),
        ),
        source: readFileSync(
          fileURLToPath(
            new URL("../../../../../packages/i18n/src/locales/en-US.ts", import.meta.url),
          ),
          "utf8",
        ),
      },
    ];
    const internalVisibleCopy = visibleCopyFiles.flatMap(({ path, source }) =>
      literalTextMatches(source, forbiddenVisibleCopyPattern).map(
        (match) => `${path.replace(routesRootPath, "routes")}: ${match}`,
      ),
    );

    expect(internalVisibleCopy).toEqual([]);
  });

  test("[CONSOLE-COPY-IA-001] keeps zh console operation copy out of raw implementation language", () => {
    const zhLocaleSource = readFileSync(
      fileURLToPath(new URL("../../../../../packages/i18n/src/locales/zh-CN.ts", import.meta.url)),
      "utf8",
    );
    const rawOperationCopy = literalTextMatches(
      zhLocaleSource,
      /\b(?:provider|workload|readiness|runtime usage inspect|workflow|metadata|Destination|storage volume|dependency resource|runtime injection|secret reference|restore point|live writes|dry-run|runtime cleanup|route snapshot|deployment snapshot|proxy route|runtime plan|Build cache|Route source|Source binding|Base ref)\b|owner 摘要|Provider|Storage backup|Dependency resource|Secret|观察入口|命令意图|归属证据|提供方标识|实现状态|命令意图|Profile 缺失|选择 source|source 是否|按时间展示 source|打开 trace|Trace|Monitor 窗口|Request ID|Route ID|Git ref|镜像 digest|镜像 tag|Ref 不匹配/u,
    );

    expect(rawOperationCopy).toEqual([]);
  });

  test("[PROJECT-DEPLOYMENT-IA-002] opens project deployment actions in context instead of legacy pages", () => {
    expect(projectDetailPageSource).toContain("function openProjectDeploymentAction()");
    expect(projectDetailPageSource).toContain("function openProjectNextAction()");
    expect(projectDetailPageSource).toContain(
      "function openProjectAttentionAction(item: ProjectAttentionItem)",
    );
    expect(projectDetailPageSource).toContain('data-testid="project-deployments-open-deploy"');
    expect(projectDetailPageSource).toContain(
      'data-testid="project-deployments-empty-open-deploy"',
    );

    const projectDeploymentsOpenDeployButton =
      projectDetailPageSource.match(
        /<Button\s+[^>]*data-testid="project-deployments-open-deploy"[\s\S]*?<\/Button>/,
      )?.[0] ?? "";
    const projectDeploymentsEmptyOpenDeployButton =
      projectDetailPageSource.match(
        /<Button\s+[^>]*data-testid="project-deployments-empty-open-deploy"[\s\S]*?<\/Button>/,
      )?.[0] ?? "";
    const projectDeploymentsTabSource = sourceBetween(
      projectDetailPageSource,
      'value="deployments"',
      'value="activity"',
    );

    expect(projectDeploymentsOpenDeployButton).toContain('type="button"');
    expect(projectDeploymentsOpenDeployButton).toContain("onclick={openProjectDeploymentAction}");
    expect(projectDeploymentsOpenDeployButton).toContain("common.actions.createDeployment");
    expect(projectDeploymentsOpenDeployButton).not.toContain("href=");
    expect(projectDeploymentsEmptyOpenDeployButton).toContain('type="button"');
    expect(projectDeploymentsEmptyOpenDeployButton).toContain(
      "onclick={openProjectDeploymentAction}",
    );
    expect(projectDeploymentsEmptyOpenDeployButton).toContain("common.actions.createDeployment");
    expect(projectDeploymentsEmptyOpenDeployButton).not.toContain("href=");
    expect(projectDeploymentsTabSource).toContain('data-testid="project-deployments-open-deploy"');
    expect(projectDeploymentsTabSource).toContain(
      'data-testid="project-deployments-empty-open-deploy"',
    );
    expect(projectDeploymentsTabSource).toContain("{#if projectDeployments.length > 0}");
    expect(projectDeploymentsTabSource).toContain("onclick={openProjectDeploymentAction}");
    expect(projectDeploymentsTabSource).toContain("<DeploymentTable");
    expect(projectDeploymentsTabSource).not.toContain("actionHref=");
    expect(projectDeploymentsTabSource).not.toContain("createHref=");
    expect(projectDeploymentsTabSource).not.toContain(
      'data-testid="project-deployments-view-records"',
    );
    expect(projectDeploymentsTabSource).not.toContain("common.actions.viewDeployments");
    expect(projectDeploymentsTabSource).not.toContain("common.actions.deploy");
    expect(projectDeploymentsTabSource).not.toContain("href={openProjectDeploymentAction}");
    expect(projectDeploymentsTabSource).not.toContain("<a\n");
    expect(projectDeploymentsTabSource).not.toContain("<a ");
    expect(projectDeploymentsTabSource).not.toContain("/deployments?projectId");
    expect(projectDeploymentsTabSource).not.toContain("deployments?projectId");
    expect(projectDeploymentsTabSource).not.toContain("common.actions.viewAll");
    expect(projectDeploymentsTabSource).not.toContain('href="/deploy"');
    expect(projectDeploymentsTabSource).not.toContain('href="/deploy?');
    expect(projectDeploymentsTabSource).not.toContain("href={`/deploy?");
    expect(projectDeploymentsTabSource).not.toContain("deployments/new");
    expect(projectDeploymentsTabSource).not.toMatch(
      /<a[\s\S]*?(部署|createDeployment)[\s\S]*?<\/a>/,
    );
    expect(resourceListTableSource).toContain(
      "aria-label={$t(i18nKeys.common.actions.createDeployment)}",
    );
    expect(resourceListTableSource).toContain("import { ArrowRight, Globe2, Play }");
    expect(resourceListTableSource).not.toContain(
      "aria-label={$t(i18nKeys.common.actions.quickDeploy)}",
    );
  });

  test("[PROJECT-INSTALL-IA-003] keeps terminal install failures out of project overview health", () => {
    expect(projectDetailPageSource).toContain("activeProjectOperatorWorkItems");
    expect(projectDetailPageSource).not.toContain("failedProjectBlueprintInstallItems");
    expect(projectDetailPageSource).not.toContain("data-project-resource-install-failures");
    expect(projectDetailPageSource).not.toContain("最近的资源安装没有完成");

    const activeOperatorWorkFilterSource = sourceBetween(
      projectDetailPageSource,
      "const activeProjectOperatorWorkItems = $derived",
      "const projectRuntimeMonitoringScope = $derived",
    );
    expect(activeOperatorWorkFilterSource).toContain('item.kind === "blueprint-install"');
    expect(activeOperatorWorkFilterSource).toContain('item.status === "running"');
    expect(activeOperatorWorkFilterSource).toContain('item.status === "pending"');
    expect(activeOperatorWorkFilterSource).toContain('item.status === "retry-scheduled"');
    expect(activeOperatorWorkFilterSource).not.toContain('item.status === "failed"');
    expect(activeOperatorWorkFilterSource).not.toContain('item.status === "dead-lettered"');

    const projectAttentionSource = sourceBetween(
      projectDetailPageSource,
      "const projectAttentionItems = $derived.by<ProjectAttentionItem[]>",
      "for (const deployment of failedProjectDeployments",
    );
    expect(projectAttentionSource).toContain("activeProjectOperatorWorkItems.slice(0, 2)");
    expect(projectAttentionSource).not.toContain("actionableProjectOperatorWorkItems");
  });

  test("[ACTIVITY-READ-MODEL-IA-001] marks home and project activity as explicit read-model gaps", () => {
    expect(homePageSource).toContain("data-home-deployment-rollup");
    expect(homePageSource).toContain("data-home-activity-read-model-gap");
    expect(homePageSource).toContain("recentActivityTitle");
    expect(homePageSource).toContain("recentActivityDescription");
    expect(homePageSource).toContain("recentActivityReadModelGap");
    expect(homePageSource).toContain("recentDeploymentsReadModelGap");
    expect(homePageSource).not.toContain("orpcClient.activity");
    expect(homePageSource).not.toContain("orpcClient.events");
    expect(homePageSource).not.toContain("activityQuery");

    const homeActivityGapSource = sourceBetween(
      homePageSource,
      "data-home-activity-read-model-gap",
      "</aside>",
    );
    assertDisplaySurfaceIsFormFree(homeActivityGapSource);
    expect(homeActivityGapSource).toContain("recentActivityReadModelGap");
    expect(homeActivityGapSource).not.toContain("<DeploymentTable");
    expect(homeActivityGapSource).not.toContain("DeploymentStatusBadge");
    expect(homeActivityGapSource).not.toContain("{#each deployments");

    expect(projectDetailPageSource).toContain("data-project-activity-display-surface");
    expect(projectDetailPageSource).toContain("data-project-activity-read-model-gap");
    expect(projectDetailPageSource).toContain("activityGapTitle");
    expect(projectDetailPageSource).toContain("activityGapDescription");
    expect(projectDetailPageSource).not.toContain("暂未开放");
    expect(projectDetailPageSource).not.toContain("orpcClient.activity");
    expect(projectDetailPageSource).not.toContain("orpcClient.events");

    const projectActivitySurface = sourceBetween(
      projectDetailPageSource,
      "data-project-activity-display-surface",
      'value="settings"',
    );
    assertDisplaySurfaceIsFormFree(projectActivitySurface);
    expect(projectActivitySurface).toContain("data-project-activity-read-model-gap");
    expect(projectActivitySurface).toContain('projectTabHref("resources")');
    expect(projectActivitySurface).toContain('projectTabHref("deployments")');
    expect(projectActivitySurface).not.toContain("<Badge");
    expect(projectActivitySurface).not.toContain("<DeploymentTable");
    expect(projectActivitySurface).not.toContain("deploymentsQuery");
    expect(projectActivitySurface).not.toContain("deploymentMutation");
  });

  test("[ACTIVITY-READ-MODEL-IA-002] keeps scoped events and logs out of the generic activity model", () => {
    expect(resourceDetailPageSource).toContain("data-resource-source-events-diagnostics");
    expect(resourceDetailPageSource).toContain(
      'const resourceJobsSections = ["scheduled-tasks", "source-events"]',
    );
    expect(resourceDetailPageSource).toContain('"monitor"');
    expect(resourceDetailPageSource).toContain('"logs"');
    expect(resourceDetailPageSource).toContain('"terminal"');
    expect(resourceDetailPageSource).not.toContain('"activity"');
    expect(resourceDetailPageSource).not.toContain("data-resource-activity-display-surface");
    expect(resourceDetailPageSource).not.toContain("data-resource-activity-read-model-gap");
    expect(resourceDetailPageSource).not.toContain("orpcClient.activity");
    expect(resourceDetailPageSource).not.toContain("activityQuery");
    expect(resourceDetailPageSource).toContain("orpc.sourceEvents.list.queryOptions");

    const resourceSourceEventsSource = sourceBetween(
      resourceDetailPageSource,
      "data-resource-source-events-diagnostics",
      '{:else if activeTab === "previews"}',
    );
    assertDisplaySurfaceIsFormFree(resourceSourceEventsSource);
    expect(resourceSourceEventsSource).toContain("resourceSourceEventsQuery");
    expect(resourceSourceEventsSource).toContain("sourceEventDeploymentHref(outcome.value)");
    expect(resourceSourceEventsSource).not.toContain("data-resource-activity");
    expect(resourceSourceEventsSource).not.toContain("<DeploymentTable");
    expect(resourceSourceEventsSource).not.toContain("deploymentMutation");

    expect(deploymentDetailPageSource).toContain("data-deployment-attempt-timeline");
    expect(deploymentDetailPageSource).toContain("orpc.deployments.timeline.queryOptions");
    expect(deploymentDetailPageSource).toContain("orpcClient.deployments.timelineStream");
    expect(deploymentDetailPageSource).not.toContain("orpcClient.activity");
    expect(deploymentDetailPageSource).not.toContain("data-deployment-activity");
    const deploymentTimelineSource = sourceBetween(
      deploymentDetailPageSource,
      "data-deployment-attempt-timeline",
      'value="snapshot"',
    );
    assertDisplaySurfaceIsFormFree(deploymentTimelineSource);
    expect(deploymentTimelineSource).toContain("deploymentProgressEvents");
    expect(deploymentTimelineSource).toContain("progressDescription");
    expect(deploymentTimelineSource).toContain("DeploymentProgressTerminal");
    expect(deploymentTimelineSource).not.toContain("project activity");
    expect(deploymentTimelineSource).not.toContain("resource activity");

    expect(instancePageSource).toContain("data-instance-worker-events-observation");
    expect(instancePageSource).toContain("orpc.operatorWork.list.queryOptions");
    expect(instancePageSource).toContain("orpc.operatorWork.show.queryOptions");
    expect(instancePageSource).not.toContain("orpcClient.activity");
    expect(instancePageSource).not.toContain("data-instance-activity");
    const instanceWorkerEventsSource = sourceBetween(
      instancePageSource,
      "data-instance-worker-events-observation",
      "</aside>",
    );
    assertDisplaySurfaceIsFormFree(instanceWorkerEventsSource);
    expect(instanceWorkerEventsSource).toContain("selectedOperatorWorkEvents");
    expect(instanceWorkerEventsSource).toContain("workerWorkEventsTitle");
    expect(instanceWorkerEventsSource).not.toContain("Activity");
    expect(instanceWorkerEventsSource).not.toContain("activity");
  });

  test("[CONSOLE-INTENT-ROUTES-IA-001] retires standalone create/deploy intent routes", () => {
    expect(existsSync(legacyResourceCreatePagePath)).toBe(false);
    expect(existsSync(legacyResourceCreateRoutePath)).toBe(false);
    expect(existsSync(legacyDeployPagePath)).toBe(false);
    expect(existsSync(legacyDeployRoutePath)).toBe(false);
    expect(existsSync(legacyResourceDeploymentCreatePagePath)).toBe(false);
    expect(existsSync(legacyResourceDeploymentCreateRoutePath)).toBe(false);
    expect(existsSync(legacyServerCreatePagePath)).toBe(false);
    expect(existsSync(legacyServerCreateRoutePath)).toBe(false);
    expect(consoleExtensionRouteLoadSource).toContain("retiredConsoleIntentRoutePatterns");
    expect(consoleExtensionRouteLoadSource).toContain(String.raw`^\/deploy\/?$`);
    expect(consoleExtensionRouteLoadSource).toContain(String.raw`^\/deployments\/new\/?$`);
    expect(consoleExtensionRouteLoadSource).toContain(String.raw`^\/servers\/new\/?$`);
    expect(consoleExtensionRouteLoadSource).toContain(String.raw`^\/projects\/new\/?$`);
    expect(consoleExtensionRouteLoadSource).toContain(String.raw`^\/resources\/new\/?$`);
    expect(consoleExtensionRouteLoadSource).toContain(String.raw`^\/preview-environments\/new\/?$`);
    expect(consoleExtensionRouteLoadSource).toContain(String.raw`^\/dependency-resources\/new\/?$`);
    expect(consoleExtensionRouteLoadSource).toContain(String.raw`^\/domain-bindings\/new\/?$`);
    expect(consoleExtensionRouteLoadSource).toContain(String.raw`\/resources\/new`);
    expect(consoleExtensionRouteLoadSource).toContain(String.raw`\/deployments\/new`);
    expect(consoleExtensionRouteLoadSource).toContain("error(404");
    expect(deploymentDetailRouteSource).not.toContain('params.deploymentId === "new"');
    expect(deploymentDetailRouteSource).not.toContain("error(404");
    expect(projectResourceDeploymentDetailRouteSource).not.toContain(
      'params.deploymentId === "new"',
    );
    expect(projectResourceDeploymentDetailRouteSource).not.toContain("error(404");
    expect(deploymentIdParamMatcherSource).toContain("isRetiredConsoleIntentSegment");
    expect(retiredIntentRoutesSource).toContain("retiredConsoleIntentSegments");
    expect(retiredIntentRoutesSource).toContain('"new"');
    expect(retiredIntentRoutesSource).toContain('"create"');
    expect(consoleObjectIdParamMatcherSource).toContain("isRetiredConsoleIntentSegment");
    expect(consoleObjectIdParamMatcherSource).toContain("!isRetiredConsoleIntentSegment(segment)");
    expect(projectDetailRouteSource).not.toContain("rejectRetiredConsoleIntentParam");
    expect(resourceDetailRouteSource).not.toContain("rejectRetiredConsoleIntentParam");
    expect(serverDetailRouteSource).not.toContain("rejectRetiredConsoleIntentParam");
    expect(previewEnvironmentDetailRouteSource).not.toContain("rejectRetiredConsoleIntentParam");
    expect(projectResourceDetailRouteSource).not.toContain("rejectRetiredConsoleIntentParam");
    expect(projectResourcePreviewEnvironmentDetailRouteSource).not.toContain(
      "rejectRetiredConsoleIntentParam",
    );
    expect(deploymentIdParamMatcherSource).toContain("!isRetiredConsoleIntentSegment(segment)");
  });

  test("[CONSOLE-ACTIONS-IA-001] supports callback-owned actions on list and state panels", () => {
    expect(resourceListTableSource).toContain('actionHref={createAction ? "" : createHref}');
    expect(resourceListTableSource).toContain("data-resource-record-list");
    expect(resourceListTableSource).toContain("data-resource-record-row");
    expect(resourceListTableSource).toContain("data-resource-owner-summary");
    expect(resourceListTableSource).toContain("xl:items-center xl:py-3");
    expect(resourceListTableSource).toContain("xl:grid-flow-col xl:grid-cols-none xl:auto-cols-fr");
    expect(resourceListTableSource).not.toContain('from "$lib/components/ui/table"');
    expect(resourceListTableSource).not.toContain("<Table.Root");
    expect(consoleStatePanelSource).toContain("{#if actionLabel && actionOnclick}");
    expect(consoleStatePanelSource).toContain(
      '<Button type="button" size="sm" disabled={actionDisabled} onclick={actionOnclick}>',
    );
    expect(consoleShellSource).toContain('"max-w-7xl"');
    expect(consoleShellSource).toContain("max-h-[calc(100vh-12rem)]");
    expect(consoleUtilsSource).not.toContain("projectQuickDeployHref");
    expect(consoleUtilsSource).not.toContain("resourceNewDeploymentHref");
    expect(consoleUtilsSource).not.toContain("/resources/new");
  });

  test("[CONSOLE-NAV-IA-001] keeps object tab navigation free of modal workflow params", () => {
    const projectTabHrefBody = functionBody(
      projectDetailPageSource,
      "function projectTabHref(tab: ProjectDetailTab): string",
    );
    const resourceTabHrefBody = functionBody(
      resourceDetailPageSource,
      "function resourceTabHref(tab: ResourceDetailTab): string",
    );
    const resourceSectionHrefBody = functionBody(
      resourceDetailPageSource,
      "function resourceSectionHref(section: ResourceDetailSection): string",
    );
    const serverTabHrefBody = functionBody(
      serverDetailPageSource,
      "function serverTabHref(tab: ServerDetailTab): string",
    );
    const serverSectionHrefBody = functionBody(
      serverDetailPageSource,
      'function serverSectionHref(\n    tab: "runtime" | "settings"',
    );
    const deploymentTabHrefBody = functionBody(
      deploymentDetailPageSource,
      "function deploymentTabHref(tab: DeploymentDetailTab): string",
    );

    for (const hrefBody of [
      projectTabHrefBody,
      resourceTabHrefBody,
      resourceSectionHrefBody,
      serverTabHrefBody,
      serverSectionHrefBody,
      deploymentTabHrefBody,
    ]) {
      expect(hrefBody).toContain("new URLSearchParams()");
      expect(hrefBody).not.toContain("page.url.searchParams");
      expect(hrefBody).not.toContain('"modal"');
      expect(hrefBody).not.toContain('"source"');
      expect(hrefBody).not.toContain('"editResource"');
      expect(hrefBody).not.toContain('"resourceMode"');
    }
  });

  test("[CONSOLE-NAV-IA-002] keeps preview policies contextual instead of workspace primary navigation", () => {
    expect(consoleShellSource).not.toContain('href: "/preview-policies"');
    expect(consoleShellSource).not.toContain("i18nKeys.console.nav.previewPolicies");
    expect(projectDetailPageSource).toContain("function projectPreviewPolicyHref()");
    expect(projectDetailPageSource).toContain("data-project-preview-policy-link");
    expect(projectDetailPageSource).toContain('scope: "project"');
    expect(resourceDetailPageSource).toContain("function resourcePreviewPolicyHref()");
    expect(resourceDetailPageSource).toContain("data-resource-preview-policy-link");
    expect(resourceDetailPageSource).toContain('scope: "resource"');
    expect(previewPoliciesPageSource).toContain("const searchParams = page.url.searchParams");
    expect(previewPoliciesPageSource).toContain('searchParams.get("projectId")');
    expect(previewPoliciesPageSource).toContain('searchParams.get("resourceId")');
  });

  test("[PROJECT-NAV-IA-001] uses the plural Previews tab contract for project previews", () => {
    const projectDetailTabModelSource = sourceBetween(
      projectDetailPageSource,
      "type ProjectDetailTab =",
      "type ProjectAttentionItem =",
    );
    const projectDetailTabsSource = sourceBetween(
      projectDetailPageSource,
      "const projectDetailTabs = [",
      "] as const;",
    );

    expect(projectDetailTabModelSource).toContain('| "previews"');
    expect(projectDetailTabModelSource).not.toContain('| "preview"');
    expect(projectDetailTabsSource).toContain('"previews"');
    expect(projectDetailTabsSource).not.toContain('"preview"');
    expect(projectDetailPageSource).toContain('value="previews"');
    expect(projectDetailPageSource).not.toContain('value="preview"');
  });

  test("[RESOURCE-DEPLOYMENT-IA-001] opens resource deployment creation as an in-context modal", () => {
    expect(resourceDetailPageSource).toContain('modalIsOpen(page, "deployment")');
    expect(resourceDetailPageSource).toContain('setModalOpen(page, "deployment", true)');
    expect(resourceDetailPageSource).toContain('setModalOpen(page, "deployment", false)');
    expect(resourceDetailPageSource).toContain("function prepareResourceDeploymentDialog()");
    expect(resourceDetailPageSource).toContain(
      "function setResourceDeploymentDialogOpen(open: boolean)",
    );
    expect(resourceDetailPageSource).toContain(
      "<Dialog.Root bind:open={deploymentDialogOpen} onOpenChange={setResourceDeploymentDialogOpen}",
    );
    expect(resourceDetailPageSource).not.toContain("deployments/new");
    expect(resourceDetailPageSource).not.toContain('href="/deploy"');
    expect(resourceDetailPageSource).not.toContain('href="/deploy?');
    expect(existsSync(legacyResourceDeploymentCreatePagePath)).toBe(false);
    expect(existsSync(legacyResourceDeploymentCreateRoutePath)).toBe(false);
  });

  test("[RESOURCE-DETAIL-IA-001B] keeps default resource pages display-first", () => {
    const resourceDetailBodySource = resourceDetailPageSource.slice(
      resourceDetailPageSource.indexOf("<div class={detailBodyClass}>"),
      resourceDetailPageSource.indexOf(
        "<Dialog.Root",
        resourceDetailPageSource.indexOf("<div class={detailBodyClass}>"),
      ),
    );
    const resourceOverviewSource = sourceBetween(
      resourceDetailPageSource,
      '{:else if activeTab === "overview"}',
      '{:else if activeTab === "networking"',
    );

    expect(resourceOverviewSource).not.toContain("<form");
    expect(resourceOverviewSource).not.toContain('type="submit"');
    expect(resourceOverviewSource).not.toContain("<Input");
    expect(resourceOverviewSource).not.toContain("<Textarea");
    expect(resourceOverviewSource).not.toContain("<select");
    expect(resourceOverviewSource).not.toContain("<Select.Root");
    expect(resourceOverviewSource).not.toContain(
      "xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]",
    );
    expect(resourceDetailPageSource).not.toContain(
      "xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]",
    );
    expect(resourceDetailPageSource).toContain("onclick={openResourceDeploymentDialog}");
    expect(resourceDetailBodySource).toContain("onclick={openResourceDomainBindingCreateDialog}");
    expect(resourceDetailBodySource).toContain("onclick={openScheduledTaskCreateDialog}");
    expect(resourceDetailBodySource).toContain("{@render resourceRuntimeControlPanel()}");
    expect(resourceDetailPageSource).toContain("onclick={openRuntimeControlDialog}");
    expect(resourceDetailPageSource).not.toContain("onclick={() => openRuntimeControlDialog");
    const latestDeploymentSummarySource = sourceBetween(
      resourceDetailPageSource,
      "data-resource-latest-deployment-summary",
      "{:else}",
    );
    expect(latestDeploymentSummarySource.match(/border border-border/g)?.length).toBe(3);
    expect(latestDeploymentSummarySource).toContain(
      "<DeploymentStatusBadge status={latestDeployment.status} />",
    );
    expect(latestDeploymentSummarySource).not.toContain("border-destructive");
    expect(latestDeploymentSummarySource).not.toContain("border-red");
  });

  test("[RESOURCE-DETAIL-IA-001C] keeps monitor, logs, terminal, and job creation at the right layer", () => {
    const resourceJobsTabSource = sourceBetween(
      resourceDetailPageSource,
      '{:else if activeTab === "jobs"}',
      '{:else if activeTab === "previews"}',
    );
    const runtimeMonitorPanelDisplaySource = sourceBetween(
      runtimeMonitorPanelSource,
      '<div class="space-y-4">',
      "<Dialog.Root",
    );
    const runtimeThresholdDialogSource = sourceBetween(
      runtimeMonitorPanelSource,
      "<Dialog.Root",
      "</Dialog.Root>",
    );
    const resourceLogsTabSource = sourceBetween(
      resourceDetailPageSource,
      '{:else if activeTab === "logs"}',
      "{/if}\n      </div>",
    );
    const resourceRuntimeLogsPanelSource = sourceBetween(
      resourceDetailPageSource,
      "{#snippet resourceRuntimeLogsPanel()}",
      "{/snippet}",
    );
    const resourceTerminalTabSource = sourceBetween(
      resourceDetailPageSource,
      '{:else if activeTab === "terminal"}',
      '{:else if activeTab === "logs"}',
    );
    const resourceDetailTabModelSource = sourceBetween(
      resourceDetailPageSource,
      "type ResourceDetailTab =",
      "let runtimeMonitoringTimeRange",
    );
    const resourceDetailTabsSource = sourceBetween(
      resourceDetailPageSource,
      "const resourceDetailTabs = [",
      "const resourceNetworkingSections",
    );
    const resourceJobsSectionsSource = sourceBetween(
      resourceDetailPageSource,
      "const resourceJobsSections =",
      "const resourceSettingsSections",
    );

    expect(resourceDetailPageSource).toContain('"monitor"');
    expect(resourceDetailPageSource).toContain('"logs"');
    expect(resourceDetailPageSource).toContain('"terminal"');
    expect(resourceDetailTabModelSource).toContain('| "monitor"');
    expect(resourceDetailTabModelSource).toContain('| "logs"');
    expect(resourceDetailTabModelSource).toContain('| "terminal"');
    expect(resourceDetailTabModelSource).toContain('| "previews"');
    expect(resourceDetailTabsSource).toContain('"monitor"');
    expect(resourceDetailTabsSource).toContain('"logs"');
    expect(resourceDetailTabsSource).toContain('"terminal"');
    expect(resourceDetailTabsSource).toContain('"previews"');
    expect(resourceDetailPageSource).toContain(
      'latestDeployment?.target?.kind === "serverless-static-artifact"',
    );
    expect(resourceDetailPageSource).toContain("const visibleResourceDetailTabs = $derived");
    expect(resourceDetailPageSource).toContain(
      'tab !== "monitor" && tab !== "logs" && tab !== "terminal" && tab !== "jobs"',
    );
    expect(resourceDetailPageSource).toContain("resourceSupportsServerBackedRuntimeSurfaces");
    expect(resourceDetailPageSource).toContain("!resource || !isDirectStaticArtifactRuntime");
    expect(resourceJobsSectionsSource).toContain('"scheduled-tasks"');
    expect(resourceJobsSectionsSource).toContain('"source-events"');
    expect(resourceJobsSectionsSource).not.toContain('"previews"');
    expect(resourceDetailPageSource).toContain('logsHref={resourceTabHref("logs")}');
    expect(resourceDetailPageSource).toContain("data-resource-runtime-logs-unavailable-state");
    expect(resourceDetailPageSource).toContain("data-resource-terminal-panel");
    expect(resourceDetailPageSource).toContain("data-resource-terminal-unavailable-state");
    expect(resourceDetailPageSource).toContain("runtimeLogsUnavailableBody");
    expect(resourceDetailPageSource).toContain("terminal.resourceUnavailableTitle");
    expect(resourceDetailPageSource).toContain("terminal.resourceUnavailableBody");
    expect(resourceDetailPageSource).toContain("readRuntimeLogErrorMessage");
    expect(resourceDetailPageSource).toContain('"Resource has no observable runtime deployment"');
    const resourceDetailQuerySource = sourceBetween(
      resourceDetailPageSource,
      "const resourceDetailQuery = createQuery",
      "const resourceHealthQuery = createQuery",
    );
    const resourceHealthQuerySource = sourceBetween(
      resourceDetailPageSource,
      "const resourceHealthQuery = createQuery",
      "const resourceEffectiveConfigQuery = createQuery",
    );
    const resourceEffectiveConfigQuerySource = sourceBetween(
      resourceDetailPageSource,
      "const resourceEffectiveConfigQuery = createQuery",
      "const resourceSourceEventsQuery = createQuery",
    );
    const resourceScheduledTasksEnabledSource = sourceBetween(
      resourceDetailPageSource,
      "const resourceScheduledTasksEnabled = $derived",
      "let storageBackupVolumeId",
    );
    const resourceRuntimeLogsEffectSource = sourceBetween(
      resourceDetailPageSource,
      '$effect(() => {\n    const currentResourceId = resource?.id ?? "";\n    const currentTab = activeTab;',
      "  onDestroy(() => {",
    );
    for (const coreResourceQuerySource of [
      resourceDetailQuerySource,
      resourceHealthQuerySource,
      resourceEffectiveConfigQuerySource,
    ]) {
      expect(coreResourceQuerySource).toContain("enabled: browser && resourceId.length > 0");
      expect(coreResourceQuerySource).not.toContain("enabled: resourceSourceEventsEnabled");
      expect(coreResourceQuerySource).not.toContain("enabled: resourcePreviewsEnabled");
      expect(coreResourceQuerySource).not.toContain("enabled: resourceScheduledTasksEnabled");
    }
    expect(resourceScheduledTasksEnabledSource).toContain(
      "resourceSupportsServerBackedRuntimeSurfaces",
    );
    expect(resourceDetailPageSource).toContain(
      "resourceRuntimeMonitorActive &&\n      resourceSupportsServerBackedRuntimeSurfaces",
    );
    expect(resourceRuntimeLogsEffectSource).toContain(
      "currentResourceSupportsServerBackedRuntimeSurfaces",
    );
    expect(resourceRuntimeLogsEffectSource).toContain(
      "if (!currentResourceSupportsServerBackedRuntimeSurfaces)",
    );
    expect(resourceRuntimeLogsPanelSource).toContain("staticArtifactRuntimeUnavailableTitle");
    expect(resourceRuntimeLogsPanelSource).toContain("staticArtifactRuntimeLogsUnavailableBody");
    expect(resourceDetailPageSource).toContain(
      "<Dialog.Root bind:open={scheduledTaskCreateDialogOpen}",
    );
    expect(resourceDetailPageSource).toContain('id="resource-scheduled-task-create-form"');
    expect(resourceJobsTabSource).toContain("onclick={openScheduledTaskCreateDialog}");
    expect(resourceJobsTabSource).toContain("data-resource-scheduled-task-run-log-detail");
    expect(resourceJobsTabSource).toContain(
      "selectedScheduledTaskRunId || scheduledTaskRunLogsLoading",
    );
    expect(resourceJobsTabSource).toContain("onclick={clearScheduledTaskRunLogs}");
    expect(resourceJobsTabSource).not.toContain('id="resource-scheduled-task-create-form"');
    expect(resourceJobsTabSource).not.toContain("previewEnvironment");
    expect(resourceJobsTabSource).not.toContain("resourcePreviewEnvironments");
    expect(resourceJobsTabSource).not.toContain("openPreviewEnvironmentCleanupDialog");
    expect(resourceJobsTabSource).not.toContain("scheduledTaskRunLogsSelect");
    expect(resourceJobsTabSource).not.toContain("<form");
    expect(resourceJobsTabSource).not.toContain("<Input");
    expect(resourceJobsTabSource).not.toContain("<Textarea");
    expect(resourceLogsTabSource).toContain("{@render resourceRuntimeLogsPanel()}");
    expect(resourceLogsTabSource).not.toContain("{@render resourceRuntimeControlPanel()}");
    expect(resourceLogsTabSource).not.toContain("openRuntimeControlDialog");
    expect(resourceLogsTabSource).not.toContain("<TerminalSessionPanel");
    expect(resourceLogsTabSource).not.toContain("data-resource-terminal-unavailable-state");
    expect(resourceLogsTabSource).not.toContain("openResourceDeploymentDialog");
    expect(resourceLogsTabSource).not.toContain("terminal.resourceUnavailable");
    expect(resourceRuntimeLogsPanelSource).toContain(
      "data-resource-runtime-logs-unavailable-state",
    );
    expect(resourceRuntimeLogsPanelSource).toContain("runtimeLogsUnavailableTitle");
    expect(resourceRuntimeLogsPanelSource).toContain("runtimeLogsUnavailableBody");
    expect(resourceRuntimeLogsPanelSource).not.toContain(
      "Resource has no observable runtime deployment",
    );
    expect(resourceTerminalTabSource).toContain("<TerminalSessionPanel");
    expect(resourceTerminalTabSource).toContain("docsHref={webDocsHrefs.serverTerminalSession}");
    expect(resourceTerminalTabSource).not.toContain('<div class="flex justify-end">');
    expect(resourceTerminalTabSource).toContain("data-resource-terminal-unavailable-state");
    expect(resourceTerminalTabSource).toContain("terminal.resourceUnavailableTitle");
    expect(resourceTerminalTabSource).toContain("terminal.resourceUnavailableBody");
    expect(resourceTerminalTabSource).toContain('href={resourceTabHref("deployments")}');
    expect(resourceTerminalTabSource).toContain("serverTerminalHref(latestDeployment.serverId)");
    expect(resourceTerminalTabSource).not.toContain("runtimeControl");
    expect(resourceTerminalTabSource).not.toContain("runtimeLogsUnavailableTitle");
    expect(resourceTerminalTabSource).not.toContain("runtimeLogsUnavailableBody");
    expect(resourceTerminalTabSource).not.toContain("openResourceDeploymentDialog");
    expect(resourceTerminalTabSource).not.toContain("onclick={openResourceDeploymentDialog}");
    expect(resourceTerminalTabSource).not.toContain("<form");
    expect(resourceTerminalTabSource).not.toContain("<Input");
    expect(runtimeMonitorPanelDisplaySource).toContain("data-runtime-threshold-display-surface");
    expect(runtimeMonitorPanelDisplaySource).toContain("setThresholdDialogOpen(true)");
    expect(runtimeMonitorPanelDisplaySource).not.toContain("<Input");
    expect(runtimeMonitorPanelDisplaySource).not.toContain("<form");
    expect(runtimeThresholdDialogSource).toContain("data-runtime-threshold-dialog");
    expect(runtimeThresholdDialogSource).toContain("<Input");
    expect(runtimeThresholdDialogSource).toContain('type="submit"');
  });

  test("[RESOURCE-SETTINGS-IA-001] keeps settings general as identity and lifecycle display surface", () => {
    const settingsGeneralSource = sourceBetween(
      resourceDetailPageSource,
      'id="resource-settings-general"',
      '{:else if activeResourceSection === "access"}',
    );
    const configurationProfileSource = sourceBetween(
      resourceDetailPageSource,
      '{:else if activeResourceSection === "profile"}',
      '{:else if activeResourceSection === "configuration"}',
    );

    expect(settingsGeneralSource).toContain("data-resource-settings-general");
    expect(settingsGeneralSource).toContain("data-resource-settings-identity");
    expect(settingsGeneralSource).toContain("data-resource-settings-lifecycle");
    expect(settingsGeneralSource).toContain("data-resource-settings-handoffs");
    expect(settingsGeneralSource).toContain("settingsTitle");
    expect(settingsGeneralSource).toContain("settingsDescription");
    expect(settingsGeneralSource).toContain("settingsHandoffsTitle");
    expect(settingsGeneralSource).toContain('resourceSectionHref("profile")');
    expect(settingsGeneralSource).toContain('resourceSectionHref("access")');
    expect(settingsGeneralSource).toContain('resourceSectionHref("diagnostics")');
    expect(settingsGeneralSource).toContain('resourceSectionHref("danger")');
    expect(settingsGeneralSource).not.toContain("<ResourceProfileSummary");
    expect(settingsGeneralSource).not.toContain("applicationProfileTitle");
    expect(settingsGeneralSource).not.toContain("networkProfileTitle");
    expect(settingsGeneralSource).not.toContain("serviceTopologyTitle");
    assertDisplaySurfaceIsFormFree(settingsGeneralSource);
    expect(configurationProfileSource).toContain("<ResourceProfileSummary");
  });

  test("[RESOURCE-HEALTH-IA-001] keeps health summary items visually bounded", () => {
    const healthPolicySource = sourceBetween(
      resourceDetailPageSource,
      'id="resource-health-policy"',
      '{:else if activeResourceSection === "danger"}',
    );

    expect(healthPolicySource).toContain("healthRuntime");
    expect(healthPolicySource).toContain("healthPolicy");
    expect(healthPolicySource).toContain("healthPublicAccess");
    expect(healthPolicySource).toContain("healthProxy");
    expect(
      healthPolicySource.match(/class="rounded-md border bg-background px-3 py-2"/g)?.length,
    ).toBeGreaterThanOrEqual(4);
    expect(healthPolicySource).not.toContain('class="rounded-md bg-muted/25 px-3 py-2"');
  });

  test("[RES-HEALTH-ENTRY-001] keeps health reasons in the header popover instead of the overview card", () => {
    const overviewSource = sourceBetween(
      resourceDetailPageSource,
      '{:else if activeTab === "overview"}',
      "{$t(i18nKeys.console.resources.overviewLatestDeployment)}",
    );
    const healthPopoverSource = sourceBetween(
      resourceDetailPageSource,
      "<Popover.Content",
      "</Popover.Content>",
    );

    expect(overviewSource).toContain("healthRuntime");
    expect(overviewSource).toContain("healthPolicy");
    expect(overviewSource).toContain("healthPublicAccess");
    expect(overviewSource).toContain("healthProxy");
    expect(overviewSource).not.toContain("healthIssueTitle");
    expect(overviewSource).not.toContain("data-resource-health-primary-issues");
    expect(healthPopoverSource).toContain("healthIssueTitle");
    expect(healthPopoverSource).toContain("<ol");
    expect(healthPopoverSource).toContain("resourceHealthIssues");
    expect(healthPopoverSource).toContain("issue.action");
  });

  test("[RESOURCE-INITIAL-CREDENTIALS-IA-001] keeps initial credentials on the resource overview", () => {
    const overviewSource = sourceBetween(
      resourceDetailPageSource,
      'id="resource-overview"',
      "{$t(i18nKeys.console.resources.overviewLatestDeployment)}",
    );

    expect(overviewSource).toContain("data-resource-initial-access-credentials");
    expect(overviewSource).toContain("data-resource-initial-access-credential");
    expect(overviewSource).toContain("visibleResourceInitialAccessCredentials");
    expect(resourceDetailPageSource).toContain('credential.status === "pending"');
    expect(resourceDetailPageSource).toContain(
      "Boolean(revealedInitialAccessCredentials[credential.credentialId])",
    );
    const initialAccessCredentialsEndpointSource = [
      "/api/resources/",
      "$",
      "{encodeURIComponent(resourceId)}",
      "/initial-access-credentials",
    ].join("");
    expect(resourceDetailPageSource).toContain(initialAccessCredentialsEndpointSource);
    expect(resourceDetailPageSource).toContain("initialAccessCredentialsTitle");
    expect(resourceDetailPageSource).toContain("claimInitialAccessCredential");
    expect(resourceDetailPageSource).not.toContain("/cloud/installed-applications/");
  });

  test("[RESOURCE-NETWORKING-IA-001] owns domain binding creation from a focused dialog", () => {
    const resourceDomainBindingsSectionSource =
      resourceDetailPageSource.match(
        /<section id="resource-domain-bindings"[\s\S]*?<section id="resource-proxy-configuration"/,
      )?.[0] ?? "";
    const resourceDomainBindingDialogSource =
      resourceDetailPageSource.match(
        /<Dialog\.Root\s+bind:open={domainBindingCreateDialogOpen}[\s\S]*?data-resource-domain-binding-create-dialog[\s\S]*?<\/Dialog\.Root>/,
      )?.[0] ?? "";

    expect(resourceDetailPageSource).toContain("domainBindingCreateDialogOpen");
    expect(resourceDetailPageSource).toContain("dnsConnectorDialogOpen");
    expect(resourceDetailPageSource).toContain("openResourceDomainBindingCreateDialog");
    expect(resourceDetailPageSource).toContain("openDnsConnectorDialog(binding)");
    expect(resourceDetailPageSource).toContain("setResourceDomainBindingCreateDialogOpen");
    expect(resourceDetailPageSource).toContain("setDnsConnectorDialogOpen");
    expect(resourceDetailPageSource).toContain("orpcClient.domainBindings.inspectDnsReadiness");
    expect(resourceDetailPageSource).not.toContain("inferDnsZoneName");
    expect(resourceDetailPageSource).toContain("orpcClient.connections.capability.accept");
    expect(resourceDetailPageSource).toContain("orpcClient.connections.capability.apply");
    expect(resourceDetailPageSource).toContain('capabilityKey: "dns.records.apply"');
    expect(resourceDetailPageSource).toContain('from "@thesvg/icons/cloudflare"');
    expect(resourceDetailPageSource).toContain("cloudflareConnectorIcon.svg");
    expect(resourceDetailPageSource).toContain("dnsConnectorProviderLabel()");
    expect(resourceDetailPageSource).toContain("dnsConnectorSelectedConnectorKey");
    expect(resourceDetailPageSource).not.toContain("<span>Cloudflare DNS</span>");
    expect(resourceDetailPageSource).toContain('modalIsOpen(page, "domain-binding")');
    expect(resourceDomainBindingsSectionSource).not.toContain(
      "data-resource-static-artifact-domain-unavailable",
    );
    expect(resourceDomainBindingsSectionSource).not.toContain(
      "staticArtifactDomainBindingsUnavailableTitle",
    );
    expect(resourceDomainBindingsSectionSource).not.toContain(
      "staticArtifactDomainBindingsUnavailableDescription",
    );
    expect(resourceDomainBindingsSectionSource).not.toContain(
      "disabled={isResourceArchived || isServerlessStaticArtifactAccess}",
    );
    expect(resourceDomainBindingsSectionSource).toContain(
      "onclick={openResourceDomainBindingCreateDialog}",
    );
    expect(resourceDomainBindingsSectionSource).toContain(
      "onclick={() => openDnsConnectorDialog(binding)}",
    );
    expect(resourceDomainBindingsSectionSource).not.toContain("<form");
    expect(resourceDomainBindingDialogSource).toContain("onsubmit={createResourceDomainBinding}");
    expect(resourceDomainBindingDialogSource).toContain(
      "data-resource-domain-binding-create-dialog",
    );
    expect(resourceDomainBindingDialogSource).toContain('id="resource-domain-binding-domain"');
    expect(resourceDomainBindingDialogSource).toContain('id="resource-domain-binding-destination"');
    expect(resourceDomainBindingDialogSource).toContain(
      'id="resource-domain-binding-destination-label"',
    );
    expect(resourceDomainBindingDialogSource).toContain(
      'aria-labelledby="resource-domain-binding-destination-label"',
    );
    expect(resourceDomainBindingDialogSource).toContain(
      '<Select.Item value="disabled">disabled</Select.Item>',
    );
    expect(resourceDetailPageSource).toContain('proxyKind: "traefik"');
    expect(resourceDomainBindingDialogSource).not.toContain(
      '<Select.Item value="traefik">traefik</Select.Item>',
    );
    expect(resourceDomainBindingDialogSource).not.toContain(
      '<Select.Item value="caddy">caddy</Select.Item>',
    );
    expect(resourceDomainBindingDialogSource).not.toContain("tlsStepTitle");
    expect(resourceDomainBindingDialogSource).not.toContain(
      '<Select.Item value="nginx">nginx</Select.Item>',
    );
    expect(resourceDetailPageSource).toContain("data-resource-domain-binding-dns-dialog");
    expect(resourceDetailPageSource).toContain("dnsConnectorReadiness");
    expect(resourceDetailPageSource).toContain("dnsConnectorConnectProvider");
    expect(resourceDetailPageSource).toContain("dnsConnectorManualDns");
    expect(resourceDetailPageSource).toContain("dnsConnectorRecordDomain");
    expect(resourceDetailPageSource).toContain("dnsConnectorRecordTarget");
    expect(resourceDetailPageSource).toContain("primaryDomainBindingNeedsDnsConfiguration");
    expect(resourceDetailPageSource).toContain('resourceSearchParams.get("dnsBindingId")');
    expect(resourceDetailPageSource).toContain("openDnsConnectorDialog(requestedBinding)");
    expect(resourceDetailPageSource).toContain(
      "domainBindingNeedsDnsConfiguration(primaryDomainBinding)",
    );
    expect(resourceDetailPageSource).toContain(
      "onclick={() => openDnsConnectorDialog(primaryDomainBinding)}",
    );
    expect(resourceDetailPageSource).toContain(
      'onclick={() => copyManualDnsRecord(record, "name")}',
    );
    expect(resourceDetailPageSource).toContain(
      'onclick={() => copyManualDnsRecord(record, "value")}',
    );
    expect(resourceDetailPageSource).toContain('id="resource-domain-binding-dns-apply"');
  });

  test("[RESOURCE-PROXY-UI-001] keeps proxy configuration summary tiles visually bounded", () => {
    const proxyConfigurationSource = sourceBetween(
      resourceDetailPageSource,
      'id="resource-proxy-configuration"',
      'id="resource-configuration-profile"',
    );

    expect(
      proxyConfigurationSource.match(/class="rounded-md border bg-muted\/25 px-3 py-2"/g),
    ).toHaveLength(4);
  });

  test("[RESOURCE-DEPENDENCIES-IA-001] keeps dependency binding forms behind a focused dialog", () => {
    const resourceDependencyBindingsSectionSource = sourceBetween(
      resourceDetailPageSource,
      '<section id="resource-dependency-bindings"',
      '<section id="resource-storage"',
    );
    const dependencyBindDialogSource =
      resourceDetailPageSource.match(
        /<Dialog\.Root bind:open={dependencyBindDialogOpen}[\s\S]*?data-resource-dependency-bind-dialog[\s\S]*?<\/Dialog\.Root>/,
      )?.[0] ?? "";
    const dependencyUnbindDialogSource =
      resourceDetailPageSource.match(
        /<Dialog\.Root bind:open={dependencyUnbindDialogOpen}[\s\S]*?data-resource-dependency-unbind-dialog[\s\S]*?<\/Dialog\.Root>/,
      )?.[0] ?? "";

    expect(resourceDetailPageSource).toContain("dependencyBindDialogOpen");
    expect(resourceDetailPageSource).toContain("dependencyUnbindDialogOpen");
    expect(resourceDetailPageSource).toContain("openDependencyBindDialog");
    expect(resourceDetailPageSource).toContain("openDependencyUnbindDialog");
    expect(resourceDetailPageSource).toContain("closeDependencyBindDialog");
    expect(resourceDetailPageSource).toContain("closeDependencyUnbindDialog");
    expect(resourceDetailPageSource).toContain("data-resource-dependency-bind-dialog");
    expect(resourceDetailPageSource).toContain("data-resource-dependency-unbind-dialog");
    expect(resourceDependencyBindingsSectionSource).toContain("onclick={openDependencyBindDialog}");
    expect(resourceDependencyBindingsSectionSource).toContain(
      "openDependencyUnbindDialog(binding)",
    );
    expect(resourceDependencyBindingsSectionSource).not.toContain("<form");
    expect(resourceDependencyBindingsSectionSource).not.toContain("<Input");
    expect(resourceDependencyBindingsSectionSource).not.toContain("<Select.Root");
    expect(dependencyBindDialogSource).toContain("onsubmit={bindDependencyResource}");
    expect(dependencyBindDialogSource).toContain(
      "<Select.Root bind:value={dependencyBindingResourceId}",
    );
    expect(dependencyBindDialogSource).toContain('id="resource-dependency-target-name"');
    expect(dependencyBindDialogSource).toContain("dependencyResourceOptionLabel");
    expect(dependencyBindDialogSource).toContain("dependencyRuntimeBadge");
    expect(dependencyBindDialogSource).toContain('type="submit"');
    expect(dependencyUnbindDialogSource).toContain("unbindDependencyResource");
    expect(dependencyUnbindDialogSource).toContain("selectedDependencyBindingForUnbind");
    expect(dependencyUnbindDialogSource).toContain("dependencyUnbindWarning");
  });

  test("[RESOURCE-STORAGE-IA-001] exposes storage backup actions inside the storage workflow", () => {
    const resourceStorageSectionSource = sourceBetween(
      resourceDetailPageSource,
      '<section id="resource-storage"',
      '{:else if activeResourceSection === "diagnostics"}',
    );
    const storageBackupDialogSource = sourceBetween(
      resourceDetailPageSource,
      "<Dialog.Root bind:open={storageBackupDialogOpen}>",
      "<Dialog.Root bind:open={configEditorDialogOpen}>",
    );

    expect(resourceStorageSectionSource).not.toContain("data-resource-storage-backup-form");
    expect(resourceStorageSectionSource).toContain("openStorageBackupDialog()");
    expect(resourceStorageSectionSource).toContain("storageBackupAttachmentOptionLabel");
    expect(resourceStorageSectionSource).toContain("storageBackupDataFormat");
    expect(storageBackupDialogSource).toContain("data-resource-storage-backup-form");
    expect(storageBackupDialogSource).toContain("onsubmit={(event) =>");
    expect(storageBackupDialogSource).toContain("planStorageBackup()");
    expect(storageBackupDialogSource).toContain("<Input");
    expect(storageBackupDialogSource).toContain("<Select.Root");
    expect(storageBackupDialogSource).toContain('id="resource-storage-backup-data-format"');
    expect(storageBackupDialogSource).not.toContain("bind:value={storageBackupDataFormat}");
    expect(storageBackupDialogSource).toContain('type="submit"');
    expect(storageBackupDialogSource).toContain("onclick={createStorageBackup}");
    expect(resourceStorageSectionSource).toContain("restoreStorageBackup(backup)");
    expect(resourceStorageSectionSource).toContain("pruneStorageBackup(backup)");
  });

  test("[RESOURCE-DETAIL-IA-002] keeps resource destructive actions behind intent dialogs", () => {
    expect(resourceDetailPageSource).toContain("scheduledTaskDeleteDialogOpen");
    expect(resourceDetailPageSource).toContain("scheduledTaskManageDialogOpen");
    expect(resourceDetailPageSource).toContain("selectedScheduledTaskForDelete");
    expect(resourceDetailPageSource).toContain("selectedScheduledTaskForManage");
    expect(resourceDetailPageSource).toContain("openScheduledTaskManageDialog(task)");
    expect(resourceDetailPageSource).toContain("openScheduledTaskDeleteDialog(task)");
    expect(resourceDetailPageSource).toContain("data-resource-scheduled-task-delete-dialog");
    expect(resourceDetailPageSource).toContain("data-resource-scheduled-task-manage-dialog");
    expect(resourceDetailPageSource).toContain("previewEnvironmentCleanupDialogOpen");
    expect(resourceDetailPageSource).toContain("selectedPreviewEnvironmentForCleanup");
    expect(resourceDetailPageSource).toContain(
      "openPreviewEnvironmentCleanupDialog(previewEnvironment)",
    );
    expect(resourceDetailPageSource).toContain("data-resource-preview-cleanup-dialog");
    expect(resourceDetailPageSource).toContain("resourceLifecycleDialogOpen");
    expect(resourceDetailPageSource).toContain("selectedResourceLifecycleAction");
    expect(resourceDetailPageSource).toContain("resourceDeleteConfirmation");
    expect(resourceDetailPageSource).toContain("data-resource-lifecycle-dialog");
    expect(resourceDetailPageSource).not.toContain("requestConsolePrompt");

    const scheduledTaskListSource =
      resourceDetailPageSource.match(
        /{#each scheduledTasks as task[\s\S]*?<\/article>\s*{\/each}/,
      )?.[0] ?? "";
    const scheduledTaskDeleteDialogSource =
      resourceDetailPageSource.match(
        /<Dialog\.Root bind:open={scheduledTaskDeleteDialogOpen}[\s\S]*?<\/Dialog\.Root>/,
      )?.[0] ?? "";
    const scheduledTaskManageDialogSource =
      resourceDetailPageSource.match(
        /<Dialog\.Root bind:open={scheduledTaskManageDialogOpen}[\s\S]*?<\/Dialog\.Root>/,
      )?.[0] ?? "";
    const previewEnvironmentListSource =
      resourceDetailPageSource.match(
        /{#each resourcePreviewEnvironments as previewEnvironment[\s\S]*?<\/article>\s*{\/each}/,
      )?.[0] ?? "";
    const previewEnvironmentActionSource =
      previewEnvironmentListSource.match(
        /<div class="flex flex-wrap gap-2 lg:justify-end">[\s\S]*?<\/div>\s*<\/div>\s*<\/article>/,
      )?.[0] ?? "";
    const previewEnvironmentCleanupDialogSource =
      resourceDetailPageSource.match(
        /<Dialog\.Root bind:open={previewEnvironmentCleanupDialogOpen}[\s\S]*?<\/Dialog\.Root>/,
      )?.[0] ?? "";
    const resourceDangerSource =
      resourceDetailPageSource.match(
        /<section\s+id="resource-danger-zone"[\s\S]*?<\/section>/,
      )?.[0] ?? "";
    const resourceLifecycleDialogSource =
      resourceDetailPageSource.match(
        /<Dialog\.Root bind:open={resourceLifecycleDialogOpen}[\s\S]*?<\/Dialog\.Root>/,
      )?.[0] ?? "";

    expect(scheduledTaskListSource).toContain("openScheduledTaskManageDialog(task)");
    expect(scheduledTaskListSource).toContain("scheduledTaskRunManageAction");
    expect(scheduledTaskListSource).not.toContain("runScheduledTaskNow(task)");
    expect(scheduledTaskListSource).not.toContain("configureScheduledTaskStatus(task)");
    expect(scheduledTaskListSource).toContain("openScheduledTaskDeleteDialog(task)");
    expect(scheduledTaskListSource).toContain("scheduledTaskLifecycleAction");
    expect(scheduledTaskListSource).not.toContain("deleteScheduledTask(task)");
    expect(scheduledTaskListSource).not.toContain("scheduledTaskRunNow");
    expect(scheduledTaskListSource).not.toContain("scheduledTaskEnable");
    expect(scheduledTaskListSource).not.toContain("scheduledTaskDisable");
    expect(scheduledTaskListSource).not.toContain('variant="destructive"');
    expect(scheduledTaskListSource).not.toContain("<Trash2");
    expect(scheduledTaskListSource).not.toContain("scheduledTaskDelete");
    expect(scheduledTaskManageDialogSource).toContain("runScheduledTaskNow(task)");
    expect(scheduledTaskManageDialogSource).toContain("configureScheduledTaskStatus(task)");
    expect(scheduledTaskManageDialogSource).toContain("scheduledTaskRunNow");
    expect(scheduledTaskManageDialogSource).toContain("scheduledTaskEnable");
    expect(scheduledTaskManageDialogSource).toContain("scheduledTaskDisable");
    expect(scheduledTaskDeleteDialogSource).toContain("onclick={deleteScheduledTask}");
    expect(scheduledTaskDeleteDialogSource).toContain("scheduledTaskDelete");
    expect(scheduledTaskDeleteDialogSource).toContain('variant="destructive"');
    expect(scheduledTaskDeleteDialogSource).toContain("<Trash2");
    expect(previewEnvironmentListSource).toContain(
      "openPreviewEnvironmentCleanupDialog(previewEnvironment)",
    );
    expect(previewEnvironmentListSource).toContain("lifecycleManageAction");
    expect(previewEnvironmentListSource).not.toContain(
      "cleanupPreviewEnvironment(previewEnvironment)",
    );
    expect(previewEnvironmentActionSource).not.toContain("cleanupAction");
    expect(previewEnvironmentActionSource).not.toContain("<Trash2");
    expect(previewEnvironmentActionSource).not.toContain('variant="destructive"');
    expect(previewEnvironmentCleanupDialogSource).toContain("onclick={cleanupPreviewEnvironment}");
    expect(previewEnvironmentCleanupDialogSource).toContain("cleanupAction");
    expect(previewEnvironmentCleanupDialogSource).toContain("<Trash2");
    expect(previewEnvironmentCleanupDialogSource).toContain('variant="destructive"');
    expect(resourceDangerSource).toContain("data-resource-danger-display-surface");
    expect(resourceDangerSource).toContain("openResourceLifecycleDialog");
    expect(resourceDangerSource).toContain("lifecycleManageAction");
    expect(resourceDangerSource).not.toContain("openDeletePreviewResourceDialog");
    expect(resourceDangerSource).not.toContain("openResourceArchiveDialog");
    expect(resourceDangerSource).not.toContain("openResourceDeleteDialog");
    expect(resourceDangerSource).not.toContain("onclick={deletePreviewResource}");
    expect(resourceDangerSource).not.toContain("onclick={archiveResource}");
    expect(resourceDangerSource).not.toContain("onclick={deleteResource}");
    expect(resourceDangerSource).not.toContain('variant="destructive"');
    expect(resourceDangerSource).not.toContain("<Trash2");
    expect(resourceLifecycleDialogSource).toContain(
      'selectedResourceLifecycleAction === "archive"',
    );
    expect(resourceLifecycleDialogSource).toContain(
      'selectedResourceLifecycleAction === "restore"',
    );
    expect(resourceLifecycleDialogSource).toContain('selectedResourceLifecycleAction === "delete"');
    expect(resourceLifecycleDialogSource).toContain('selectResourceLifecycleAction("archive")');
    expect(resourceLifecycleDialogSource).toContain('selectResourceLifecycleAction("restore")');
    expect(resourceLifecycleDialogSource).toContain('selectResourceLifecycleAction("delete")');
    expect(resourceLifecycleDialogSource).toContain("lifecycleArchiveOption");
    expect(resourceLifecycleDialogSource).toContain("lifecycleRestoreOption");
    expect(resourceLifecycleDialogSource).toContain("lifecycleDeleteOption");
    expect(resourceLifecycleDialogSource).toContain("lifecyclePreviewDeleteOption");
    expect(resourceLifecycleDialogSource).toContain(
      '<Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} class="max-w-2xl">',
    );
    expect(resourceLifecycleDialogSource).toContain(
      'class="box-border min-w-0 w-full space-y-5 overflow-x-hidden px-5 pb-5"',
    );
    expect(resourceLifecycleDialogSource).toContain('class="grid min-w-0 gap-2 sm:grid-cols-3"');
    expect(
      resourceLifecycleDialogSource.match(
        /class="h-auto min-w-0 w-full max-w-full items-start justify-start whitespace-normal px-3 py-3 text-left"/g,
      )?.length,
    ).toBeGreaterThanOrEqual(3);
    expect(resourceLifecycleDialogSource).toContain('class="mt-0.5 size-4 shrink-0"');
    expect(resourceLifecycleDialogSource).toContain('class="min-w-0 flex-1"');
    expect(resourceLifecycleDialogSource).toContain(
      'class="block break-words text-xs font-normal leading-snug opacity-80"',
    );
    expect(resourceLifecycleDialogSource).toContain("<Input");
    expect(resourceDetailPageSource).toContain(
      "normalizedConfirmationResourceSlug !== resource.slug",
    );
    expect(resourceLifecycleDialogSource).toContain('name="resourceSlug"');
    expect(resourceDetailPageSource).not.toContain("requestConsoleConfirm");
    expect(resourceDetailPageSource).not.toContain("requestConsolePrompt");
  });

  test("[RESOURCE-RUNTIME-IA-001] exposes resource runtime actions from the detail header", () => {
    const runtimeControlPanelSource = resourceDetailPageSource.slice(
      resourceDetailPageSource.indexOf("{#snippet resourceRuntimeControlPanel()}"),
      resourceDetailPageSource.indexOf("{#snippet resourceRuntimeLogsPanel()}"),
    );
    const resourceDetailActionsMenuSource =
      resourceDetailPageSource.match(
        /<DropdownMenu>[\s\S]*?resourceActionsMenu[\s\S]*?<\/DropdownMenu>/,
      )?.[0] ?? "";
    const runtimeControlDialogSource =
      resourceDetailPageSource.match(
        /<Dialog\.Root bind:open={runtimeControlDialogOpen}[\s\S]*?<\/Dialog\.Root>/,
      )?.[0] ?? "";

    expect(resourceDetailPageSource).toContain("runtimeControlDialogOpen");
    expect(resourceDetailPageSource).toContain("selectedRuntimeControlOperation");
    expect(resourceDetailPageSource).toContain("openRuntimeControlDialog");
    expect(resourceDetailPageSource).toContain("confirmSelectedRuntimeControl");
    expect(resourceDetailPageSource).toContain("data-resource-runtime-control-dialog");
    expect(resourceDetailPageSource).toContain("runtimeControlAttemptIsActive");
    expect(resourceDetailPageSource).toContain("latestRuntimeControlActive");
    expect(resourceDetailPageSource).toContain("runtimeControlHealthPolling");
    expect(resourceDetailPageSource).toContain(
      "refetchInterval: runtimeControlHealthPolling ? 2_000 : false",
    );
    expect(resourceDetailPageSource).toContain("runtimeControlDoesNotApplyConfig");
    expect(resourceDetailPageSource).toContain("runtimeControlApplyConfigWithRedeploy");
    expect(resourceDetailPageSource).toContain("runtimeControlRestartHint");
    expect(runtimeControlPanelSource).toContain(
      '<section id="resource-runtime-control" class="space-y-4">',
    );
    expect(runtimeControlPanelSource).not.toContain(
      'id="resource-runtime-control" class="space-y-4 p-5"',
    );
    expect(runtimeControlPanelSource).toContain("onclick={openRuntimeControlDialog}");
    expect(runtimeControlPanelSource).toContain("runtimeControlManageAction");
    expect(runtimeControlPanelSource).toContain("runtimeControlStartedAt");
    expect(runtimeControlPanelSource).toContain("runtimeControlPhaseLabel");
    expect(resourceDetailActionsMenuSource).toContain("DropdownMenuContent");
    expect(resourceDetailActionsMenuSource).toContain("resourceActionsMenu");
    expect(resourceDetailPageSource).toContain("onclick={() => redeployResource(false)}");
    expect(resourceDetailActionsMenuSource).toContain("onclick={() => redeployResource(true)}");
    expect(resourceDetailPageSource).toContain("observeDeploymentProgressAfterAcceptance");
    expect(resourceDetailPageSource).toContain("startDeploymentProgressDialog();");
    expect(resourceDetailPageSource).toContain("observeAcceptedResourceDeployment(result.id)");
    expect(resourceDetailPageSource).toContain("deploymentProgressDeploymentId = deploymentId;");
    expect(resourceDetailPageSource).toContain("deploymentProgressStreamError = message;");
    expect(resourceDetailPageSource).toContain("isTerminalDeploymentProgressEvent(event)");
    expect(deploymentProgressDialogSource).toContain("{onClose}");
    expect(deploymentProgressDialogSource).toContain("accessUrl?: string");
    expect(deploymentProgressDialogSource).toContain("{accessUrl}");
    expect(resourceDetailPageSource).toContain("accessUrl={primaryAccessHref}");
    expect(deploymentProgressDialogSource).toContain('class="max-h-[86vh] shadow-lg"');
    expect(deploymentProgressDialogSource).not.toContain(
      "flex-col overflow-hidden rounded-lg border bg-background",
    );
    expect(deploymentProgressDialogSource).not.toContain("min-h-0 flex-1 overflow-auto p-5");
    expect(operationProgressPanelSource).toContain("onclick={() => onClose?.()}");
    expect(operationProgressPanelSource).toContain("deployment-progress-spinner");
    expect(operationProgressPanelSource).toContain(":global(.deployment-progress-spinner)");
    expect(operationProgressPanelSource).toContain("deployment-progress-confetti");
    expect(operationProgressPanelSource).toContain("data-deployment-progress-success-access-url");
    expect(operationProgressPanelSource).toContain("const resolvedAccessUrl = $derived(accessUrl)");
    expect(operationProgressPanelSource).not.toContain("accessUrlFromDeploymentProgressEvents");
    expect(operationProgressPanelSource).not.toContain("/public route/i");
    expect(resourceDetailActionsMenuSource).toContain('controlResourceRuntime("stop")');
    expect(resourceDetailActionsMenuSource).toContain('controlResourceRuntime("restart")');
    expect(resourceDetailActionsMenuSource).toContain("forceRedeploy");
    expect(runtimeControlDialogSource).toContain("data-resource-runtime-control-intent-picker");
    expect(runtimeControlDialogSource).toContain('selectedRuntimeControlOperation = "stop"');
    expect(runtimeControlDialogSource).toContain('selectedRuntimeControlOperation = "start"');
    expect(runtimeControlDialogSource).toContain('selectedRuntimeControlOperation = "restart"');
    expect(runtimeControlDialogSource).toContain("onclick={confirmSelectedRuntimeControl}");
    expect(runtimeControlDialogSource).toContain("closeRuntimeControlDialog");
  });

  test("[DEPLOYMENTS-FEED-IA-001] keeps the global deployment feed read-only", () => {
    expect(deploymentsPageSource).toContain("DeploymentTable");
    expect(deploymentsPageSource).toContain("selectedOwnerHref");
    expect(deploymentsPageSource).toContain("data-deployments-feed-display-surface");
    expect(deploymentsPageSource).not.toContain("filtersDescription");
    expect(deploymentsPageSource).not.toContain("console-panel p-4");
    expect(deploymentTableSource).toContain("data-deployment-record-list");
    expect(deploymentTableSource).toContain("data-deployment-record-row");
    expect(deploymentTableSource).toContain("data-deployment-owner-summary");
    expect(deploymentTableSource).toContain('from "$lib/components/ui/table"');
    expect(deploymentTableSource).toContain("data-deployment-table-display-surface");
    expect(deploymentTableSource).toContain("<Table.Root");
    expect(deploymentTableSource).toContain("<Table.Head");
    expect(deploymentsPageSource).toContain('import * as Select from "$lib/components/ui/select"');
    expect(deploymentsPageSource).toContain("<Select.Root bind:value={projectFilter}");
    expect(deploymentsPageSource).toContain("<Select.Root bind:value={environmentFilter}");
    expect(deploymentsPageSource).toContain("disabled={pageLoading || !selectedProject}");
    expect(deploymentsPageSource).toContain(
      ": $t(i18nKeys.console.deployments.selectProjectFirst)",
    );
    expect(deploymentsPageSource).toContain(
      'projectFilter === "all"\n      ? []\n      : environments.filter',
    );
    expect(deploymentsPageSource).toContain("<Select.Root bind:value={resourceFilter}");
    expect(deploymentsPageSource).toContain("<Select.Root bind:value={statusFilter}");
    expect(deploymentsPageSource).not.toContain("<select");
    expect(deploymentsPageSource).not.toContain("<form");
    expect(deploymentsPageSource).not.toContain('type="submit"');
    expect(deploymentsPageSource).not.toContain("modal=quick-deploy");
    expect(deploymentsPageSource).not.toContain("common.actions.quickDeploy");
    expect(deploymentsPageSource).not.toContain('href="/deploy"');
    expect(deploymentsPageSource).not.toContain("deployments/new");
    expect(deploymentsPageSource).not.toContain("resources.create");
  });

  test("[DEPLOYMENTS-COPY-IA-001] keeps deployment console copy user-facing", () => {
    const zhLocaleSource = readFileSync(
      fileURLToPath(new URL("../../../../../packages/i18n/src/locales/zh-CN.ts", import.meta.url)),
      "utf8",
    );
    const enLocaleSource = readFileSync(
      fileURLToPath(new URL("../../../../../packages/i18n/src/locales/en-US.ts", import.meta.url)),
      "utf8",
    );
    const deploymentCopyKeys = [
      "accessSnapshotDescription",
      "accessSnapshotEmpty",
      "accessSnapshotTitle",
      "attemptObservationDescription",
      "attemptObservationTitle",
      "attemptSnapshotDescription",
      "attemptSnapshotTitle",
      "currentResourceStateCurrent",
      "currentResourceStateDescription",
      "currentResourceObservationDescription",
      "currentResourceObservationEmpty",
      "failedAttemptHint",
      "filtersDescription",
      "noFailureSummary",
      "runningAttemptHint",
      "recoveryDescription",
      "recoveryDialogDescription",
      "recoveryNoReasons",
      "recoveryReasonRuntimeArtifactMissing",
      "recoveryRollbackCandidateDescription",
      "recoverySelectActionDescription",
      "succeededAttemptHint",
    ];

    for (const key of deploymentCopyKeys) {
      const zhEntry = localeEntrySource(zhLocaleSource, key);
      const enEntry = localeEntrySource(enLocaleSource, key);
      expect(
        literalTextMatches(
          zhEntry,
          /\battempt\b|deployment attempt|owner 面|资源 owner|artifact|readiness|readiness query|按 intent/iu,
        ),
      ).toEqual([]);
      expect(
        literalTextMatches(
          enEntry,
          /deployment attempt|owner context|owner surface|artifact|readiness query|recovery intent/iu,
        ),
      ).toEqual([]);
    }
  });

  test("[DEPLOYMENT-DETAIL-IA-001] keeps recovery actions behind an intent dialog", () => {
    expect(deploymentDetailPageSource).toContain("data-deployment-attempt-snapshot");
    expect(deploymentDetailPageSource).toContain("data-deployment-access-snapshot");
    expect(deploymentDetailPageSource).toContain("data-deployment-environment-snapshot-table");
    expect(deploymentDetailPageSource).toContain("data-deployment-environment-snapshot-value");
    expect(deploymentDetailPageSource).toContain("{variable.value}");
    expect(deploymentDetailPageSource).toContain("data-deployment-current-resource-handoff");
    expect(deploymentDetailPageSource).toContain("data-deployment-attempt-observation");
    expect(deploymentDetailPageSource).toContain("data-deployment-current-resource-observation");
    expect(deploymentDetailPageSource).toContain("data-deployment-diagnostic-summary-fallback");
    expect(deploymentDetailPageSource).not.toContain('from "$lib/components/ui/textarea"');
    expect(deploymentDetailPageSource).not.toContain("selectDiagnosticSummaryFallback");
    expect(deploymentDetailPageSource).not.toContain("<Textarea");
    expect(deploymentDetailPageSource).toContain("attemptSnapshotTitle");
    expect(deploymentDetailPageSource).toContain("accessSnapshotTitle");
    expect(deploymentDetailPageSource).toContain("currentResourceStateTitle");
    expect(deploymentDetailPageSource).toContain("attemptObservationTitle");
    expect(deploymentDetailPageSource).toContain("currentResourceObservationTitle");
    expect(deploymentDetailPageSource).toContain("data-deployment-header-owner-actions");
    expect(deploymentDetailPageSource).toContain("data-deployment-observation-actions");
    expect(deploymentDetailPageSource).toContain('from "$lib/console/layout-classes"');
    expect(deploymentDetailPageSource).toContain("<div class={detailPageClass}>");
    expect(deploymentDetailPageSource).toContain(
      "<Tabs.Root value={activeTab} class={detailBodyClass}>",
    );
    expect(deploymentDetailPageSource).toContain(
      'class={[detailTabPanelScrollClass, "space-y-5"]}',
    );
    expect(deploymentDetailPageSource).not.toContain('<div class="space-y-8">');
    expect(deploymentDetailPageSource).not.toContain(
      '<Tabs.Root value={activeTab} class="space-y-5">',
    );
    expect(deploymentDetailPageSource).toContain("class={detailTabsClass}");
    expect(deploymentDetailPageSource).toContain("class={detailTabClass}");
    expect(deploymentDetailPageSource).not.toContain("console-detail-");
    expect(deploymentDetailPageSource).toContain(
      'aria-current={activeTab === tab ? "page" : undefined}',
    );
    expect(deploymentDetailPageSource).not.toContain("<Tabs.List");
    expect(deploymentDetailPageSource).not.toContain("<Tabs.Trigger");
    expect(deploymentDetailPageSource).toContain("latestFailureTitle");
    expect(deploymentDetailPageSource).toContain("noFailureSummary");
    const resourceLogsHrefInterpolation = "$" + "{resourceDetailHref(deploymentResourceRef)}";
    expect(deploymentDetailPageSource).toContain(`\`${resourceLogsHrefInterpolation}?tab=logs\``);
    expect(deploymentDetailPageSource).toContain(
      "resourceTerminalHref(deploymentResourceRef, deployment?.id)",
    );
    expect(deploymentDetailPageSource).toContain("const deploymentTimelineHref = $derived");
    expect(deploymentDetailPageSource).not.toContain('deploymentTabHref("logs")');
    expect(deploymentDetailPageSource).toContain('deploymentTabHref("timeline")');
    expect(deploymentDetailPageSource).toContain('deploymentTabHref("snapshot")');
    expect(deploymentDetailPageSource).toContain("DeploymentProgressTerminal");
    expect(deploymentDetailPageSource).not.toContain(
      'class="grid grid-cols-[4.75rem_5rem_3.5rem_5rem_minmax(0,1fr)]',
    );
    expect(deploymentDetailPageSource).not.toContain(
      'class="grid grid-cols-[4.75rem_6rem_3.5rem_minmax(0,1fr)]',
    );
    expect(deploymentDetailPageSource).toContain(
      "currentResourceSummary.lastDeploymentId === deployment.id",
    );
    expect(deploymentDetailPageSource).toContain('data-testid="deployment-recovery-readiness"');
    expect(deploymentDetailPageSource).toContain("data-deployment-recovery-summary");
    expect(deploymentDetailPageSource).toContain('data-deployment-recovery-summary-item="retry"');
    expect(deploymentDetailPageSource).toContain(
      'data-deployment-recovery-summary-item="redeploy"',
    );
    expect(deploymentDetailPageSource).toContain(
      'data-deployment-recovery-summary-item="rollback"',
    );
    expect(deploymentDetailPageSource).not.toContain("data-deployment-recovery-card");
    expect(deploymentDetailPageSource).toContain("data-deployment-recovery-intent-picker");
    expect(deploymentDetailPageSource).toContain("function selectRecoveryAction");
    expect(deploymentDetailPageSource).toContain("recoverySelectActionTitle");
    expect(deploymentDetailPageSource).toContain("recoverySelectActionDescription");
    expect(deploymentDetailPageSource).toContain("onclick={() => openRecoveryDialog()}");
    expect(deploymentDetailPageSource).toContain("function openRecoveryDialog");
    expect(deploymentDetailPageSource).toContain("<Dialog.Root bind:open={recoveryDialogOpen}");
    expect(deploymentDetailPageSource).toContain('name="rollback-candidate"');
    expect(deploymentDetailPageSource).toContain("confirmSelectedRecoveryAction");
    const deploymentOverviewSource = sourceBetween(
      deploymentDetailPageSource,
      'value="overview"',
      'value="timeline"',
    );
    expect(deploymentOverviewSource).toContain("data-deployment-attempt-observation");
    expect(deploymentOverviewSource).toContain("data-deployment-current-resource-observation");
    expect(deploymentOverviewSource).toContain("attemptObservationDescription");
    expect(deploymentOverviewSource).toContain("currentResourceObservationDescription");
    expect(deploymentOverviewSource).toContain("resourceLogsHref");
    expect(deploymentOverviewSource).toContain("resourceTerminalUrl");
    expect(deploymentOverviewSource).toContain('id="deployment-diagnostic-summary-copy"');
    expect(deploymentOverviewSource).toContain("data-deployment-recovery-summary");
    expect(deploymentOverviewSource).not.toContain("<ul");
    expect(deploymentOverviewSource).not.toContain("recoveryActionReasons");
    expect(deploymentOverviewSource).not.toContain("deploymentRecoveryActionError");
    expect(deploymentOverviewSource).not.toContain("confirmSelectedRecoveryAction");
    expect(deploymentOverviewSource).not.toContain("retryDeploymentMutation.mutate");
    expect(deploymentOverviewSource).not.toContain("redeployDeploymentMutation.mutate");
    expect(deploymentOverviewSource).not.toContain("rollbackDeploymentMutation.mutate");
    expect(deploymentDetailPageSource).not.toContain("<select");
    expect(deploymentDetailPageSource).not.toContain(
      'onclick={() => runDeploymentRecoveryAction("retry")}',
    );
    expect(deploymentDetailPageSource).not.toContain(
      'onclick={() => runDeploymentRecoveryAction("redeploy")}',
    );
    expect(deploymentDetailPageSource).not.toContain(
      'onclick={() => runDeploymentRecoveryAction("rollback")}',
    );
    expect(deploymentDetailPageSource).not.toContain('openRecoveryDialog("retry")');
    expect(deploymentDetailPageSource).not.toContain('openRecoveryDialog("redeploy")');
    expect(deploymentDetailPageSource).not.toContain('openRecoveryDialog("rollback")');

    const deploymentRecoveryDialogSource =
      deploymentDetailPageSource.match(
        /<Dialog\.Root bind:open={recoveryDialogOpen}[\s\S]*?<\/Dialog\.Root>/,
      )?.[0] ?? "";
    const deploymentHeaderActionsSource = sourceBetweenLast(
      deploymentDetailPageSource,
      "data-deployment-header-owner-actions",
      "\n          </div>\n        </div>",
    );
    const deploymentAttemptObservationSource = deploymentOverviewSource.slice(
      deploymentOverviewSource.indexOf("data-deployment-attempt-observation"),
      deploymentOverviewSource.indexOf("data-deployment-current-resource-observation"),
    );
    const deploymentAccessSnapshotSource = sourceBetweenLast(
      deploymentDetailPageSource,
      "data-deployment-access-snapshot",
      "data-deployment-current-resource-handoff",
    );
    const deploymentCurrentResourceHandoffSource = sourceBetweenLast(
      deploymentOverviewSource,
      "data-deployment-current-resource-handoff",
      "data-deployment-attempt-observation",
    );
    const deploymentCurrentResourceObservationSource = deploymentOverviewSource.slice(
      deploymentOverviewSource.indexOf("data-deployment-current-resource-observation"),
      deploymentOverviewSource.indexOf('data-testid="deployment-recovery-readiness-loading"'),
    );
    expect(deploymentHeaderActionsSource).not.toContain("handleViewProgress");
    expect(deploymentHeaderActionsSource).not.toContain("deployment-diagnostic-summary-copy");
    expect(deploymentHeaderActionsSource).not.toContain("handleCopyDeploymentDiagnosticSummary");
    expect(deploymentHeaderActionsSource).not.toContain("openAccessUrl");
    expect(deploymentHeaderActionsSource).not.toContain("handleCopyAccessUrl");
    expect(deploymentHeaderActionsSource).not.toContain("accessUrlCopyLabel");
    expect(deploymentAccessSnapshotSource).toContain("openAccessUrl");
    expect(deploymentAccessSnapshotSource).toContain("handleCopyAccessUrl");
    expect(deploymentAccessSnapshotSource).toContain("accessUrlCopyLabel");
    expect(deploymentCurrentResourceHandoffSource).toContain("currentResourceStateTitle");
    expect(deploymentCurrentResourceHandoffSource).not.toContain("resourceOverviewHref");
    expect(deploymentCurrentResourceHandoffSource).not.toContain("resourceLogsHref");
    expect(deploymentCurrentResourceHandoffSource).not.toContain("resourceTerminalUrl");
    expect(deploymentAttemptObservationSource).toContain("data-deployment-observation-actions");
    expect(deploymentAttemptObservationSource).toContain("handleCopyDeploymentDiagnosticSummary");
    expect(deploymentCurrentResourceObservationSource).toContain("resourceOverviewHref");
    expect(deploymentCurrentResourceObservationSource).toContain("resourceLogsHref");
    expect(deploymentCurrentResourceObservationSource).toContain("resourceTerminalUrl");
    expect(deploymentRecoveryDialogSource).toContain("deploymentRecoveryActionError");
    expect(deploymentRecoveryDialogSource).toContain("data-deployment-recovery-intent-picker");
  });

  test("[DEP-PROOF-WEB-001] renders proof dimensions, mismatches, and unavailable evidence", () => {
    expect(deploymentDetailPageSource).toContain("orpc.deployments.proof.queryOptions");
    expect(deploymentDetailPageSource).toContain('data-testid="deployment-proof"');
    expect(deploymentDetailPageSource).toContain("data-deployment-proof-dimensions");
    expect(deploymentDetailPageSource).toContain("data-deployment-proof-mismatches");
    expect(deploymentDetailPageSource).toContain("data-deployment-proof-unavailable");
    expect(deploymentDetailPageSource).toContain("data-deployment-proof-environment-keys");
    expect(deploymentDetailPageSource).toContain("matchesPlannedKeySet");
    expect(deploymentDetailPageSource).toContain("configuration.keyCount");
    expect(deploymentDetailPageSource).toContain("configuration.plannedKeyCount");
    expect(deploymentDetailPageSource).toContain("proofVerdictPartiallyVerified");
    expect(deploymentDetailPageSource).toContain("proofRecoveryUnavailable");
  });

  test("[SERVER-COLLECTION-IA-001] opens server registration as an in-context dialog", () => {
    expect(serversPageSource).toContain('modalIsOpen(page, "create-server")');
    expect(serversPageSource).toContain("function openServerCreateDialog()");
    expect(serversPageSource).toContain("function setServerCreateDialogOpen(open: boolean)");
    expect(serversPageSource).toContain("bind:open={serverCreateDialogOpen}");
    expect(serversPageSource).toContain("onOpenChange={setServerCreateDialogOpen}");
    expect(serversPageSource).toContain("findConsoleOperationIntentModalExtension");
    expect(serversPageSource).toContain("resolveConsoleOperationIntentModalEndpoint");
    expect(serversPageSource).toContain("resolveConsolePageVisibilityEndpoint");
    expect(serversPageSource).toContain("<ConsoleExtensionPage embedded");
    expect(serversPageSource).toContain("<ServerCreateForm");
    expect(serversPageSource).toContain("onCreated={openCreatedServer}");
    expect(serversPageSource).not.toContain('href="/servers/new"');
    expect(serversPageSource).not.toContain("href={`/servers/new");
    expect(existsSync(legacyServerCreatePagePath)).toBe(false);
    expect(existsSync(legacyServerCreateRoutePath)).toBe(false);
  });

  test("[SERVER-COLLECTION-IA-002] presents server rows as runtime placement summaries", () => {
    const serversDisplaySurface = sourceBetween(
      serversPageSource,
      "<ConsoleResourceCanvas data-servers-display-surface>",
      "</ConsoleResourceCanvas>",
    );
    const serverRowHeaderSource = sourceBetween(
      serversDisplaySurface,
      "data-server-row-header",
      "data-server-row-readiness",
    );
    const serverOperationalLinksSource = sourceBetween(
      serversDisplaySurface,
      "data-server-row-operational-links",
      "</article>",
    );

    expect(serversDisplaySurface).toContain("data-server-list");
    expect(serversDisplaySurface).toContain("data-server-row");
    expect(serversDisplaySurface).toContain("data-server-row-lifecycle");
    expect(serverRowHeaderSource.indexOf("<h3")).toBeGreaterThanOrEqual(0);
    expect(serverRowHeaderSource.indexOf("data-server-row-lifecycle")).toBeGreaterThan(
      serverRowHeaderSource.indexOf("<h3"),
    );
    const serverHostPortTitleSource =
      "title={HostAddress.rehydrate(server.host).formatWithPort(server.port)}";
    expect(serverRowHeaderSource.indexOf("data-server-row-lifecycle")).toBeLessThan(
      serverRowHeaderSource.indexOf(serverHostPortTitleSource),
    );
    expect(serverRowHeaderSource).toContain('class="shrink-0"');
    expect(serversDisplaySurface).toContain("data-server-row-readiness");
    expect(serversDisplaySurface).toContain("runtimeAvailabilityLabel(server.runtimeAvailability)");
    expect(serversDisplaySurface).toContain(
      "runtimeAvailabilityVariant(server.runtimeAvailability)",
    );
    expect(serversDisplaySurface).toContain("data-server-row-proxy");
    expect(serversDisplaySurface).toContain("edgeProxyStatusLabel(server.edgeProxy.status)");
    expect(serversDisplaySurface).toContain("edgeProxyStatusVariant(server.edgeProxy?.status)");
    expect(serversDisplaySurface).toContain("data-server-row-capacity");
    expect(serversDisplaySurface).toContain("serverCapacityHref(server.id)");
    expect(serversDisplaySurface).toContain("capacityGovernanceAction");
    expect(serversDisplaySurface).toContain("data-server-row-ownership");
    expect(serversDisplaySurface).toContain("server.targetKind");
    expect(serversDisplaySurface).toContain("serverProviderDisplayLabel");
    expect(serversDisplaySurface).toContain("data-server-row-deployment-rollup");
    expect(serversDisplaySurface).toContain("serverDeploymentsHref(server.id)");
    expect(serversDisplaySurface).toContain("data-server-row-operational-links");
    expect(serversDisplaySurface).toContain("serverRuntimeHref(server.id)");
    expect(serversDisplaySurface).toContain("serverConnectivityHref(server.id)");
    expect(serverOperationalLinksSource).toContain("serverDetailHref(server.id)");
    expect(serverOperationalLinksSource.indexOf("serverDetailHref(server.id)")).toBeGreaterThan(
      serverOperationalLinksSource.indexOf("serverConnectivityHref(server.id)"),
    );
    expect(serverOperationalLinksSource).toContain("i18nKeys.common.actions.viewDetails");
    expect(serversDisplaySurface).not.toContain("serverTerminalHref");
    expect(serversDisplaySurface).not.toContain("openServerDeleteDialog");
    expect(serversDisplaySurface).not.toContain("openServerDeactivateDialog");
    expect(serversDisplaySurface).not.toContain("deleteSafety");
  });

  test("[SERVER-DETAIL-IA-001] keeps runtime and settings as first-level domains", () => {
    expect(serverDetailPageSource).toContain("type ServerDetailTab =");
    expect(serverDetailPageSource).toContain('"runtime"');
    expect(serverDetailPageSource).toContain('"settings"');
    expect(serverDetailPageSource).toContain(
      'const serverRuntimeSections = ["monitor", "terminal"]',
    );
    expect(serverDetailPageSource).toContain(
      'const serverSettingsSections = ["general", "credentials", "danger"]',
    );
    expect(serverDetailPageSource).toContain('from "$lib/console/layout-classes"');
    expect(serverDetailPageSource).toContain("class={detailTabsClass}");
    expect(serverDetailPageSource).toContain("class={detailTabClass}");
    expect(serverDetailPageSource).toContain("<div class={detailPageClass}>");
    expect(serverDetailPageSource).toContain("class={detailHeaderClass}");
    expect(serverDetailPageSource).toContain(
      "<Tabs.Root value={activeTab} class={detailBodyClass}>",
    );
    expect(consoleLayoutCssSource).not.toContain(".console-server-detail-body");
    expect(consoleLayoutCssSource).not.toContain(".console-detail-tab-panel");
    expect(serverDetailPageSource).toContain('class={[detailTabPanelScrollClass, "space-y-5"]}');
    expect(serverDetailPageSource).not.toContain("detailTabPanelScrollNoTopClass");
    expect(serverDetailPageSource).toContain("class={detailTabPanelSubnavClass}");
    expect(serverDetailPageSource).toContain("detailSubnavLayoutClass");
    expect(serverDetailPageSource).toContain("class={detailSubnavContentClass}");
    expect(serverDetailPageSource).not.toContain("md:pt-0");
    expect(serverDetailPageSource).not.toContain("console-detail-");
    expect(serverDetailPageSource).not.toContain("console-subnav-");
    expect(serverDetailPageSource).toContain('value="runtime"');
    expect(serverDetailPageSource).toContain('value="settings"');
    expect(serverDetailPageSource).not.toContain("<Tabs.List");
    expect(serverDetailPageSource).not.toContain("<Tabs.Trigger");
    expect(serverDetailPageSource).not.toContain('<Tabs.Content value="monitor"');
    expect(serverDetailPageSource).not.toContain('<Tabs.Content value="terminal"');
    expect(serverDetailPageSource).not.toContain('<Tabs.Content value="credentials"');
    expect(serverDetailPageSource).not.toContain('<Tabs.Content value="danger"');
    expect(serverDetailPageSource).not.toContain('value === "monitor" || value === "terminal"');
    expect(serverDetailPageSource).not.toContain('value === "credentials" || value === "danger"');
  });

  test("[SERVER-DETAIL-IA-001B] keeps server overview as display and operational handoff", () => {
    const serverOverviewSource = sourceBetween(
      serverDetailPageSource,
      "data-server-overview-display-surface",
      'value="runtime"',
    );
    const serverHeaderSource = sourceBetween(
      serverDetailPageSource,
      "<section class={detailHeaderClass}>",
      "<Tabs.Root value={activeTab} class={detailBodyClass}>",
    );

    expect(serverOverviewSource).toContain("data-server-overview-operational-surfaces");
    expect(serverOverviewSource).toContain("data-server-overview-display-surface");
    expect(serverOverviewSource).toContain("runtimeSurfaceTitle");
    expect(serverOverviewSource).toContain("capacitySurfaceTitle");
    expect(serverOverviewSource).toContain("connectivitySurfaceTitle");
    expect(serverOverviewSource).toContain("deploymentsSurfaceTitle");
    expect(serverOverviewSource).toContain('serverSectionHref("runtime", "monitor")');
    expect(serverOverviewSource).toContain('serverSectionHref("runtime", "terminal")');
    expect(serverOverviewSource).toContain('serverTabHref("capacity")');
    expect(serverOverviewSource).toContain('serverTabHref("connectivity")');
    expect(serverOverviewSource).toContain('serverTabHref("deployments")');
    expect(serverOverviewSource).toContain('href={serverTabHref("connectivity")}');
    expect(serverHeaderSource).toContain("</section>");
    expect(serverHeaderSource).not.toContain("<nav");
    expect(serverHeaderSource).not.toContain("console-detail-tabs");
    expect(serverHeaderSource).not.toContain("<Tabs.Content");
    expect(serverHeaderSource).not.toContain('href={serverSectionHref("runtime", "terminal")}');
    expect(serverHeaderSource).not.toContain("common.actions.openTerminal");
    expect(serverOverviewSource).not.toContain("<form");
    expect(serverOverviewSource).not.toContain('type="submit"');
    expect(serverOverviewSource).not.toContain("onclick={testConnectivity}");
    expect(serverOverviewSource).not.toContain("connectivityMutation.isPending");
    expect(serverOverviewSource).not.toContain("openServerDeleteDialog");
    expect(serverOverviewSource).not.toContain("openServerDeactivateDialog");
    expect(serverOverviewSource).not.toContain("openCapacityPruneDialog");
    expect(serverOverviewSource).not.toContain("<Trash2");
    expect(serverOverviewSource).not.toContain("capacityPruneTitle");
  });

  test("[SERVER-DETAIL-IA-001C] keeps connectivity tests on the connectivity surface", () => {
    const serverHeaderSource = sourceBetween(
      serverDetailPageSource,
      "<section class={detailHeaderClass}>",
      "<Tabs.Root value={activeTab} class={detailBodyClass}>",
    );
    const serverConnectivityTabSource = sourceBetween(
      serverDetailPageSource,
      'value="connectivity"',
      'value="deployments"',
    );

    expect(serverHeaderSource).not.toContain("onclick={testConnectivity}");
    expect(serverHeaderSource).not.toContain("connectivityMutation.isPending");
    expect(serverConnectivityTabSource).toContain("onclick={testConnectivity}");
    expect(serverConnectivityTabSource).toContain("connectivityMutation.isPending");
    expect(serverConnectivityTabSource).toContain("connectivityResult");
    expect(serverConnectivityTabSource).toContain(
      'class="rounded-md border bg-muted/25 px-4 py-4 text-sm text-muted-foreground"',
    );
  });

  test("[SERVER-DETAIL-IA-002] keeps rename editing behind a single-intent dialog", () => {
    expect(serverDetailPageSource).toContain("data-server-settings-general");
    expect(serverDetailPageSource).toContain("data-server-settings-display-surface");
    expect(serverDetailPageSource).toContain("serverRenameDialogOpen");
    expect(serverDetailPageSource).toContain("openServerRenameDialog");
    expect(serverDetailPageSource).toContain("<Dialog.Root bind:open={serverRenameDialogOpen}");
    expect(serverDetailPageSource).toContain('id="server-rename-dialog-form"');
    expect(serverDetailPageSource).not.toContain('id="server-rename-form"');
    expect(serverDetailPageSource).not.toContain(
      'class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(14rem,22rem)_auto]"',
    );
  });

  test("[SERVER-DETAIL-IA-002B] keeps settings display surfaces free of intent forms", () => {
    const settingsDisplaySurface = sourceBetween(
      serverDetailPageSource,
      "data-server-settings-display-surface",
      'value="connectivity"',
    );
    const serverLifecycleDialogSource = sourceBetween(
      serverDetailPageSource,
      "<Dialog.Root bind:open={serverLifecycleDialogOpen}",
      "<Dialog.Root bind:open={capacityPruneDialogOpen}",
    );
    const serverDangerSettingsSource = sourceBetween(
      settingsDisplaySurface,
      "data-server-settings-danger-display-surface",
      "</Tabs.Content>",
    );

    expect(settingsDisplaySurface).toContain("data-server-settings-general");
    expect(settingsDisplaySurface).toContain("data-server-settings-credential-summary");
    expect(settingsDisplaySurface).toContain("credentialReusableUnavailableTitle");
    expect(settingsDisplaySurface).toContain("openServerRenameDialog");
    expect(settingsDisplaySurface).toContain("openServerLifecycleDialog");
    expect(settingsDisplaySurface).toContain("lifecycleManageAction");
    expect(settingsDisplaySurface).toContain("data-server-settings-danger-display-surface");
    expect(settingsDisplaySurface).not.toContain("<form");
    expect(settingsDisplaySurface).not.toContain("<Dialog.Root");
    expect(settingsDisplaySurface).not.toContain("<Input");
    expect(settingsDisplaySurface).not.toContain('type="submit"');
    expect(settingsDisplaySurface).not.toContain('id="server-deactivate-form"');
    expect(settingsDisplaySurface).not.toContain('id="server-delete-form"');
    expect(settingsDisplaySurface).not.toContain("openServerDeactivateDialog");
    expect(settingsDisplaySurface).not.toContain("openServerDeleteDialog");
    expect(serverDangerSettingsSource).toContain("deleteSafetyTitle");
    expect(serverDangerSettingsSource).toContain("openServerLifecycleDialog");
    expect(serverDangerSettingsSource).toContain("lifecycleManageAction");
    expect(serverDangerSettingsSource).not.toContain(
      '<Button\n              type="button"\n              variant="destructive"',
    );
    expect(serverDangerSettingsSource).not.toContain("<Trash2");

    expect(serverLifecycleDialogSource).toContain('id="server-lifecycle-form"');
    expect(serverLifecycleDialogSource).toContain("data-server-lifecycle-dialog");
    expect(serverLifecycleDialogSource).toContain('selectedServerLifecycleAction === "deactivate"');
    expect(serverLifecycleDialogSource).toContain('selectedServerLifecycleAction === "delete"');
    expect(serverLifecycleDialogSource).toContain('selectServerLifecycleAction("deactivate")');
    expect(serverLifecycleDialogSource).toContain('selectServerLifecycleAction("delete")');
    expect(serverLifecycleDialogSource).toContain("lifecycleDeactivateOption");
    expect(serverLifecycleDialogSource).toContain("lifecycleDeleteOption");
    expect(serverLifecycleDialogSource).toContain("<Input");
    expect(serverLifecycleDialogSource).toContain('type="submit"');
    expect(serverLifecycleDialogSource).toContain('variant="destructive"');
    expect(serverLifecycleDialogSource).toContain("<Trash2");
    expect(serverLifecycleDialogSource).toContain("<XCircle");
    expect(serverDetailPageSource.indexOf("data-server-settings-display-surface")).toBeLessThan(
      serverDetailPageSource.indexOf("bind:open={serverLifecycleDialogOpen}"),
    );
  });

  test("[SERVER-DETAIL-IA-003] keeps capacity prune forms behind a single-intent dialog", () => {
    expect(serverDetailPageSource).toContain("capacityPruneDialogOpen");
    expect(serverDetailPageSource).toContain("capacityPruneConfirmation");
    expect(serverDetailPageSource).toContain("openCapacityPruneDialog");
    expect(serverDetailPageSource).toContain("closeCapacityPruneDialog");
    expect(serverDetailPageSource).toContain("canApplyCapacityPrune");
    expect(serverDetailPageSource).toContain("<Dialog.Root bind:open={capacityPruneDialogOpen}");
    expect(serverDetailPageSource).toContain('id="server-capacity-prune-form"');
    expect(serverDetailPageSource).not.toContain("requestConsoleConfirm");

    const capacityTabSource = sourceBetween(
      serverDetailPageSource,
      'value="capacity"',
      'value="settings"',
    );
    const capacityPruneDialogSource =
      serverDetailPageSource.match(
        /<Dialog\.Root bind:open={capacityPruneDialogOpen}[\s\S]*?<Dialog\.Root bind:open={serverRenameDialogOpen}/,
      )?.[0] ?? "";

    expect(capacityTabSource).toContain("openCapacityPruneDialog");
    expect(capacityTabSource).toContain("capacityGovernanceTitle");
    expect(capacityTabSource).toContain("capacityGovernanceDescription");
    expect(capacityTabSource).toContain("capacityGovernanceAction");
    expect(capacityTabSource).not.toContain('id="server-capacity-prune-before"');
    expect(capacityTabSource).not.toContain('type="checkbox"');
    expect(capacityTabSource).not.toContain("runCapacityPrune(true)");
    expect(capacityTabSource).not.toContain("runCapacityPrune(false)");
    expect(capacityTabSource).not.toContain("<Trash2");
    expect(capacityTabSource).not.toContain('variant="destructive"');
    expect(capacityPruneDialogSource).toContain('id="server-capacity-prune-before"');
    expect(capacityPruneDialogSource).toContain('type="checkbox"');
    expect(capacityPruneDialogSource).toContain("capacityPruneSelectedCategories[category]");
    expect(capacityPruneDialogSource).toContain("runCapacityPrune(true)");
    expect(capacityPruneDialogSource).toContain("runCapacityPrune(false)");
    expect(capacityPruneDialogSource).toContain("capacityPruneConfirmation.trim() !== server.id");
    expect(capacityPruneDialogSource).toContain("capacityPruneTitle");
    expect(capacityPruneDialogSource).toContain('variant="destructive"');
    expect(capacityPruneDialogSource).toContain("<Trash2");
  });

  test("[SERVER-DETAIL-IA-003B] keeps server capacity copy user-facing", () => {
    const zhLocaleSource = readFileSync(
      fileURLToPath(new URL("../../../../../packages/i18n/src/locales/zh-CN.ts", import.meta.url)),
      "utf8",
    );
    const enLocaleSource = readFileSync(
      fileURLToPath(new URL("../../../../../packages/i18n/src/locales/en-US.ts", import.meta.url)),
      "utf8",
    );
    const serverCapacityCopy = [
      "capacityDescription",
      "capacityGovernanceDescription",
      "capacityPruneDescription",
      "capacitySurfaceDescription",
      "deploymentsSurfaceDescription",
    ];

    for (const key of serverCapacityCopy) {
      const zhLine = zhLocaleSource.match(new RegExp(`${key}: [^\\n]+`))?.[0] ?? "";
      const enLine = enLocaleSource.match(new RegExp(`${key}: [^\\n]+`))?.[0] ?? "";
      expect(zhLine).not.toMatch(
        /runtime target|cleanup candidates|deployment attempt|owner 面|按 intent/iu,
      );
      expect(enLine).not.toMatch(/runtime target|cleanup candidates|owner surface|owner view/iu);
    }
  });

  test("[GOVERNANCE-COLLECTION-IA-001] keeps domain binding governance display-first", () => {
    expect(domainBindingsPageSource).toContain("domainBindingsLoading");
    expect(domainBindingsPageSource).toContain("domainBindingEnrichmentLoading");
    expect(domainBindingsPageSource).not.toContain("const pageLoading = $derived");
    expect(domainBindingsPageSource).not.toContain("createFeedback");
    expect(domainBindingsPageSource).not.toContain("selectedDomainBindingId");
    expect(domainBindingsPageSource).not.toContain("selectedDomainBindingDetail");
    expect(domainBindingsPageSource).not.toContain("function selectDomainBinding");
    expect(domainBindingsPageSource).not.toContain("function showSelectedDomainBindingDetail");
    expect(domainBindingsPageSource).not.toContain("domainBindingVerificationDialogOpen");
    expect(domainBindingsPageSource).not.toContain("domainBindingRouteDialogOpen");
    expect(domainBindingsPageSource).not.toContain("domainBindingDeleteDialogOpen");
    expect(domainBindingsPageSource).toContain("data-domain-binding-list-display-surface");
    expect(domainBindingsPageSource).not.toContain("data-domain-binding-detail-display-surface");
    expect(domainBindingsPageSource).toContain("function domainBindingDetailHref");
    expect(domainBindingsPageSource).toContain("domainBindingDetailHref(binding)");
    expect(domainBindingsPageSource).not.toContain("dangerZoneTitle");
    expect(domainBindingsPageSource).not.toContain("dangerZoneDescription");
    expect(domainBindingDetailRouteSource).toContain("export const prerender = false");
    expect(domainBindingDetailRouteSource).toContain("export const ssr = false");
    expect(domainBindingDetailPageSource).toContain("data-domain-binding-detail-display-surface");
    expect(domainBindingDetailPageSource).toContain("type DomainBindingDetailTab =");
    expect(domainBindingDetailPageSource).toContain('"overview" | "routing" | "dns" | "lifecycle"');
    expect(domainBindingDetailPageSource).toContain("domainBindingOverviewSections");
    expect(domainBindingDetailPageSource).toContain("class={detailTabsClass}");
    expect(domainBindingDetailPageSource).toContain("class={detailTabClass}");
    expect(domainBindingDetailPageSource).toContain("class={detailTabPanelSubnavClass}");
    expect(domainBindingDetailPageSource).toContain("detailSubnavLayoutClass");
    expect(domainBindingDetailPageSource).toContain("class={detailSubnavContentClass}");
    expect(domainBindingDetailPageSource).toContain("data-domain-binding-identity-summary");
    expect(domainBindingDetailPageSource).toContain("data-domain-binding-owner-summary");
    expect(domainBindingDetailPageSource).toContain("data-domain-binding-route-summary");
    expect(domainBindingDetailPageSource).toContain("data-domain-binding-verification-summary");
    expect(domainBindingDetailPageSource).toContain("data-domain-binding-lifecycle-handoff");
    expect(domainBindingDetailPageSource).toContain("data-domain-binding-verification-dialog");
    expect(domainBindingDetailPageSource).toContain("routeManagedInDialog");
    expect(domainBindingDetailPageSource).toContain("routeDialogTitle");
    expect(domainBindingDetailPageSource).toContain("deleteDialogTitle");

    const domainBindingsListSource = sourceBetween(
      domainBindingsPageSource,
      "data-domain-binding-list-display-surface",
      "{:else}",
    );
    const domainBindingLoadingSource = sourceBetween(
      domainBindingsPageSource,
      "data-domain-binding-list-skeleton",
      "{:else}",
    );
    const domainBindingVerificationDialogSource = sourceBetween(
      domainBindingDetailPageSource,
      "data-domain-binding-verification-dialog",
      "bind:open={domainBindingRouteDialogOpen}",
    );
    const domainBindingRouteDialogSource = sourceBetween(
      domainBindingDetailPageSource,
      "data-domain-binding-route-dialog",
      "bind:open={domainBindingDeleteDialogOpen}",
    );
    const domainBindingDeleteDialogSource = sourceBetween(
      domainBindingDetailPageSource,
      "data-domain-binding-delete-dialog",
      "</ConsoleShell>",
    );

    expect(domainBindingDetailPageSource).toContain('let routeRedirectDraft = $state("")');
    expect(domainBindingDetailPageSource).toContain(
      'let routeRedirectStatusDraft = $state<RedirectStatusText>("308")',
    );
    expect(domainBindingDetailPageSource).toContain('let deleteConfirmationDraft = $state("")');
    expect(domainBindingDetailPageSource).not.toContain("routeRedirectDrafts");
    expect(domainBindingDetailPageSource).not.toContain("routeRedirectStatusDrafts");
    expect(domainBindingDetailPageSource).not.toContain("deleteConfirmationDrafts");
    expect(
      domainBindingsPageSource.indexOf(
        "<ConsoleResourceCanvas data-domain-bindings-display-surface>",
      ),
    ).toBeLessThan(domainBindingsPageSource.indexOf("{#if domainBindingsLoading}"));
    expect(domainBindingLoadingSource).toContain("console-record-list");
    expect(domainBindingLoadingSource).toContain("console-record-row p-0");
    expect(domainBindingLoadingSource).toContain("md:grid-cols-3");
    expect(domainBindingLoadingSource).toContain("bg-muted/20");
    expect(domainBindingsListSource).toContain("domainBindingDetailHref(binding)");
    expect(domainBindingsListSource).toContain("data-domain-binding-row");
    expect(domainBindingsListSource).toContain("data-domain-binding-pending-dns-notice");
    expect(domainBindingsListSource).toContain("DomainBindingVerifyDnsButton");
    expect(domainBindingsPageSource).toContain("function domainBindingConfigureDnsHref");
    expect(domainBindingsPageSource).toContain("dnsBindingId: binding.id");
    expect(domainBindingsPageSource).toContain("domainBindingNeedsDnsConfiguration(binding)");
    expect(domainBindingsListSource).toContain("domainBindingConfigureDnsHref(binding, resource)");
    expect(domainBindingsListSource).toContain("dnsConnectorConfigure");
    expect(domainBindingsListSource).not.toContain("openDomainBindingVerificationDialog(binding)");
    expect(domainBindingsListSource).not.toContain("openDomainBindingRouteDialog(binding)");
    expect(domainBindingsListSource).not.toContain("openDomainBindingDeleteDialog(binding)");
    expect(domainBindingsListSource).not.toContain("showDomainBindingMutation.mutate");
    expect(domainBindingsListSource).not.toContain("confirmDomainBindingOwnership(binding)");
    expect(domainBindingsListSource).not.toContain("retryDomainBindingVerificationMutation.mutate");
    expect(domainBindingsListSource).not.toContain("lifecycleManageAction");
    expect(domainBindingsListSource).not.toContain("deleteDialogTitle");
    expect(domainBindingsListSource).not.toContain("deleteSafety");
    expect(domainBindingsListSource).not.toContain("<Trash2");
    expect(domainBindingsListSource).not.toContain('variant="destructive"');

    expect(domainBindingDetailPageSource).toContain("openDomainBindingRouteDialog()");
    expect(domainBindingDetailPageSource).toContain("openDomainBindingVerificationDialog()");
    expect(domainBindingDetailPageSource).toContain("openDomainBindingDeleteDialog()");
    expect(domainBindingDetailPageSource).toContain("function domainBindingConfigureDnsHref");
    expect(domainBindingDetailPageSource).toContain(
      "domainBindingNeedsDnsConfiguration(selectedDomainBinding)",
    );
    expect(domainBindingDetailPageSource).toContain(
      "domainBindingConfigureDnsHref(selectedDomainBinding)",
    );
    expect(domainBindingDetailPageSource).toContain("dnsConnectorConfigure");
    expect(domainBindingDetailPageSource).toContain("lifecycleStatus");
    expect(domainBindingDetailPageSource).toContain("lifecycleDescription");
    expect(domainBindingDetailPageSource).toContain("lifecycleManageAction");

    expect(domainBindingVerificationDialogSource).not.toContain("deleteDialogTitle");
    expect(domainBindingVerificationDialogSource).toContain(
      "confirmDomainBindingOwnership(selectedDomainBinding)",
    );
    expect(domainBindingVerificationDialogSource).toContain(
      "retryDomainBindingVerificationMutation.mutate",
    );
    expect(domainBindingRouteDialogSource).toContain("routeRedirectDraft");
    expect(domainBindingRouteDialogSource).toContain("routeRedirectStatusDraft");
    expect(domainBindingRouteDialogSource).toContain("setRouteRedirectDraft");
    expect(domainBindingRouteDialogSource).toContain("setRouteRedirectStatusDraft");
    expect(domainBindingDeleteDialogSource).toContain("deleteConfirmationDraft");
    expect(domainBindingDeleteDialogSource).toContain("setDeleteConfirmationDraft");
    expect(domainBindingsPageSource).not.toContain('href="/domain-bindings?modal=quick-deploy"');
    expect(domainBindingsPageSource).not.toContain(
      '<Button href="/domain-bindings?modal=quick-deploy"',
    );
    expect(domainBindingsPageSource).toContain('import { goto } from "$app/navigation";');
    expect(domainBindingsPageSource).toContain('void goto("/resources")');
    expect(domainBindingsPageSource).not.toContain('window.location.href = "/resources"');
    expect(domainBindingsPageSource).not.toContain(
      'class="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]"',
    );
    expect(domainBindingsPageSource).not.toContain("sm:grid-cols-[minmax(0,1fr)_auto_auto]");
    expect(domainBindingDetailRouteSource).toContain("export const prerender = false;");
  });

  test("[CONSOLE-DISPLAY-STATE-IA-001] keeps collection display surfaces free of intent forms", () => {
    const dependencyResourceDisplaySurface = sourceBetween(
      dependencyResourcesPageSource,
      "<ConsoleResourceCanvas data-dependency-resources-display-surface>",
      "</ConsoleResourceCanvas>",
    );
    const domainBindingDisplaySurface = sourceBetween(
      domainBindingsPageSource,
      "<ConsoleResourceCanvas data-domain-bindings-display-surface>",
      "</ConsoleResourceCanvas>",
    );
    const serversDisplaySurface = sourceBetween(
      serversPageSource,
      "<ConsoleResourceCanvas data-servers-display-surface>",
      "</ConsoleResourceCanvas>",
    );

    for (const displaySurface of [
      dependencyResourceDisplaySurface,
      domainBindingDisplaySurface,
      serversDisplaySurface,
    ]) {
      expect(displaySurface).not.toContain("<form");
      expect(displaySurface).not.toContain('type="submit"');
      expect(displaySurface).not.toContain("<Input");
      expect(displaySurface).not.toContain("<Textarea");
      expect(displaySurface).not.toContain("<Dialog.Root");
    }

    expect(dependencyResourceDisplaySurface).toContain("openDependencyResourceCreateDialog");
    expect(dependencyResourceDisplaySurface).toContain("data-dependency-resource-filter-toolbar");
    expect(dependencyResourceDisplaySurface).toContain("filterProjectSelectValue");
    expect(dependencyResourceDisplaySurface).toContain("filterEnvironmentSelectValue");
    expect(dependencyResourceDisplaySurface).toContain("selectDependencyResourceProjectFilter");
    expect(dependencyResourceDisplaySurface).toContain("selectDependencyResourceEnvironmentFilter");
    expect(dependencyResourceDisplaySurface).toContain("disabled={!filterProjectId}");
    expect(dependencyResourceDisplaySurface).toContain(
      "$t(i18nKeys.console.dependencyResources.selectProjectFirst)",
    );
    expect(dependencyResourceDisplaySurface).not.toContain('id="dependency-resource-create-form"');
    expect(dependencyResourceDisplaySurface).not.toContain("bind:value={createProjectId}");
    expect(dependencyResourceDisplaySurface).not.toContain("bind:value={createEnvironmentId}");
    expect(dependencyResourceDisplaySurface).not.toContain("configureBackupPolicy");
    expect(dependencyResourceDisplaySurface).not.toContain("deleteDependencyResourceConfirmation");
    expect(dependencyResourcesPageSource).toContain(
      "<Dialog.Root\n    bind:open={dependencyResourceCreateDialogOpen}",
    );
    expect(dependencyResourcesPageSource).toContain('id="dependency-resource-create-form"');
    const dependencyResourceCreateDialogSource = sourceBetween(
      dependencyResourcesPageSource,
      "<Dialog.Root\n    bind:open={dependencyResourceCreateDialogOpen}",
      "<Dialog.Root bind:open={projectCreateDialogOpen}",
    );
    expect(dependencyResourceCreateDialogSource).toContain("bind:value={createProjectId}");
    expect(dependencyResourceCreateDialogSource).toContain("bind:value={createEnvironmentId}");
    expect(dependencyResourceCreateDialogSource).toContain("createProjectEnvironments");
    expect(dependencyResourceCreateDialogSource).not.toContain("filterProjectId");
    expect(dependencyResourceCreateDialogSource).not.toContain("filterEnvironmentId");
    expect(dependencyResourcesPageSource).toContain("let filterProjectId = $state");
    expect(dependencyResourcesPageSource).toContain("let filterEnvironmentId = $state");
    expect(dependencyResourcesPageSource).toContain("let createProjectId = $state");
    expect(dependencyResourcesPageSource).toContain("let createEnvironmentId = $state");
    expect(dependencyResourcesPageSource).toContain("allDependencyResourceFilterValue");
    expect(dependencyResourcesPageSource).toContain(
      "filterProjectId\n      ? environments.filter((environment) => environment.projectId === filterProjectId)\n      : []",
    );
    expect(dependencyResourcesPageSource).toContain(
      "createProjectId\n      ? environments.filter((environment) => environment.projectId === createProjectId)\n      : []",
    );
    expect(dependencyResourcesPageSource).toContain(
      'filterProjectId = value === allDependencyResourceFilterValue ? "" : value',
    );
    expect(dependencyResourcesPageSource).toContain(
      'filterEnvironmentId = value === allDependencyResourceFilterValue ? "" : value',
    );
    expect(dependencyResourcesPageSource).not.toContain('<Select.Item value="">');
    expect(
      dependencyResourcesPageSource.indexOf("data-dependency-resources-display-surface"),
    ).toBeLessThan(
      dependencyResourcesPageSource.indexOf("bind:open={dependencyResourceCreateDialogOpen}"),
    );

    expect(domainBindingDisplaySurface).toContain("data-domain-binding-list-display-surface");
    expect(domainBindingDisplaySurface).toContain("domainBindingDetailHref(binding)");
    expect(domainBindingDisplaySurface).not.toContain("data-domain-binding-detail-display-surface");
    expect(domainBindingDisplaySurface).not.toContain("selectDomainBinding(binding)");
    expect(domainBindingDetailPageSource).toContain("openDomainBindingVerificationDialog()");
    expect(domainBindingDetailPageSource).toContain("openDomainBindingRouteDialog()");
    expect(domainBindingDetailPageSource).toContain("openDomainBindingDeleteDialog()");
    expect(domainBindingDetailPageSource).toContain("lifecycleStatus");
    expect(domainBindingDetailPageSource).toContain("lifecycleDescription");
    expect(domainBindingDetailPageSource).toContain("lifecycleManageAction");
    expect(domainBindingDisplaySurface).not.toContain("routeRedirectDraft");
    expect(domainBindingDisplaySurface).not.toContain("routeRedirectStatusDraft");
    expect(domainBindingDisplaySurface).not.toContain("deleteConfirmationDraft");
    expect(domainBindingDisplaySurface).not.toContain("deleteSafety");
    expect(domainBindingDisplaySurface).not.toContain("deleteDialogTitle");
    expect(domainBindingDetailPageSource).toContain(
      "bind:open={domainBindingVerificationDialogOpen}",
    );
    expect(domainBindingDetailPageSource).toContain("bind:open={domainBindingRouteDialogOpen}");
    expect(domainBindingDetailPageSource).toContain("bind:open={domainBindingDeleteDialogOpen}");
    const domainBindingRouteDialogSource = sourceBetween(
      domainBindingDetailPageSource,
      "data-domain-binding-route-dialog",
      "bind:open={domainBindingDeleteDialogOpen}",
    );
    const domainBindingDeleteDialogSource = sourceBetween(
      domainBindingDetailPageSource,
      "data-domain-binding-delete-dialog",
      "</Dialog.Root>",
    );
    expect(domainBindingRouteDialogSource).toContain("routeRedirectDraft");
    expect(domainBindingRouteDialogSource).toContain("routeRedirectStatusDraft");
    expect(domainBindingDeleteDialogSource).toContain("deleteSafety");
    expect(domainBindingDeleteDialogSource).toContain("deleteCheckFirst");
    expect(domainBindingDeleteDialogSource).toContain("deleteConfirmationDraft");
    const resourceDomainBindingsSource = sourceBetween(
      resourceDetailPageSource,
      'id="resource-domain-bindings"',
      'id="resource-proxy-configuration"',
    );
    expect(resourceDomainBindingsSource).toContain(
      "openResourceDomainBindingDeleteDialog(binding)",
    );
    expect(resourceDomainBindingsSource).toContain("resource-domain-binding-delete-action");
    expect(resourceDetailPageSource).toContain("data-resource-domain-binding-delete-dialog");
    expect(resourceDetailPageSource).toContain("orpcClient.domainBindings.deleteCheck");
    expect(resourceDetailPageSource).toContain("orpcClient.domainBindings.delete");

    expect(serversDisplaySurface).toContain("openServerCreateDialog");
    expect(serversDisplaySurface).not.toContain("<ServerCreateForm");
    expect(serversPageSource).toContain("<ServerCreateForm");
    expect(serversPageSource.indexOf("data-servers-display-surface")).toBeLessThan(
      serversPageSource.indexOf("bind:open={serverCreateDialogOpen}"),
    );
  });

  test("[SERVER-COLLECTION-IA-003] keeps loading and readiness treatment aligned with server rows", () => {
    const serversDisplaySurface = sourceBetween(
      serversPageSource,
      "<ConsoleResourceCanvas data-servers-display-surface>",
      "</ConsoleResourceCanvas>",
    );
    const serverLoadingSource = sourceBetween(
      serversDisplaySurface,
      "data-server-list-skeleton",
      "{:else if visibleServers.length === 0}",
    );
    const serverReadinessSource = sourceBetween(
      serversDisplaySurface,
      "data-server-row-readiness",
      "data-server-row-ownership",
    );

    expect(serversDisplaySurface).toContain("data-server-list-skeleton");
    expect(serverLoadingSource).toContain("rounded-md border bg-card p-4 shadow-sm");
    expect(serverReadinessSource).toContain("connectivitySurfaceDescription");
    expect(serversPageSource).toContain('case "active":\n        return "secondary";');
    expect(serversPageSource).toContain('case "ready":\n        return "secondary";');
    expect(serversPageSource).toContain('case "available":\n        return "secondary";');
  });

  test("[GOVERNANCE-COLLECTION-IA-002] keeps dependency restore, policy, and delete forms behind dialogs", () => {
    expect(dependencyResourcesPageSource).toContain("dependencyResourcesLoading");
    expect(dependencyResourcesPageSource).toContain("dependencyResourceEnrichmentLoading");
    expect(dependencyResourcesPageSource).toContain("authSessionQuery");
    expect(dependencyResourcesPageSource).toContain("dependencyResourceQueriesEnabled");
    expect(dependencyResourcesPageSource).toContain("canRunProductQueries(authSessionQuery.data)");
    expect(dependencyResourcesPageSource).toContain("enabled: dependencyResourceQueriesEnabled");
    expect(dependencyResourceDetailPageSource).toContain(
      "enabled: dependencyResourceQueriesEnabled && dependencyResourceId.length > 0",
    );
    expect(dependencyResourcesPageSource).not.toContain("enabled: browser,");
    expect(dependencyResourcesPageSource).not.toContain(
      "enabled: browser && selectedDependencyResourceId.length > 0",
    );
    expect(dependencyResourcesPageSource).toContain("dependencyResourcesError");
    expect(dependencyResourcesPageSource).toContain("<ConsoleStatePanel");
    expect(dependencyResourcesPageSource).toContain("i18nKeys.errors.web.backendUnavailable");
    expect(dependencyResourcesPageSource).toContain("i18nKeys.console.runtimeUsage.refreshNow");
    expect(dependencyResourcesPageSource).toContain("dependencyResourcesQuery.refetch()");
    expect(dependencyResourcesPageSource).not.toContain("const pageLoading = $derived");
    expect(dependencyResourceDetailPageSource).toContain("backupCreateDialogOpen");
    expect(dependencyResourceDetailPageSource).toContain("restoreBackupDialogOpen");
    expect(dependencyResourceDetailPageSource).toContain("backupPolicyDialogOpen");
    expect(dependencyResourceDetailPageSource).toContain("deleteDependencyResourceDialogOpen");
    expect(dependencyResourceDetailPageSource).toContain("openRestoreBackupDialog");
    expect(dependencyResourceDetailPageSource).toContain("openBackupPolicyDialog");
    expect(dependencyResourceDetailPageSource).toContain("openDeleteDependencyResourceDialog");
    expect(dependencyResourceDetailPageSource).toContain("confirmBackupResource");
    expect(dependencyResourceDetailPageSource).toContain("confirmDeleteDependencyResource");
    expect(dependencyResourceDetailPageSource).toContain(
      "data-dependency-resource-backup-create-dialog",
    );
    expect(dependencyResourceDetailPageSource).toContain("restoreDialogTitle");
    expect(dependencyResourceDetailPageSource).toContain("backupPolicyDialogTitle");
    expect(dependencyResourceDetailPageSource).toContain("deleteDialogTitle");
    expect(dependencyResourceDetailPageSource).toContain("deleteConfirmLabel");
    expect(dependencyResourceDetailPageSource).toContain("deleteDependencyResourceConfirmation");
    expect(dependencyResourceDetailPageSource).toContain("canDeleteSelectedDependencyResource");
    expect(dependencyResourceDetailPageSource).toContain("backupPolicyManageAction");
    expect(dependencyResourcesPageSource).not.toContain("backupResource(resource)");
    expect(dependencyResourcesPageSource).not.toContain(
      "backupResource(selectedDependencyResource)",
    );
    expect(dependencyResourcesPageSource).not.toContain("function backupResource()");
    expect(dependencyResourcesPageSource).not.toContain("function deleteResource(");
    expect(dependencyResourcesPageSource).not.toContain("onclick={() => deleteResource(resource)}");
    expect(dependencyResourcesPageSource).not.toContain(
      '<form class="console-section space-y-3" onsubmit={configureBackupPolicy}>',
    );
    const dependencyResourceListSource =
      dependencyResourcesPageSource.match(
        /{#each filteredDependencyResources as resource[\s\S]*?<\/article>\s*{\/each}/,
      )?.[0] ?? "";
    const dependencyResourceDetailDisplaySource = sourceBetween(
      dependencyResourceDetailPageSource,
      "data-dependency-resource-detail-display-surface",
      "data-dependency-resource-danger-zone",
    );
    const dependencyResourceDangerZoneSource = sourceBetween(
      dependencyResourceDetailPageSource,
      "data-dependency-resource-danger-zone",
      "{#if selectedDependencyResource}",
    );
    expect(dependencyResourceListSource).not.toContain("dependency-resource-delete-action");
    expect(dependencyResourceListSource).not.toContain("deleteAction");
    expect(dependencyResourceListSource).not.toContain("dependency-resource-backup-action");
    expect(dependencyResourceListSource).not.toContain("openBackupCreateDialog(resource)");
    expect(dependencyResourcesPageSource).toContain(
      "data-dependency-resource-list-display-surface",
    );
    expect(dependencyResourceListSource).toContain(
      "resource.backupRelationship?.retentionRequired",
    );
    expect(dependencyResourceListSource).toContain("resource.bindingReadiness.status");
    expect(dependencyResourceListSource).toContain("resource.sourceMode");
    expect(dependencyResourceListSource).toContain(
      'class="console-record-row rounded-md border bg-background lg:grid-cols-[minmax(0,1fr)_auto]"',
    );
    expect(
      dependencyResourceListSource.match(/class="rounded-md border bg-muted\/20 px-3 py-2"/g),
    ).toHaveLength(4);
    expect(dependencyResourcesPageSource).not.toContain(
      "data-dependency-resource-detail-display-surface",
    );
    expect(dependencyResourceDetailDisplaySource).toContain(
      "data-dependency-resource-detail-display-surface",
    );
    expect(dependencyResourceDetailDisplaySource).toContain(
      "data-dependency-resource-identity-summary",
    );
    expect(dependencyResourceDetailDisplaySource).toContain(
      "data-dependency-resource-backup-summary",
    );
    expect(dependencyResourceDetailDisplaySource).toContain(
      "data-dependency-resource-policy-summary",
    );
    expect(dependencyResourceDetailDisplaySource).toContain(
      "data-dependency-resource-lifecycle-handoff",
    );
    expect(dependencyResourceDetailDisplaySource).not.toContain("dangerZoneTitle");
    expect(dependencyResourceDetailDisplaySource).not.toContain("deleteDialogTitle");
    expect(dependencyResourceDetailDisplaySource).toContain("lifecycleDescription");
    expect(dependencyResourceDetailDisplaySource).not.toContain("deleteDialogDescription");
    expect(dependencyResourceDetailDisplaySource).toContain(
      "data-dependency-resource-lifecycle-handoff",
    );
    expect(dependencyResourceDetailDisplaySource).toContain("backupManageAction");
    expect(dependencyResourceDetailDisplaySource).toContain("restoreManageAction");
    expect(dependencyResourceDetailDisplaySource).not.toContain("restoreAction");
    expect(dependencyResourceDetailDisplaySource).not.toContain(
      "{$t(i18nKeys.console.dependencyResources.backup)}",
    );
    expect(dependencyResourceDetailDisplaySource).not.toContain('variant="destructive"');
    expect(dependencyResourceDetailDisplaySource).not.toContain("<form");
    expect(dependencyResourceDetailDisplaySource).not.toContain("<Input");
    expect(dependencyResourceDetailDisplaySource).not.toContain('type="submit"');
    expect(dependencyResourceDetailDisplaySource).toContain("openRestoreBackupDialog");
    expect(dependencyResourceDetailDisplaySource).toContain("openBackupPolicyDialog");
    expect(dependencyResourceDetailDisplaySource).not.toContain(
      "openDeleteDependencyResourceDialog",
    );
    expect(dependencyResourceDangerZoneSource).toContain("dangerZoneTitle");
    expect(dependencyResourceDangerZoneSource).toContain("deleteBlockedTitle");
    expect(dependencyResourceDangerZoneSource).toContain("openDeleteDependencyResourceDialog");
    expect(dependencyResourceDangerZoneSource).not.toContain('variant="destructive"');
    const dependencyResourceDeleteDialogSource =
      dependencyResourceDetailPageSource.match(
        /<Dialog\.Root bind:open={deleteDependencyResourceDialogOpen}[\s\S]*?<\/Dialog\.Root>/,
      )?.[0] ?? "";
    expect(dependencyResourceDeleteDialogSource).toContain("deleteConfirmLabel");
    expect(dependencyResourceDeleteDialogSource).toContain(
      'id="dependency-resource-delete-confirmation"',
    );
    expect(dependencyResourceDeleteDialogSource).toContain('variant="destructive"');
    expect(dependencyResourceDeleteDialogSource).toContain(
      "disabled={!canDeleteSelectedDependencyResource || deleteDependencyResourceMutation.isPending}",
    );
  });

  test("[RT-USAGE-UI-001] renders runtime usage metric tiles with visible card borders", () => {
    expect(runtimeUsagePanelSource).toContain('class="rounded-md border bg-muted/30 px-3 py-2"');
  });

  test("[BLUEPRINT-INSTALL-IA-001] keeps Blueprint install inputs behind intent dialogs", () => {
    expect(marketplaceBlueprintDetailPageSource).toContain("installDialogOpen");
    expect(marketplaceBlueprintDetailPageSource).toContain(
      'modalIsOpen(page, "blueprint-install")',
    );
    expect(marketplaceBlueprintDetailPageSource).toContain("data-blueprint-install-summary");
    expect(marketplaceBlueprintDetailPageSource).toContain("data-blueprint-detail-display-surface");
    expect(marketplaceBlueprintDetailPageSource).toContain(
      "data-blueprint-variant-display-surface",
    );
    expect(marketplaceBlueprintDetailPageSource).toContain("data-blueprint-variant-option");
    expect(marketplaceBlueprintDetailPageSource).toContain("data-blueprint-install-dialog");
    expect(marketplaceBlueprintDetailPageSource).toContain("openInstallDialog");
    expect(marketplaceBlueprintDetailPageSource).not.toContain("openQuickDeployDialog");
    expect(marketplaceBlueprintDetailPageSource).not.toContain("data-blueprint-upgrade-summary");
    expect(marketplaceBlueprintDetailPageSource).not.toContain(
      "data-blueprint-upgrade-plan-dialog",
    );
    expect(marketplaceBlueprintDetailPageSource).not.toContain(
      'modalIsOpen(page, "blueprint-upgrade-plan")',
    );
    const blueprintDetailDisplaySurface = sourceBetween(
      marketplaceBlueprintDetailPageSource,
      "data-blueprint-detail-display-surface",
      "<Dialog.Root bind:open={installDialogOpen}",
    );
    const blueprintVariantDisplaySurface = sourceBetween(
      marketplaceBlueprintDetailPageSource,
      "data-blueprint-variant-display-surface",
      "data-blueprint-overview-summary",
    );
    const installSummarySource =
      marketplaceBlueprintDetailPageSource.match(
        /<section class="console-side-panel space-y-4" data-blueprint-install-summary>[\s\S]*?<\/section>/,
      )?.[0] ?? "";
    const installDialogSource =
      marketplaceBlueprintDetailPageSource.match(
        /<Dialog\.Root bind:open={installDialogOpen}[\s\S]*?<\/Dialog\.Root>/,
      )?.[0] ?? "";
    expect(blueprintDetailDisplaySurface).not.toContain("<Input");
    expect(blueprintDetailDisplaySurface).not.toContain("<Textarea");
    expect(blueprintDetailDisplaySurface).not.toContain("<Select.Root");
    expect(blueprintDetailDisplaySurface).not.toContain("<select");
    expect(blueprintDetailDisplaySurface).not.toContain("<form");
    expect(blueprintDetailDisplaySurface).not.toContain('type="submit"');
    expect(blueprintDetailDisplaySurface).toContain("onclick={openInstallDialog}");
    expect(blueprintDetailDisplaySurface).toContain("{detailCopy.quickDeploy}");
    expect(blueprintVariantDisplaySurface).toContain("data-blueprint-variant-option");
    expect(blueprintVariantDisplaySurface).toContain("{detailCopy.deploymentPlanHelp}");
    expect(blueprintVariantDisplaySurface).not.toContain("selectedVariant = variant.id");
    expect(blueprintVariantDisplaySurface).not.toContain("<button");
    expect(blueprintVariantDisplaySurface).not.toContain("<Select.Root");
    expect(installSummarySource).toContain("{detailCopy.quickDeploy}");
    expect(installSummarySource).toContain("{detailCopy.quickDeployDescription}");
    expect(installSummarySource).not.toContain("<Input");
    expect(installSummarySource).not.toContain("<select");
    expect(installSummarySource).not.toContain("data-blueprint-install-secret-inputs");
    expect(installSummarySource).not.toContain("dry-run");
    expect(installSummarySource).not.toContain("openQuickDeployDialog");
    expect(installDialogSource).toContain("<Input");
    expect(installDialogSource).toContain("<Select.Root");
    expect(installDialogSource).not.toContain("<select");
    expect(installDialogSource).toContain("data-blueprint-install-secret-inputs");
    expect(installDialogSource).toContain("data-blueprint-accept-install");
    expect(installDialogSource).toContain("{detailCopy.quickDeployDialogDescription}");
    expect(installDialogSource).toContain("{detailCopy.startDeployment}");
    expect(installDialogSource).not.toContain("生成 dry-run");
    expect(installDialogSource).not.toContain("预览部署计划");
  });

  test("[BLUEPRINT-DETAIL-IA-001] orders Blueprint details around deployment decisions and created topology", () => {
    const summaryHeader = sourceBetween(
      marketplaceBlueprintDetailPageSource,
      "data-blueprint-summary-header",
      "data-blueprint-detail-body",
    );

    expect(marketplaceBlueprintDetailPageSource).toContain("data-blueprint-summary-header");
    expect(marketplaceBlueprintDetailPageSource).toContain("data-blueprint-footprint-summary");
    expect(marketplaceBlueprintDetailPageSource).toContain("data-blueprint-detail-body");
    expect(marketplaceBlueprintDetailPageSource).toContain("data-blueprint-overview-summary");
    expect(marketplaceBlueprintDetailPageSource).toContain("data-blueprint-topology");
    expect(marketplaceBlueprintDetailPageSource).toContain("data-blueprint-configuration-summary");
    expect(summaryHeader).not.toContain("detailCopy.planPrefix");
    expect(summaryHeader).not.toContain("upgradeSummary(selectedUpgrade)");
    expect(marketplaceBlueprintDetailPageSource.match(/href={listing\.websiteUrl}/g)?.length).toBe(
      1,
    );
    expect(
      marketplaceBlueprintDetailPageSource.match(/href={listing\.documentationUrl}/g)?.length,
    ).toBe(1);
    expect(marketplaceBlueprintDetailPageSource).toContain(
      'class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]"',
    );
    expect(marketplaceBlueprintDetailPageSource).toContain(
      'class="order-2 min-w-0 space-y-5 xl:order-1"',
    );
    expect(marketplaceBlueprintDetailPageSource).toContain(
      'class="order-1 min-w-0 space-y-5 xl:order-2 xl:sticky xl:top-20 xl:self-start"',
    );
    expect(marketplaceBlueprintDetailPageSource).not.toContain("detailCopy.backToMarketplace");
    expect(
      marketplaceBlueprintDetailPageSource.indexOf("data-blueprint-variant-display-surface"),
    ).toBeLessThan(marketplaceBlueprintDetailPageSource.indexOf("data-blueprint-overview-summary"));
    expect(
      marketplaceBlueprintDetailPageSource.indexOf("data-blueprint-overview-summary"),
    ).toBeLessThan(marketplaceBlueprintDetailPageSource.indexOf("data-blueprint-topology"));
    expect(marketplaceBlueprintDetailPageSource.indexOf("data-blueprint-topology")).toBeLessThan(
      marketplaceBlueprintDetailPageSource.indexOf("data-blueprint-configuration-summary"),
    );
  });

  test("[BLUEPRINT-INSTALL-IA-002] presents install completion as a handoff, not a progress dump", () => {
    expect(marketplaceBlueprintDetailPageSource).toContain("data-blueprint-install-handoff");
    expect(marketplaceBlueprintDetailPageSource).toContain("installHandoffTitle");
    expect(marketplaceBlueprintDetailPageSource).toContain("installHandoffDescription");
    expect(marketplaceBlueprintDetailPageSource).toContain(
      "data-blueprint-install-created-resources",
    );
    expect(marketplaceBlueprintDetailPageSource).toContain("data-blueprint-install-dependencies");
    expect(marketplaceBlueprintDetailPageSource).toContain("data-blueprint-install-public-urls");
    expect(marketplaceBlueprintDetailPageSource).toContain(
      "data-blueprint-install-component-deployments",
    );
    expect(marketplaceBlueprintDetailPageSource).toContain("data-blueprint-install-next-actions");
    expect(marketplaceBlueprintDetailPageSource).toContain("type InstalledApplicationComponent");
    expect(marketplaceBlueprintDetailPageSource).toContain("type InstalledApplicationDependency");
    expect(marketplaceBlueprintDetailPageSource).toContain("installedApplicationComponents");
    expect(marketplaceBlueprintDetailPageSource).toContain("installedApplicationDependencies");
    expect(marketplaceBlueprintDetailPageSource).toContain("installedApplicationPublicEndpoints");
    expect(marketplaceBlueprintDetailPageSource).toContain("progressResourceHref");
    expect(marketplaceBlueprintDetailPageSource).toContain("dependencyResourceCollectionHref");
    expect(marketplaceBlueprintDetailPageSource).toContain("installedApplicationHref");
    expect(marketplaceBlueprintDetailPageSource).toContain("{detailCopy.openResource}");
    expect(marketplaceBlueprintDetailPageSource).toContain("{detailCopy.openGovernance}");
    expect(marketplaceBlueprintDetailPageSource).toContain("{detailCopy.openPublicUrl}");
    expect(marketplaceBlueprintDetailPageSource).toContain("{detailCopy.viewInstalledApplication}");
    expect(marketplaceBlueprintDetailPageSource).toContain("/installed-applications/");
    expect(marketplaceBlueprintDetailPageSource).toContain(
      "{detailCopy.installedApplicationPending}",
    );
    expect(marketplaceBlueprintDetailPageSource).not.toContain("安装详情暂时还不能打开");
    expect(marketplaceBlueprintDetailPageSource).not.toContain("暂时还不能");
    expect(marketplaceBlueprintDetailPageSource).not.toContain("detail route");
    expect(marketplaceBlueprintDetailPageSource).not.toContain("resource owner surface");
    expect(marketplaceBlueprintDetailPageSource).not.toContain("owner surface");
    expect(marketplaceBlueprintDetailPageSource).not.toContain(
      "Installed Application detail route 仍是 route gap",
    );
    expect(marketplaceBlueprintDetailPageSource).toContain("detailCopy.publicUrlEmpty");
    expect(marketplaceBlueprintDetailPageSource).toContain("progressDeploymentHref");
    expect(marketplaceBlueprintDetailPageSource).toContain("componentDeploymentStatus");
    expect(marketplaceBlueprintDetailPageSource).toContain(
      "return detailCopy.installHandoffTitle;",
    );
    expect(marketplaceBlueprintDetailPageSource).toContain(
      "return detailCopy.installHandoffNeedsAttentionTitle;",
    );
    expect(marketplaceBlueprintDetailPageSource).toContain(
      "return detailCopy.installHandoffInProgressTitle;",
    );

    const installHandoffSource =
      marketplaceBlueprintDetailPageSource.match(
        /data-blueprint-install-handoff[\s\S]*?<\/aside>/,
      )?.[0] ?? "";

    expect(installHandoffSource).toContain("installHandoffTitle(installResult.progress)");
    expect(installHandoffSource).toContain("installHandoffDescription(installResult.progress)");
    expect(installHandoffSource).toContain("{detailCopy.createdResources}");
    expect(installHandoffSource).toContain("{detailCopy.dependencyResources}");
    expect(installHandoffSource).toContain("{detailCopy.publicUrl}");
    expect(installHandoffSource).toContain("{detailCopy.componentDeployments}");
    expect(installHandoffSource).toContain("{detailCopy.openFirstResource}");
    expect(installHandoffSource).toContain("{detailCopy.openLatestDeployment}");
    expect(installHandoffSource).toContain("{detailCopy.viewInstalledApplication}");
    expect(installHandoffSource).toContain("{detailCopy.openProjects}");
    expect(installHandoffSource).toContain("{detailCopy.installedApplicationPending}");
    expect(installHandoffSource).not.toContain("暂时还不能");
    expect(installHandoffSource).not.toContain("detail route");
    expect(installHandoffSource).not.toContain("collection 进入治理");
    expect(installHandoffSource).not.toContain("<Input");
    expect(installHandoffSource).not.toContain("<select");
    expect(installHandoffSource).not.toContain("data-blueprint-install-secret-inputs");
    expect(installHandoffSource).not.toContain("接受安装");
  });

  test("[INSTALLED-APPLICATION-IA-001] renders Installed Application as a display-only aggregate view", () => {
    expect(installedApplicationDetailRouteSource).toContain("ssr = false");
    expect(installedApplicationDetailPageSource).toContain(
      "data-installed-application-display-surface",
    );
    expect(installedApplicationDetailPageSource).toContain("type InstalledApplicationTab");
    expect(installedApplicationDetailPageSource).toContain("const installedApplicationTabs");
    expect(installedApplicationDetailPageSource).toContain("function installedApplicationTabHref");
    expect(installedApplicationDetailPageSource).toContain(
      "function selectInstalledApplicationTab",
    );
    expect(installedApplicationDetailPageSource).toContain('from "$lib/console/layout-classes"');
    expect(installedApplicationDetailPageSource).toContain("class={detailTabsClass}");
    expect(installedApplicationDetailPageSource).toContain("class={detailTabClass}");
    expect(installedApplicationDetailPageSource).not.toContain("console-detail-");
    expect(installedApplicationDetailPageSource).toContain(
      'aria-current={activeTab === tab.value ? "page" : undefined}',
    );
    expect(installedApplicationDetailPageSource).toContain("data-installed-application-overview");
    expect(installedApplicationDetailPageSource).toContain(
      "data-installed-application-outcome-summary",
    );
    expect(installedApplicationDetailPageSource).toContain(
      "data-installed-application-owner-handoff",
    );
    expect(installedApplicationDetailPageSource).toContain("data-installed-application-resources");
    expect(installedApplicationDetailPageSource).toContain(
      "data-installed-application-dependencies",
    );
    expect(installedApplicationDetailPageSource).toContain(
      "data-installed-application-public-urls",
    );
    expect(installedApplicationDetailPageSource).toContain("data-installed-application-history");
    expect(installedApplicationDetailPageSource).toContain("data-installed-application-handoff");
    expect(installedApplicationDetailPageSource).toContain(
      "data-installed-application-lifecycle-gap",
    );
    expect(installedApplicationDetailPageSource).toContain(
      "data-installed-application-lifecycle-governance",
    );
    expect(installedApplicationDetailPageSource).toContain(
      "data-installed-application-upgrade-governance",
    );
    expect(installedApplicationDetailPageSource).toContain(
      "data-installed-application-rollback-governance",
    );
    expect(installedApplicationDetailPageSource).toContain(
      "data-installed-application-uninstall-governance",
    );
    expect(installedApplicationDetailPageSource).toContain("/api/blueprints/installations/");
    expect(installedApplicationDetailPageSource).toContain("resourceDetailHref");
    expect(installedApplicationDetailPageSource).toContain("dependencyResourceHref");
    expect(installedApplicationDetailPageSource).toContain("deploymentHref");
    expect(installedApplicationDetailPageSource).toContain(
      "i18nKeys.console.installedApplications",
    );
    expect(installedApplicationDetailPageSource).toContain("claimEndpoint");
    expect(installedApplicationDetailPageSource).not.toContain("/cloud/installed-applications/");
    expect(installedApplicationDetailPageSource).toContain("tabOverview");
    expect(installedApplicationDetailPageSource).toContain("tabResources");
    expect(installedApplicationDetailPageSource).toContain("tabDependencies");
    expect(installedApplicationDetailPageSource).toContain("tabAccess");
    expect(installedApplicationDetailPageSource).toContain("tabHistory");
    expect(installedApplicationDetailPageSource).not.toContain("owner surface");
    expect(installedApplicationDetailPageSource).not.toContain("Resource owner");
    expect(installedApplicationDetailPageSource).not.toContain("暂不可用");
    expect(installedApplicationDetailPageSource).not.toContain("暂时还不能");

    const installedApplicationDisplaySurface = sourceBetween(
      installedApplicationDetailPageSource,
      "data-installed-application-display-surface",
      "</ConsoleShell>",
    );
    const installedApplicationOverviewTab = sourceBetween(
      installedApplicationDetailPageSource,
      '{#if activeTab === "overview"}',
      '{:else if activeTab === "resources"}',
    );
    const installedApplicationResourcesTab = sourceBetween(
      installedApplicationDetailPageSource,
      '{:else if activeTab === "resources"}',
      '{:else if activeTab === "dependencies"}',
    );
    const installedApplicationDependenciesTab = sourceBetween(
      installedApplicationDetailPageSource,
      '{:else if activeTab === "dependencies"}',
      '{:else if activeTab === "access"}',
    );
    const installedApplicationAccessTab = sourceBetween(
      installedApplicationDetailPageSource,
      '{:else if activeTab === "access"}',
      '{:else}\n          <div class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">',
    );
    const installedApplicationHistoryTab = sourceBetween(
      installedApplicationDetailPageSource,
      "{:else}",
      "</ConsoleShell>",
    );

    assertDisplaySurfaceIsFormFree(installedApplicationDisplaySurface);
    expect(installedApplicationOverviewTab).toContain("data-installed-application-outcome-summary");
    expect(installedApplicationOverviewTab).toContain("data-installed-application-owner-handoff");
    expect(installedApplicationOverviewTab).toContain("data-installed-application-handoff");
    expect(installedApplicationOverviewTab).not.toContain("data-installed-application-resources");
    expect(installedApplicationOverviewTab).not.toContain(
      "data-installed-application-dependencies",
    );
    expect(installedApplicationOverviewTab).not.toContain("data-installed-application-public-urls");
    expect(installedApplicationResourcesTab).toContain("data-installed-application-resources");
    expect(installedApplicationResourcesTab).toContain("resourcesTitle");
    expect(installedApplicationDependenciesTab).toContain(
      "data-installed-application-dependencies",
    );
    expect(installedApplicationDependenciesTab).toContain("openGovernance");
    expect(installedApplicationAccessTab).toContain("data-installed-application-access");
    expect(installedApplicationAccessTab).toContain(
      "data-installed-application-initial-access-credentials",
    );
    expect(installedApplicationAccessTab).toContain(
      "data-installed-application-initial-access-credential",
    );
    expect(installedApplicationAccessTab).toContain("data-installed-application-public-urls");
    expect(installedApplicationAccessTab).toContain("accessTitle");
    expect(installedApplicationAccessTab).toContain("initialAccessCredentialsTitle");
    expect(installedApplicationAccessTab).toContain("claimInitialAccessCredential");
    expect(installedApplicationHistoryTab).toContain("data-installed-application-history");
    expect(installedApplicationHistoryTab).toContain("data-installed-application-lifecycle-gap");
    expect(installedApplicationHistoryTab).toContain(
      "data-installed-application-lifecycle-governance",
    );
    expect(installedApplicationHistoryTab).toContain(
      "data-installed-application-upgrade-governance",
    );
    expect(installedApplicationHistoryTab).toContain(
      "data-installed-application-rollback-governance",
    );
    expect(installedApplicationHistoryTab).toContain(
      "data-installed-application-uninstall-governance",
    );
    expect(installedApplicationHistoryTab).toContain("upgradeDescription");
    expect(installedApplicationHistoryTab).toContain("uninstallDescription");
    expect(installedApplicationDisplaySurface).toContain("openProject");
    expect(installedApplicationDisplaySurface).toContain("openPrimaryResource");
    expect(installedApplicationDisplaySurface).toContain("openGovernance");
    expect(installedApplicationDisplaySurface).toContain("openPublicUrl");
    expect(installedApplicationDisplaySurface).toContain("openLatestDeployment");
    expect(installedApplicationDisplaySurface).not.toContain("<form");
    expect(installedApplicationDisplaySurface).not.toContain('type="submit"');
    expect(installedApplicationDisplaySurface).not.toContain("<Input");
    expect(installedApplicationDisplaySurface).not.toContain("rollbackMutation");
    expect(installedApplicationDisplaySurface).not.toContain("uninstallMutation");
    expect(installedApplicationDisplaySurface).not.toContain("upgradeMutation");
    expect(installedApplicationDisplaySurface).not.toContain("submitUninstall");
    expect(installedApplicationDisplaySurface).not.toContain("submitUpgrade");
    expect(installedApplicationDisplaySurface).not.toContain("submitRollback");
    expect(installedApplicationDisplaySurface).not.toContain("onclick={uninstall");
    expect(installedApplicationDisplaySurface).not.toContain('variant="destructive"');
    expect(installedApplicationDisplaySurface).not.toContain("<Trash2");
  });

  test("[PREVIEW-POLICY-IA-001] keeps preview policy scope and settings display-first", () => {
    expect(previewPoliciesPageSource).toContain("data-preview-policy-scope-display-surface");
    expect(previewPoliciesPageSource).toContain("data-preview-policy-scope-dialog");
    expect(previewPoliciesPageSource).toContain("data-preview-policy-summary");
    expect(previewPoliciesPageSource).toContain("data-preview-policy-edit-dialog");

    const scopeDisplaySurface = sourceBetween(
      previewPoliciesPageSource,
      "data-preview-policy-scope-display-surface",
      '<section class="grid gap-4',
    );
    const policySummarySurface = sourceBetween(
      previewPoliciesPageSource,
      "data-preview-policy-summary",
      "</ConsoleResourceCanvas>",
    );
    const scopeDialogSource = sourceBetween(
      previewPoliciesPageSource,
      "<Dialog.Root bind:open={scopeDialogOpen}",
      "<Dialog.Root bind:open={policyEditDialogOpen}",
    );
    const policyDialogSource = sourceBetween(
      previewPoliciesPageSource,
      "<Dialog.Root bind:open={policyEditDialogOpen}",
      "</ConsoleShell>",
    );

    assertDisplaySurfaceIsFormFree(scopeDisplaySurface);
    assertDisplaySurfaceIsFormFree(policySummarySurface);
    expect(scopeDisplaySurface).toContain("onclick={openScopeDialog}");
    expect(scopeDisplaySurface).toContain("<dl");
    expect(scopeDialogSource).toContain("data-preview-policy-scope-dialog");
    expect(scopeDialogSource).toContain("<Select.Root");
    expect(scopeDialogSource).toContain("bind:value={selectedProjectId}");
    expect(scopeDialogSource).toContain("bind:value={selectedScopeKind}");
    expect(scopeDialogSource).toContain("bind:value={selectedResourceId}");
    expect(policySummarySurface).toContain("onclick={openPolicyEditDialog}");
    expect(policySummarySurface).toContain("<dl");
    expect(policyDialogSource).toContain("data-preview-policy-edit-dialog");
    expect(policyDialogSource).toContain("<form");
    expect(policyDialogSource).toContain("<Input");
    expect(policyDialogSource).toContain("<Select.Root");
  });

  test("[PREVIEW-ENVIRONMENTS-IA-001] keeps preview cleanup behind lifecycle governance dialog", () => {
    expect(previewEnvironmentsPageSource).toContain("data-preview-environments-display-surface");
    expect(previewEnvironmentsPageSource).toContain("console-record-list");
    expect(previewEnvironmentsPageSource).toContain("console-record-row");
    expect(previewEnvironmentsPageSource).not.toContain("<Table.Root");
    expect(previewEnvironmentsPageSource).not.toContain('from "$lib/components/ui/table"');
    const previewEnvironmentListSurface = sourceBetween(
      previewEnvironmentsPageSource,
      "data-preview-environments-display-surface",
      "</section>",
    );
    assertDisplaySurfaceIsFormFree(previewEnvironmentListSurface);
    expect(previewEnvironmentListSurface).toContain("previewEnvironmentDetailHref");
    expect(previewEnvironmentListSurface).toContain("resourcePreviewEnvironmentDetailHref");
    expect(previewEnvironmentListSurface).not.toContain("cleanupDialogOpen");
    expect(previewEnvironmentListSurface).not.toContain("cleanupAction");
    expect(previewEnvironmentListSurface).not.toContain('variant="destructive"');

    expect(previewEnvironmentDetailPageSource).toContain(
      "data-preview-environment-detail-display-surface",
    );
    expect(previewEnvironmentDetailPageSource).toContain(
      "data-preview-environment-cleanup-handoff",
    );
    expect(previewEnvironmentDetailPageSource).toContain("data-preview-environment-cleanup-dialog");
    expect(previewEnvironmentDetailPageSource).toContain("lifecycleManageAction");
    expect(previewEnvironmentDetailPageSource).toContain("lifecycleReady");
    expect(previewEnvironmentDetailPageSource).toContain("lifecycleBlocked");

    const previewEnvironmentDisplaySurface = sourceBetween(
      previewEnvironmentDetailPageSource,
      "data-preview-environment-detail-display-surface",
      "<Dialog.Root bind:open={cleanupDialogOpen}",
    );
    const previewEnvironmentCleanupHandoff =
      previewEnvironmentDetailPageSource.match(
        /<div class="rounded-md border bg-muted\/15 px-3 py-2" data-preview-environment-cleanup-handoff>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/,
      )?.[0] ?? "";
    const previewEnvironmentCleanupDialog =
      previewEnvironmentDetailPageSource.match(
        /<Dialog\.Root bind:open={cleanupDialogOpen}[\s\S]*?data-preview-environment-cleanup-dialog[\s\S]*?<\/Dialog\.Root>/,
      )?.[0] ?? "";

    assertDisplaySurfaceIsFormFree(previewEnvironmentDisplaySurface);
    expect(previewEnvironmentDisplaySurface).toContain("openCleanupDialog");
    expect(previewEnvironmentDisplaySurface).not.toContain("requestCleanup");
    expect(previewEnvironmentDisplaySurface).not.toContain('variant="destructive"');
    expect(previewEnvironmentDisplaySurface).not.toContain("cleanupAction");
    expect(previewEnvironmentDisplaySurface).not.toContain("<Trash2");
    expect(previewEnvironmentCleanupHandoff).toContain("lifecycleManageAction");
    expect(previewEnvironmentCleanupHandoff).not.toContain("cleanupAction");
    expect(previewEnvironmentCleanupHandoff).not.toContain("<Trash2");
    expect(previewEnvironmentCleanupDialog).toContain("requestCleanup");
    expect(previewEnvironmentCleanupDialog).toContain("cleanupAction");
    expect(previewEnvironmentCleanupDialog).toContain('variant="destructive"');
    expect(previewEnvironmentCleanupDialog).toContain("<Trash2");
  });

  test("[ACCOUNT-SETTINGS-IA-001] keeps profile editing behind a single-intent dialog", () => {
    expect(accountProfilePageSource).toContain("data-account-profile-summary");
    expect(accountProfilePageSource).toContain("data-account-settings-handoff");
    expect(accountProfilePageSource).toContain("data-account-settings-next-actions");
    expect(accountProfilePageSource).toContain("profileEditDialogOpen");
    expect(accountProfilePageSource).toContain("openProfileEditDialog");
    expect(accountProfilePageSource).toContain("data-account-profile-edit-dialog");
    expect(accountProfilePageSource).toContain("<Dialog.Root bind:open={profileEditDialogOpen}");
    expect(accountProfilePageSource).toContain("orpcClient.account.changeProfile");

    const profileSummarySource =
      accountProfilePageSource.match(
        /<section class="console-panel space-y-5 p-5" data-account-profile-summary>[\s\S]*?<\/section>/,
      )?.[0] ?? "";
    const profileDialogSource =
      accountProfilePageSource.match(
        /<Dialog\.Root bind:open={profileEditDialogOpen}[\s\S]*?<\/Dialog\.Root>/,
      )?.[0] ?? "";
    const accountSettingsHandoffSource = sourceBetween(
      accountProfilePageSource,
      "data-account-settings-handoff",
      "<Dialog.Root bind:open={profileEditDialogOpen}",
    );

    expect(profileSummarySource).toContain("openProfileEditDialog");
    assertDisplaySurfaceIsFormFree(profileSummarySource);
    assertDisplaySurfaceIsFormFree(accountSettingsHandoffSource);
    expect(accountSettingsHandoffSource).toContain('href="/account/security"');
    expect(accountSettingsHandoffSource).toContain('href="/account/connections"');
    expect(accountSettingsHandoffSource).toContain('href="/account/sessions"');
    expect(accountSettingsHandoffSource).toContain('href="/account/danger-zone"');
    expect(profileDialogSource).toContain("<form");
    expect(profileDialogSource).toContain("<Input");
    expect(profileDialogSource).toContain('type="submit"');
  });

  test("[ACCOUNT-SETTINGS-IA-004] keeps provider linking inside the account connections page", () => {
    expect(accountConnectionsPageSource).toContain("data-account-connections-summary");
    expect(accountConnectionsPageSource).toContain("data-account-github-connection");
    expect(accountConnectionsPageSource).toContain("GitHubIcon");
    expect(accountConnectionsPageSource).not.toContain(
      'class="console-panel space-y-5 p-5" data-account-connections-summary',
    );
    expect(accountConnectionsPageSource).toContain('activePath="/account/connections"');
    expect(accountConnectionsPageSource).toContain("/api/auth/link-social");
    expect(accountConnectionsPageSource).toContain("githubProvider?.accountLabel");
    expect(accountConnectionsPageSource).toContain("linkGitHubAccount");
    expect(consoleShellSource).not.toContain("/api/auth/link-social");
  });

  test("[ACCOUNT-SETTINGS-IA-002] keeps account security forms behind intent dialogs", () => {
    expect(accountSecurityPageSource).toContain("data-account-security-password-summary");
    expect(accountSecurityPageSource).toContain("data-account-security-email-summary");
    expect(accountSecurityPageSource).toContain("passwordDialogOpen");
    expect(accountSecurityPageSource).toContain("emailDialogOpen");
    expect(accountSecurityPageSource).toContain("openPasswordDialog");
    expect(accountSecurityPageSource).toContain("openEmailDialog");
    expect(accountSecurityPageSource).toContain("data-account-security-password-dialog");
    expect(accountSecurityPageSource).toContain("data-account-security-email-dialog");
    expect(accountSecurityPageSource).toContain('emailChangeStep = "request"');

    const passwordSummarySource =
      accountSecurityPageSource.match(
        /<section class="console-panel space-y-5 p-5" data-account-security-password-summary>[\s\S]*?<\/section>/,
      )?.[0] ?? "";
    const emailSummarySource =
      accountSecurityPageSource.match(
        /<section class="console-panel space-y-5 p-5" data-account-security-email-summary>[\s\S]*?<\/section>/,
      )?.[0] ?? "";
    const passwordDialogSource =
      accountSecurityPageSource.match(
        /<Dialog\.Root bind:open={passwordDialogOpen}[\s\S]*?<\/Dialog\.Root>/,
      )?.[0] ?? "";
    const emailDialogSource =
      accountSecurityPageSource.match(
        /<Dialog\.Root bind:open={emailDialogOpen}[\s\S]*?<\/Dialog\.Root>/,
      )?.[0] ?? "";

    expect(passwordSummarySource).toContain("openPasswordDialog");
    assertDisplaySurfaceIsFormFree(passwordSummarySource);
    expect(emailSummarySource).toContain("openEmailDialog");
    assertDisplaySurfaceIsFormFree(emailSummarySource);
    expect(passwordDialogSource).toContain("<form");
    expect(passwordDialogSource).toContain("<Input");
    expect(emailDialogSource).toContain("<form");
    expect(emailDialogSource).toContain("emailChangeStep");
    expect(emailDialogSource).toContain('{#if emailChangeStep === "request"}');
    expect(emailDialogSource).toContain("{:else}");
    expect(emailDialogSource).toContain("data-account-security-email-request-form");
    expect(emailDialogSource).toContain("data-account-security-email-verify-form");
    expect(emailDialogSource).toContain("editRequestedEmail");
    const emailRequestFormSource =
      emailDialogSource.match(
        /<form class="grid gap-4" onsubmit={requestEmailChange} data-account-security-email-request-form>[\s\S]*?<\/form>/,
      )?.[0] ?? "";
    const emailVerifyFormSource =
      emailDialogSource.match(
        /<form class="grid gap-4" onsubmit={verifyEmailChange} data-account-security-email-verify-form>[\s\S]*?<\/form>/,
      )?.[0] ?? "";
    expect(emailRequestFormSource).toContain("<Input");
    expect(emailRequestFormSource).not.toContain("<InputOTP.Root");
    expect(emailRequestFormSource).toContain("requestEmailChange");
    expect(emailRequestFormSource).not.toContain("verifyEmailChange");
    expect(emailVerifyFormSource).toContain("<InputOTP.Root");
    expect(emailVerifyFormSource).not.toContain('type="email"');
    expect(emailVerifyFormSource).toContain("verifyEmailChange");
    expect(emailVerifyFormSource).not.toContain("requestEmailChange");
    const openEmailDialogSource = functionBody(
      accountSecurityPageSource,
      "function openEmailDialog()",
    );
    expect(openEmailDialogSource).toContain('newEmail = ""');
    expect(openEmailDialogSource).toContain('emailOtp = ""');
    expect(openEmailDialogSource).toContain('emailChangeStep = "request"');
    expect(openEmailDialogSource).not.toContain(
      'emailChangeStep = normalizedNewEmail ? "verify" : "request"',
    );
  });

  test("[ACCOUNT-SETTINGS-IA-002B] keeps account danger operations behind blocker checks and confirmation dialog", () => {
    expect(accountDangerZonePageSource).toContain("submitDeleteAccount");
    expect(accountDangerZonePageSource).toContain("data-account-danger-summary");
    expect(accountDangerZonePageSource).toContain("data-account-danger-blocker-check");
    expect(accountDangerZonePageSource).toContain("deleteAccountDialogOpen");
    expect(accountDangerZonePageSource).toContain("openDeleteAccountDialog");
    expect(accountDangerZonePageSource).toContain("data-account-delete-dialog");
    expect(accountDangerZonePageSource).toContain('variant="destructive"');

    const accountDangerSummarySource =
      accountDangerZonePageSource.match(
        /<div class="space-y-4" data-account-danger-summary>[\s\S]*?<\/div>\s*{:else if profile}/,
      )?.[0] ??
      accountDangerZonePageSource.match(
        /<div class="space-y-4" data-account-danger-summary>[\s\S]*?<\/div>\s*{/,
      )?.[0] ??
      "";
    const accountDeleteDialogSource =
      accountDangerZonePageSource.match(
        /<Dialog\.Root bind:open={deleteAccountDialogOpen}[\s\S]*?data-account-delete-dialog[\s\S]*?<\/Dialog\.Root>/,
      )?.[0] ?? "";

    expect(accountDangerSummarySource).toContain("openDeleteAccountDialog");
    expect(accountDangerSummarySource).toContain("data-account-danger-blocker-check");
    expect(accountDangerSummarySource).toContain("dangerConfirmLabel");
    expect(accountDangerSummarySource).toContain("dangerDialogDescription");
    expect(accountDangerSummarySource).toContain("lifecycleManageAction");
    assertDisplaySurfaceIsFormFree(accountDangerSummarySource);
    expect(accountDangerSummarySource).not.toContain("submitDeleteAccount");
    expect(accountDangerSummarySource).not.toContain("deleteAccountMutation.mutate");
    expect(accountDangerSummarySource).not.toContain('variant="destructive"');
    expect(accountDangerSummarySource).not.toContain("<Trash2");
    expect(accountDeleteDialogSource).toContain("<form");
    expect(accountDeleteDialogSource).toContain("<Input");
    expect(accountDeleteDialogSource).toContain('type="submit"');
    expect(accountDeleteDialogSource).toContain("submitDeleteAccount");
    expect(accountDeleteDialogSource).toContain('variant="destructive"');
    expect(accountDeleteDialogSource).toContain("<Trash2");
  });

  test("[ACCOUNT-SETTINGS-IA-003] keeps account session revocation behind a confirmation dialog", () => {
    expect(accountSessionsPageSource).toContain("data-account-sessions-display-surface");
    expect(accountSessionsPageSource).toContain("revokeSessionDialogOpen");
    expect(accountSessionsPageSource).toContain("selectedSessionForRevoke");
    expect(accountSessionsPageSource).toContain("openRevokeSessionDialog(session)");
    expect(accountSessionsPageSource).toContain("confirmRevokeSession");
    expect(accountSessionsPageSource).toContain("data-account-session-revoke-dialog");
    expect(accountSessionsPageSource).toContain("orpcClient.account.revokeSession");
    expect(accountSessionsPageSource).toContain("lifecycleManageAction");

    const sessionsDisplaySurface =
      accountSessionsPageSource.match(
        /<div class="console-record-list" data-account-sessions-display-surface>[\s\S]*?<\/div>\s*{\/if}/,
      )?.[0] ?? "";
    const sessionRevokeDialogSource =
      accountSessionsPageSource.match(
        /<Dialog\.Root bind:open={revokeSessionDialogOpen}[\s\S]*?data-account-session-revoke-dialog[\s\S]*?<\/Dialog\.Root>/,
      )?.[0] ?? "";

    assertDisplaySurfaceIsFormFree(sessionsDisplaySurface);
    expect(sessionsDisplaySurface).toContain("openRevokeSessionDialog(session)");
    expect(sessionsDisplaySurface).toContain("lifecycleManageAction");
    expect(sessionsDisplaySurface).not.toContain("confirmRevokeSession");
    expect(sessionsDisplaySurface).not.toContain("revokeSessionMutation.mutate");
    expect(sessionsDisplaySurface).not.toContain("revokeSession}");
    expect(sessionsDisplaySurface).not.toContain('variant="destructive"');
    expect(sessionsDisplaySurface).not.toContain("<Trash2");
    expect(sessionRevokeDialogSource).toContain("confirmRevokeSession");
    expect(sessionRevokeDialogSource).toContain("revokeSessionMutation.isPending");
    expect(sessionRevokeDialogSource).toContain('variant="destructive"');
    expect(sessionRevokeDialogSource).toContain("<Trash2");
    expect(sessionRevokeDialogSource).toContain("accountSettings.revokeSession");
  });

  test("[ORGANIZATION-SETTINGS-IA-000] keeps organization display surfaces form-free", () => {
    expect(organizationPageSource).toContain("data-organization-profile-display-surface");
    expect(organizationPageSource).toContain("data-organization-members-display-surface");
    expect(organizationPageSource).toContain("data-organization-invitations-display-surface");
    expect(organizationPageSource).toContain("data-organization-deploy-tokens-display-surface");
    expect(organizationPageSource).toContain("data-organization-archived-projects-display-surface");
    expect(organizationPageSource).toContain("data-organization-danger-display-surface");
    expect(organizationPageSource).toContain("data-organization-danger-blocker-check");
    expect(organizationPageSource).toContain("data-organization-operation-notice-display-surface");
    expect(organizationPageSource).toContain("data-organization-token-secret-display");
    expect(organizationPageSource).toContain("data-organization-invite-dialog");
    expect(organizationPageSource).toContain("data-organization-profile-edit-dialog");
    expect(organizationPageSource).toContain("data-organization-deploy-token-create-dialog");
    expect(organizationPageSource).toContain("data-organization-delete-dialog");
    expect(organizationPageSource).not.toContain('from "$lib/components/ui/textarea"');
    expect(organizationPageSource).not.toContain("<Textarea");

    const profileDisplaySurface = sourceBetween(
      organizationPageSource,
      "data-organization-profile-display-surface",
      "{#if context.organizations.length > 1}",
    );
    const membersDisplaySurface = sourceBetween(
      organizationPageSource,
      "data-organization-members-display-surface",
      '{#if activeSection === "invitations"}',
    );
    const invitationsDisplaySurface = sourceBetween(
      organizationPageSource,
      "data-organization-invitations-display-surface",
      '{#if activeSection === "deploy-tokens"}',
    );
    const deployTokensDisplaySurface = sourceBetween(
      organizationPageSource,
      "data-organization-deploy-tokens-display-surface",
      '{#if activeSection === "archived-projects"}',
    );
    const archivedProjectsDisplaySurface = sourceBetween(
      organizationPageSource,
      "data-organization-archived-projects-display-surface",
      '{#if activeSection === "danger-zone"}',
    );
    const dangerDisplaySurface = sourceBetween(
      organizationPageSource,
      "data-organization-danger-display-surface",
      '{#if activeSection === "profile"}',
    );
    const operationNoticeDisplaySurface = sourceBetween(
      organizationPageSource,
      "data-organization-operation-notice-display-surface",
      '{#if activeSection === "profile"}',
    );

    [
      profileDisplaySurface,
      membersDisplaySurface,
      invitationsDisplaySurface,
      deployTokensDisplaySurface,
      archivedProjectsDisplaySurface,
      dangerDisplaySurface,
      operationNoticeDisplaySurface,
    ].forEach(assertDisplaySurfaceIsFormFree);

    expect(operationNoticeDisplaySurface).toContain("<pre");
    expect(operationNoticeDisplaySurface).toContain("<code");
    expect(operationNoticeDisplaySurface).not.toContain("readonly");
    expect(dangerDisplaySurface).toContain("data-organization-danger-blocker-check");
    expect(dangerDisplaySurface).toContain("dangerConfirmLabel");
    expect(dangerDisplaySurface).toContain("deleteOrganizationDialogWarning");
    expect(dangerDisplaySurface).toContain("permissionDeniedTitle");
    expect(dangerDisplaySurface).toContain("openDeleteOrganizationDialog");
    expect(dangerDisplaySurface).toContain("lifecycleManageAction");
    expect(dangerDisplaySurface).not.toContain("submitOrganizationDelete");
    expect(dangerDisplaySurface).not.toContain("deleteOrganizationMutation.mutate");
    expect(dangerDisplaySurface).not.toContain('variant="destructive"');
    expect(dangerDisplaySurface).not.toContain("<Trash2");
  });

  test("[ORGANIZATION-SETTINGS-IA-000A] uses real settings routes instead of query-section compatibility", () => {
    expect(organizationPageSource).toContain('page.url.pathname.endsWith("/members")');
    expect(organizationPageSource).toContain('page.url.pathname.endsWith("/invitations")');
    expect(organizationPageSource).toContain('page.url.pathname.endsWith("/deploy-tokens")');
    expect(organizationPageSource).toContain('page.url.pathname.endsWith("/archived-projects")');
    expect(organizationPageSource).toContain('page.url.pathname.endsWith("/danger-zone")');
    expect(organizationPageSource).not.toContain('page.url.searchParams.get("section")');
    expect(organizationPageSource).not.toContain("querySection");
    expect(organizationPageSource).not.toContain("?section=");
  });

  test("[ORGANIZATION-SETTINGS-IA-000B] keeps organization create/edit/delete intent forms in dialogs", () => {
    const inviteDialogSource = sourceBetween(
      organizationPageSource,
      "<Dialog.Root bind:open={inviteDialogOpen}",
      "<Dialog.Root\n    bind:open={organizationProfileDialogOpen}",
    );
    const profileEditDialogSource = sourceBetween(
      organizationPageSource,
      "<Dialog.Root\n    bind:open={organizationProfileDialogOpen}",
      "<Dialog.Root bind:open={memberRoleDialogOpen}",
    );
    const deleteOrganizationDialogSource = sourceBetween(
      organizationPageSource,
      "<Dialog.Root bind:open={deleteOrganizationDialogOpen}",
      "<Dialog.Root\n    bind:open={deployTokenCreateDialogOpen}",
    );
    const deployTokenCreateDialogSource = sourceBetween(
      organizationPageSource,
      "<Dialog.Root\n    bind:open={deployTokenCreateDialogOpen}",
      "</SettingsShell>",
    );

    expect(inviteDialogSource).toContain("data-organization-invite-dialog");
    expect(inviteDialogSource).toContain("submitInvite");
    expect(inviteDialogSource).toContain("<form");
    expect(profileEditDialogSource).toContain("data-organization-profile-edit-dialog");
    expect(profileEditDialogSource).toContain("submitOrganizationProfile");
    expect(profileEditDialogSource).toContain("<form");
    expect(deleteOrganizationDialogSource).toContain("data-organization-delete-dialog");
    expect(deleteOrganizationDialogSource).toContain("submitOrganizationDelete");
    expect(deleteOrganizationDialogSource).toContain("<Input");
    expect(deleteOrganizationDialogSource).toContain('variant="destructive"');
    expect(deployTokenCreateDialogSource).toContain("data-organization-deploy-token-create-dialog");
    expect(deployTokenCreateDialogSource).toContain("submitDeployToken");
    expect(deployTokenCreateDialogSource).toContain("<Select.Root");
    expect(deployTokenCreateDialogSource).toContain("<form");
  });

  test("[ORGANIZATION-SETTINGS-IA-001] keeps member and deploy-token lifecycle actions behind dialogs", () => {
    expect(organizationPageSource).not.toContain("requestConsoleConfirm");
    expect(organizationPageSource).toContain("memberLifecycleDialogOpen");
    expect(organizationPageSource).toContain("deployTokenLifecycleDialogOpen");
    expect(organizationPageSource).toContain("data-organization-member-lifecycle-dialog");
    expect(organizationPageSource).toContain("data-organization-deploy-token-lifecycle-dialog");
    expect(organizationPageSource).toContain(
      "function openMemberLifecycleDialog(member: OrganizationMemberSummary)",
    );
    expect(organizationPageSource).not.toContain(
      "function openMemberLifecycleDialog(\n    member: OrganizationMemberSummary,\n    action",
    );
    expect(organizationPageSource).toContain("memberLifecycleDialogTitle");
    expect(organizationPageSource).toContain("memberLifecycleDialogDescription");
    expect(organizationPageSource).toContain(
      "function openDeployTokenLifecycleDialog(tokenId: string)",
    );
    expect(organizationPageSource).not.toContain(
      "function openDeployTokenLifecycleDialog(tokenId: string, action",
    );
    expect(organizationPageSource).toContain("tokenLifecycleDialogTitle");
    expect(organizationPageSource).toContain("tokenLifecycleDialogDescription");
    expect(organizationPageSource).toContain("submitMemberLifecycleAction");
    expect(organizationPageSource).toContain("submitDeployTokenLifecycleAction");
    expect(organizationPageSource).toContain("removeMemberDialogTitle");
    expect(organizationPageSource).toContain("restoreMemberDialogTitle");
    expect(organizationPageSource).toContain("rotateTokenDialogTitle");
    expect(organizationPageSource).toContain("revokeTokenDialogTitle");

    const membersSectionSource =
      organizationPageSource.match(
        /{#if activeSection === "members"}[\s\S]*?{#if activeSection === "invitations"}/,
      )?.[0] ?? "";
    const deployTokensSectionSource =
      organizationPageSource.match(
        /{#if activeSection === "deploy-tokens"}[\s\S]*?{#if activeSection === "archived-projects"}/,
      )?.[0] ?? "";
    const memberLifecycleDialogSource =
      organizationPageSource.match(
        /<Dialog\.Root bind:open={memberLifecycleDialogOpen}[\s\S]*?<Dialog\.Root\s+bind:open={deployTokenLifecycleDialogOpen}/,
      )?.[0] ?? "";
    const deployTokenLifecycleDialogSource =
      organizationPageSource.match(
        /<Dialog\.Root\s+bind:open={deployTokenLifecycleDialogOpen}[\s\S]*?<Dialog\.Root bind:open={deleteOrganizationDialogOpen}/,
      )?.[0] ?? "";
    const submitMemberLifecycleSource =
      organizationPageSource.match(
        /function submitMemberLifecycleAction\(\): void \{[\s\S]*?\n {2}\}/,
      )?.[0] ?? "";
    const submitDeployTokenLifecycleSource =
      organizationPageSource.match(
        /function submitDeployTokenLifecycleAction\(\): void \{[\s\S]*?\n {2}\}/,
      )?.[0] ?? "";

    expect(membersSectionSource).toContain("openMemberLifecycleDialog(member)");
    expect(membersSectionSource).not.toContain('openMemberLifecycleDialog(member, "remove")');
    expect(membersSectionSource).not.toContain('openMemberLifecycleDialog(member, "restore")');
    expect(membersSectionSource).toContain("lifecycleManageAction");
    expect(membersSectionSource.match(/lifecycleManageAction/g)?.length ?? 0).toBe(2);
    expect(membersSectionSource).not.toContain("restoreMember}");
    expect(membersSectionSource).not.toContain("restoringMember");
    expect(membersSectionSource).not.toContain("removeMember}");
    expect(membersSectionSource).not.toContain("removingMember");
    expect(membersSectionSource).not.toContain('variant="destructive"');
    expect(membersSectionSource).not.toContain("<Trash2");
    expect(membersSectionSource).not.toContain("removeMemberMutation.mutate");
    expect(membersSectionSource).not.toContain("reactivateMemberMutation.mutate");
    expect(deployTokensSectionSource).toContain("openDeployTokenLifecycleDialog(token.tokenId)");
    expect(deployTokensSectionSource).not.toContain(
      'openDeployTokenLifecycleDialog(token.tokenId, "rotate")',
    );
    expect(deployTokensSectionSource).not.toContain(
      'openDeployTokenLifecycleDialog(token.tokenId, "revoke")',
    );
    expect(deployTokensSectionSource).toContain("lifecycleManageAction");
    expect(deployTokensSectionSource.match(/lifecycleManageAction/g)?.length ?? 0).toBe(1);
    expect(deployTokensSectionSource).not.toContain("rotateToken}");
    expect(deployTokensSectionSource).not.toContain("rotatingToken");
    expect(deployTokensSectionSource).not.toContain("revokeToken}");
    expect(deployTokensSectionSource).not.toContain("revokingToken");
    expect(deployTokensSectionSource).not.toContain('variant="destructive"');
    expect(deployTokensSectionSource).not.toContain("<Trash2");
    expect(deployTokensSectionSource).not.toContain("rotateDeployTokenMutation.mutate");
    expect(deployTokensSectionSource).not.toContain("revokeDeployTokenMutation.mutate");
    expect(memberLifecycleDialogSource).toContain("onclick={submitMemberLifecycleAction}");
    expect(memberLifecycleDialogSource).toContain(
      'variant={selectedMemberLifecycleAction === "remove" ? "destructive" : "default"}',
    );
    expect(memberLifecycleDialogSource).toContain('selectedMemberLifecycleAction = "remove"');
    expect(memberLifecycleDialogSource).toContain('selectedMemberLifecycleAction = "restore"');
    expect(memberLifecycleDialogSource).toContain("memberLifecycleRemoveOption");
    expect(memberLifecycleDialogSource).toContain("memberLifecycleRestoreOption");
    expect(memberLifecycleDialogSource).toContain("<Trash2");
    expect(submitMemberLifecycleSource).toContain("removeMemberMutation.mutate");
    expect(submitMemberLifecycleSource).toContain("reactivateMemberMutation.mutate");
    expect(deployTokenLifecycleDialogSource).toContain(
      "onclick={submitDeployTokenLifecycleAction}",
    );
    expect(deployTokenLifecycleDialogSource).toContain(
      'variant={selectedDeployTokenLifecycleAction === "revoke" ? "destructive" : "default"}',
    );
    expect(deployTokenLifecycleDialogSource).toContain(
      'selectedDeployTokenLifecycleAction = "rotate"',
    );
    expect(deployTokenLifecycleDialogSource).toContain(
      'selectedDeployTokenLifecycleAction = "revoke"',
    );
    expect(deployTokenLifecycleDialogSource).toContain("tokenLifecycleRotateOption");
    expect(deployTokenLifecycleDialogSource).toContain("tokenLifecycleRevokeOption");
    expect(deployTokenLifecycleDialogSource).toContain("<Trash2");
    expect(submitDeployTokenLifecycleSource).toContain("rotateDeployTokenMutation.mutate");
    expect(submitDeployTokenLifecycleSource).toContain("revokeDeployTokenMutation.mutate");
  });

  test("[INSTANCE-OPERATIONS-IA-001] keeps instance operation pages display-first", () => {
    expect(instancePageSource).toContain("data-instance-overview-display-surface");
    expect(instancePageSource).toContain("data-instance-workers-display-surface");
    expect(instancePageSource).toContain("data-instance-maintenance-display-surface");
    expect(instancePageSource).toContain("data-instance-sessions-display-surface");
    expect(instancePageSource).toContain("data-instance-terminal-sessions-lifecycle-handoff");
    expect(instancePageSource).toContain("data-instance-terminal-sessions-list");
    expect(instancePageSource).toContain("data-instance-guidance-display-surface");
    expect(instancePageSource).toContain("data-instance-runtime-workers-list");
    expect(instancePageSource).toContain("data-instance-operator-work-list");
    expect(instancePageSource).toContain("applyUpgradeDialogOpen");
    expect(instancePageSource).toContain("terminalSessionCloseDialogOpen");
    expect(instancePageSource).toContain("terminalSessionsExpireDialogOpen");
    expect(instancePageSource).not.toContain('from "$lib/components/ui/table"');
    expect(instancePageSource).not.toContain("<Table.Root");

    const overviewDisplaySurface = sourceBetween(
      instancePageSource,
      "data-instance-overview-display-surface",
      '{:else if activeSection === "workers"}',
    );
    const workersDisplaySurface = sourceBetween(
      instancePageSource,
      "data-instance-workers-display-surface",
      '{:else if activeSection === "maintenance"}',
    );
    const maintenanceDisplaySurface = sourceBetween(
      instancePageSource,
      "data-instance-maintenance-display-surface",
      '{:else if activeSection === "sessions"}',
    );
    const sessionsDisplaySurface = sourceBetween(
      instancePageSource,
      "data-instance-sessions-display-surface",
      "{:else}",
    );
    const guidanceDisplaySurface = sourceBetween(
      instancePageSource,
      "data-instance-guidance-display-surface",
      "{/if}",
    );

    [
      overviewDisplaySurface,
      workersDisplaySurface,
      maintenanceDisplaySurface,
      sessionsDisplaySurface,
      guidanceDisplaySurface,
    ].forEach(assertDisplaySurfaceIsFormFree);

    expect(overviewDisplaySurface).toContain("openApplyUpgradeDialog");
    expect(overviewDisplaySurface).toContain("reviewUpgrade");
    expect(overviewDisplaySurface).not.toContain("i18nKeys.console.instance.applyUpgrade");
    expect(overviewDisplaySurface).toContain('variant="outline"');
    expect(workersDisplaySurface).toContain("data-instance-runtime-workers-list");
    expect(workersDisplaySurface).toContain("data-instance-operator-work-list");
    expect(workersDisplaySurface).toContain("console-record-list");
    expect(workersDisplaySurface).toContain("console-record-row");
    expect(workersDisplaySurface).not.toContain("<Table.Root");
    expect(sessionsDisplaySurface).toContain("openTerminalSessionCloseDialog(session)");
    expect(sessionsDisplaySurface).toContain("openTerminalSessionsExpireDialog");
    expect(sessionsDisplaySurface).toContain("lifecycleManageAction");
    expect(sessionsDisplaySurface).toContain("data-instance-terminal-sessions-lifecycle-handoff");
    expect(sessionsDisplaySurface).toContain("data-instance-terminal-sessions-list");
    expect(sessionsDisplaySurface).toContain("console-record-list");
    expect(sessionsDisplaySurface).toContain("console-record-row");
    expect(sessionsDisplaySurface).not.toContain("lifecycleExpireOld}");
    expect(sessionsDisplaySurface).not.toContain("closeTerminal}");
    expect(sessionsDisplaySurface).not.toContain('variant="destructive"');
    expect(overviewDisplaySurface).not.toContain("applyUpgradeMutation.mutate");
    expect(sessionsDisplaySurface).not.toContain("closeTerminalSessionMutation.mutate");
    expect(sessionsDisplaySurface).not.toContain("expireTerminalSessionsMutation.mutate");

    const applyUpgradeDialogSource = sourceBetween(
      instancePageSource,
      "<Dialog.Root bind:open={applyUpgradeDialogOpen}",
      "<Dialog.Root\n    bind:open={terminalSessionsExpireDialogOpen}",
    );
    const expireTerminalSessionsDialogSource = sourceBetween(
      instancePageSource,
      "<Dialog.Root\n    bind:open={terminalSessionsExpireDialogOpen}",
      "<Dialog.Root\n    bind:open={terminalSessionCloseDialogOpen}",
    );
    const closeTerminalSessionDialogSource = sourceBetween(
      instancePageSource,
      "<Dialog.Root\n    bind:open={terminalSessionCloseDialogOpen}",
      "</SettingsShell>",
    );

    expect(applyUpgradeDialogSource).toContain("confirmApplyUpgrade");
    expect(closeTerminalSessionDialogSource).toContain("confirmCloseTerminalSession");
    expect(expireTerminalSessionsDialogSource).toContain("confirmExpireTerminalSessions");
    expect(closeTerminalSessionDialogSource).toContain("closeTerminal");
    expect(closeTerminalSessionDialogSource).toContain('variant="destructive"');
    expect(expireTerminalSessionsDialogSource).toContain("lifecycleExpireOld");
    expect(expireTerminalSessionsDialogSource).toContain('variant="destructive"');
  });

  test("[PROJECT-DETAIL-IA-002] keeps project and environment lifecycle actions behind dialogs", () => {
    expect(projectDetailPageSource).not.toContain("requestConsoleConfirm");
    expect(projectDetailPageSource).not.toContain("requestConsolePrompt");
    expect(projectDetailPageSource).toContain("projectLifecycleDialogOpen");
    expect(projectDetailPageSource).toContain("environmentLifecycleDialogOpen");
    expect(projectDetailPageSource).toContain("data-project-lifecycle-dialog");
    expect(projectDetailPageSource).toContain("data-project-environment-lifecycle-dialog");
    expect(projectDetailPageSource).toContain("function openProjectLifecycleDialog()");
    expect(projectDetailPageSource).toContain(
      "function openEnvironmentLifecycleDialog(environment: EnvironmentSummary)",
    );
    expect(projectDetailPageSource).toContain("selectedEnvironmentLifecycleAction = null;");
    expect(projectDetailPageSource).toContain("projectDeleteConfirmation.trim() === project.id");
    expect(projectDetailPageSource).toContain("deleteDialogTitle");
    expect(projectDetailPageSource).toContain("environmentLifecycleDialogTitle");
    expect(projectDetailPageSource).toContain("environmentLifecycleDialogDescription");

    const projectSettingsSource = sourceBetween(
      projectDetailPageSource,
      'value="settings"',
      "</Tabs.Root>",
    );
    const environmentsTabSource = sourceBetween(
      projectDetailPageSource,
      'value="environments"',
      'value="deployments"',
    );
    const projectConsoleQueriesSource = sourceBetween(
      projectDetailPageSource,
      "const {\n    projectsQuery",
      "const projectId = $derived",
    );
    const projectPreviewEnvironmentsQuerySource = sourceBetween(
      projectDetailPageSource,
      "orpc.previewEnvironments.list.queryOptions",
      "orpc.resources.list.queryOptions",
    );
    const projectPreviewResourcesQuerySource = sourceBetween(
      projectDetailPageSource,
      "orpc.resources.list.queryOptions",
      "orpc.operatorWork.list.queryOptions",
    );
    const projectLifecycleDialogSource =
      projectDetailPageSource.match(
        /<Dialog\.Root bind:open={projectLifecycleDialogOpen}[\s\S]*?<Dialog\.Root\s+bind:open={environmentLifecycleDialogOpen}/,
      )?.[0] ?? "";
    const projectDeleteSafetyQuerySource = sourceBetween(
      projectDetailPageSource,
      "orpc.projects.deleteCheck.queryOptions",
      "const projectDeleteSafety = $derived",
    );
    const environmentLifecycleDialogSource =
      projectDetailPageSource.match(
        /<Dialog\.Root\s+bind:open={environmentLifecycleDialogOpen}[\s\S]*?<Dialog\.Root bind:open={projectRenameDialogOpen}/,
      )?.[0] ?? "";

    expect(projectSettingsSource).toContain("data-project-danger-display-surface");
    expect(projectSettingsSource).toContain("onclick={openProjectLifecycleDialog}");
    expect(projectSettingsSource).toContain("lifecycleManageAction");
    expect(projectSettingsSource).not.toContain('openProjectLifecycleDialog("archive")');
    expect(projectSettingsSource).not.toContain('openProjectLifecycleDialog("restore")');
    expect(projectSettingsSource).not.toContain('openProjectLifecycleDialog("delete")');
    expect(projectSettingsSource).not.toMatch(/<Button\b(?=[^>]*variant="destructive")[^>]*>/);
    expect(projectSettingsSource).not.toContain('id="project-delete-button"');
    expect(projectSettingsSource).not.toContain('id="project-archive-button"');
    expect(projectSettingsSource).not.toContain('id="project-restore-button"');
    expect(projectSettingsSource).not.toContain("archiveProjectMutation.mutate");
    expect(projectSettingsSource).not.toContain("restoreProjectMutation.mutate");
    expect(projectSettingsSource).not.toContain("deleteProjectMutation.mutate");
    expect(projectConsoleQueriesSource).toContain("health: false");
    expect(projectConsoleQueriesSource).toContain("readiness: false");
    expect(projectConsoleQueriesSource).toContain("version: false");
    expect(projectConsoleQueriesSource).toContain("serversQuery");
    expect(projectConsoleQueriesSource).not.toContain("servers: false");
    expect(projectConsoleQueriesSource).toContain("previewEnvironments: false");
    expect(projectConsoleQueriesSource).toContain("domainBindingsQuery");
    expect(projectConsoleQueriesSource).not.toContain("domainBindings: false");
    expect(projectConsoleQueriesSource).toContain("certificates: false");
    expect(projectConsoleQueriesSource).toContain("providers: false");
    expect(projectDetailPageSource).toContain("projectDomainBindings");
    expect(projectDetailPageSource).toContain("onDomainBindingVerificationFeedback");
    expect(projectPreviewEnvironmentsQuerySource).toContain('activeProjectTab === "previews"');
    expect(projectPreviewResourcesQuerySource).toContain('activeProjectTab === "previews"');
    expect(environmentsTabSource).toContain("openEnvironmentLifecycleDialog(environment)");
    expect(environmentsTabSource).toContain("lifecycleManageAction");
    expect(environmentsTabSource).not.toContain(
      'openEnvironmentLifecycleDialog(environment, "archive")',
    );
    expect(environmentsTabSource).not.toContain(
      'openEnvironmentLifecycleDialog(environment, "lock")',
    );
    expect(environmentsTabSource).not.toContain(
      'openEnvironmentLifecycleDialog(environment, "unlock")',
    );
    expect(environmentsTabSource).not.toContain("archiveEnvironmentMutation.mutate");
    expect(environmentsTabSource).not.toContain("lockEnvironmentMutation.mutate");
    expect(environmentsTabSource).not.toContain("unlockEnvironmentMutation.mutate");
    expect(projectLifecycleDialogSource).toContain('selectedProjectLifecycleAction = "archive"');
    expect(projectLifecycleDialogSource).toContain('selectedProjectLifecycleAction = "restore"');
    expect(projectLifecycleDialogSource).toContain('selectedProjectLifecycleAction = "delete"');
    expect(projectLifecycleDialogSource).toContain("lifecycleArchiveOption");
    expect(projectLifecycleDialogSource).toContain("lifecycleRestoreOption");
    expect(projectLifecycleDialogSource).toContain("lifecycleDeleteOption");
    expect(projectLifecycleDialogSource).toContain("onclick={submitProjectLifecycleAction}");
    expect(projectDeleteSafetyQuerySource).toContain("isProjectArchived");
    expect(projectDeleteSafetyQuerySource).toContain("projectDetailQuery.isSuccess");
    expect(projectDeleteSafetyQuerySource).not.toContain(
      "enabled: browser && projectId.length > 0",
    );
    expect(environmentLifecycleDialogSource).toContain(
      'selectedEnvironmentLifecycleAction = "archive"',
    );
    expect(environmentLifecycleDialogSource).toContain(
      'selectedEnvironmentLifecycleAction = "lock"',
    );
    expect(environmentLifecycleDialogSource).toContain(
      'selectedEnvironmentLifecycleAction = "unlock"',
    );
    expect(environmentLifecycleDialogSource).toContain("environmentLifecycleArchiveOption");
    expect(environmentLifecycleDialogSource).toContain("environmentLifecycleLockOption");
    expect(environmentLifecycleDialogSource).toContain("environmentLifecycleUnlockOption");
    expect(environmentLifecycleDialogSource).toContain('class="grid gap-2"');
    expect(environmentLifecycleDialogSource).not.toContain("sm:grid-cols-2");
    expect(
      environmentLifecycleDialogSource.match(/environmentLifecycleOptionButtonClass/g)?.length ?? 0,
    ).toBe(3);
    expect(
      environmentLifecycleDialogSource.match(/environmentLifecycleOptionTextClass/g)?.length ?? 0,
    ).toBe(3);
    expect(
      environmentLifecycleDialogSource.match(/environmentLifecycleOptionDescriptionClass/g)
        ?.length ?? 0,
    ).toBe(3);
    expect(projectDetailPageSource).toContain(
      "h-auto w-full min-w-0 items-start justify-start gap-3 whitespace-normal px-3 py-3 text-left",
    );
    expect(projectDetailPageSource).toContain(
      "min-w-0 flex-1 whitespace-normal break-words leading-snug",
    );
    expect(environmentLifecycleDialogSource).toContain(
      "onclick={submitEnvironmentLifecycleAction}",
    );
    expect(projectDetailPageSource).toContain("archiveProjectMutation.mutate");
    expect(projectDetailPageSource).toContain("restoreProjectMutation.mutate");
    expect(projectDetailPageSource).toContain("deleteProjectMutation.mutate");
    expect(projectDetailPageSource).toContain("archiveEnvironmentMutation.mutate");
    expect(projectDetailPageSource).toContain("lockEnvironmentMutation.mutate");
    expect(projectDetailPageSource).toContain("unlockEnvironmentMutation.mutate");
  });
});
