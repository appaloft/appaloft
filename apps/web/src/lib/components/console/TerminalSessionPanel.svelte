<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { WTerm } from "@wterm/dom";
  import "@wterm/dom/css";
  import type { TerminalSessionDescriptor, TerminalSessionFrame } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import { API_BASE } from "$lib/api/client";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import DocsHelpLink from "$lib/components/console/DocsHelpLink.svelte";
  import { i18nKeys, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";

  type TerminalScope =
    | {
        kind: "server";
        serverId: string;
      }
    | {
        kind: "resource";
        resourceId: string;
        deploymentId?: string;
      }
    | {
        kind: "sandbox";
        sandboxId: string;
      };
  type TerminalStatus = "idle" | "connecting" | "connected" | "disconnected" | "failed";
  type TerminalAttachmentAccess = {
    access: "observe" | "write";
    transport: {
      kind: "websocket";
      path: string;
    };
  };

  let {
    scope,
    title,
    description,
    disabled = false,
    autoOpen = true,
    fallbackHref = "",
    fallbackLabel = "",
    docsHref = "",
    docsAriaLabel = "",
    issueAttachmentAccess,
  }: {
    scope: TerminalScope;
    title?: string;
    description?: string;
    disabled?: boolean;
    autoOpen?: boolean;
    fallbackHref?: string;
    fallbackLabel?: string;
    docsHref?: string;
    docsAriaLabel?: string;
    issueAttachmentAccess?: (sessionId: string) => Promise<TerminalAttachmentAccess>;
  } = $props();

  let terminalElement = $state<HTMLDivElement | null>(null);
  let terminal = $state<WTerm | null>(null);
  let socket = $state<WebSocket | null>(null);
  let descriptor = $state<TerminalSessionDescriptor | null>(null);
  let status = $state<TerminalStatus>("idle");
  let attachmentMode = $state<"observe" | "write">("write");
  let errorMessage = $state("");
  let autoOpenAttempted = false;
  let visibilityObserver: IntersectionObserver | null = null;
  let pendingInput = "";
  let inputFlushTimer: ReturnType<typeof setTimeout> | undefined;
  let terminalRows = 24;
  let terminalCols = 80;
  let isTerminalMounted = false;

  const panelTitle = $derived(title ?? $t(i18nKeys.console.terminal.title));
  const panelDescription = $derived(description ?? $t(i18nKeys.console.terminal.description));
  const canOpen = $derived(!disabled && status !== "connecting" && status !== "connected");
  const buttonLabel = $derived(
    status === "connected"
      ? $t(i18nKeys.common.actions.closeTerminal)
      : status === "disconnected" || status === "failed"
        ? $t(i18nKeys.common.actions.reconnect)
        : status === "connecting"
          ? $t(i18nKeys.console.terminal.connecting)
          : $t(i18nKeys.common.actions.openTerminal),
  );

  function terminalStatusLabel(currentStatus: TerminalStatus): string {
    switch (currentStatus) {
      case "connected":
        return $t(i18nKeys.console.terminal.connected);
      case "connecting":
        return $t(i18nKeys.console.terminal.connecting);
      case "disconnected":
        return $t(i18nKeys.console.terminal.disconnected);
      case "failed":
        return $t(i18nKeys.common.status.failed);
      case "idle":
        return $t(i18nKeys.common.status.notConfigured);
    }
  }

  function terminalStatusVariant(
    currentStatus: TerminalStatus,
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (currentStatus) {
      case "connected":
        return "default";
      case "connecting":
        return "secondary";
      case "failed":
        return "destructive";
      case "disconnected":
      case "idle":
        return "outline";
    }
  }

  function terminalSocketUrl(attachPath: string): string {
    const url = new URL(attachPath, API_BASE);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
  }

  function readTerminalErrorMessage(error: unknown): string {
    const message = readErrorMessage(error);
    if (
      message.includes("Deployment workspace metadata is not available") ||
      message.includes("Resource terminal session requires an observable deployment workspace")
    ) {
      return $t(i18nKeys.console.terminal.workspaceUnavailable);
    }

    return message;
  }

  function sendResize(): void {
    if (attachmentMode === "observe" || !socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(
      JSON.stringify({
        kind: "resize",
        rows: terminalRows,
        cols: terminalCols,
      }),
    );
  }

  function shouldFlushInputImmediately(data: string): boolean {
    return /[\r\n\x00-\x1f\x7f]/u.test(data);
  }

  function flushTerminalInput(): void {
    if (inputFlushTimer) {
      clearTimeout(inputFlushTimer);
      inputFlushTimer = undefined;
    }

    if (!pendingInput) {
      return;
    }

    const data = pendingInput;
    pendingInput = "";

    if (socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify({ kind: "input", data }));
  }

  function queueTerminalInput(data: string): void {
    if (attachmentMode === "observe") {
      return;
    }
    pendingInput += data;

    if (shouldFlushInputImmediately(data)) {
      flushTerminalInput();
      return;
    }

    inputFlushTimer ??= setTimeout(flushTerminalInput, 8);
  }

  function clearTerminal(): void {
    terminal?.write("\x1b[3J\x1b[2J\x1b[H");
  }

  function compactPath(path: string): string {
    const segments = path.split("/").filter((segment) => segment.length > 0);
    if (segments.length <= 3) {
      return path;
    }

    return `.../${segments.slice(-3).join("/")}`;
  }

  function focusTerminal(): void {
    const focusInput = () => {
      terminal?.focus();
    };

    if (typeof window === "undefined") {
      focusInput();
      return;
    }

    window.requestAnimationFrame(focusInput);
  }

  function handleTerminalFrame(frame: TerminalSessionFrame): void {
    switch (frame.kind) {
      case "ready":
        status = "connected";
        errorMessage = "";
        focusTerminal();
        break;
      case "output":
        terminal?.write(frame.data);
        break;
      case "closed":
        status = "disconnected";
        socket = null;
        descriptor = null;
        break;
      case "error":
        status = "failed";
        errorMessage = frame.error.message;
        terminal?.write(`\r\n${frame.error.message}\r\n`);
        socket = null;
        break;
    }
  }

  function detachTerminal(): void {
    flushTerminalInput();
    const activeSocket = socket;
    socket = null;
    activeSocket?.close();
    status = status === "idle" ? "idle" : "disconnected";
  }

  function connectTerminal(opened: TerminalSessionDescriptor): void {
    const ws = new WebSocket(terminalSocketUrl(opened.transport.path));
    descriptor = opened;
    socket = ws;

    ws.onopen = () => {
      status = "connected";
      sendResize();
      focusTerminal();
    };
    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as TerminalSessionFrame;
        handleTerminalFrame(parsed);
      } catch {
        status = "failed";
        errorMessage = $t(i18nKeys.console.terminal.sessionError);
      }
    };
    ws.onerror = () => {
      status = "failed";
      errorMessage = $t(i18nKeys.console.terminal.sessionError);
    };
    ws.onclose = () => {
      if (status === "connecting" || status === "connected") {
        status = "disconnected";
      }
      socket = null;
    };
  }

  async function openTerminal(): Promise<void> {
    if (!terminal || !canOpen) {
      return;
    }

    detachTerminal();
    status = "connecting";
    errorMessage = "";

    try {
      let target = descriptor;
      if (!target && scope.kind === "sandbox") {
        const listed = await orpcClient.terminalSessions.list({
          scope: "sandbox",
          sandboxId: scope.sandboxId,
          limit: 20,
        });
        target = listed.items.find((item) => item.status === "active") ?? null;
      }
      if (!target) {
        clearTerminal();
        target = await orpcClient.terminalSessions.open({
          scope,
          initialRows: terminalRows,
          initialCols: terminalCols,
        });
      }
      if (issueAttachmentAccess) {
        const grant = await issueAttachmentAccess(target.sessionId);
        attachmentMode = grant.access;
        target = { ...target, transport: grant.transport };
      } else {
        attachmentMode = "write";
      }
      connectTerminal(target);
    } catch (error) {
      status = "failed";
      errorMessage = readTerminalErrorMessage(error);
    }
  }

  function handleAction(): void {
    if (status === "connected") {
      detachTerminal();
      return;
    }

    void openTerminal();
  }

  function handleTerminalSurfaceClick(): void {
    if (status === "idle" || status === "disconnected" || status === "failed") {
      void openTerminal();
      return;
    }

    focusTerminal();
  }

  function handleTerminalSurfaceKeydown(event: KeyboardEvent): void {
    if (status === "connected") {
      return;
    }

    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    handleTerminalSurfaceClick();
  }

  function maybeAutoOpen(): void {
    if (!autoOpen || autoOpenAttempted || disabled || !terminal || !terminalElement) {
      return;
    }

    const bounds = terminalElement.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    autoOpenAttempted = true;
    void openTerminal();
  }

  onMount(() => {
    isTerminalMounted = true;
    const initializeTerminal = async () => {
      if (!terminalElement) {
        return;
      }

      const term = new WTerm(terminalElement, {
        autoResize: true,
        cursorBlink: true,
        rows: terminalRows,
        cols: terminalCols,
        onData: queueTerminalInput,
        onResize: (cols, rows) => {
          terminalCols = cols;
          terminalRows = rows;
          sendResize();
        },
      });
      terminal = term;

      try {
        await term.init();
      } catch (error) {
        if (!isTerminalMounted) {
          term.destroy();
          return;
        }
        terminal = null;
        status = "failed";
        errorMessage = readErrorMessage(error);
        return;
      }

      if (!isTerminalMounted) {
        term.destroy();
        return;
      }

      visibilityObserver = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          maybeAutoOpen();
        }
      });
      visibilityObserver.observe(terminalElement);
      window.requestAnimationFrame(maybeAutoOpen);
    };

    void initializeTerminal();
  });

  onDestroy(() => {
    isTerminalMounted = false;
    visibilityObserver?.disconnect();
    if (inputFlushTimer) {
      clearTimeout(inputFlushTimer);
    }
    detachTerminal();
    terminal?.destroy();
  });
