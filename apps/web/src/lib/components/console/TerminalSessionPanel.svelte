<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { FitAddon } from "@xterm/addon-fit";
  import { Terminal } from "@xterm/xterm";
  import "@xterm/xterm/css/xterm.css";
  import type { TerminalSessionDescriptor, TerminalSessionFrame } from "@appaloft/contracts";

  import { readErrorMessage } from "$lib/api/client";
  import { API_BASE } from "$lib/api/client";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
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
      };
  type TerminalStatus = "idle" | "connecting" | "connected" | "disconnected" | "failed";

  let {
    scope,
    title,
    description,
    disabled = false,
    autoOpen = true,
  }: {
    scope: TerminalScope;
    title?: string;
    description?: string;
    disabled?: boolean;
    autoOpen?: boolean;
  } = $props();

  let terminalElement = $state<HTMLDivElement | null>(null);
  let terminal = $state<Terminal | null>(null);
  let fitAddon = $state<FitAddon | null>(null);
  let socket = $state<WebSocket | null>(null);
  let descriptor = $state<TerminalSessionDescriptor | null>(null);
  let status = $state<TerminalStatus>("idle");
  let errorMessage = $state("");
  let autoOpenAttempted = false;
  let visibilityObserver: IntersectionObserver | null = null;
  let pendingInput = "";
  let inputFlushTimer: ReturnType<typeof setTimeout> | undefined;

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

  function sendResize(): void {
    if (!socket || socket.readyState !== WebSocket.OPEN || !fitAddon) {
      return;
    }

    const dimensions = fitAddon.proposeDimensions();
    if (!dimensions) {
      return;
    }

    socket.send(
      JSON.stringify({
        kind: "resize",
        rows: dimensions.rows,
        cols: dimensions.cols,
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
    pendingInput += data;

    if (shouldFlushInputImmediately(data)) {
      flushTerminalInput();
      return;
    }

    inputFlushTimer ??= setTimeout(flushTerminalInput, 8);
  }

  function fitTerminal(): void {
    fitAddon?.fit();
    sendResize();
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
      terminalElement?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
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
        break;
      case "error":
        status = "failed";
        errorMessage = frame.error.message;
        terminal?.writeln(`\r\n${frame.error.message}`);
        socket = null;
        break;
    }
  }

  function closeTerminal(): void {
    flushTerminalInput();
    const activeSocket = socket;
    socket = null;
    if (activeSocket?.readyState === WebSocket.OPEN) {
      activeSocket.send(JSON.stringify({ kind: "close" }));
    }
    activeSocket?.close();
    status = status === "idle" ? "idle" : "disconnected";
  }

  async function openTerminal(): Promise<void> {
    if (!terminal || !canOpen) {
      return;
    }

    closeTerminal();
    terminal.clear();
    status = "connecting";
    errorMessage = "";

    try {
      const opened = await orpcClient.terminalSessions.open({
        scope,
        initialRows: 24,
        initialCols: 80,
      });
      const ws = new WebSocket(terminalSocketUrl(opened.transport.path));
      descriptor = opened;
      socket = ws;

      ws.onopen = () => {
        fitTerminal();
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
    } catch (error) {
      status = "failed";
      errorMessage = readErrorMessage(error);
    }
  }

  function handleAction(): void {
    if (status === "connected") {
      closeTerminal();
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
    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: "'IBM Plex Mono', monospace",
      fontSize: 13,
      rows: 24,
      cols: 80,
      theme: {
        background: "#111827",
        foreground: "#f8fafc",
        cursor: "#f8fafc",
        selectionBackground: "#334155",
      },
    });
    const addon = new FitAddon();
    terminal = term;
    fitAddon = addon;
    term.loadAddon(addon);

    if (terminalElement) {
      term.open(terminalElement);
      fitTerminal();
      visibilityObserver = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          maybeAutoOpen();
        }
      });
      visibilityObserver.observe(terminalElement);
      window.requestAnimationFrame(maybeAutoOpen);
    }

    term.onData((data) => {
      queueTerminalInput(data);
    });

    window.addEventListener("resize", fitTerminal);
  });

  onDestroy(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", fitTerminal);
    }
    visibilityObserver?.disconnect();
    if (inputFlushTimer) {
      clearTimeout(inputFlushTimer);
    }
    closeTerminal();
    terminal?.dispose();
  });
</script>

<section class="console-panel space-y-3 p-4">
  <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
    <div class="min-w-0">
      <h2 class="text-lg font-semibold">{panelTitle}</h2>
      <p class="mt-1 text-sm text-muted-foreground">{panelDescription}</p>
    </div>
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <Badge variant={terminalStatusVariant(status)}>{terminalStatusLabel(status)}</Badge>
      <Button type="button" variant={status === "connected" ? "outline" : "default"} disabled={disabled || status === "connecting"} onclick={handleAction}>
        {buttonLabel}
      </Button>
    </div>
  </div>

  {#if errorMessage}
    <p class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      {errorMessage}
    </p>
  {/if}

  {#if descriptor?.workingDirectory}
    <p class="truncate text-xs text-muted-foreground" title={descriptor.workingDirectory}>
      {$t(i18nKeys.console.terminal.workspace)}: {compactPath(descriptor.workingDirectory)}
    </p>
  {/if}

  <div
    bind:this={terminalElement}
    class="min-h-[28rem] overflow-hidden rounded-md border border-zinc-800 bg-[#111827] p-2 shadow-inner"
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
