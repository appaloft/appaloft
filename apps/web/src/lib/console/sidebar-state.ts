export const consoleSidebarOpenStorageKey = "appaloft:console-sidebar-open";
export const consoleSidebarDesktopMediaQuery = "(min-width: 1280px)";
export const defaultConsoleSidebarOpen = true;

export function parseConsoleSidebarOpen(value: string | null): boolean | undefined {
  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  return undefined;
}

export function resolveInitialConsoleSidebarOpen(input: {
  readonly isBrowser: boolean;
  readonly storedSidebarState?: string | null;
  readonly desktopViewportMatches?: boolean;
}): boolean {
  if (!input.isBrowser) {
    return defaultConsoleSidebarOpen;
  }

  const storedSidebarOpen = parseConsoleSidebarOpen(input.storedSidebarState ?? null);
  if (storedSidebarOpen !== undefined) {
    return storedSidebarOpen;
  }

  return input.desktopViewportMatches === true;
}

export function readBrowserConsoleSidebarOpen(windowRef: Window): boolean {
  return resolveInitialConsoleSidebarOpen({
    isBrowser: true,
    storedSidebarState: windowRef.localStorage.getItem(consoleSidebarOpenStorageKey),
    desktopViewportMatches: windowRef.matchMedia(consoleSidebarDesktopMediaQuery).matches,
  });
}
