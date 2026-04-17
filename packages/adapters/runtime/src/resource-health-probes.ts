import {
  type ExecutionContext,
  type ResourceHealthProbeRequest,
  type ResourceHealthProbeResult,
  type ResourceHealthProbeRunner,
} from "@appaloft/application";
import { domainError, err, ok, type DomainError, type Result } from "@appaloft/core";

const responsePreviewLimit = 4096;

function normalizedProbeUrl(raw: string): Result<URL, DomainError> {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return err(
        domainError.resourceHealthUnavailable("Resource health probe URL is unsupported", {
          phase: "health-check-execution",
          protocol: url.protocol,
        }),
      );
    }
    return ok(url);
  } catch {
    return err(
      domainError.resourceHealthUnavailable("Resource health probe URL is invalid", {
        phase: "health-check-execution",
      }),
    );
  }
}

async function readBoundedText(response: Response): Promise<string> {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (total < responsePreviewLimit) {
    const read = await reader.read();
    if (read.done) {
      break;
    }

    const remaining = responsePreviewLimit - total;
    const chunk = read.value.byteLength > remaining ? read.value.slice(0, remaining) : read.value;
    chunks.push(chunk);
    total += chunk.byteLength;

    if (read.value.byteLength > remaining) {
      await reader.cancel();
      break;
    }
  }

  return new TextDecoder().decode(Uint8Array.from(chunks.flatMap((chunk) => [...chunk])));
}

function failedProbe(input: {
  request: ResourceHealthProbeRequest;
  observedAt: string;
  durationMs: number;
  statusCode?: number;
  reasonCode: string;
  message: string;
  retriable?: boolean;
}): ResourceHealthProbeResult {
  return {
    name: input.request.name,
    target: input.request.target,
    status: "failed",
    observedAt: input.observedAt,
    durationMs: input.durationMs,
    ...(input.statusCode ? { statusCode: input.statusCode } : {}),
    reasonCode: input.reasonCode,
    message: input.message,
    retriable: input.retriable ?? true,
  };
}

export class RuntimeResourceHealthProbeRunner implements ResourceHealthProbeRunner {
  async probe(
    context: ExecutionContext,
    request: ResourceHealthProbeRequest,
  ): Promise<Result<ResourceHealthProbeResult, DomainError>> {
    const urlResult = normalizedProbeUrl(request.url);
    if (urlResult.isErr()) {
      return err(urlResult.error);
    }

    const startedAt = Date.now();
    const timeoutMs = Math.max(1, request.timeoutSeconds) * 1000;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(urlResult.value, {
        method: request.method,
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "User-Agent": "appaloft-resource-health/1",
          "X-Appaloft-Request-Id": context.requestId,
        },
      });
      const durationMs = Date.now() - startedAt;

      if (response.status !== request.expectedStatusCode) {
        return ok(
          failedProbe({
            request,
            observedAt: new Date().toISOString(),
            durationMs,
            statusCode: response.status,
            reasonCode: "resource_health_check_response_mismatch",
            message: "Resource health probe returned an unexpected status code.",
          }),
        );
      }

      if (request.expectedResponseText && request.method !== "HEAD") {
        const bodyPreview = await readBoundedText(response);
        if (!bodyPreview.includes(request.expectedResponseText)) {
          return ok(
            failedProbe({
              request,
              observedAt: new Date().toISOString(),
              durationMs,
              statusCode: response.status,
              reasonCode: "resource_health_check_response_mismatch",
              message: "Resource health probe response did not contain the expected text.",
            }),
          );
        }
      }

      return ok({
        name: request.name,
        target: request.target,
        status: "passed",
        observedAt: new Date().toISOString(),
        durationMs,
        statusCode: response.status,
        metadata: {
          probeRunner: "runtime-resource-health-probe",
        },
      });
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const timedOut = error instanceof Error && error.name === "AbortError";
      return ok(
        failedProbe({
          request,
          observedAt: new Date().toISOString(),
          durationMs,
          reasonCode: timedOut ? "resource_health_check_timeout" : "resource_health_check_failed",
          message: timedOut
            ? "Resource health probe timed out."
            : "Resource health probe could not reach the target.",
          retriable: true,
        }),
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
