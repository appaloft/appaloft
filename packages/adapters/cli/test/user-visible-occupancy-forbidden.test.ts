import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { publicDocsHelpTopics } from "@appaloft/docs-registry";
import { SHELL_OCCUPANCY_PROGRESS } from "../../../../apps/shell/src/occupancy-cli-progress.ts";
import {
  OCCUPANCY_FIRST_FRAME_CHROME,
  OCCUPANCY_FIRST_FRAME_TITLE,
  occupancyFirstFrameBytes,
} from "../../../../apps/shell/src/occupancy-tui-first-frame.ts";
import { enUS, zhCN } from "../../../i18n/src/resources.ts";
import { CODE_OPTION_DESCRIPTIONS, formatCodeHelp } from "../src/code-help.js";
import { cliCommandDescriptions } from "../src/commands/docs-help.js";
import { occupancyAvailableDoorHint } from "../src/occupancy-chrome.js";
import {
  OCCUPANCY_CODE_CHROME_TITLE,
  OCCUPANCY_CODE_PROGRESS,
  OCCUPANCY_PREPARE_STEP_LABELS,
  occupancyChromeHasForbiddenWord,
  occupancyOpeningProgress,
} from "../src/occupancy-code-progress.js";
import { occupancyConnectingSteps } from "../src/occupancy-connecting-telemetry.js";
import {
  OCCUPANCY_VENDOR_LABEL,
  occupancyVendorCredentialMissingError,
} from "../src/occupancy-vendor.js";
import { occupancyCloudCompatError } from "../src/remote-code-session.js";
import { formatSetupHelp, SETUP_AGENT_OPTION_DESCRIPTIONS } from "../src/setup-help.js";
import { workspaceControlRendererUnavailableMessage } from "../src/workspace-tui-launch.js";

const FORBIDDEN = /occupancy/iu;

function collectStrings(value: unknown, path = ""): Array<{ path: string; text: string }> {
  if (typeof value === "string") return [{ path, text: value }];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectStrings(item, `${path}[${index}]`));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
      collectStrings(nested, path ? `${path}.${key}` : key),
    );
  }
  return [];
}

function expectNoOccupancy(surface: string, text: string): void {
  expect(occupancyChromeHasForbiddenWord(text), `${surface}: ${text}`).toBeFalse();
  expect(text).not.toMatch(FORBIDDEN);
}

function expectNoOccupancyLeaves(surface: string, value: unknown): void {
  for (const leaf of collectStrings(value, surface)) {
    expectNoOccupancy(leaf.path, leaf.text);
  }
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await listMarkdownFiles(path)));
    else if (entry.name.endsWith(".md") || entry.name.endsWith(".mdx")) files.push(path);
  }
  return files;
}

function publicDocsVisibleText(markdown: string): string {
  return markdown
    .replace(/<a id="[^"]*" \/>/gu, "")
    .replace(/id="[^"]*"/gu, "")
    .replace(/docs\/decisions\/ADR-[^.\s]+/gu, "")
    .replace(/docs\/specs\/[^\s)]+/gu, "")
    .replace(/docs\/testing\/[^\s)]+/gu, "");
}

