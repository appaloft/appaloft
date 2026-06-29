import { readFileSync } from "node:fs";
import { type SystemPluginWebExtension } from "@appaloft/contracts";
import { describe, expect, test } from "vitest";

import {
  consoleDomainErrorModalRenderer,
  consoleOperationIntentModalRenderer,
  consolePageRenderer,
  createLocalizedConsolePageEndpoint,
  findConsoleDomainErrorModalExtension,
  findConsoleOperationIntentModalExtension,
  findConsolePageExtensionByPath,
  findConsolePanelExtensionsByPlacement,
  readConsoleDomainErrorModalExtensionMetadata,
  readConsoleOperationIntentModalExtensionMetadata,
  readConsolePageExtensionMetadata,
  resolveConsoleDomainErrorModalEndpoint,
  resolveConsoleOperationIntentModalEndpoint,
  resolveConsolePageEndpoint,
  resolveConsolePageVisibilityEndpoint,
} from "./console-page-extension";

const consolePageExtension: SystemPluginWebExtension = {
  key: "example-console-page",
  pluginName: "example",
  pluginDisplayName: "Example",
  title: "Usage",
  path: "/usage",
  placement: "settings",
  target: "console-route",
  requiresAuth: true,
  metadata: {
    renderer: consolePageRenderer,
    pageEndpoint:
      "/example/usage-page?organizationId={organizationId}&path={pathname}&query={query}",
  },
};

const resourcePanelExtension: SystemPluginWebExtension = {
  ...consolePageExtension,
  key: "example-resource-panel",
  title: "Resource panel",
  path: "/resources",
  placement: "resource-detail-panel",
  metadata: {
    renderer: consolePageRenderer,
    pageEndpoint:
      "/example/resource-panel?projectId={projectId}&environmentId={environmentId}&resourceId={resourceId}",
  },
};

const domainErrorModalExtension: SystemPluginWebExtension = {
  ...consolePageExtension,
  key: "example-domain-error-modal",
  title: "Resolve error",
  path: "/settings",
  placement: "domain-error-modal",
  metadata: {
    renderer: consoleDomainErrorModalRenderer,
    pageEndpoint:
      "/example/domain-error-modal?organizationId={organizationId}&errorCode={errorCode}&requestPath={requestPath}",
    errorCodes: ["plan_limit_exceeded"],
  },
};

const operationIntentModalExtension: SystemPluginWebExtension = {
  ...consolePageExtension,
  key: "example-operation-intent-modal",
  title: "Operation intent",
  path: "/operation-intent",
  placement: "operation-intent-modal",
  metadata: {
    renderer: consoleOperationIntentModalRenderer,
    operationKey: "servers.register",
    intent: "create-server",
    pageEndpoint:
      "/example/operation-intent?organizationId={organizationId}&operationKey={operationKey}&intent={intent}",
    visibilityEndpoint:
      "/example/operation-intent/visibility?organizationId={organizationId}&currentServerCount={currentServerCount}",
  },
};

