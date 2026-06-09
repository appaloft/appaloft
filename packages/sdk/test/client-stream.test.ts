import { describe, expect, test } from "bun:test";

import { createAppaloftSdkClient, type SdkOperationDescriptor } from "../src";

const streamOperation: SdkOperationDescriptor = {
  operationKey: "deployments.stream-events",
  operationGroup: "deployments",
  operationMethod: "streamEvents",
  operationId: "deployments.events.stream",
  kind: "query",
  domain: "deployments",
  messageName: "StreamDeploymentEventsQuery",
  route: {
    method: "GET",
    path: "/deployments/{deploymentId}/events/stream",
  },
  authPolicy: "product-session",
  errorFamily: "structured-platform-error",
  streaming: true,
};

const nonStreamOperation: SdkOperationDescriptor = {
  ...streamOperation,
  route: {
    method: "GET",
    path: "/deployments/{deploymentId}/events",
  },
  streaming: false,
};

const workStreamOperation: SdkOperationDescriptor = {
  operationKey: "operator-work.stream-events",
  operationGroup: "operator-work",
  operationMethod: "streamEvents",
  operationId: "operatorWork.eventsStream",
  kind: "query",
  domain: "operator-work",
  messageName: "StreamOperatorWorkEventsQuery",
  route: {
    method: "GET",
    path: "/operator-work/{workId}/events/stream",
  },
  authPolicy: "product-session",
  errorFamily: "structured-platform-error",
  streaming: true,
};

describe("Appaloft SDK streaming helpers", () => {
  test("[TS-SDK-STREAM-001] streams typed JSON envelopes only for streaming operations", async () => {
    const client = createAppaloftSdkClient({
      baseUrl: "https://appaloft.example/api",
      fetch: async () =>
        new Response(
          [
            'data: {"schemaVersion":"deployments.stream-events/v1","kind":"heartbeat","at":"2026-01-01T00:00:00.000Z"}',
            "",
            'data: {"schemaVersion":"deployments.stream-events/v1","kind":"closed","reason":"completed","cursor":"dep_demo:1"}',
            "",
          ].join("\n"),
          {
            headers: {
              "content-type": "text/event-stream",
            },
          },
        ),
    });

    const envelopes: unknown[] = [];

    for await (const envelope of client.stream({
      operation: streamOperation,
      pathParams: {
        deploymentId: "dep_demo",
      },
    })) {
      envelopes.push(envelope);
    }

    expect(envelopes).toEqual([
      {
        schemaVersion: "deployments.stream-events/v1",
        kind: "heartbeat",
        at: "2026-01-01T00:00:00.000Z",
      },
      {
        schemaVersion: "deployments.stream-events/v1",
        kind: "closed",
        reason: "completed",
        cursor: "dep_demo:1",
      },
    ]);
  });

  test("[OP-WORK-ENTRY-003C] streams operator work envelopes as an AsyncIterable", async () => {
    const client = createAppaloftSdkClient({
      baseUrl: "https://appaloft.example/api",
      fetch: async () =>
        new Response(
          [
            'data: {"schemaVersion":"operator-work.stream-events/v1","kind":"heartbeat","at":"2026-01-01T00:00:00.000Z","cursor":"wrk_blueprint_install:1"}',
            "",
            'data: {"schemaVersion":"operator-work.stream-events/v1","kind":"closed","reason":"completed","cursor":"wrk_blueprint_install:2"}',
            "",
          ].join("\n"),
          {
            headers: {
              "content-type": "text/event-stream",
            },
          },
        ),
    });

    const envelopes: unknown[] = [];

    for await (const envelope of client.stream({
      operation: workStreamOperation,
      pathParams: {
        workId: "wrk_blueprint_install",
      },
    })) {
      envelopes.push(envelope);
    }

    expect(envelopes).toEqual([
      {
        schemaVersion: "operator-work.stream-events/v1",
        kind: "heartbeat",
        at: "2026-01-01T00:00:00.000Z",
        cursor: "wrk_blueprint_install:1",
      },
      {
        schemaVersion: "operator-work.stream-events/v1",
        kind: "closed",
        reason: "completed",
        cursor: "wrk_blueprint_install:2",
      },
    ]);
  });

  test("[TS-SDK-STREAM-001] rejects non-streaming operation descriptors", async () => {
    const client = createAppaloftSdkClient({
      baseUrl: "https://appaloft.example/api",
      fetch: async () => Response.json({ envelopes: [] }),
    });

    await expect(async () =>
      client.stream({
        operation: nonStreamOperation,
        pathParams: {
          deploymentId: "dep_demo",
        },
      }),
    ).toThrow("Operation deployments.stream-events is not marked as streaming");
  });

  test("[TS-SDK-STREAM-001] wires cancellation through AbortSignal", async () => {
    let capturedRequest: Request | undefined;
    const controller = new AbortController();
    const client = createAppaloftSdkClient({
      baseUrl: "https://appaloft.example/api",
      fetch: async (request) => {
        capturedRequest = request;
        return new Response('{"kind":"heartbeat"}\n', {
          headers: {
            "content-type": "application/x-ndjson",
          },
        });
      },
    });

    const stream = client.stream({
      operation: streamOperation,
      pathParams: {
        deploymentId: "dep_demo",
      },
      signal: controller.signal,
    });

    await stream[Symbol.asyncIterator]().next();
    controller.abort();

    expect(capturedRequest?.signal).toBe(controller.signal);
    expect(capturedRequest?.signal.aborted).toBe(true);
  });

  test("[TS-SDK-STREAM-001] returns structured stream errors before parsing envelopes", async () => {
    const client = createAppaloftSdkClient({
      baseUrl: "https://appaloft.example/api",
      fetch: async () =>
        Response.json(
          {
            error: {
              code: "product_auth_missing",
              category: "user",
              message: "Product session is required",
              retryable: false,
            },
          },
          { status: 401 },
        ),
    });

    const stream = client.stream({
      operation: streamOperation,
      pathParams: {
        deploymentId: "dep_demo",
      },
    });

    await expect(async () => stream[Symbol.asyncIterator]().next()).toThrow(
      "SDK stream request failed with product_auth_missing",
    );
  });
});
