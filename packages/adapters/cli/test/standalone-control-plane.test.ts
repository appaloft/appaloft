import { describe, expect, test } from "bun:test";

import { runStandaloneControlPlaneCli } from "../src/standalone-control-plane.js";

describe("standalone control plane help", () => {
  test("[WS-REMOTE-DOCS-067][WS-REMOTE-DOCS-068] top-level help names occupancy doors", async () => {
    const chunks: string[] = [];
    const result = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "--help"],
      stdout: {
        write: (chunk) => {
          chunks.push(String(chunk));
          return true;
        },
      },
    });

    const printed = chunks.join("");
    expect(result).toEqual({ handled: true, exitCode: 0 });
    expect(printed.indexOf("appaloft code [path|git-remote]")).toBeGreaterThan(-1);
    expect(printed).toContain("appaloft code [path|git-remote]");
    expect(printed).toContain("[--server <id>]");
    expect(printed.indexOf("appaloft workspace [--json]")).toBeGreaterThan(-1);
    expect(printed.indexOf("appaloft workspace open [path|git-remote]")).toBeGreaterThan(-1);
    expect(printed.indexOf("appaloft deploy [path|git-remote]")).toBeGreaterThan(-1);
    expect(printed).not.toContain("appaloft deploy <path>");
    expect(printed.indexOf("appaloft code")).toBeLessThan(
      printed.indexOf("appaloft workspace open"),
    );
  });

  test("[CONTROL-PLANE-CLI-012] login --help prints usage and does not start OAuth", async () => {
    let loginStarted = false;
    const chunks: string[] = [];
    const result = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "login", "--help"],
      fetch: async () => {
        loginStarted = true;
        return new Response("should not fetch", { status: 500 });
      },
      stdout: {
        write: (chunk) => {
          chunks.push(String(chunk));
          return true;
        },
      },
    });

    const printed = chunks.join("");
    expect(result).toEqual({ handled: true, exitCode: 0 });
    expect(loginStarted).toBe(false);
    expect(printed).toContain(
      "appaloft login [--url <url>] [--mode cloud|self-hosted] [--no-browser]",
    );
    expect(printed).toContain("--url");
    expect(printed).toContain("--mode");
    expect(printed).toContain("--no-browser");
    expect(printed).not.toContain("validation_error");
    expect(printed).not.toContain("Unsupported option");
  });

  test("[CONTROL-PLANE-CLI-012] login -h prints usage and does not start OAuth", async () => {
    let loginStarted = false;
    const chunks: string[] = [];
    const result = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "login", "-h"],
      fetch: async () => {
        loginStarted = true;
        return new Response("should not fetch", { status: 500 });
      },
      stdout: {
        write: (chunk) => {
          chunks.push(String(chunk));
          return true;
        },
      },
    });

    expect(result).toEqual({ handled: true, exitCode: 0 });
    expect(loginStarted).toBe(false);
    expect(chunks.join("")).toContain("appaloft login [--url <url>]");
  });

  test("[CONTROL-PLANE-CLI-004] auth login --help and auth status --help print usage", async () => {
    const loginChunks: string[] = [];
    const statusChunks: string[] = [];
    const login = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "auth", "login", "--help"],
      stdout: {
        write: (chunk) => {
          loginChunks.push(String(chunk));
          return true;
        },
      },
    });
    const status = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "auth", "status", "--help"],
      stdout: {
        write: (chunk) => {
          statusChunks.push(String(chunk));
          return true;
        },
      },
    });

    expect(login).toEqual({ handled: true, exitCode: 0 });
    expect(status).toEqual({ handled: true, exitCode: 0 });
    expect(loginChunks.join("")).toContain("appaloft auth login");
    expect(statusChunks.join("")).toContain("appaloft auth status [--profile <name>]");
  });

  test("[CONTROL-PLANE-CLI-023][CONTROL-PLANE-CLI-024] auth mcp cursor/opencode install --help prints usage", async () => {
    const cursorChunks: string[] = [];
    const openCodeChunks: string[] = [];
    const claudeChunks: string[] = [];
    const rootChunks: string[] = [];

    const cursor = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "auth", "mcp", "cursor", "install", "--help"],
      stdout: {
        write: (chunk) => {
          cursorChunks.push(String(chunk));
          return true;
        },
      },
    });
    const openCode = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "auth", "mcp", "opencode", "install", "--help"],
      stdout: {
        write: (chunk) => {
          openCodeChunks.push(String(chunk));
          return true;
        },
      },
    });
    const claude = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "auth", "mcp", "claude-code", "install", "--help"],
      stdout: {
        write: (chunk) => {
          claudeChunks.push(String(chunk));
          return true;
        },
      },
    });
    const root = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "--help"],
      stdout: {
        write: (chunk) => {
          rootChunks.push(String(chunk));
          return true;
        },
      },
    });

    expect(cursor).toEqual({ handled: true, exitCode: 0 });
    expect(openCode).toEqual({ handled: true, exitCode: 0 });
    expect(claude).toEqual({ handled: true, exitCode: 0 });
    expect(root).toEqual({ handled: true, exitCode: 0 });
    expect(cursorChunks.join("")).toContain("appaloft auth mcp cursor install");
    expect(openCodeChunks.join("")).toContain("appaloft auth mcp opencode install");
    expect(claudeChunks.join("")).toContain("appaloft auth mcp claude-code install");
    expect(rootChunks.join("")).toContain("appaloft auth mcp cursor install");
    expect(rootChunks.join("")).toContain("appaloft auth mcp opencode install");
    expect(rootChunks.join("")).toContain("appaloft auth mcp claude-code install");
    expect(rootChunks.join("")).toContain("appaloft auth mcp codex install");
    expect(rootChunks.join("")).toContain("appaloft setup agent");
  });

  test("[CONTROL-PLANE-CLI-025][CONTROL-PLANE-CLI-027] setup agent --help prints usage", async () => {
    const chunks: string[] = [];
    const result = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "setup", "agent", "--help"],
      stdout: {
        write: (chunk) => {
          chunks.push(String(chunk));
          return true;
        },
      },
    });

    const printed = chunks.join("");
    expect(result).toEqual({ handled: true, exitCode: 0 });
    expect(printed).toContain("appaloft setup agent");
    expect(printed).toContain("--agent");
    expect(printed).toContain("opencode");
    expect(printed).toContain("not default-checked");
    expect(printed).toContain("~/.claude.json");
    expect(printed).toContain("~/.cursor/mcp.json");
    expect(printed).not.toContain("A true or false value");
    expect(printed).not.toContain("This setting is optional");
    expect(printed).not.toMatch(/occupancy/iu);
  });

  test("[CONTROL-PLANE-CLI-027] setup agent -h prints the same compact usage", async () => {
    const chunks: string[] = [];
    const result = await runStandaloneControlPlaneCli({
      argv: ["node", "appaloft", "setup", "agent", "-h"],
      stdout: {
        write: (chunk) => {
          chunks.push(String(chunk));
          return true;
        },
      },
    });

    const printed = chunks.join("");
    expect(result).toEqual({ handled: true, exitCode: 0 });
    expect(printed).toContain("appaloft setup agent");
    expect(printed).toContain("-y, --yes");
    expect(printed).not.toContain("A true or false value");
    expect(printed).not.toMatch(/occupancy/iu);
  });
});
