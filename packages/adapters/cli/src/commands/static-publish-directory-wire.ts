/**
 * Live Cloud still runs the pre-#1309 `normalizeStaticPublishDirectory` that rejects `.`.
 * Production already accepts `/` as the source-root publish directory. CLI entry workflows
 * must send that form so tonight's control plane never sees a dot segment.
 */
export function wireCompatibleStaticPublishDirectory(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const normalized = trimmed.replaceAll("\\", "/").replace(/\/+$/u, "") || "/";
  if (normalized === "." || normalized === "./" || normalized === "/") {
    return "/";
  }

  return trimmed;
}

export function withWireCompatibleStaticPublishDirectory<
  T extends { readonly publishDirectory?: string | undefined },
>(profile: T): T {
  const current = profile.publishDirectory;
  if (!current) {
    return profile;
  }

  const publishDirectory = wireCompatibleStaticPublishDirectory(current);
  if (publishDirectory === current) {
    return profile;
  }

  return {
    ...profile,
    publishDirectory,
  };
}
