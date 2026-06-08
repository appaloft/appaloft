import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

async function collectSourceFiles(directory: URL): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      if (entry.isDirectory()) {
        return collectSourceFiles(entryUrl);
      }

      return [entryUrl.pathname];
    }),
  );

  return files.flat();
}

describe("console modal interactions", () => {
  test("[CONSOLE-MODAL-001] uses shadcn-svelte modal components instead of browser blocking dialogs", async () => {
    const sourceRoot = new URL("../../", import.meta.url);
    const sourceFiles = (await collectSourceFiles(sourceRoot)).filter(
      (filePath) =>
        /\.(svelte|ts)$/.test(filePath) &&
        !filePath.endsWith(".test.ts") &&
        !filePath.endsWith(".d.ts"),
    );
    const nativeDialogPattern = /\b(?:window\s*\.\s*)?(?:alert|confirm|prompt)\s*\(/;
    const offenders: string[] = [];

    await Promise.all(
      sourceFiles.map(async (filePath) => {
        const source = await readFile(filePath, "utf8");
        if (nativeDialogPattern.test(source)) {
          offenders.push(join("src", filePath.split("/src/")[1] ?? filePath));
        }
      }),
    );

    expect(offenders).toEqual([]);
  });

  test("[CONSOLE-MODAL-002] mounts a shared AlertDialog/Dialog interaction host", async () => {
    const [layoutSource, hostSource, modalApiSource] = await Promise.all([
      readFile(new URL("../../routes/+layout.svelte", import.meta.url), "utf8"),
      readFile(
        new URL("../../lib/components/console/ConsoleModalInteractionHost.svelte", import.meta.url),
        "utf8",
      ),
      readFile(new URL("./modal-interaction.ts", import.meta.url), "utf8"),
    ]);

    expect(layoutSource).toContain("ConsoleModalInteractionHost");
    expect(hostSource).toContain("$lib/components/ui/alert-dialog");
    expect(hostSource).toContain("Dialog.Content");
    expect(modalApiSource).toContain("requestConsoleConfirm");
    expect(modalApiSource).toContain("requestConsolePrompt");
  });
});
