import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

const dashboardRoot = new URL("..", import.meta.url);

async function sourceFiles(directory: URL): Promise<URL[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);

      if (entry.isDirectory()) {
        return sourceFiles(child);
      }

      return [child];
    }),
  );

  return files.flat();
}

describe("Dashboard foundation", () => {
  test("[DASH-FOUND-001] is an independently buildable static SvelteKit workspace", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("package.json", dashboardRoot), "utf8"),
    ) as {
      name?: string;
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const svelteConfig = await readFile(new URL("svelte.config.js", dashboardRoot), "utf8");
    const routeLayout = await readFile(new URL("src/routes/+layout.ts", dashboardRoot), "utf8");

    expect(packageJson.name).toBe("@appaloft/dashboard");
    expect(packageJson.scripts?.build).toBeTruthy();
    expect(packageJson.devDependencies?.["@appaloft/design"]).toBe("workspace:*");
    expect(packageJson.devDependencies?.["@appaloft/ui"]).toBe("workspace:*");
    expect(packageJson.devDependencies?.["@appaloft/i18n"]).toBe("workspace:*");
    expect(svelteConfig).toContain("@sveltejs/adapter-static");
    expect(svelteConfig).toContain('fallback: "200.html"');
    expect(routeLayout).toContain("export const ssr = false");
  });

  test("[DASH-FOUND-001] never imports legacy apps/web source", async () => {
    const files = await sourceFiles(new URL("src/", dashboardRoot));
    const source = (
      await Promise.all(
        files
          .filter((file) => /\.(svelte|ts|css|html)$/.test(file.pathname))
          .map((file) => readFile(file, "utf8")),
      )
    ).join("\n");

    expect(source).not.toMatch(/apps\/web|@appaloft\/web/);
    expect(source).toContain("@appaloft/design");
    expect(source).toContain("@appaloft/ui");
  });
});
