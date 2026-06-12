const retiredConsoleIntentSegments = new Set(["new", "create"]);

export function isRetiredConsoleIntentSegment(value: string | null | undefined): boolean {
  return retiredConsoleIntentSegments.has(value?.trim().toLowerCase() ?? "");
}
