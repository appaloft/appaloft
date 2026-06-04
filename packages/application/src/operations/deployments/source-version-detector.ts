import { err, ok, type Result } from "@appaloft/core";

import { type ExecutionContext } from "../../execution-context";
import { type SourceVersionDetectionResult, type SourceVersionDetector } from "../../ports";

export class CoreSourceVersionDetector implements SourceVersionDetector {
  async detect(
    _context: ExecutionContext,
    input: Parameters<SourceVersionDetector["detect"]>[1],
  ): Promise<Result<SourceVersionDetectionResult>> {
    const resolved = input.source.resolveVersion({
      ...(input.requestedVersion ? { requestedVersion: input.requestedVersion } : {}),
    });
    if (resolved.isErr()) {
      return err(resolved.error);
    }

    return ok(resolved.value);
  }
}
