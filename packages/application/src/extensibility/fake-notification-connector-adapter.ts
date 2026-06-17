import {
  domainError,
  err,
  NotificationMessage,
  type NotificationMessageDeliverySnapshot,
  type NotificationMessageSnapshot,
  ok,
  type Result,
} from "@appaloft/core";

import { type ExecutionContext } from "../execution-context";
import {
  type ConnectorCapabilityApplyInput,
  type ConnectorCapabilityApplyResult,
  type ConnectorCapabilityPlanInput,
  type ConnectorCapabilityPlanPreview,
  type ConnectorProviderAdapter,
} from "../ports";

export interface FakeNotificationConnectorProviderAdapterOptions {
  connectorKey: string;
  providerKey: string;
  providerTitle: string;
  defaultChannelRef?: string;
}

export class FakeNotificationConnectorProviderAdapter implements ConnectorProviderAdapter {
  readonly connectorKey: string;
  private readonly providerKey: string;
  private readonly providerTitle: string;
  private readonly defaultChannelRef: string;

  constructor(options: FakeNotificationConnectorProviderAdapterOptions) {
    this.connectorKey = options.connectorKey;
    this.providerKey = options.providerKey;
    this.providerTitle = options.providerTitle;
    this.defaultChannelRef = options.defaultChannelRef ?? "#deployments";
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
      this.providerKey,
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
      this.providerKey,
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

    const notificationDelivery: NotificationMessageDeliverySnapshot = {
      ...message.value.toJSON(),
      providerMessageId: `msg_${stableHash({
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
    const planId = `notifyplan_${stableHash({
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
        description: "Notification messages cannot be cleaned up through Appaloft.",
      },
      providerPlan: {
        kind: "notification-message",
        notificationMessage,
      },
    };
  }
}

function parseNotificationMessageParameters(
  providerKey: string,
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
    providerKey,
    channelRef,
    subject,
    bodyPreview,
    payloadSensitivity,
    redactedFields,
    metadata,
  });
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