describe("user-visible Occupancy is forbidden", () => {
  test("[FOLDER-ONBOARD-009] TUI chrome, progress, help, and errors never say Occupancy", () => {
    expectNoOccupancy("chrome.title", OCCUPANCY_CODE_CHROME_TITLE);
    expectNoOccupancy("first-frame.chrome", OCCUPANCY_FIRST_FRAME_CHROME);
    expectNoOccupancy("first-frame.title", OCCUPANCY_FIRST_FRAME_TITLE);
    expectNoOccupancy("first-frame.bytes", occupancyFirstFrameBytes());
    expectNoOccupancyLeaves("progress", OCCUPANCY_CODE_PROGRESS);
    expectNoOccupancyLeaves("prepare-labels", OCCUPANCY_PREPARE_STEP_LABELS);
    expectNoOccupancy("opening", occupancyOpeningProgress("hostinger"));
    expectNoOccupancyLeaves("shell-progress", SHELL_OCCUPANCY_PROGRESS);
    expectNoOccupancyLeaves("code-help.options", CODE_OPTION_DESCRIPTIONS);
    expectNoOccupancy("code-help", formatCodeHelp());
    expectNoOccupancyLeaves("setup-help.options", SETUP_AGENT_OPTION_DESCRIPTIONS);
    expectNoOccupancy("setup-help", formatSetupHelp());
    expectNoOccupancyLeaves("cli-descriptions", cliCommandDescriptions);
    expectNoOccupancyLeaves(
      "connecting-steps",
      occupancyConnectingSteps({ vendor: "grok", credentialOffered: true, skillCount: 2 }),
    );
    expectNoOccupancy(
      "door-hint",
      occupancyAvailableDoorHint({
        previewUrl: "https://preview.example",
        productionUrl: "https://prod.example",
        repositoryIdentity: "github.com/acme/api",
        commitSha: "a".repeat(40),
        branch: "main",
      }) ?? "",
    );
    expectNoOccupancy(
      "renderer-unavailable",
      workspaceControlRendererUnavailableMessage({ codeChrome: true }),
    );
    expectNoOccupancy(
      "cloud-compat",
      occupancyCloudCompatError(
        {
          code: "bad_request",
          category: "user",
          message: "Input validation failed",
          retryable: false,
          details: { phase: "orpc-error-normalization", orpcCode: "BAD_REQUEST" },
        },
        { id: "srv_hostinger", name: "hostinger" },
      ).message,
    );
    for (const vendor of Object.keys(OCCUPANCY_VENDOR_LABEL) as Array<
      keyof typeof OCCUPANCY_VENDOR_LABEL
    >) {
      const error = occupancyVendorCredentialMissingError(vendor);
      expectNoOccupancy(`vendor-error.${vendor}.message`, error.message);
      expectNoOccupancy(`vendor-error.${vendor}.guidance`, String(error.details?.guidance ?? ""));
    }
  });

  test("[FOLDER-ONBOARD-009] i18n, docs-registry titles, and TUI help never say Occupancy", async () => {
    expectNoOccupancyLeaves("i18n.en-US", enUS);
    expectNoOccupancyLeaves("i18n.zh-CN", zhCN);
    for (const [id, topic] of Object.entries(publicDocsHelpTopics)) {
      expectNoOccupancy(`docs-registry.${id}.title`, topic.title);
      expectNoOccupancy(`docs-registry.${id}.description`, topic.description);
      expectNoOccupancyLeaves(`docs-registry.${id}.aliases`, topic.aliases ?? []);
    }
    const rust = await Bun.file(
      new URL("../../../../apps/workspace-control-tui/src/lib.rs", import.meta.url),
    ).text();
    const helpBlock = rust.slice(
      rust.indexOf("const OCCUPANCY_HELP_ROWS"),
      rust.indexOf("fn occupancy_help_lines"),
    );
    const helpRows = [...helpBlock.matchAll(/"([^"]*)"/gu)].map((match) => match[1] ?? "");
    expect(helpRows.length).toBeGreaterThan(10);
    for (const row of helpRows) {
      expectNoOccupancy("tui.help-row", row);
    }
    expect(rust).toContain('" ⌥f restore the tree  shift+esc/^] stop typing  ? "');
    expect(rust).toContain("Local terminal has OSC 52 disabled");
    expect(rust).not.toMatch(/title:\s*"Occupancy"/u);
    expect(rust).not.toMatch(/"Occupancy"/u);
  });

  test("[FOLDER-ONBOARD-009] public docs body copy never says Occupancy", async () => {
    const docsRoot = join(import.meta.dir, "../../../../apps/docs/src/content/docs");
    const files = await listMarkdownFiles(docsRoot);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const visible = publicDocsVisibleText(await readFile(file, "utf8"));
      expect(visible, file).not.toMatch(FORBIDDEN);
    }
  });
});
