export const OCCUPANCY_CODE_PROGRESS = {
  connecting: "Connecting to Appaloft…",
  checkingLogin: "Checking login…",
  lookingUpServers: "Looking up enrolled servers…",
  choosingOccupancy: "Choosing occupancy…",
  resolvingRepository: "Resolving repository…",
  copyingSkills: "Copying skills…",
  attaching: "Attaching…",
} as const;

export function occupancyCodeUsesLineProgress(input: {
  readonly noAttach: boolean;
  readonly stdinIsTty?: boolean;
  readonly stdoutIsTty?: boolean;
}): boolean {
  if (input.noAttach) return true;
  return !input.stdinIsTty || !input.stdoutIsTty;
}

export const DEFAULT_OCCUPANCY_SKILL_OFFER_TIMEOUT_MS = 8_000;
export const DEFAULT_OCCUPANCY_BANNER_CHROME_TIMEOUT_MS = 2_000;
export const DEFAULT_OCCUPANCY_SKILL_COMMAND_TIMEOUT_MS = 3_000;

export function occupancyTimeoutMs(
  envName: string,
  fallback: number,
  env: NodeJS.ProcessEnv = process.env,
): number {
  const parsed = Number(env[envName]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export async function settleWithTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
): Promise<{ status: "completed"; value: T } | { status: "timed-out" }> {
  if (timeoutMs === 0) return { status: "timed-out" };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work.then((value) => ({ status: "completed" as const, value })),
      new Promise<{ status: "timed-out" }>((resolve) => {
        timer = setTimeout(() => resolve({ status: "timed-out" }), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function occupancyOpeningProgress(serverName: string): string {
  const name = serverName.trim() || "the enrolled server";
  return `Opening occupancy on ${name}…`;
}

export function reportOccupancyCodeProgress(
  message: string,
  write: (text: string) => void = (text) => {
    process.stdout.write(text);
  },
): void {
  write(`${message}\n`);
}
