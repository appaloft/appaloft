import { readdir, readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

async function readTree(directory: URL): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const values = await Promise.all(
    entries.map(async (entry) => {
      const child = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      if (entry.isDirectory()) return readTree(child);
      return entry.name === "app.html" ? "" : readFile(child, "utf8");
    }),
  );
  return values.join("\n");
}

describe("dashboard-v2 design governance", () => {
  test("[DASH-VIS-002] keeps DESIGN and semantic token values in sync", async () => {
    const css = await readFile(
      new URL("../../../packages/design/styles/dashboard.css", import.meta.url),
      "utf8",
    );
    const design = await readFile(
      new URL("../../../packages/design/DESIGN.md", import.meta.url),
      "utf8",
    );

    const contract = [
      ['data-console-preset="dashboard-v2"', "dashboard-v2"],
      ["--primary: #4e84ff", "Appaloft blue"],
      ["--radius: 0.625rem", "10px control radius"],
      ["--radius-card: 1rem", "14-16px card radius"],
      ["--radius-panel: 1.125rem", "16-18px panel radius"],
      ["--background: #fbfcff", "near-white luminous Light"],
      ["--background: #20212c", "lifted warm-charcoal Dark"],
      ["--ambient-blue:", "--ambient-blue"],
      ["--ambient-cyan:", "--ambient-cyan"],
      ["--ambient-violet:", "--ambient-violet"],
      ["--icon-blue:", "--icon-blue"],
      ["--icon-cyan:", "--icon-cyan"],
      ["--icon-violet:", "--icon-violet"],
    ] as const;

    for (const [token, documentation] of contract) {
      expect(css).toContain(token);
      expect(design).toContain(documentation);
    }
  });

  test("[DASH-VIS-001] keeps app components on semantic tokens and clean-room language", async () => {
    const source = await readTree(new URL("../src/", import.meta.url));

    expect(source).not.toMatch(/apps\/web|@appaloft\/web/);
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(source).not.toMatch(/\b(?:railway|openship|kun)\b/i);
    expect(source).not.toMatch(/(?:bg|from|via|to)-gradient/);
    expect(source).toContain("@appaloft/design/styles/dashboard.css");
  });

  test("[DASH-VIS-005] keeps luminous depth shell-scoped and semantic", async () => {
    const css = await readFile(
      new URL("../../../packages/design/styles/dashboard.css", import.meta.url),
      "utf8",
    );
    const source = await readTree(new URL("../src/", import.meta.url));

    expect(css).toContain(".dashboard-shell");
    expect(css).toContain("radial-gradient(");
    expect(css).not.toContain("linear-gradient(");
    expect(source).toContain("data-icon-surface");
    expect(source).not.toMatch(/(?:bg|text)-(?:blue|cyan|violet|purple)-[1-9]00/);
  });

  test("[DASH-A11Y-005] keeps a reduced-motion fallback in the dashboard preset", async () => {
    const dashboardCss = await readFile(
      new URL("../../../packages/design/styles/dashboard.css", import.meta.url),
      "utf8",
    );

    expect(dashboardCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(dashboardCss).toContain("animation-duration: 0.01ms !important");
  });
});