</script>

<section class="console-panel space-y-3 p-4" data-terminal-session-status={status}>
  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div class="min-w-0">
      <div class="flex items-center gap-2">
        <h2 class="text-lg font-semibold">{panelTitle}</h2>
        {#if docsHref}
          <DocsHelpLink href={docsHref} ariaLabel={docsAriaLabel || $t(i18nKeys.common.actions.openDocs)} />
        {/if}
      </div>
      <p class="mt-1 text-sm text-muted-foreground">{panelDescription}</p>
    </div>
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <Badge variant={terminalStatusVariant(status)}>{terminalStatusLabel(status)}</Badge>
      {#if attachmentMode === "observe" && status === "connected"}
        <Badge variant="outline">{$t(i18nKeys.console.terminal.readOnly)}</Badge>
      {/if}
      <Button
        type="button"
        variant={status === "connected" ? "outline" : "default"}
        disabled={disabled || status === "connecting"}
        data-terminal-session-action
        onclick={handleAction}
      >
        {buttonLabel}
      </Button>
    </div>
  </div>

  {#if errorMessage}
    <div class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
      <p class="text-destructive">{errorMessage}</p>
      {#if fallbackHref}
        <Button class="mt-2" href={fallbackHref} size="sm" variant="outline">
          {fallbackLabel || $t(i18nKeys.common.actions.openTerminal)}
        </Button>
      {/if}
    </div>
  {/if}

  {#if descriptor?.workingDirectory}
    <p class="truncate text-xs text-muted-foreground" title={descriptor.workingDirectory}>
      {$t(i18nKeys.console.terminal.workspace)}: {compactPath(descriptor.workingDirectory)}
    </p>
  {/if}

  <div
    bind:this={terminalElement}
    class="terminal-shell min-h-[28rem] overflow-hidden rounded-md border border-zinc-800 bg-[#111827] p-2 shadow-inner"
    role="button"
    tabindex="0"
    aria-label={panelTitle}
    onclick={handleTerminalSurfaceClick}
    onkeydown={handleTerminalSurfaceKeydown}
  ></div>

  {#if !descriptor}
    <p class="text-xs text-muted-foreground">{$t(i18nKeys.console.terminal.startHint)}</p>
  {/if}
</section>

<style>
  .terminal-shell:global(.wterm) {
    --term-bg: #111827;
    --term-fg: #f8fafc;
    --term-cursor: #f8fafc;
    --term-font-family: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    --term-font-size: 13px;
    min-height: 28rem;
    border-radius: 0.375rem;
    box-shadow: inset 0 2px 4px 0 rgb(0 0 0 / 0.05);
  }
</style>
