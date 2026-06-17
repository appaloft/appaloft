import {
  type ConnectorCapabilityApplyInput,
  type ConnectorCapabilityApplyResult,
  type ConnectorCapabilityPlanInput,
  type ConnectorCapabilityPlanPreview,
  type ConnectorProviderAdapter,
  type ExecutionContext,
} from "@appaloft/application";
import {
  domainError,
  err,
  NotificationMessage,
  type NotificationMessageDeliverySnapshot,
  type NotificationMessageSnapshot,
  ok,
  type Result,
} from "@appaloft/core";

export interface SlackNotificationWebhookProvider {
  webhookUrl(): Promise<Result<string>> | Result<string>;
}

export type SlackNotificationFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface StaticSlackNotificationWebhookProviderOptions {
  webhookUrl: string;
}

export class StaticSlackNotificationWebhookProvider implements SlackNotificationWebhookProvider {
  private readonly url: string;

  constructor(options: StaticSlackNotificationWebhookProviderOptions) {
    this.url = options.webhookUrl;
  }

  webhookUrl(): Result<string> {
    const url = this.url.trim();
    if (!url) {
      return err(domainError.validation("Slack notification webhook URL is required"));
    }
    return ok(url);
  }
}

export interface SlackNotificationConnectorProviderAdapterOptions {
  connectorKey?: string;
  providerTitle?: string;
  defaultChannelRef?: string;
  fetcher?: SlackNotificationFetch;
  webhookProvider: SlackNotificationWebhookProvider;
}

export class SlackNotificationConnectorProviderAdapter implements ConnectorProviderAdapter {
  readonly connectorKey: string;
  private readonly providerTitle: string;
  private readonly defaultChannelRef: string;
  private readonly fetcher: SlackNotificationFetch;
  private readonly webhookProvider: SlackNotificationWebhookProvider;

  constructor(options: SlackNotificationConnectorProviderAdapterOptions) {
    this.connectorKey = options.connectorKey ?? "slack-notification";
    this.providerTitle = options.providerTitle ?? "Slack Notification";
    this.defaultChannelRef = options.defaultChannelRef ?? "#deployments";
    this.fetcher = options.fetcher ?? fetch;
    this.webhookProvider = options.webhookProvider;
  }

  canPlan(capabilityKey: string): boolean {
    return capabilityKey === "notification.messages.plan";
  }

  async planCapability(
    context: ExecutionContext,
    input: ConnectorCapabilityPlanInput,
  ): Promise<Result<ConnectorCapabilityPlanPreview>> {
    void context;
    if (!this.canPlan(input.capabilityKey)) {
      return err(
        domainError.validation(`Connector ${this.connectorKey} cannot plan ${input.capabilityKey}`),
      );
    }

    const parameters = parseNotificationMessageParameters(
      this.defaultChannelRef,
      input.parameters ?? {},
    );
    if (parameters.isErr()) return err(parameters.error);
    const message = NotificationMessage.create(parameters.value);
    if (message.isErr()) return err(message.error);
    return ok(this.toPreview(input, message.value));
  }

  canApply(capabilityKey: string): boolean {
    return capabilityKey === "notification.messages.send";
  }

