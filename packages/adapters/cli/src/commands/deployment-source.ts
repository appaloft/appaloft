import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export type DeploymentMethod =
  | "auto"
  | "dockerfile"
  | "docker-compose"
  | "prebuilt-image"
  | "static"
  | "workspace-commands";

export const deploymentMethods = [
  "auto",
  "dockerfile",
  "docker-compose",
  "prebuilt-image",
  "static",
  "workspace-commands",
] as const satisfies readonly DeploymentMethod[];

function isRemoteOrImageSource(locator: string): boolean {
  return (
    /^(https?|ssh|git):\/\//.test(locator) ||
    /^[^/\\]+@[^/\\]+:/.test(locator) ||
    locator.startsWith("docker://") ||
    locator.startsWith("image://")
  );
}

export function normalizeCliPathOrSource(locator: string, method: DeploymentMethod): string {
  if (method === "prebuilt-image" || isRemoteOrImageSource(locator) || isAbsolute(locator)) {
    return locator;
  }

  const bases = [process.env.PWD, process.cwd()].filter(
    (base): base is string => typeof base === "string" && base.length > 0,
  );
  for (const base of bases) {
    const candidate = resolve(base, locator);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return locator;
}
