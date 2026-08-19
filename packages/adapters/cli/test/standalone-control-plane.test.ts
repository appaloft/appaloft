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
    expect(printed.indexOf("appaloft workspace [--json]")).toBeGreaterThan(-1);
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
});
