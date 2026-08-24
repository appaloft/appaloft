/// <reference types="bun-types" />

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";

const previewPort = 43_000 + (process.pid % 10_000);
const previewUrl = `http://127.0.0.1:${previewPort}`;
const evidenceDirectory = "/private/tmp/appaloft-dashboard-evidence";

let previewProcess: ReturnType<typeof Bun.spawn> | undefined;

async function waitForPreview(): Promise<void> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${previewUrl}/projects`);
      if (response.ok) return;
    } catch {
      // Preview startup is eventually consistent.
    }
    await Bun.sleep(100);
  }

  throw new Error(`Dashboard preview did not become ready at ${previewUrl}`);
}

function createView(width: number, height: number): Bun.WebView {
  return new Bun.WebView({
    width,
    height,
    ...(process.platform === "darwin" ? {} : { backend: "chrome" as const }),
  });
}

async function waitFor<T>(read: () => Promise<T>, matches: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 10_000;
  let value = await read();

  while (!matches(value) && Date.now() < deadline) {
    await Bun.sleep(50);
    value = await read();
  }

  if (!matches(value))
    throw new Error(`Dashboard WebView did not reach the expected state: ${String(value)}`);
  return value;
}

async function navigateWithTheme(
  view: Bun.WebView,
  path: string,
  theme: "dark" | "light",
): Promise<void> {
  await view.navigate(`${previewUrl}${path}`);
  await waitFor(
    () => view.evaluate<string | undefined>(`document.documentElement.dataset.consolePreset`),
    (preset) => preset === "dashboard-v2",
  );
  await view.evaluate(`(() => {
    localStorage.setItem('appaloft.dashboard.theme', '${theme}');
    return true;
  })()`);
  await view.navigate(`${previewUrl}${path}`);
  await waitFor(
    () => view.evaluate<string | undefined>(`document.documentElement.dataset.theme`),
    (value) => value === theme,
  );
  await Bun.sleep(300);
}

async function capture(view: Bun.WebView, name: string): Promise<string> {
  await mkdir(evidenceDirectory, { recursive: true });
  const output = `${evidenceDirectory}/${name}.png`;
  await Bun.write(output, await view.screenshot());
  return output;
}

beforeAll(async () => {
  previewProcess = Bun.spawn({
    cmd: [
      "bun",
      "run",
      "preview",
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      String(previewPort),
      "--strictPort",
    ],
    cwd: new URL("../..", import.meta.url).pathname,
    stdout: "ignore",
    stderr: "ignore",
  });
  await waitForPreview();
});

afterAll(async () => {
  previewProcess?.kill();
  await previewProcess?.exited.catch(() => undefined);
  Bun.WebView.closeAll();
});

describe("Dashboard foundation WebView", () => {
  test("[DASH-VIS-003][DASH-A11Y-007] captures labeled desktop Light and Dark fixtures", async () => {
    await using view = createView(1_440, 1_000);
    await navigateWithTheme(view, "/projects", "light");

    const light = await view.evaluate<{
      ambientBackground: string;
      iconSurfaceCount: number;
      navLabels: string[];
      preset: string | undefined;
      theme: string | undefined;
      unlabeledControls: number;
    }>(`(() => ({
      ambientBackground: getComputedStyle(document.querySelector('.dashboard-shell')).backgroundImage,
      iconSurfaceCount: document.querySelectorAll('[data-icon-surface]').length,
      navLabels: Array.from(document.querySelectorAll('nav[aria-label="Workspace"] a')).filter((item) => item.getClientRects().length > 0).map((item) => item.textContent?.trim() ?? ''),
      preset: document.documentElement.dataset.consolePreset,
      theme: document.documentElement.dataset.theme,
      unlabeledControls: Array.from(document.querySelectorAll('button, a')).filter((item) => !(item.getAttribute('aria-label') || item.textContent?.trim())).length,
    }))()`);

    expect(light.preset).toBe("dashboard-v2");
    expect(light.theme).toBe("light");
    expect(light.ambientBackground).toContain("radial-gradient");
    expect(light.iconSurfaceCount).toBeGreaterThanOrEqual(3);
    expect(light.navLabels).toHaveLength(5);
    expect(light.unlabeledControls).toBe(0);
    expect(
      (await Bun.file(await capture(view, "projects-desktop-light")).arrayBuffer()).byteLength,
    ).toBeGreaterThan(10_000);

    await navigateWithTheme(
      view,
      "/projects/atlas-api/overview?environment=production&view=list",
      "light",
    );
    expect(
      (await Bun.file(await capture(view, "project-desktop-light")).arrayBuffer()).byteLength,
    ).toBeGreaterThan(10_000);

    await navigateWithTheme(
      view,
      "/projects/atlas-api/resources/api-gateway/overview?environment=production&view=list",
      "dark",
    );
    expect(
      (await Bun.file(await capture(view, "resource-desktop-dark")).arrayBuffer()).byteLength,
    ).toBeGreaterThan(10_000);

    await navigateWithTheme(view, "/patterns", "dark");
    expect(await view.evaluate<string | undefined>(`document.documentElement.dataset.theme`)).toBe(
      "dark",
    );
    expect(
      (await Bun.file(await capture(view, "patterns-desktop-dark")).arrayBuffer()).byteLength,
    ).toBeGreaterThan(10_000);
  });

  test("[DASH-VIS-004][DASH-A11Y-006][DASH-A11Y-008] keeps mobile navigation labeled and Resource content on-canvas", async () => {
    await using view = createView(390, 844);
    await navigateWithTheme(view, "/projects", "dark");

    const workspace = await view.evaluate<{
      bottomLabels: string[];
      cardBackground: string;
      cardSurfaceToken: string;
      clientWidth: number;
      rootClass: string;
      scrollWidth: number;
      surfaceToken: string;
    }>(`(() => ({
      bottomLabels: Array.from(document.querySelectorAll('nav[aria-label="Workspace"] a')).filter((item) => item.getClientRects().length > 0).map((item) => item.textContent?.trim() ?? ''),
      cardBackground: getComputedStyle(document.querySelector('[data-project-card]')).backgroundColor,
      cardSurfaceToken: getComputedStyle(document.querySelector('[data-project-card]')).getPropertyValue('--surface').trim(),
      clientWidth: document.documentElement.clientWidth,
      rootClass: document.documentElement.className,
      scrollWidth: document.documentElement.scrollWidth,
      surfaceToken: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),
    }))()`);

    expect(workspace.bottomLabels).toHaveLength(5);
    expect(workspace.bottomLabels.every(Boolean)).toBe(true);
    expect(workspace.rootClass.split(/\s+/)).toContain("dark");
    expect(workspace.surfaceToken).toBe("#282a37");
    expect(workspace.cardSurfaceToken).toBe("#282a37");
    expect(workspace.cardBackground).toBe("rgb(40, 42, 55)");
    expect(workspace.scrollWidth).toBeLessThanOrEqual(workspace.clientWidth);
    expect(
      (await Bun.file(await capture(view, "projects-mobile-dark")).arrayBuffer()).byteLength,
    ).toBeGreaterThan(10_000);

    await navigateWithTheme(
      view,
      "/projects/atlas-api/resources/api-gateway/deployments?environment=production&view=logs",
      "dark",
    );
    const resource = await view.evaluate<{
      backgroundDisplay: string;
      clientWidth: number;
      closeLabel: string | null;
      scrollWidth: number;
    }>(`(() => ({
      backgroundDisplay: getComputedStyle(document.querySelector('.dashboard-resource-background')).display,
      clientWidth: document.documentElement.clientWidth,
      closeLabel: document.querySelector('aside button[aria-label]')?.getAttribute('aria-label') ?? null,
      scrollWidth: document.documentElement.scrollWidth,
    }))()`);

    expect(resource.backgroundDisplay).toBe("none");
    expect(resource.closeLabel).toBeTruthy();
    expect(resource.scrollWidth).toBeLessThanOrEqual(resource.clientWidth);
    expect(
      (await Bun.file(await capture(view, "resource-mobile-dark")).arrayBuffer()).byteLength,
    ).toBeGreaterThan(10_000);
  });

  test("[DASH-A11Y-005][DASH-A11Y-006] exposes a bounded keyboard-operable desktop panel resize control", async () => {
    await using view = createView(1_440, 1_000);
    await navigateWithTheme(
      view,
      "/projects/atlas-api/resources/api-gateway/overview?environment=production&view=list",
      "light",
    );

    const separator = await view.evaluate<{
      label: string | null;
      maximum: string | null;
      minimum: string | null;
      type: string | null;
    }>(`(() => {
      const item = document.querySelector('[data-resource-panel-resize]');
      return {
        label: item?.getAttribute('aria-label') ?? null,
        maximum: item?.getAttribute('max') ?? null,
        minimum: item?.getAttribute('min') ?? null,
        type: item?.getAttribute('type') ?? null,
      };
    })()`);

    expect(separator.type).toBe("range");
    expect(separator.label).toBeTruthy();
    expect(Number(separator.minimum)).toBe(480);
    expect(Number(separator.maximum)).toBeGreaterThan(Number(separator.minimum));

    const resized = await view.evaluate<{ after: number; before: number }>(`(() => {
      const item = document.querySelector('[data-resource-panel-resize]');
      const before = Number(item?.value);
      item?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      return { before, after: Number(localStorage.getItem('appaloft.dashboard.resource-panel-width')) };
    })()`);
    expect(resized.after).toBe(resized.before + 16);
  });
});