describe("Console page extension surface", () => {
  test("[CONSOLE-EXT-PAGE-001] discovers neutral console page extension metadata by route", () => {
    expect(findConsolePageExtensionByPath([consolePageExtension], "/usage")).toEqual(
      consolePageExtension,
    );
    expect(findConsolePageExtensionByPath([consolePageExtension], "/usage/")).toEqual(
      consolePageExtension,
    );
    expect(findConsolePageExtensionByPath([consolePageExtension], "/usage/details")).toEqual(
      consolePageExtension,
    );
    expect(readConsolePageExtensionMetadata(consolePageExtension)).toEqual({
      renderer: "console-page",
      pageEndpoint:
        "/example/usage-page?organizationId={organizationId}&path={pathname}&query={query}",
    });
    expect(findConsolePageExtensionByPath([consolePageExtension], "/other")).toBeNull();
  });

  test("[CONSOLE-EXT-PAGE-001] resolves organization template variables without exposing private code", () => {
    const metadata = readConsolePageExtensionMetadata(consolePageExtension);

    expect(
      resolveConsolePageEndpoint(metadata, {
        pathname: "/usage",
        query: "range=30d&type=debit",
        organization: {
          organizationId: "org_123",
          slug: "acme-team",
          name: "Acme Team",
          role: "billing",
        },
      }),
    ).toBe(
      "/example/usage-page?organizationId=org_123&path=%2Fusage&query=range%3D30d%26type%3Ddebit",
    );
  });

  test("[CONSOLE-EXT-PAGE-001] appends locale to extension page endpoints", () => {
    expect(
      createLocalizedConsolePageEndpoint(
        "/example/usage-page?organizationId=org_123&path=%2Fusage",
        "en-US",
      ),
    ).toBe("/example/usage-page?organizationId=org_123&path=%2Fusage&locale=en-US");
    expect(createLocalizedConsolePageEndpoint("/example/usage-page#panel", "zh-CN")).toBe(
      "/example/usage-page?locale=zh-CN#panel",
    );
    expect(
      createLocalizedConsolePageEndpoint("https://app.example.test/page?tab=connections", "en-US"),
    ).toBe("https://app.example.test/page?tab=connections&locale=en-US");
  });

  test("[CONSOLE-EXT-PAGE-003] resolves owner-scoped console panel template variables", () => {
    const metadata = readConsolePageExtensionMetadata(resourcePanelExtension);

    expect(
      resolveConsolePageEndpoint(metadata, {
        pathname: "/resources/res_123",
        query: "tab=dependencies",
        organization: {
          organizationId: "org_123",
          slug: "acme-team",
        },
        projectId: "proj_123",
        environmentId: "env_staging",
        resourceId: "res_123",
      }),
    ).toBe(
      "/example/resource-panel?projectId=proj_123&environmentId=env_staging&resourceId=res_123",
    );
  });

  test("[CONSOLE-EXT-PAGE-004] resolves neutral domain-error modal extensions", () => {
    const modalHostSource = readFileSync(
      new URL("../components/console/ConsoleDomainErrorModalHost.svelte", import.meta.url),
      "utf8",
    );

    expect(
      findConsoleDomainErrorModalExtension([domainErrorModalExtension], "plan_limit_exceeded"),
    ).toEqual(domainErrorModalExtension);
    expect(
      findConsoleDomainErrorModalExtension([domainErrorModalExtension], "other_error"),
    ).toBeNull();

    const metadata = readConsoleDomainErrorModalExtensionMetadata(domainErrorModalExtension);
    expect(metadata).toEqual({
      renderer: "console-domain-error-modal",
      pageEndpoint:
        "/example/domain-error-modal?organizationId={organizationId}&errorCode={errorCode}&requestPath={requestPath}",
      errorCodes: ["plan_limit_exceeded"],
    });
    expect(
      resolveConsoleDomainErrorModalEndpoint(metadata, {
        pathname: "/servers",
        organization: {
          organizationId: "org_123",
        },
        error: {
          code: "plan_limit_exceeded",
          status: 400,
          requestPath: "/api/servers",
        },
      }),
    ).toBe(
      "/example/domain-error-modal?organizationId=org_123&errorCode=plan_limit_exceeded&requestPath=%2Fapi%2Fservers",
    );
    expect(modalHostSource).toContain(
      'class="max-h-[calc(100vh-12rem)] overflow-y-auto px-0 pb-5"',
    );
    expect(modalHostSource).not.toContain(
      'class="max-h-[calc(100vh-12rem)] overflow-y-auto px-5 pb-5"',
    );
  });

  test("[CONSOLE-EXT-PAGE-005] resolves neutral operation intent modal extensions", () => {
    expect(
      findConsoleOperationIntentModalExtension([operationIntentModalExtension], {
        operationKey: "servers.register",
        intent: "create-server",
      }),
    ).toEqual(operationIntentModalExtension);
    expect(
      findConsoleOperationIntentModalExtension([operationIntentModalExtension], {
        operationKey: "projects.create",
        intent: "create-project",
      }),
    ).toBeNull();

    const metadata = readConsoleOperationIntentModalExtensionMetadata(
      operationIntentModalExtension,
    );
    expect(metadata).toEqual({
      renderer: "console-operation-intent-modal",
      pageEndpoint:
        "/example/operation-intent?organizationId={organizationId}&operationKey={operationKey}&intent={intent}",
      operationKey: "servers.register",
      intent: "create-server",
    });
    expect(
      resolveConsoleOperationIntentModalEndpoint(metadata, {
        pathname: "/servers",
        organization: {
          organizationId: "org_123",
        },
        currentServerCount: 2,
      }),
    ).toBe(
      "/example/operation-intent?organizationId=org_123&operationKey=servers.register&intent=create-server",
    );
    expect(
      resolveConsolePageVisibilityEndpoint(operationIntentModalExtension, {
        pathname: "/servers",
        organization: {
          organizationId: "org_123",
        },
        currentServerCount: 2,
      }),
    ).toBe("/example/operation-intent/visibility?organizationId=org_123&currentServerCount=2");
  });

  test("[CONSOLE-EXT-PAGE-003] discovers console panel extensions by placement", () => {
    expect(
      findConsolePanelExtensionsByPlacement(
        [consolePageExtension, resourcePanelExtension],
        "resource-detail-panel",
      ),
    ).toEqual([resourcePanelExtension]);
    expect(
      findConsolePanelExtensionsByPlacement(
        [consolePageExtension, resourcePanelExtension],
        "project-environment-panel",
      ),
    ).toEqual([]);
  });

  test("[CONSOLE-EXT-PAGE-002] renderer supports neutral panel fields and request body bindings", () => {
    const rendererSource = readFileSync(
      new URL("../components/console/ConsoleExtensionPage.svelte", import.meta.url),
      "utf8",
    );
    const tableFilterSelectSource = readFileSync(
      new URL("../components/console/ConsoleTableFilterSelect.svelte", import.meta.url),
      "utf8",
    );
    const rendererSurface = `${rendererSource}\n${tableFilterSelectSource}`;

    expect(rendererSource).toContain('type: "number" | "range" | "range-number"');
    expect(rendererSource).toContain("data-console-page-panel-field");
    expect(rendererSource).toContain("data-console-page-record-list");
    expect(rendererSource).toContain("data-console-page-record-row");
    expect(rendererSource).toContain("cells?: Record<string, ConsolePageTableCellValue>");
    expect(rendererSource).toContain("row.cells?.[key] ?? row[key]");
    expect(rendererSource).toContain("isConsolePageDisplayValue(value)");
    expect(rendererSource).toContain('type?: "buttons" | "multi-select"');
    expect(rendererSource).toContain("icon?: ConsolePageIcon");
    expect(rendererSurface).toContain("data-console-page-table-filter-select");
    expect(rendererSurface).toContain('role="menuitemcheckbox"');
    expect(rendererSurface).toContain("event.stopPropagation()");
    expect(rendererSurface).toContain("iconComponent(filter.icon)");
    expect(rendererSurface).toContain("<DropdownMenu.Root bind:open>");
    expect(rendererSource).toContain('kind: "actor"');
    expect(rendererSource).toContain('kind: "badge"');
    expect(rendererSource).toContain('kind: "icon-label"');
    expect(rendererSource).toContain('kind: "link"');
    expect(rendererSource).toContain("isConsolePageIconLabelValue(cell.text)");
    expect(rendererSource).toContain("iconComponent(cell.text.icon)");
    expect(rendererSource).toContain("actorInitials(cell.text)");
    expect(rendererSource).toContain("badgeClass(cell.text.tone ?? cell.tone)");
    expect(rendererSource).toContain("href={cell.text.href}");
    expect(rendererSource).toContain("href?: string");
    expect(rendererSource).toContain("row.details?.href");
    expect(rendererSource).toContain("navigateConsolePageHref(row.details.href)");
    expect(rendererSource).toContain("align-middle");
    expect(rendererSource).toContain('kind: "datetime"');
    expect(rendererSource).toContain('format?: "short" | "date-time"');
    expect(rendererSource).toContain("formatConsoleDateTime(value)");
    expect(rendererSource).toContain("new Intl.DateTimeFormat($locale || undefined");
    expect(rendererSource).toContain("displayValueText(cell.text)");
    expect(rendererSource).toContain("displayValueText(row.value)");
    expect(rendererSource).toContain('kind: "dialog-panel-grid"');
    expect(rendererSource).toContain('layout?: "grid" | "comparison-table"');
    expect(rendererSource).toContain("data-console-page-dialog-comparison-table");
    expect(rendererSource).toContain('{#if section.layout === "comparison-table"}');
    expect(rendererSource).toContain("{@render panelGridComparisonTable(section)}");
    expect(rendererSource).toContain('class="min-w-32 border-l px-3 py-3 text-center align-top"');
    expect(rendererSource).toContain('class="flex min-h-9 items-center justify-center"');
    expect(rendererSource).toContain(
      '{@render panelGridItems(section.items, "grid gap-4 md:grid-cols-2 xl:grid-cols-3")}',
    );
    expect(rendererSource).toContain('kind: "integration-catalog"');
    expect(rendererSource).toContain('layout?: "catalog-grid" | "settings-list"');
    expect(rendererSource).toContain("src?: string");
    expect(rendererSource).toContain("data-console-page-integration-catalog");
    expect(rendererSource).toContain("data-console-page-integration-list");
    expect(rendererSource).toContain("data-console-page-integration-card");
    expect(rendererSource).toContain("data-console-page-integration-icon-image");
    expect(rendererSource).toContain("data-console-page-integration-details-trigger");
    expect(rendererSource).toContain("data-console-page-integration-details");
    expect(rendererSource).toContain(
      'class="mt-5 space-y-5 px-5 pb-5 sm:px-8 sm:pb-8" data-console-page-integration-details',
    );
    expect(rendererSource).toContain("integrationInitials(item)");
    expect(rendererSource).toContain("integrationStatusClass(item.status.tone)");
    expect(rendererSource).toContain("openIntegrationDetails(item.details)");
    expect(rendererSource).toContain("bind:open={integrationDetailsOpen}");
    expect(rendererSource).toContain("openPanelGridDialog(section)");
    expect(rendererSource).toContain("bind:open={panelGridDialogOpen}");
    expect(rendererSource).toContain("data-console-page-dialog-panel-body");
    expect(rendererSource).toContain("px-5 pb-5 sm:px-8 sm:pb-8");
    expect(rendererSource).toContain("fieldBindings?: Record<string, string>");
    expect(rendererSource).toContain("autoRun?: boolean");
    expect(rendererSource).toContain("confirmation?:");
    expect(rendererSource).toContain("confirmationOpen = true");
    expect(rendererSource).toContain("confirmRequestAction");
    expect(rendererSource).not.toContain("window.confirm");
    expect(rendererSource).toContain("findAutoRunRequestAction(pageDocument)");
    expect(rendererSource).toContain("void runRequestAction(entry.action, entry.item)");
    expect(rendererSource).toContain("requestActionBody(action, item)");
    expect(rendererSource).toContain('kind: "tiered-unit-rate"');
    expect(rendererSource).toContain("<table");
    expect(rendererSource).toContain("<thead");
    expect(rendererSource).toContain("<tfoot");
    expect(rendererSource.indexOf("<tfoot")).toBeGreaterThan(rendererSource.indexOf("</tbody>"));
    expect(rendererSource).not.toContain(
      '<p class="text-xs leading-5 text-muted-foreground">{item.description}</p>',
    );
    expect(rendererSource).toContain("title?: string");
    expect(rendererSource).toContain('import { goto } from "$app/navigation";');
    expect(rendererSource).toContain('settingsScope?: "organization" | "instance" | null');
    expect(rendererSource).toContain("embedded?: boolean");
    expect(rendererSource).toContain('class={embedded ? "max-w-none p-0" : "max-w-7xl"}');
    expect(rendererSource).toContain('"space-y-4"');
    expect(rendererSource).toContain("{#if section.title || section.description}");
    expect(rendererSource).toContain("data-console-page-tab-radio");
    expect(rendererSource).toContain('"inline-flex h-9 items-center gap-2 rounded-md px-3');
    expect(rendererSource).toContain('"border-primary"');
    expect(rendererSource).toContain('"border-muted-foreground/40"');
    expect(rendererSource).toContain('<span class="size-1.5 rounded-full bg-primary"></span>');
    expect(rendererSource).toContain('<div class="console-panel overflow-hidden">');
    expect(rendererSource).toContain('class="overflow-x-auto" data-console-page-table-body');
    expect(rendererSource).toContain('<div class="p-5 text-sm text-muted-foreground">');
    expect(rendererSource).toContain(
      '<div class="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">',
    );
    expect(rendererSource).toContain("{#if !embedded}");
    expect(rendererSource).toContain("{#if embedded}");
    expect(rendererSource).toContain("projectId?: string");
    expect(rendererSource).toContain("resourceId?: string");
    expect(rendererSource).toContain("items={instanceSettingsItems");
    expect(rendererSource).toContain("placeholderData: (previousData) => previousData");
    expect(rendererSource).toContain("navigateConsolePageHref(filter.href)");
    expect(rendererSource).toContain("noScroll: true");
    expect(rendererSource).not.toContain("href={filter.href}");
    expect(rendererSource).not.toContain("<Table.Root");
    expect(rendererSource).not.toContain('from "$lib/components/ui/table"');
  });

  test("[CONSOLE-EXT-PAGE-003] embeds owner-scoped console panel hosts in project and resource pages", () => {
    const panelHostSource = readFileSync(
      new URL("../components/console/ConsoleExtensionPanelHost.svelte", import.meta.url),
      "utf8",
    );
    const projectPageSource = readFileSync(
      new URL("../../routes/projects/[projectId=consoleObjectId]/+page.svelte", import.meta.url),
      "utf8",
    );
    const resourcePageSource = readFileSync(
      new URL("../../routes/resources/[resourceId=consoleObjectId]/+page.svelte", import.meta.url),
      "utf8",
    );

    expect(panelHostSource).toContain("data-console-extension-panel-host");
    expect(panelHostSource).toContain("findConsolePanelExtensionsByPlacement");
    expect(panelHostSource).toContain("projectId");
    expect(panelHostSource).toContain("environmentId");
    expect(panelHostSource).toContain("resourceId");
    expect(panelHostSource).toContain("type ConsolePageRequestAction");
    expect(panelHostSource).toContain("collapsedByDefault?: boolean");
    expect(panelHostSource).toContain("expandedPanelKeys");
    expect(panelHostSource).toContain("resolvePanelExtensionVisibilityEndpoint");
    expect(panelHostSource).toContain("togglePanel(result)");
    expect(panelHostSource).toContain("runRequestAction(action, item)");
    expect(panelHostSource).toContain("data-console-extension-panel-host");
    expect(projectPageSource).toContain('placement="project-environment-panel"');
    expect(projectPageSource).toContain('"audit-log"');
    expect(projectPageSource).toContain("visibleProjectDetailTabs");
    expect(projectPageSource).toContain("detailTabPanelFlushClass");
    expect(projectPageSource).toContain(
      '<Tabs.Content value="audit-log" class={detailTabPanelFlushClass}>',
    );
    expect(projectPageSource).toContain("<ConsoleExtensionPage {projectId} embedded />");
    expect(projectPageSource).toContain("environmentId={environment.id}");
    expect(resourcePageSource).toContain('placement="resource-detail-panel"');
    expect(resourcePageSource).toContain('"audit-log"');
    expect(resourcePageSource).toContain("visibleResourceDetailTabs");
    expect(resourcePageSource).toContain("detailTabPanelFlushClass");
    expect(resourcePageSource).toContain("<div class={detailTabPanelFlushClass}>");
    expect(resourcePageSource).toContain("<ConsoleExtensionPage");
    expect(resourcePageSource).toContain("embedded");
    expect(resourcePageSource).toContain("projectId={resourceProjectId}");
    expect(resourcePageSource).toContain("environmentId={resourceEnvironmentId}");
  });

  test("[CONSOLE-EXT-PAGE-004] includes owner-scoped route pages for audit-style console pages", () => {
    const projectAuditRouteSource = readFileSync(
      new URL(
        "../../routes/projects/[projectId=consoleObjectId]/audit-log/+page.svelte",
        import.meta.url,
      ),
      "utf8",
    );
    const resourceAuditRouteSource = readFileSync(
      new URL(
        "../../routes/resources/[resourceId=consoleObjectId]/audit-log/+page.svelte",
        import.meta.url,
      ),
      "utf8",
    );
    const nestedResourceAuditRouteSource = readFileSync(
      new URL(
        "../../routes/projects/[projectId=consoleObjectId]/environments/[environmentId=consoleObjectId]/resources/[resourceId=consoleObjectId]/audit-log/+page.svelte",
        import.meta.url,
      ),
      "utf8",
    );

    expect(projectAuditRouteSource).toContain("<ConsoleExtensionPage {projectId} />");
    expect(resourceAuditRouteSource).toContain("<ConsoleExtensionPage {resourceId} />");
    expect(nestedResourceAuditRouteSource).toContain(
      "<ConsoleExtensionPage {projectId} {environmentId} {resourceId} />",
    );
  });

  test("[CONSOLE-EXT-PAGE-006] endpoint overrides render without route extension metadata", () => {
    const rendererSource = readFileSync(
      new URL("../components/console/ConsoleExtensionPage.svelte", import.meta.url),
      "utf8",
    );

    expect(rendererSource).toContain("enabled: browser && !pageEndpointOverride");
    expect(rendererSource).toContain("pageEndpointOverride ??");
    expect(rendererSource).toContain("createLocalizedConsolePageEndpoint(pageEndpoint, $locale)");
    expect(rendererSource).toContain('queryKey: ["console-extension-page", localizedPageEndpoint]');
    expect(rendererSource).toContain(
      "!pageEndpointOverride && (!extension || !metadata || !pageEndpoint)",
    );
  });
});