  async applyCapability(
    context: ExecutionContext,
    input: ConnectorCapabilityApplyInput,
  ): Promise<Result<ConnectorCapabilityApplyResult>> {
    void context;
    if (!this.canApply(input.capabilityKey)) {
      return err(
        domainError.validation(
          `Connector ${this.connectorKey} cannot apply ${input.capabilityKey}`,
        ),
      );
    }

    const parameters = parseNotificationMessageParameters(
      this.defaultChannelRef,
      input.parameters ?? {},
    );
    if (parameters.isErr()) return err(parameters.error);
    const message = NotificationMessage.create(parameters.value);
    if (message.isErr()) return err(message.error);
    if (message.value.requiresExplicitAcceptance() && !input.acceptedPlanId) {
      return err(
        domainError.conflict(
          `Connector ${this.connectorKey} requires an accepted plan before sending sensitive notification payloads`,
          {
            capabilityKey: input.capabilityKey,
          },
        ),
      );
    }

    const webhookUrl = await this.webhookProvider.webhookUrl();
    if (webhookUrl.isErr()) return err(webhookUrl.error);
    const payload = slackPayload(message.value);
    const response = await this.fetcher(webhookUrl.value, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const responseText = await response.text();
    if (!response.ok || responseText.trim() !== "ok") {
      return err(
        domainError.provider("Slack notification webhook rejected the message", {
          status: response.status,
          providerError: safeSlackError(responseText),
        }),
      );
    }

    const notificationDelivery: NotificationMessageDeliverySnapshot = {
      ...message.value.toJSON(),
      providerMessageId: `slack_msg_${stableHash({
        connectorKey: input.connectorKey,
        capabilityKey: input.capabilityKey,
        ownerRef: input.ownerRef,
        message: message.value.toJSON(),
      })}`,
      status: "sent",
    };

    return ok({
      operationId: `notify_${stableHash(notificationDelivery)}`,
      connectorKey: input.connectorKey,
      capabilityKey: input.capabilityKey,
      status: "applied",
      summary: `${this.providerTitle}: sent ${message.value.summary()}`,
      effects: [
        {
          kind: "notification.message.sent",
          title: message.value.title(),
          description: message.value.description(),
          providerRecordId: notificationDelivery.providerMessageId,
          managed: true,
        },
      ],
      providerResult: {
        kind: "notification-delivery",
        notificationDelivery,
      },
    });
  }

  private toPreview(
    input: ConnectorCapabilityPlanInput,
    message: NotificationMessage,
  ): ConnectorCapabilityPlanPreview {
    const notificationMessage = message.toJSON();
    const planId = `slack_notifyplan_${stableHash({
      connectorKey: input.connectorKey,
      capabilityKey: input.capabilityKey,
      ownerRef: input.ownerRef,
      notificationMessage,
    })}`;

    return {
      planId,
      connectorKey: input.connectorKey,
      capabilityKey: input.capabilityKey,
      riskLevel: message.riskLevel(),
      requiresExplicitAcceptance: message.requiresExplicitAcceptance(),
      summary: `${this.providerTitle}: ${message.summary()}`,
      effects: [
        {
          kind: "notification.message.preview",
          title: message.title(),
          description: message.description(),
        },
      ],
      cleanup: {
        supported: false,
        description: "Slack incoming webhooks do not support Appaloft-driven message cleanup.",
      },
      providerPlan: {
        kind: "notification-message",
        notificationMessage,
      },
    };
  }
}

function parseNotificationMessageParameters(
  defaultChannelRef: string,
  parameters: Record<string, unknown>,
): Result<NotificationMessageSnapshot> {
  const channelRef = optionalString(parameters.channelRef ?? parameters.channel, defaultChannelRef);
  const subject = optionalString(parameters.subject ?? parameters.title, "Appaloft notification");
  const body = optionalString(parameters.body ?? parameters.text ?? parameters.message, subject);
  const payload = isRecord(parameters.payload) ? parameters.payload : {};
  const redactedFields = redactedPayloadFields(payload);
  const bodyPreview = redactSensitiveText(body);
  const metadata = sanitizeMetadata(isRecord(parameters.metadata) ? parameters.metadata : {});
  const payloadSensitivity =
    parameters.sensitive === true || redactedFields.length > 0 ? "sensitive" : "normal";

  return ok({
    providerKey: "slack",
    channelRef,
    subject,
    bodyPreview,
    payloadSensitivity,
    redactedFields,
    metadata,
  });
}

function slackPayload(message: NotificationMessage): { text: string } {
  const snapshot = message.toJSON();
  return {
    text: `*${snapshot.subject}*\n${snapshot.bodyPreview}`,
  };
}

function optionalString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function redactedPayloadFields(payload: Record<string, unknown>): string[] {
  return Object.keys(payload)
    .filter((key) => sensitiveFieldName(key))
    .sort((left, right) => left.localeCompare(right));
}

function sensitiveFieldName(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized.includes("token") ||
    normalized.includes("secret") ||
    normalized.includes("password") ||
    normalized.includes("email") ||
    normalized.includes("authorization")
  );
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(token|secret|password|authorization)=\S+/gi, "$1=[redacted]");
}

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(metadata)) {
    const normalizedKey = key.trim();
    if (!normalizedKey || typeof value !== "string") {
      continue;
    }
    const normalizedValue = value.trim();
    if (normalizedValue) {
      sanitized[normalizedKey] = normalizedValue;
    }
  }
  return sanitized;
}

function safeSlackError(value: string): string {
  return value
    .trim()
    .replace(/https:\/\/hooks\.slack(?:-gov)?\.com\/services\/\S+/gi, "[redacted-slack-webhook]")
    .slice(0, 160);
}

function stableHash(value: unknown): string {
  const input = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
