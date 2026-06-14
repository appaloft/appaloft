import { isRetiredConsoleIntentSegment } from "$lib/console/retired-intent-routes";

export function match(param: string): boolean {
  const segment = param.trim().toLowerCase();

  return segment.length > 0 && !isRetiredConsoleIntentSegment(segment);
}
