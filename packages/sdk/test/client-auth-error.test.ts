import { describe, expect, test } from "bun:test";

import {
  createAppaloftSdkClient,
  isAppaloftSdkErrorCode,
  type SdkOperationDescriptor,
} from "../src";

const productSessionOperation: SdkOperationDescriptor = {
  operationKey: "organizations.current-context",
  operationGroup: "organizations",
  operationMethod: "currentContext",
  operationId: "organizations.currentContext",
  kind: "query",
  domain: "organizations",
  messageName: "GetCurrentOrganizationContextQuery",
  route: {
    method: "GET",
    path: "/organizations/current-context",
  },
  authPolicy: "product-session",
  errorFamily: "structured-platform-error",
  streaming: false,
};

const deployTokenOperation: SdkOperationDescriptor = {
  operationKey: "source-events.ingest",
  operationGroup: "source-events",
  operationMethod: "ingest",
  operationId: "source-events.ingest",
  kind: "command",
  domain: "source-events",
  messageName: "IngestSourceEventCommand",
  route: {
    method: "POST",
    path: "/resources/{resourceId}/source-events/generic-signed",
  },
  authPolicy: "webhook-signature",
  errorFamily: "structured-platform-error",
  streaming: false,
};

describe("Appaloft SDK auth and structured errors", () => {
  test("[TS-SDK-AUTH-001] sends product-session cookies and organization scope through operation input", async () => {
    let capturedRequest: Request | undefined;
    const client = createAppaloftSdkClient({
      baseUrl: "https://appaloft.example/api",
      auth: {
        kind: "product-session",
        cookie: "better-auth.session_token=test-session",
      },
      userAgent: "appaloft-cli/test",
      fetch: async (request) => {
        capturedRequest = request;
        return Response.json({ ok: true });
      },
    });

    const result = await client.request({
      operation: {
        ...productSessionOperation,
        route: {
          method: "GET",
          path: "/organizations/{organizationId}/members",
        },
      },
      pathParams: {
        organizationId: "org_self_hosted",
      },
      query: {
        cursor: "cursor_1",
      },
    });

    expect(result.ok).toBe(true);
    expect(capturedRequest?.url).toBe(
      "https://appaloft.example/api/organizations/org_self_hosted/members?cursor=cursor_1",
    );
    expect(capturedRequest?.headers.get("cookie")).toBe("better-auth.session_token=test-session");
    expect(capturedRequest?.headers.get("user-agent")).toBe("appaloft-cli/test");
    expect(capturedRequest?.headers.has("authorization")).toBe(false);
  });

  test("[TS-SDK-AUTH-001] sends deploy-token bearer auth for machine-token operations", async () => {
    let capturedRequest: Request | undefined;
    const client = createAppaloftSdkClient({
      baseUrl: "https://appaloft.example/api",
      auth: {
        kind: "deploy-token",
        token: "aplt_dt_rawtokenvalue00000000",
      },
      fetch: async (request) => {
        capturedRequest = request;
        return Response.json({ accepted: true }, { status: 202 });
      },
    });

    const result = await client.request({
      operation: deployTokenOperation,
      pathParams: {
        resourceId: "res_web",
      },
      body: {
        eventId: "evt_1",
      },
    });

    expect(result).toMatchObject({ ok: true, status: 202 });
    expect(capturedRequest?.url).toBe(
      "https://appaloft.example/api/resources/res_web/source-events/generic-signed",
    );
    expect(capturedRequest?.headers.get("authorization")).toBe(
      "Bearer aplt_dt_rawtokenvalue00000000",
    );
    expect(capturedRequest?.headers.get("content-type")).toBe("application/json");
    expect(await capturedRequest?.json()).toEqual({ eventId: "evt_1" });
  });

  test("[TS-SDK-ERROR-001] returns typed product 401/403 errors without message parsing", async () => {
    const client = createAppaloftSdkClient({
      baseUrl: "https://appaloft.example/api",
      fetch: async () =>
        Response.json(
          {
            error: {
              code: "product_auth_forbidden",
              category: "user",
              message: "The current user is not allowed to manage this organization",
              retryable: false,
              details: {
                organizationId: "org_self_hosted",
                requiredRole: "admin",
              },
            },
          },
          { status: 403 },
        ),
    });

    const result = await client.request({
      operation: productSessionOperation,
    });

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: {
        code: "product_auth_forbidden",
        category: "user",
        message: "The current user is not allowed to manage this organization",
        retryable: false,
        details: {
          organizationId: "org_self_hosted",
          requiredRole: "admin",
        },
      },
    });

    if (!result.ok) {
      expect(isAppaloftSdkErrorCode(result.error, "product_auth_forbidden")).toBe(true);
      expect(isAppaloftSdkErrorCode(result.error, "product_auth_missing")).toBe(false);
    }
  });

  test("[TS-SDK-ERROR-001] returns typed action deploy-token 401/403 errors", async () => {
    const client = createAppaloftSdkClient({
      baseUrl: "https://appaloft.example/api",
      fetch: async () =>
        Response.json(
          {
            error: {
              code: "action_auth_invalid",
              category: "user",
              message: "Action deploy token is invalid",
              retryable: false,
              details: {
                phase: "action-authentication",
                requiredCredential: "deploy-token",
              },
            },
          },
          { status: 401 },
        ),
    });

    const result = await client.request({
      operation: deployTokenOperation,
      pathParams: {
        resourceId: "res_web",
      },
    });

    expect(result).toMatchObject({
      ok: false,
      status: 401,
      error: {
        code: "action_auth_invalid",
        category: "user",
        retryable: false,
      },
    });

    if (!result.ok) {
      expect(isAppaloftSdkErrorCode(result.error, "action_auth_invalid")).toBe(true);
    }
  });
});
