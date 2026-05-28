import { describe, expect, test } from "vitest";

import {
  consoleSidebarDesktopMediaQuery,
  consoleSidebarOpenStorageKey,
  parseConsoleSidebarOpen,
  resolveInitialConsoleSidebarOpen,
} from "./sidebar-state";

describe("console sidebar initial state", () => {
  test("defaults the static console shell to expanded so desktop first paint does not flash collapsed", () => {
    expect(resolveInitialConsoleSidebarOpen({ isBrowser: false })).toBe(true);
  });

  test("uses a stored user preference before the desktop breakpoint default", () => {
    expect(
      resolveInitialConsoleSidebarOpen({
        isBrowser: true,
        storedSidebarState: "false",
        desktopViewportMatches: true,
      }),
    ).toBe(false);
    expect(
      resolveInitialConsoleSidebarOpen({
        isBrowser: true,
        storedSidebarState: "true",
        desktopViewportMatches: false,
      }),
    ).toBe(true);
  });

  test("falls back to the desktop breakpoint when there is no stored preference", () => {
    expect(
      resolveInitialConsoleSidebarOpen({
        isBrowser: true,
        storedSidebarState: null,
        desktopViewportMatches: true,
      }),
    ).toBe(true);
    expect(
      resolveInitialConsoleSidebarOpen({
        isBrowser: true,
        storedSidebarState: null,
        desktopViewportMatches: false,
      }),
    ).toBe(false);
  });

  test("keeps sidebar persistence keys explicit", () => {
    expect(consoleSidebarOpenStorageKey).toBe("appaloft:console-sidebar-open");
    expect(consoleSidebarDesktopMediaQuery).toBe("(min-width: 1280px)");
    expect(parseConsoleSidebarOpen("unexpected")).toBeUndefined();
  });
});
