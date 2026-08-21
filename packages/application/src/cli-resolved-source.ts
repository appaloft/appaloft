export const CLI_RESOLVED_SOURCE_METADATA_KEY = "cliResolvedSource";

export function explicitCliResolvedSource(input: {
  cliResolvedSource?: string;
  metadata?: Record<string, string>;
  locator?: string;
}): string | undefined {
  const fromInput = input.cliResolvedSource?.trim();
  if (fromInput) {
    return fromInput;
  }

  const fromMetadata = input.metadata?.[CLI_RESOLVED_SOURCE_METADATA_KEY]?.trim();
  if (fromMetadata) {
    return fromMetadata;
  }

  const locator = input.locator?.trim();
  return locator || undefined;
}

export function withCliResolvedSourceMetadata(
  metadata: Record<string, string> | undefined,
  cliResolvedSource: string | undefined,
): Record<string, string> | undefined {
  const resolved = cliResolvedSource?.trim();
  if (!resolved) {
    return metadata;
  }

  return {
    ...(metadata ?? {}),
    [CLI_RESOLVED_SOURCE_METADATA_KEY]: resolved,
  };
}
