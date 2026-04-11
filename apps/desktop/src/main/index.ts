import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";

const currentDir = dirname(fileURLToPath(import.meta.url));

let backendProcess: ChildProcessWithoutNullStreams | null = null;
let backendBaseUrl: string | null = null;

function backendExecutableName(): string {
  return process.platform === "win32" ? "yundu.exe" : "yundu";
}

function resolveRepoRoot(): string {
  return resolve(app.getAppPath(), "../..");
}

function resolveBackendPath(): string {
  if (process.env.YUNDU_DESKTOP_BACKEND_PATH) {
    return process.env.YUNDU_DESKTOP_BACKEND_PATH;
  }

  const resourceBackendPath = join(
    process.resourcesPath,
    "yundu-binary-bundle",
    backendExecutableName(),
  );

  if (app.isPackaged) {
    return resourceBackendPath;
  }

  return join(resolveRepoRoot(), "dist", "release", "yundu-binary-bundle", backendExecutableName());
}

function reservePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to reserve a local backend port"));
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePort(address.port);
      });
    });

    server.on("error", reject);
  });
}

async function waitForBackend(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
      lastError = new Error(`Backend health check failed with ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Backend did not become ready before the startup timeout");
}

async function startBackend(): Promise<string> {
  const backendPath = resolveBackendPath();

  if (!existsSync(backendPath)) {
    throw new Error(
      `Missing Yundu backend binary at ${backendPath}. Run bun run package:binary-bundle first.`,
    );
  }

  const port = await reservePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const dataDir = join(app.getPath("userData"), "data");
  const pgliteDataDir = join(dataDir, "pglite");

  backendProcess = spawn(backendPath, ["serve"], {
    env: {
      ...process.env,
      YUNDU_DATABASE_DRIVER: process.env.YUNDU_DATABASE_DRIVER ?? "pglite",
      YUNDU_DATA_DIR: process.env.YUNDU_DATA_DIR ?? dataDir,
      YUNDU_PGLITE_DATA_DIR: process.env.YUNDU_PGLITE_DATA_DIR ?? pgliteDataDir,
      YUNDU_HTTP_HOST: "127.0.0.1",
      YUNDU_HTTP_PORT: String(port),
      YUNDU_WEB_ORIGIN: baseUrl,
      YUNDU_BETTER_AUTH_URL: process.env.YUNDU_BETTER_AUTH_URL ?? baseUrl,
    },
    stdio: "pipe",
  });

  backendProcess.stdout.on("data", (data) => {
    console.info(`[yundu] ${data.toString().trimEnd()}`);
  });
  backendProcess.stderr.on("data", (data) => {
    console.error(`[yundu] ${data.toString().trimEnd()}`);
  });
  backendProcess.once("exit", (code, signal) => {
    backendProcess = null;
    backendBaseUrl = null;
    if (code !== 0 && signal !== "SIGTERM") {
      console.error(`Yundu backend exited unexpectedly: code=${code} signal=${signal}`);
    }
  });

  await waitForBackend(baseUrl);
  backendBaseUrl = baseUrl;
  return baseUrl;
}

function stopBackend(): void {
  if (!backendProcess) {
    return;
  }

  const processToStop = backendProcess;
  backendProcess = null;
  backendBaseUrl = null;
  processToStop.kill("SIGTERM");

  setTimeout(() => {
    if (!processToStop.killed) {
      processToStop.kill("SIGKILL");
    }
  }, 2_000).unref();
}

async function createWindow(baseUrl: string): Promise<void> {
  const window = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: "Yundu",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(currentDir, "../preload/index.mjs"),
      sandbox: false,
    },
  });

  await window.loadURL(baseUrl);

  if (process.env.YUNDU_DESKTOP_OPEN_DEVTOOLS === "true") {
    window.webContents.openDevTools({ mode: "detach" });
  }
}

ipcMain.handle("yundu:select-directory", async () => {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  const dialogOptions: OpenDialogOptions = {
    properties: ["openDirectory"],
  };
  const result = focusedWindow
    ? await dialog.showOpenDialog(focusedWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  return result.canceled ? null : (result.filePaths[0] ?? null);
});

app.on("before-quit", stopBackend);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length > 0) {
    return;
  }

  const baseUrl = backendBaseUrl ?? (await startBackend());
  await createWindow(baseUrl);
});

async function bootstrap(): Promise<void> {
  try {
    await app.whenReady();
    const baseUrl = await startBackend();
    await createWindow(baseUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start Yundu desktop";
    console.error(message);
    await dialog.showMessageBox({
      type: "error",
      title: "Yundu failed to start",
      message,
    });
    app.quit();
  }
}

void bootstrap();
