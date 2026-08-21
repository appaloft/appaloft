import { SourceDescriptor } from "@appaloft/core";

export const CLI_RESOLVED_SOURCE_METADATA_KEY = "cliResolvedSource";

/**
 * Exact `deploy .` path the CLI already printed as summary.Source.
 * Only an explicit value or persisted metadata counts. Locator is not a
 * fallback: after an upstream dirname it is already the parent.
 */
export function explicitCliResolvedSource(input: {
  cliResolvedSource?: string;
  metadata?: Record<string, string>;
}): string | undefined {
  const fromInput = input.cliResolvedSource?.trim();
  if (fromInput) {
    return fromInput;
  }

  const fromMetadata = input.metadata?.[CLI_RESOLVED_SOURCE_METADATA_KEY]?.trim();
  return fromMetadata || undefined;
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

export function retainCliResolvedSource(
  source: SourceDescriptor,
  cliResolvedSource: string | undefined,
): SourceDescriptor {
  const resolved = explicitCliResolvedSource({
    ...(cliResolvedSource ? { cliResolvedSource } : {}),
    ...(source.metadata ? { metadata: source.metadata } : {}),
  });
  if (!resolved) {
    return source;
  }

  return SourceDescriptor.rehydrate({
    ...source.toState(),
    metadata: withCliResolvedSourceMetadata(source.metadata, resolved) ?? {
      [CLI_RESOLVED_SOURCE_METADATA_KEY]: resolved,
    },
  });
}
