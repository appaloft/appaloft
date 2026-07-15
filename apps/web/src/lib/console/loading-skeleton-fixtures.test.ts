import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

type LoadingSurface = {
  path: string;
  marker: string;
  end: string;
  minimumSkeletons: number;
  fixtureValues: string[];
};

const loadingSurfaces: LoadingSurface[] = [
  {
    path: "../../routes/servers/+page.svelte",
    marker: "data-server-list-skeleton",
    end: "{:else if visibleServers.length === 0}",
    minimumSkeletons: 2,
    fixtureValues: ["edge-1.example.com", "ready · 4 resources"],
  },
  {
    path: "../../routes/dependency-resources/+page.svelte",
    marker: "data-dependency-resource-list-skeleton",
    end: "{:else if dependencyResourcesError}",
    minimumSkeletons: 2,
    fixtureValues: ["postgres-main", "postgres · ready"],
  },
  {
    path: "../../routes/domain-bindings/+page.svelte",
    marker: "data-domain-binding-list-skeleton",
    end: "{:else}",
    minimumSkeletons: 3,
    fixtureValues: ["app.example.com", "pending_verification", "Sample"],
  },
  {
    path: "../../routes/preview-environments/+page.svelte",
    marker: "data-preview-environment-list-skeleton",
    end: "{:else if previewEnvironments.length === 0}",
    minimumSkeletons: 3,
    fixtureValues: [">3<", "org/repo #42", "Sample preview environment"],
  },
  {
    path: "../../routes/projects/[projectId=consoleObjectId]/+page.svelte",
    marker: "data-project-detail-loading-skeleton",
    end: "{:else if !project}",
    minimumSkeletons: 5,
    fixtureValues: ["Environment {groupIndex + 1}"],
  },
  {
    path: "../../routes/servers/[serverId=consoleObjectId]/+page.svelte",
    marker: "data-server-detail-loading-skeleton",
    end: "{:else if !server}",
    minimumSkeletons: 4,
    fixtureValues: [
      "host.example.com · ssh credential ready",
      "Sample value",
      "Server overview content",
    ],
  },
  {
    path: "../../routes/resources/[resourceId=consoleObjectId]/+page.svelte",
    marker: "data-resource-detail-loading-skeleton",
    end: "{:else if !resource}",
    minimumSkeletons: 4,
    fixtureValues: [
      "Resource name",
      "Resource overview for skeleton capture.",
      "Ready",
      "Resource detail content",
    ],
  },
  {
    path: "../../routes/deployments/[deploymentId=deploymentId]/+page.svelte",
    marker: "data-deployment-detail-loading-skeleton",
    end: "{:else if !deployment}",
    minimumSkeletons: 4,
    fixtureValues: [
      "Deployment source",
      "Attempt snapshot for skeleton capture.",
      "Sample",
      "Access and observation panels",
    ],
  },
  {
    path: "../../routes/domain-bindings/[domainBindingId=consoleObjectId]/+page.svelte",
    marker: "data-domain-binding-detail-loading-skeleton",
    end: "{:else if !selectedDomainBinding}",
    minimumSkeletons: 3,
    fixtureValues: [
      "app.example.com",
      "Domain binding detail",
      "pending_verification · path / · edge",
    ],
  },
  {
    path: "../../routes/dependency-resources/[dependencyResourceId=consoleObjectId]/+page.svelte",
    marker: "data-dependency-resource-detail-loading-skeleton",
    end: "{:else if dependencyResourceError}",
    minimumSkeletons: 3,
    fixtureValues: ["postgres-main", "Dependency resource detail", "postgres · ready"],
  },
  {
    path: "../../routes/preview-environments/[previewEnvironmentId=consoleObjectId]/+page.svelte",
    marker: "data-preview-environment-detail-loading-skeleton",
    end: "{:else if previewEnvironmentQuery.error || !previewEnvironment}",
    minimumSkeletons: 4,
    fixtureValues: ["Active", "pev_sample_preview", "org/repo #42", "Sample preview detail"],
  },
  {
    path: "../../routes/preview-policies/+page.svelte",
    marker: "data-preview-policy-loading-skeleton",
    end: "{:else if projects.length === 0}",
    minimumSkeletons: 3,
    fixtureValues: [
      "Project · sample-project",
      "Configured · without-secrets",
      "Same-repo previews enabled",
    ],
  },
  {
    path: "../../routes/marketplace/[slug]/+page.svelte",
    marker: "data-blueprint-detail-loading-skeleton",
    end: "{:else if !catalogMetadata}",
    minimumSkeletons: 3,
    fixtureValues: [
      "Blueprint title",
      "Sample marketplace blueprint detail.",
      "One-click install actions",
    ],
  },
  {
    path: "../../routes/installed-applications/[applicationId=consoleObjectId]/+page.svelte",
    marker: "data-installed-application-detail-loading-skeleton",
    end: "{:else if installedApplicationQuery.error || !installedApplication}",
    minimumSkeletons: 3,
    fixtureValues: [
      "Sample Application",
      "Installed application detail",
      "running · marketplace install",
    ],
  },
];

function sourceBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);

  expect(startIndex, `missing loading marker: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `missing loading branch end after: ${start}`).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
}

function expectFixtureValueWrapped(source: string, fixtureValue: string): void {
  let fixtureIndex = source.indexOf(fixtureValue);
  expect(fixtureIndex, `missing fixture value: ${fixtureValue}`).toBeGreaterThanOrEqual(0);

  while (fixtureIndex >= 0) {
    const skeletonStart = source.lastIndexOf("<ConsoleDataSkeleton", fixtureIndex);
    const skeletonEnd = source.lastIndexOf("</ConsoleDataSkeleton>", fixtureIndex);

    expect(
      skeletonStart,
      `fixture value is not inside ConsoleDataSkeleton: ${fixtureValue}`,
    ).toBeGreaterThan(skeletonEnd);

    fixtureIndex = source.indexOf(fixtureValue, fixtureIndex + fixtureValue.length);
  }
}

describe("console loading skeleton fixture visibility", () => {
  test("[CONSOLE-LOADING-SKELETON-001] loading surfaces hide every fixture value behind granular data skeletons", async () => {
    for (const surface of loadingSurfaces) {
      const source = await readFile(new URL(surface.path, import.meta.url), "utf8");
      const loadingSource = sourceBetween(source, surface.marker, surface.end);
      const skeletonCount = loadingSource.match(/<ConsoleDataSkeleton\b/g)?.length ?? 0;

      expect(skeletonCount, `not enough data skeletons in ${surface.path}`).toBeGreaterThanOrEqual(
        surface.minimumSkeletons,
      );

      for (const fixtureValue of surface.fixtureValues) {
        expectFixtureValueWrapped(loadingSource, fixtureValue);
      }
    }
  });
});
