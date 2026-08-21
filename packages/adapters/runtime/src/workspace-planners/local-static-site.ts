import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

function isRemoteOrImageLocator(locator: string): boolean {
  return (
    /^(https?|ssh|git|oci):\/\//i.test(locator) ||
    /^[^/\\]+@[^/\\]+:/.test(locator) ||
    locator.startsWith("docker://") ||
    locator.startsWith("image://")
  );
}

/**
 * Folder→URL static hint: `public/index.html` publishes from `public`;
 * root `index.html` publishes from the source root (`.`).
 */
export function detectLocalStaticPublishDirectory(locator: string): string | undefined {
  if (isRemoteOrImageLocator(locator)) {
    return undefined;
  }

  const root = resolve(locator);
  if (existsSync(join(root, "public", "index.html"))) {
    return "public";
  }
  if (existsSync(join(root, "index.html"))) {
    return ".";
  }
  return undefined;
}

export function wireLocalStaticPublishDirectory(value: string): string {
  return value === "." || value === "./" || value === "/" ? "/" : value;
}
