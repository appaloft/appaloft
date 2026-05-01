import {
  classifyResourceAccessFailure,
  parseResourceAccessFailureCode,
  parseResourceAccessFailureSignal,
  type ResourceAccessFailureDiagnostic,
  resourceAccessFailureCodeFromHttpStatus,
} from "@appaloft/application";

const routeFailureSignalHeader = "x-appaloft-resource-access-signal";

function firstQueryValue(searchParams: URLSearchParams, key: string): string | null {
  const value = searchParams.get(key)?.trim();
  return value && value.length > 0 ? value : null;
}

function parseStatus(input: string | null): number | null {
  if (!input) {
    return null;
  }

  const status = Number(input);
  return Number.isInteger(status) ? status : null;
}

function safeToken(input: string | null, fallback: string): string {
  if (!input) {
    return fallback;
  }

  const normalized = input.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 160);
  return normalized.length > 0 ? normalized : fallback;
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function requestAcceptsHtml(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("application/json") || accept.includes("application/problem+json")) {
    return false;
  }

  return accept.includes("text/html");
}

function resolveRequestId(request: Request, searchParams: URLSearchParams): string {
  return safeToken(
    firstQueryValue(searchParams, "requestId") ?? request.headers.get("x-request-id"),
    "req_unavailable",
  );
}

function buildDiagnostic(request: Request, now: () => string): ResourceAccessFailureDiagnostic {
  const url = new URL(request.url);
  const code = parseResourceAccessFailureCode(firstQueryValue(url.searchParams, "code"));
  const signal =
    parseResourceAccessFailureSignal(firstQueryValue(url.searchParams, "signal")) ??
    parseResourceAccessFailureSignal(request.headers.get(routeFailureSignalHeader));
  const status = parseStatus(firstQueryValue(url.searchParams, "status"));
  const statusCode = status === null ? null : resourceAccessFailureCodeFromHttpStatus(status);
  const selectedCode = code ?? (signal ? null : statusCode);
  const affectedUrl = firstQueryValue(url.searchParams, "affectedUrl");
  const affectedHostname = firstQueryValue(url.searchParams, "host");
  const affectedPath = firstQueryValue(url.searchParams, "path");

  return classifyResourceAccessFailure({
    ...(selectedCode ? { code: selectedCode } : {}),
    ...(signal && !code ? { signal } : {}),
    requestId: resolveRequestId(request, url.searchParams),
    generatedAt: now(),
    affected: {
      ...(affectedUrl ? { url: affectedUrl } : {}),
      ...(affectedHostname ? { hostname: affectedHostname } : {}),
      ...(affectedPath ? { path: affectedPath } : {}),
      method: request.method,
    },
    ...(firstQueryValue(url.searchParams, "causeCode")
      ? { causeCode: safeToken(firstQueryValue(url.searchParams, "causeCode"), "") }
      : {}),
    ...(request.headers.get("x-request-id")
      ? { correlationId: safeToken(request.headers.get("x-request-id"), "req_unavailable") }
      : {}),
  });
}

function publicMessage(diagnostic: ResourceAccessFailureDiagnostic): string {
  switch (diagnostic.ownerHint) {
    case "resource":
      return "The request reached Appaloft, but the application did not respond successfully.";
    case "operator-config":
      return "The request reached Appaloft, but the route configuration could not serve traffic.";
    case "platform":
      return "The request reached Appaloft, but the edge route is not available.";
    case "unknown":
      return "The request reached Appaloft, but the route failed before a response was available.";
  }
}

