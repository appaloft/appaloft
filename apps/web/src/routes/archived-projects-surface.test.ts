import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const homePageSource = readFileSync(
  fileURLToPath(new URL("./+page.svelte", import.meta.url)),
  "utf8",
);
const projectsPageSource = readFileSync(
  fileURLToPath(new URL("./projects/+page.svelte", import.meta.url)),
  "utf8",
);
const consoleShellSource = readFileSync(
  fileURLToPath(new URL("../lib/components/console/ConsoleShell.svelte", import.meta.url)),
  "utf8",
);
const organizationPageSource = readFileSync(
  fileURLToPath(new URL("./organization/+page.svelte", import.meta.url)),
  "utf8",
);
const organizationArchivedProjectsRouteSource = readFileSync(
  fileURLToPath(new URL("./organization/archived-projects/+page.svelte", import.meta.url)),
  "utf8",
);
const settingsNavSource = readFileSync(
  fileURLToPath(new URL("../lib/console/settings-nav.ts", import.meta.url)),
  "utf8",
);

describe("archived project surfaces", () => {
  test("[PROJ-LIFE-WEB-DEFAULT-001] default project surfaces rely on backend active-only list semantics", () => {
    expect(homePageSource).toContain("orpcClient.projects.list({ limit: homeProjectListLimit })");
    expect(projectsPageSource).toMatch(
      /createConsoleQueries\(browser,\s*\{[\s\S]*projects:\s*false[\s\S]*\}\)/,
    );
    expect(projectsPageSource).toContain(
      "orpcClient.projects.list({ limit: projectPageSize, offset: projectOffset })",
    );
    expect(consoleShellSource).toContain("projectsQuery.data?.items ?? []");
    expect(homePageSource).not.toContain('lifecycleStatus === "archived"');
    expect(projectsPageSource).not.toContain('lifecycleStatus === "archived"');
    expect(consoleShellSource).not.toContain('lifecycleStatus === "archived"');
    expect(homePageSource).not.toContain("activeProjects(");
    expect(projectsPageSource).not.toContain("activeProjects(");
    expect(consoleShellSource).not.toContain("activeProjects(");
  });

  test("[PROJ-LIFE-WEB-ARCHIVED-001] organization settings has an explicit archived projects section", () => {
    expect(settingsNavSource).toContain('href: "/organization/archived-projects"');
    expect(settingsNavSource).toContain("i18nKeys.console.organization.archivedProjectsTitle");
    expect(organizationArchivedProjectsRouteSource).toContain(
      '<OrganizationPage section="archived-projects" />',
    );
    expect(organizationPageSource).toContain(
      'orpcClient.projects.list({ lifecycleStatus: "archived", limit: 100 })',
    );
    expect(organizationPageSource).toContain('activeSection === "archived-projects"');
  });
});
