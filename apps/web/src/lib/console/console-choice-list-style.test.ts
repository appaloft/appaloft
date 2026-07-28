import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const consoleLayoutCssSource = readFileSync(
  fileURLToPath(new URL("../../routes/layout.css", import.meta.url)),
  "utf8",
);
const serverRegistrationFormSource = readFileSync(
  fileURLToPath(new URL("../components/console/ServerRegistrationForm.svelte", import.meta.url)),
  "utf8",
);

describe("Console selectable object list structure", () => {
  test("[CONSOLE-CHOICE-LIST-001] keeps shared selectable object lists on Tailwind white and blue surfaces", () => {
    expect(consoleLayoutCssSource).not.toContain(".console-choice-list");
    expect(consoleLayoutCssSource).not.toContain(".console-choice-item");
    expect(serverRegistrationFormSource).toContain("rounded-md border border-input bg-card p-2");
    expect(serverRegistrationFormSource).toContain("hover:bg-primary/5");
    expect(serverRegistrationFormSource).toContain("data-[selected=true]:bg-primary/5");
    expect(serverRegistrationFormSource).toContain("data-server-workload-role-selector");
    expect(serverRegistrationFormSource).toContain("data-server-role-option");
    expect(serverRegistrationFormSource).toContain('type="checkbox"');
    expect(serverRegistrationFormSource).toContain("focus-within:ring-2");
    expect(serverRegistrationFormSource).toContain("lg:grid-cols-3");
    expect(serverRegistrationFormSource).not.toContain("console-choice-list");
    expect(serverRegistrationFormSource).not.toContain("console-choice-item");
  });
});
