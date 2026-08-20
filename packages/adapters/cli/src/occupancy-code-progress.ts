export const OCCUPANCY_CODE_PROGRESS = {
  checkingLogin: "Checking login…",
  lookingUpServers: "Looking up enrolled servers…",
  choosingOccupancy: "Choosing occupancy…",
  resolvingRepository: "Resolving repository…",
  copyingSkills: "Copying skills…",
  attaching: "Attaching…",
} as const;

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
