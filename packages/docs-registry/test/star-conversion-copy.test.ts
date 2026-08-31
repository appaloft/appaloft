import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const OCCUPY = /occupanc|occupy|占用/iu;

function readRepo(relativePath: string): string {
  return readFileSync(join(repositoryRoot, relativePath), "utf8");
}

function firstScreen(markdown: string, installHeading: string): string {
  const index = markdown.indexOf(installHeading);
  expect(index).toBeGreaterThan(0);
  return markdown.slice(0, index);
}

function glanceBlock(markdown: string, heading: string): string {
  const headingIndex = markdown.indexOf(heading);
  expect(headingIndex).toBeGreaterThan(0);
  const fenceStart = markdown.indexOf("```bash", headingIndex);
  const fenceEnd = markdown.indexOf("```", fenceStart + "```bash".length);
  expect(fenceStart).toBeGreaterThan(headingIndex);
  expect(fenceEnd).toBeGreaterThan(fenceStart);
  return markdown.slice(fenceStart, fenceEnd);
}

describe("GitHub star-conversion copy", () => {
  test("[PUB-DOCS-019] README first screen is the 60-second two-door path", () => {
    for (const [relativePath, installHeading] of [
      ["README.md", "## Install"],
      ["README.zh-CN.md", "## 安装"],
    ] as const) {
      const source = readRepo(relativePath);
      const screen = firstScreen(source, installHeading);
      const afterInstall = source.slice(source.indexOf(installHeading));

      expect(screen).toMatch(/Two doors|两扇门/);
      expect(screen).toContain("```bash\nappaloft up\n```");
      expect(screen).toContain("```bash\nappaloft setup agent\n```");
      expect(screen).toMatch(/If you are not logged in|如果还没登录/);
      expect(screen).toContain("https://www.appaloft.com/compare/railway");
      expect(screen).toMatch(/not a complete replacement|不是 Railway 的完整替代/);
      expect(screen).not.toContain("appaloft-deploy-loop.gif");
      expect(screen).not.toMatch(/public alpha/i);
      expect(screen).not.toContain("install.sh");
      expect(screen).not.toMatch(/star us|please star|给个 star/i);
      expect(screen).not.toMatch(OCCUPY);
      expect(source).not.toContain("--agent cursor");

      expect(afterInstall.indexOf("npm install -g @appaloft/cli")).toBeLessThan(
        afterInstall.indexOf("install.sh"),
      );
      expect(afterInstall.indexOf("brew install appaloft/tap/appaloft")).toBeLessThan(
        afterInstall.indexOf("install.sh"),
      );
      expect(afterInstall).toContain("appaloft-deploy-loop.gif");
      expect(afterInstall).toMatch(/public alpha/i);
    }
  });

  test("[PUB-DOCS-019] Agents overview markets setup agent, not Workspace or Sandbox", () => {
    for (const [relativePath, startHeading, doesNotDeploy] of [
      [
        "apps/docs/src/content/docs/en/agents/overview.mdx",
        "## Short definition",
        "does **not** deploy",
      ],
      ["apps/docs/src/content/docs/agents/overview.mdx", "## 简要定义", "**不会部署**"],
    ] as const) {
      const source = readRepo(relativePath);
      const start = source.indexOf(startHeading);
      const nextHeading = source.indexOf("\n## ", start + startHeading.length);
      const story = source.slice(start, nextHeading === -1 ? undefined : nextHeading);
      const setupIndex = story.indexOf("appaloft setup agent");
      expect(setupIndex).toBeGreaterThan(0);
      expect(story).toContain(doesNotDeploy);
      expect(story).toContain("appaloft up");
      expect(setupIndex).toBeLessThan(story.search(/Workspace|Sandbox/u));
      expect(source).not.toMatch(/Private Preview/i);
      expect(source).not.toMatch(OCCUPY);
      expect(source).toContain("/agents/grok-bot-plugin/");
    }
  });

  test("[PUB-DOCS-019] CLI at-a-glance leads with up, then setup agent and code", () => {
    const en = glanceBlock(
      readRepo("apps/docs/src/content/docs/en/reference/cli.mdx"),
      "## Common commands at a glance",
    );
    const zh = glanceBlock(
      readRepo("apps/docs/src/content/docs/reference/cli.mdx"),
      "## 常用命令速查",
    );

    for (const block of [en, zh]) {
      expect(block.indexOf("appaloft up")).toBeLessThan(block.indexOf("appaloft setup agent"));
      expect(block.indexOf("appaloft setup agent")).toBeLessThan(block.indexOf("appaloft code"));
      expect(block).not.toMatch(OCCUPY);
      expect(block).not.toMatch(/Occupy my Sandbox|我的 Sandbox/u);
    }
  });
});
