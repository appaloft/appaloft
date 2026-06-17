import { describe, expect, test } from "bun:test";

import { type ExecutionContext } from "@appaloft/application";

import {
  SlackNotificationConnectorProviderAdapter,
  StaticSlackNotificationWebhookProvider,
} from "../src";

interface CapturedRequest {
  input: RequestInfo | URL;
  init: RequestInit | undefined;
}

function adapter(input: { captured?: CapturedRequest[]; status?: number; body?: string } = {}) {
  return new SlackNotificationConnectorProviderAdapter({
    webhookProvider: new StaticSlackNotificationWebhookProvider({
      webhookUrl: "https://hooks.slack.com/services/T000/B000/secret",
    }),
    fetcher: async (requestInput, init) => {
      input.captured?.push({ input: requestInput, init });
      return new Response(input.body ?? "ok", {
        status: input.status ?? 200,
        headers: { "content-type": "text/plain" },
      });
    },
  });
}

function testContext(): ExecutionContext {
  return {
    entrypoint: "system",
    locale: "en-US",
    requestId: "req_test",
    t(key) {
      return key;
    },
    tracer: {
      async startActiveSpan(_name, _options, callback) {
        return callback({
          addEvent() {},
          recordError() {},
          setAttribute() {},
          setAttributes() {},
          setStatus() {},
        });
      },
    },
  };
}

describe("SlackNotificationConnectorProviderAdapter", () => {
  test("[APP-CONN-011] plans Slack messages without exposing webhook URL or sensitive payload", async () => {
    const service = adapter();

    const result = await service.planCapability(testContext(), {
      connectorKey: "slack-notification",
      capabilityKey: "notification.messages.plan",
      parameters: {
        subject: "Deploy finished",
        body: "Deploy finished for owner@example.com token=secret-token",
        payload: {
          actorEmail: "owner@example.com",
          token: "secret-token",
        },
      },
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan).toMatchObject({
      connectorKey: "slack-notification",
      capabilityKey: "notification.messages.plan",
      riskLevel: "medium",
      requiresExplicitAcceptance: true,
      providerPlan: {
        kind: "notification-message",
        notificationMessage: {
          providerKey: "slack",
          channelRef: "#deployments",
          payloadSensitivity: "sensitive",
          redactedFields: ["actorEmail", "token"],
        },
      },
    });
    expect(JSON.stringify(plan)).not.toContain("hooks.slack.com");
    expect(JSON.stringify(plan)).not.toContain("owner@example.com");
    expect(JSON.stringify(plan)).not.toContain("secret-token");
  });

  test("[APP-CONN-011] posts accepted Slack webhook messages and stores only safe delivery metadata", async () => {
    const captured: CapturedRequest[] = [];
    const service = adapter({ captured });

    const result = await service.applyCapability(testContext(), {
      connectorKey: "slack-notification",
      capabilityKey: "notification.messages.send",
      acceptedPlanId: "notifyplan_test",
      parameters: {
        subject: "Deploy finished",
        body: "Deploy finished for appaloft-edge-prod-1",
      },
    });

    expect(result.isOk()).toBe(true);
    const delivery = result._unsafeUnwrap();
    expect(captured).toHaveLength(1);
    expect(String(captured[0]?.input)).toBe("https://hooks.slack.com/services/T000/B000/secret");
    expect(captured[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(captured[0]?.init?.body))).toEqual({
      text: "*Deploy finished*\nDeploy finished for appaloft-edge-prod-1",
    });
    expect(delivery).toMatchObject({
      connectorKey: "slack-notification",
      capabilityKey: "notification.messages.send",
      status: "applied",
      providerResult: {
        kind: "notification-delivery",
        notificationDelivery: {
          providerKey: "slack",
          status: "sent",
        },
      },
    });
    expect(JSON.stringify(delivery)).not.toContain("hooks.slack.com");
  });

  test("[APP-CONN-011] requires accepted plan before sending sensitive Slack messages", async () => {
    const service = adapter();

    const result = await service.applyCapability(testContext(), {
      connectorKey: "slack-notification",
      capabilityKey: "notification.messages.send",
      parameters: {
        subject: "Deploy finished",
        body: "Deploy finished for owner@example.com",
        payload: {
          actorEmail: "owner@example.com",
        },
      },
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: "conflict",
    });
  });

  test("[APP-CONN-MOCK-020] translates Slack webhook errors without leaking webhook URL", async () => {
    const service = adapter({
      status: 403,
      body: "action_prohibited https://hooks.slack.com/services/T000/B000/secret",
    });

    const result = await service.applyCapability(testContext(), {
      connectorKey: "slack-notification",
      capabilityKey: "notification.messages.send",
      parameters: {
        subject: "Deploy blocked",
        body: "Deploy blocked",
      },
    });

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error).toMatchObject({
      category: "provider",
    });
    expect(JSON.stringify(error)).toContain("[redacted-slack-webhook]");
    expect(JSON.stringify(error)).not.toContain("hooks.slack.com");
  });
});
