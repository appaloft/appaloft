import { resolve } from "node:path";

type ChildProcess = ReturnType<typeof Bun.spawn>;

const dataDir = resolve(Bun.env.YUNDU_DATA_DIR ?? ".yundu/data");
const pgliteDataDir = resolve(Bun.env.YUNDU_PGLITE_DATA_DIR ?? `${dataDir}/pglite`);
const webPort = Bun.env.YUNDU_DEV_WEB_PORT ?? "3001";
const backendPort = Bun.env.YUNDU_DEV_BACKEND_PORT ?? "3002";
const webHost = Bun.env.YUNDU_DEV_WEB_HOST ?? "localhost";
const backendHost = Bun.env.YUNDU_DEV_BACKEND_HOST ?? "127.0.0.1";
const webOriginHost = webHost === "0.0.0.0" ? "localhost" : webHost;
const webOrigin = Bun.env.YUNDU_DEV_WEB_ORIGIN ?? `http://${webOriginHost}:${webPort}`;
const backendOrigin = `http://${backendHost}:${backendPort}`;
const trustedOrigins = [
  webOrigin,
  `http://localhost:${webPort}`,
  `http://127.0.0.1:${webPort}`,
  ...(Bun.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ?? []),
]
  .map((origin) => origin.trim())
  .filter((origin, index, origins) => origin.length > 0 && origins.indexOf(origin) === index)
  .join(",");

const children: ChildProcess[] = [];
let shuttingDown = false;
let shutdownSignal: NodeJS.Signals | null = null;

function spawnProcess(name: string, cmd: string[], env: Bun.Env): ChildProcess {
  console.log(`[dev] starting ${name}: ${cmd.join(" ")}`);
  const child = Bun.spawn({
    cmd,
    cwd: process.cwd(),
    env,
    stdout: "inherit",
    stderr: "inherit",
    stdin: "inherit",
  });
  children.push(child);
  child.exited.then((exitCode) => {
    if (!shuttingDown) {
      console.error(
        `[dev] ${name} exited with code ${exitCode}; other dev processes are still running.`,
      );
    }
  });
  return child;
}

function shutdown(signal: NodeJS.Signals): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  shutdownSignal = signal;

  for (const child of children) {
    child.kill(signal);
  }
}

spawnProcess(
  "backend",
  [process.execPath, "run", "--cwd", "apps/shell", "--watch", "src/index.ts", "serve"],
  {
    ...Bun.env,
    YUNDU_HTTP_HOST: backendHost,
    YUNDU_HTTP_PORT: backendPort,
    YUNDU_DATA_DIR: dataDir,
    YUNDU_PGLITE_DATA_DIR: pgliteDataDir,
    YUNDU_WEB_ORIGIN: webOrigin,
    YUNDU_BETTER_AUTH_URL: webOrigin,
    BETTER_AUTH_TRUSTED_ORIGINS: trustedOrigins,
  },
);

spawnProcess(
  "web",
  [
    process.execPath,
    "run",
    "--cwd",
    "apps/web",
    "dev",
    "--",
    "--host",
    webHost,
    "--port",
    webPort,
    "--strictPort",
  ],
  {
    ...Bun.env,
    YUNDU_WEB_DEV_PROXY_TARGET: backendOrigin,
  },
);

console.log(`[dev] web: ${webOrigin}`);
console.log(`[dev] api proxy: /api -> ${backendOrigin}`);

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

const exitCodes = await Promise.all(children.map((child) => child.exited));

if (shutdownSignal === "SIGINT") {
  process.exit(130);
}

if (shutdownSignal === "SIGTERM") {
  process.exit(143);
}

process.exit(exitCodes.find((exitCode) => exitCode !== 0) ?? 0);