function renderHtml(diagnostic: ResourceAccessFailureDiagnostic): string {
  const code = escapeHtml(diagnostic.code);
  const requestId = escapeHtml(diagnostic.requestId);
  const generatedAt = escapeHtml(diagnostic.generatedAt);
  const message = escapeHtml(publicMessage(diagnostic));
  const nextAction = escapeHtml(diagnostic.nextAction);
  const edgeStatus = diagnostic.ownerHint === "platform" ? "Error" : "Working";
  const resourceStatus = diagnostic.ownerHint === "platform" ? "Unknown" : "Error";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Appaloft access error</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #172026;
        background: #f7f9fb;
      }
      body {
        margin: 0;
      }
      main {
        max-width: 860px;
        margin: 0 auto;
        padding: 56px 24px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 36px;
        line-height: 1.1;
        font-weight: 650;
      }
      p {
        margin: 0;
        color: #4b5a62;
      }
      .code {
        display: inline-flex;
        margin-left: 8px;
        padding: 3px 8px;
        border-radius: 6px;
        background: #e8edf2;
        color: #38464e;
        font-size: 12px;
        vertical-align: middle;
      }
      .timeline {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 16px;
        margin: 40px 0 32px;
      }
      .step {
        border: 1px solid #d8e0e6;
        border-radius: 8px;
        background: #fff;
        padding: 18px;
      }
      .label {
        color: #667985;
        font-size: 13px;
      }
      .status {
        margin-top: 8px;
        font-size: 18px;
        font-weight: 650;
      }
      .ok {
        color: #217a42;
      }
      .bad {
        color: #b42318;
      }
      .meta {
        margin-top: 28px;
        padding-top: 18px;
        border-top: 1px solid #d8e0e6;
        font-size: 13px;
      }
      @media (max-width: 680px) {
        main {
          padding: 36px 18px;
        }
        h1 {
          font-size: 30px;
        }
        .timeline {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Application unavailable <span class="code">${code}</span></h1>
      <p>${message}</p>
      <section class="timeline" aria-label="Request path">
        <div class="step">
          <div class="label">Browser</div>
          <div class="status ok">Working</div>
        </div>
        <div class="step">
          <div class="label">Appaloft Edge</div>
          <div class="status ${edgeStatus === "Working" ? "ok" : "bad"}">${edgeStatus}</div>
        </div>
        <div class="step">
          <div class="label">Application</div>
          <div class="status ${resourceStatus === "Error" ? "bad" : ""}">${resourceStatus}</div>
        </div>
      </section>
      <p>Try again shortly. If you own this app, use the request id below in resource health or diagnostics.</p>
      <p class="meta">Next action: ${nextAction}</p>
      <p class="meta">Request ID: ${requestId}<br />Time: ${generatedAt}</p>
    </main>
  </body>
</html>`;
}

function problemDetails(diagnostic: ResourceAccessFailureDiagnostic): Record<string, unknown> {
  return {
    type: "https://appaloft.dev/problems/resource-access-failure",
    title: "Resource access failed",
    status: diagnostic.httpStatus,
    code: diagnostic.code,
    category: diagnostic.category,
    phase: diagnostic.phase,
    requestId: diagnostic.requestId,
    generatedAt: diagnostic.generatedAt,
    retriable: diagnostic.retriable,
    ownerHint: diagnostic.ownerHint,
    nextAction: diagnostic.nextAction,
    ...(diagnostic.affected ? { affected: diagnostic.affected } : {}),
    ...(diagnostic.route ? { route: diagnostic.route } : {}),
    ...(diagnostic.causeCode ? { causeCode: diagnostic.causeCode } : {}),
  };
}

export function resourceAccessFailureDiagnosticResponse(
  request: Request,
  input?: {
    now?: () => string;
  },
): Response {
  const diagnostic = buildDiagnostic(request, input?.now ?? (() => new Date().toISOString()));

  if (requestAcceptsHtml(request)) {
    return new Response(renderHtml(diagnostic), {
      status: diagnostic.httpStatus,
      headers: {
        "cache-control": "no-store",
        "content-type": "text/html; charset=utf-8",
        "x-appaloft-diagnostic-code": diagnostic.code,
        "x-request-id": diagnostic.requestId,
      },
    });
  }

  return Response.json(problemDetails(diagnostic), {
    status: diagnostic.httpStatus,
    headers: {
      "cache-control": "no-store",
      "content-type": "application/problem+json",
      "x-appaloft-diagnostic-code": diagnostic.code,
      "x-request-id": diagnostic.requestId,
    },
  });
}
