import { get, writable } from "svelte/store";

type ConsoleModalBaseRequest = {
  readonly id: number;
  readonly title?: string;
  readonly message: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly destructive?: boolean;
};

export type ConsoleConfirmRequest = ConsoleModalBaseRequest & {
  readonly kind: "confirm";
  readonly resolve: (value: boolean) => void;
};

export type ConsolePromptRequest = ConsoleModalBaseRequest & {
  readonly kind: "prompt";
  readonly initialValue?: string;
  readonly inputLabel?: string;
  readonly placeholder?: string;
  readonly resolve: (value: string | null) => void;
};

export type ConsoleModalInteractionRequest = ConsoleConfirmRequest | ConsolePromptRequest;

export type ConsoleConfirmInput = string | Omit<ConsoleConfirmRequest, "id" | "kind" | "resolve">;

export type ConsolePromptInput = string | Omit<ConsolePromptRequest, "id" | "kind" | "resolve">;

export const consoleModalInteraction = writable<ConsoleModalInteractionRequest | null>(null);

let nextRequestId = 1;
const queuedRequests: ConsoleModalInteractionRequest[] = [];

function enqueueConsoleModal(request: ConsoleModalInteractionRequest): void {
  if (get(consoleModalInteraction)) {
    queuedRequests.push(request);
    return;
  }

  consoleModalInteraction.set(request);
}

function settleConsoleModal<TValue>(request: ConsoleModalInteractionRequest, value: TValue): void {
  if (get(consoleModalInteraction)?.id !== request.id) {
    return;
  }

  consoleModalInteraction.set(null);
  (request.resolve as (value: TValue) => void)(value);
  consoleModalInteraction.set(queuedRequests.shift() ?? null);
}

function normalizeConfirmInput(
  input: ConsoleConfirmInput,
): Omit<ConsoleConfirmRequest, "id" | "kind" | "resolve"> {
  return typeof input === "string" ? { message: input } : input;
}

function normalizePromptInput(
  input: ConsolePromptInput,
): Omit<ConsolePromptRequest, "id" | "kind" | "resolve"> {
  return typeof input === "string" ? { message: input } : input;
}

export function requestConsoleConfirm(input: ConsoleConfirmInput): Promise<boolean> {
  if (typeof window === "undefined") {
    return Promise.resolve(false);
  }

  const normalizedInput = normalizeConfirmInput(input);
  return new Promise((resolve) => {
    enqueueConsoleModal({
      ...normalizedInput,
      id: nextRequestId++,
      kind: "confirm",
      resolve,
    });
  });
}

export function requestConsolePrompt(input: ConsolePromptInput): Promise<string | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }

  const normalizedInput = normalizePromptInput(input);
  return new Promise((resolve) => {
    enqueueConsoleModal({
      ...normalizedInput,
      id: nextRequestId++,
      kind: "prompt",
      resolve,
    });
  });
}

export function acceptConsoleModal(
  request: ConsoleModalInteractionRequest,
  value: string | true,
): void {
  settleConsoleModal(request, value);
}

export function cancelConsoleModal(request: ConsoleModalInteractionRequest): void {
  settleConsoleModal(request, request.kind === "confirm" ? false : null);
}
