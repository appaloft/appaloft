export const OCCUPANCY_CODE_CHROME_TITLE = "Appaloft Cloud Agents";

export const OCCUPANCY_PREPARE_STEP_IDS = ["credential", "skills", "disk"] as const;

export type OccupancyPrepareStepId = (typeof OCCUPANCY_PREPARE_STEP_IDS)[number];

export const OCCUPANCY_CODE_PROGRESS = {
  connecting: "Checking credentials…",
  checkingLogin: "Checking login…",
  lookingUpServers: "Looking up enrolled servers…",
  choosingOccupancy: "Choosing this folder…",
  usingThisProject: "Using this project…",
  resolvingRepository: "Resolving repository…",
  copyingSkills: "Preparing skills…",
  attaching: "Attaching…",
} as const;

export const OCCUPANCY_PREPARE_STEP_LABELS = {
  credential: "Checking login",
  skills: "Preparing skills",
  disk: "Preparing disk",
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
  return `Preparing disk on ${name}…`;
}

export function occupancyPrepareStepForProgress(message: string): OccupancyPrepareStepId {
  if (/skill/iu.test(message)) return "skills";
  if (/login|server|credential/iu.test(message)) return "credential";
  return "disk";
}

export function occupancyChromeHasForbiddenWord(text: string): boolean {
  return /occupancy/iu.test(text);
}

export function reportOccupancyCodeProgress(
  message: string,
  write: (text: string) => void = (text) => {
    process.stdout.write(text);
  },
): void {
  write(`${message}\n`);
}
