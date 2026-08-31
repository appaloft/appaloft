import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  astroChineseLocaleAliasRedirects,
  chineseDocsLocaleAliasRedirectStatus,
  cloudflareChineseLocaleAliasRedirects,
  stripChineseLocaleAliasPrefix,
} from "./locale-aliases";

const docsAppRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("Chinese docs locale path aliases [PUB-DOCS-018]", () => {
  test("strips /zh-CN and /zh prefixes onto the unprefixed Chinese tree", () => {
    expect(stripChineseLocaleAliasPrefix("/")).toBe("/");
    expect(stripChineseLocaleAliasPrefix("/agents/overview")).toBe("/agents/overview");
    expect(stripChineseLocaleAliasPrefix("/zh-CN")).toBe("/");
    expect(stripChineseLocaleAliasPrefix("/zh-CN/")).toBe("/");
    expect(stripChineseLocaleAliasPrefix("/zh-CN/agents/overview")).toBe("/agents/overview");
    expect(stripChineseLocaleAliasPrefix("/zh")).toBe("/");
    expect(stripChineseLocaleAliasPrefix("/zh/agents/overview")).toBe("/agents/overview");
    expect(stripChineseLocaleAliasPrefix("/en/agents/overview")).toBe("/en/agents/overview");
  });

  test("does not treat /zhao or /zh-TW as Chinese locale aliases", () => {
    expect(stripChineseLocaleAliasPrefix("/zhao")).toBe("/zhao");
    expect(stripChineseLocaleAliasPrefix("/zh-TW/agents/overview")).toBe("/zh-TW/agents/overview");
  });

  test("Astro redirects 308 /zh-CN and /zh onto unprefixed Chinese paths", () => {
    expect(astroChineseLocaleAliasRedirects()).toEqual({
      "/zh-CN": { status: chineseDocsLocaleAliasRedirectStatus, destination: "/" },
      "/zh-CN/[...slug]": {
        status: chineseDocsLocaleAliasRedirectStatus,
        destination: "/[...slug]",
      },
      "/zh": { status: chineseDocsLocaleAliasRedirectStatus, destination: "/" },
      "/zh/[...slug]": {
        status: chineseDocsLocaleAliasRedirectStatus,
        destination: "/[...slug]",
      },
    });
  });

  test("committed Cloudflare _redirects matches the official-site 308 alias rules", () => {
    const committed = readFileSync(resolve(docsAppRoot, "public/_redirects"), "utf8");

    expect(committed).toBe(cloudflareChineseLocaleAliasRedirects());
    expect(committed).toContain("/zh-CN / 308");
    expect(committed).toContain("/zh-CN/* /:splat 308");
    expect(committed).toContain("/zh / 308");
    expect(committed).toContain("/zh/* /:splat 308");
  });
});
