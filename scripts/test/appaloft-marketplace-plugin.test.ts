import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "bun:test";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const hostedMcpUrl = "https://app.appaloft.com/mcp";
const hostedMcpConfig = {
  mcpServers: {
    appaloft: {
      type: "http",
      url: hostedMcpUrl,
    },
  },
} as const;

const mcpConfigPaths = [
  "plugins/appaloft/.mcp.json",
  "plugins/appaloft/.cursor-plugin/mcp.json",
  "plugins/appaloft/.grok-plugin/mcp.json",
] as const;

const pluginManifestPaths = [
  ".cursor-plugin/marketplace.json",
  "plugins/appaloft/.cursor-plugin/plugin.json",
  "plugins/appaloft/.grok-plugin/plugin.json",
  "plugins/appaloft/README.md",
] as const;

const sourceSkillRoot = resolve(repositoryRoot, "skills/appaloft");
const packagedSkillRoot = resolve(repositoryRoot, "plugins/appaloft/skills/appaloft");

function readRepositoryJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(repositoryRoot, path), "utf8"));
}

function collectRelativeFiles(root: string): string[] {
  const files: string[] = [];

  const visit = (directory: string) => {
    for (const entry of readdirSync(directory).toSorted()) {
      const absolutePath = join(directory, entry);
      if (statSync(absolutePath).isDirectory()) {
        visit(absolutePath);
        continue;
      }
      files.push(relative(root, absolutePath));
    }
  };

  visit(root);
  return files;
}

function userFacingPluginCopy(): string {
  return [
    ...pluginManifestPaths.map((path) => readFileSync(resolve(repositoryRoot, path), "utf8")),
    JSON.stringify(readRepositoryJson(".cursor-plugin/marketplace.json")),
    JSON.stringify(readRepositoryJson("plugins/appaloft/.cursor-plugin/plugin.json")),
    JSON.stringify(readRepositoryJson("plugins/appaloft/.grok-plugin/plugin.json")),
  ].join("\n");
}

describe("Appaloft marketplace plugin packaging", () => {
  test("[APPALOFT-MARKETPLACE-PLUGIN-001] marketplace lists plugins/appaloft", () => {
    const marketplace = readRepositoryJson(".cursor-plugin/marketplace.json") as {
      plugins: Array<{ name: string; source: string }>;
    };

    expect(marketplace.plugins).toEqual([
      expect.objectContaining({
        name: "appaloft",
        source: "plugins/appaloft",
      }),
    ]);
  });

  test("[APPALOFT-MARKETPLACE-PLUGIN-002] plugin MCP configs are HTTP-only hosted Appaloft MCP", () => {
    for (const path of mcpConfigPaths) {
      const config = readRepositoryJson(path);
      expect(config).toEqual(hostedMcpConfig);

      const serialized = JSON.stringify(config);
      expect(serialized).toContain(hostedMcpUrl);
      expect(serialized).not.toMatch(/stdio|npx|token|command|args/i);
    }
  });

  test("[APPALOFT-MARKETPLACE-PLUGIN-003] packaged skill matches skills/appaloft", () => {
    const sourceFiles = collectRelativeFiles(sourceSkillRoot).filter(
      (path) => path === "SKILL.md" || path.startsWith("references/"),
    );
    const packagedFiles = collectRelativeFiles(packagedSkillRoot);

    expect(packagedFiles).toEqual(sourceFiles);

    for (const path of sourceFiles) {
      expect(readFileSync(join(packagedSkillRoot, path), "utf8")).toBe(
        readFileSync(join(sourceSkillRoot, path), "utf8"),
      );
    }

    expect(readFileSync(join(packagedSkillRoot, "SKILL.md"), "utf8")).toContain(
      "AI-facing Appaloft entrypoint",
    );
  });

  test("[APPALOFT-MARKETPLACE-PLUGIN-004] plugin copy describes Deploy and Agent without occupancy", () => {
    const copy = userFacingPluginCopy();

    expect(copy).toMatch(/Deploy/i);
    expect(copy).toMatch(/folder/i);
    expect(copy).toMatch(/URL/i);
    expect(copy).toMatch(/Agent/i);
    expect(copy).not.toMatch(/occupancy|occupy/i);
  });

  test("[APPALOFT-MARKETPLACE-PLUGIN-005] setup agent stays the local skill source", () => {
    const setupHelp = readFileSync(
      resolve(repositoryRoot, "packages/adapters/cli/src/setup-help.ts"),
      "utf8",
    );
    const agentHostSetup = readFileSync(
      resolve(repositoryRoot, "packages/adapters/cli/src/agent-host-setup.ts"),
      "utf8",
    );

    expect(setupHelp).toContain("skills/appaloft");
    expect(agentHostSetup).toContain("skills/appaloft");
    expect(setupHelp).not.toContain("plugins/appaloft");
    expect(agentHostSetup).not.toContain("plugins/appaloft");
  });
});
