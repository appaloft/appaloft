import { domainError } from "../shared/errors";
import { err, ok, type Result } from "../shared/result";
import { ScalarValueObject } from "../shared/value-object";

export interface NotificationMessageSnapshot {
  providerKey: string;
  channelRef: string;
  subject: string;
  bodyPreview: string;
  payloadSensitivity: "normal" | "sensitive";
  redactedFields: string[];
  metadata: Record<string, string>;
}

export interface NotificationMessageDeliverySnapshot extends NotificationMessageSnapshot {
  providerMessageId: string;
  status: "sent" | "skipped";
}

function requiredText(value: string, label: string): Result<string> {
  const normalized = value.trim();
  if (!normalized) {
    return err(domainError.validation(`${label} is required`));
  }
  return ok(normalized);
}

const notificationProviderKeyBrand: unique symbol = Symbol("NotificationProviderKey");
export class NotificationProviderKey extends ScalarValueObject<string> {
  private [notificationProviderKeyBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<NotificationProviderKey> {
    return requiredText(value, "Notification provider key").map(
      (normalized) => new NotificationProviderKey(normalized.toLowerCase()),
    );
  }

  static rehydrate(value: string): NotificationProviderKey {
    return new NotificationProviderKey(value.trim().toLowerCase());
  }
}

const notificationChannelRefBrand: unique symbol = Symbol("NotificationChannelRef");
export class NotificationChannelRef extends ScalarValueObject<string> {
  private [notificationChannelRefBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<NotificationChannelRef> {
    return requiredText(value, "Notification channel reference").map(
      (normalized) => new NotificationChannelRef(normalized),
    );
  }

  static rehydrate(value: string): NotificationChannelRef {
    return new NotificationChannelRef(value.trim());
  }
}

const notificationSubjectBrand: unique symbol = Symbol("NotificationSubject");
export class NotificationSubject extends ScalarValueObject<string> {
  private [notificationSubjectBrand]!: void;

  private constructor(value: string) {
    super(value);
  }

  static create(value: string): Result<NotificationSubject> {
    return requiredText(value, "Notification subject").map(
      (normalized) => new NotificationSubject(limitText(normalized, 160)),
    );
  }

  static rehydrate(value: string): NotificationSubject {
    return new NotificationSubject(limitText(value.trim(), 160));
  }
}

export class NotificationMessage {
  private constructor(
    private readonly providerKeyValue: NotificationProviderKey,
    private readonly channelRefValue: NotificationChannelRef,
    private readonly subjectValue: NotificationSubject,
    private readonly bodyPreviewValue: string,
    private readonly payloadSensitivityValue: NotificationMessageSnapshot["payloadSensitivity"],
    private readonly redactedFieldsValue: string[],
    private readonly metadataValue: Record<string, string>,
  ) {}

  static create(input: NotificationMessageSnapshot): Result<NotificationMessage> {
    const providerKey = NotificationProviderKey.create(input.providerKey);
    if (providerKey.isErr()) return err(providerKey.error);
    const channelRef = NotificationChannelRef.create(input.channelRef);
    if (channelRef.isErr()) return err(channelRef.error);
    const subject = NotificationSubject.create(input.subject);
    if (subject.isErr()) return err(subject.error);
    const bodyPreview = requiredText(input.bodyPreview, "Notification body preview");
    if (bodyPreview.isErr()) return err(bodyPreview.error);
    if (!["normal", "sensitive"].includes(input.payloadSensitivity)) {
      return err(
        domainError.validation(
          `Unsupported notification payload sensitivity ${input.payloadSensitivity}`,
        ),
      );
    }

    return ok(
      new NotificationMessage(
        providerKey.value,
        channelRef.value,
        subject.value,
        limitText(bodyPreview.value, 500),
        input.payloadSensitivity,
        [...new Set(input.redactedFields.map((field) => field.trim()).filter(Boolean))],
        sanitizeMetadata(input.metadata),
      ),
    );
  }

  static rehydrate(input: NotificationMessageSnapshot): NotificationMessage {
    return new NotificationMessage(
      NotificationProviderKey.rehydrate(input.providerKey),
      NotificationChannelRef.rehydrate(input.channelRef),
      NotificationSubject.rehydrate(input.subject),
      limitText(input.bodyPreview, 500),
      input.payloadSensitivity,
      [...input.redactedFields],
      sanitizeMetadata(input.metadata),
    );
  }

  requiresExplicitAcceptance(): boolean {
    return this.payloadSensitivityValue === "sensitive";
  }

  riskLevel(): "low" | "medium" | "high" {
    return this.payloadSensitivityValue === "sensitive" ? "medium" : "low";
  }

  summary(): string {
    return `${this.providerKeyValue.value} notification to ${this.channelRefValue.value}: ${this.subjectValue.value}`;
  }

  title(): string {
    return this.subjectValue.value;
  }

  description(): string {
    const redactionSuffix =
      this.redactedFieldsValue.length === 0
        ? "No fields redacted."
        : `Redacted fields: ${this.redactedFieldsValue.join(", ")}.`;
    return `${this.bodyPreviewValue} ${redactionSuffix}`;
  }

  toJSON(): NotificationMessageSnapshot {
    return {
      providerKey: this.providerKeyValue.value,
      channelRef: this.channelRefValue.value,
      subject: this.subjectValue.value,
      bodyPreview: this.bodyPreviewValue,
      payloadSensitivity: this.payloadSensitivityValue,
      redactedFields: [...this.redactedFieldsValue],
      metadata: { ...this.metadataValue },
    };
  }
}

export class NotificationMessageDelivery {
  private constructor(
    private readonly messageValue: NotificationMessage,
    private readonly providerMessageIdValue: string,
    private readonly statusValue: NotificationMessageDeliverySnapshot["status"],
  ) {}

  static create(input: NotificationMessageDeliverySnapshot): Result<NotificationMessageDelivery> {
    const message = NotificationMessage.create(input);
    if (message.isErr()) return err(message.error);
    const providerMessageId = requiredText(input.providerMessageId, "Provider message id");
    if (providerMessageId.isErr()) return err(providerMessageId.error);
    if (!["sent", "skipped"].includes(input.status)) {
      return err(
        domainError.validation(`Unsupported notification delivery status ${input.status}`),
      );
    }
    return ok(
      new NotificationMessageDelivery(message.value, providerMessageId.value, input.status),
    );
  }

  toJSON(): NotificationMessageDeliverySnapshot {
    return {
      ...this.messageValue.toJSON(),
      providerMessageId: this.providerMessageIdValue,
      status: this.statusValue,
    };
  }
}

function limitText(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 3)}...`;
}

function sanitizeMetadata(metadata: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key, value]) => key.trim() && typeof value === "string")
      .map(([key, value]) => [key.trim(), limitText(value.trim(), 160)]),
  );
}
