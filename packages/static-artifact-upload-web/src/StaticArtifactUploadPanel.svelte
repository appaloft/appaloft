<script lang="ts">
  import { Badge } from "@appaloft/ui/badge";
  import { Button } from "@appaloft/ui/button";
  import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
  } from "@appaloft/ui/card";
  import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
  } from "@appaloft/ui/dialog";
  import { Input } from "@appaloft/ui/input";
  import { cn } from "@appaloft/ui/utils";
  import CheckIcon from "@lucide/svelte/icons/check";
  import CopyIcon from "@lucide/svelte/icons/copy";
  import FileArchiveIcon from "@lucide/svelte/icons/file-archive";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import UploadCloudIcon from "@lucide/svelte/icons/upload-cloud";
  import type {
    StaticArtifactUploadAdapter,
    StaticArtifactUploadFilePayload,
    StaticArtifactUploadPanelProps,
    StaticArtifactUploadProgress,
    StaticArtifactUploadPublication,
    StaticArtifactUploadSessionState,
  } from "./types";

  let {
    adapter,
    copy,
    density = "default",
    maxFiles = 1000,
    maxTotalBytes = 100 * 1024 * 1024,
  }: StaticArtifactUploadPanelProps = $props();

  const authProviders = $derived(adapter.authProviders ?? []);
  const githubProvider = $derived(authProviders.find((provider) => provider.key === "github"));
  const emailProvider = $derived(authProviders.find((provider) => provider.key === "email"));

  let session = $state<StaticArtifactUploadSessionState>({
    status: "anonymous",
  });
  let files = $state<StaticArtifactUploadFilePayload[]>([]);
  let progress = $state<StaticArtifactUploadProgress | null>(null);
  let publication = $state<StaticArtifactUploadPublication | null>(null);
  let errorMessage = $state("");
  let loginOpen = $state(false);
  let email = $state("");
  let otp = $state("");
  let emailStep = $state<"email" | "otp" | "sent">("email");
  let copied = $state(false);
  let busy = $state(false);
  let checkingSession = $state(true);
  let fileInput: HTMLInputElement | null = $state(null);

  const selectedBytes = $derived(files.reduce((sum, item) => sum + item.file.size, 0));
  const isCompact = $derived(density === "compact");
  const isMinimal = $derived(density === "minimal");
  const selectedSummary = $derived(
    copy.selectedSummary
      .replace("{{count}}", String(files.length))
      .replace("{{size}}", formatBytes(selectedBytes)),
  );
  const canStartPublish = $derived(!busy && selectedBytes <= maxTotalBytes);
  const progressPercent = $derived(progress ? Math.max(0, Math.min(100, progress.progress)) : 0);

  $effect(() => {
    let cancelled = false;

    async function refresh() {
      checkingSession = true;
      try {
        const next = await adapter.checkSession();
        if (!cancelled) {
          session = next;
        }
      } catch {
        if (!cancelled) {
          session = { status: "unavailable" };
        }
      } finally {
        if (!cancelled) {
          checkingSession = false;
        }
      }
    }

    void refresh();

    return () => {
      cancelled = true;
    };
  });

  async function ensureAuthenticatedForFileSelection() {
    errorMessage = "";

    if (session.status === "authenticated") {
      return true;
    }

    checkingSession = true;
    try {
      const next = await adapter.checkSession();
      session = next;
      if (next.status === "authenticated") {
        return true;
      }
      loginOpen = true;
      return false;
    } catch {
      session = { status: "unavailable" };
      loginOpen = true;
      return false;
    } finally {
      checkingSession = false;
    }
  }

  async function openFilePicker() {
    if (!(await ensureAuthenticatedForFileSelection())) return;
    fileInput?.click();
  }

  async function handleUploadSurfaceClick() {
    if (isMinimal && files.length > 0) {
      await publish();
      return;
    }

    await openFilePicker();
  }

  function selectFiles(nextFiles: FileList | null | undefined) {
    errorMessage = "";
    publication = null;
    progress = null;
    copied = false;

    const allFiles = Array.from(nextFiles ?? []);
    const selected = allFiles.slice(0, maxFiles).map((file) => ({
      file,
      path: readFilePath(file),
    }));

    files = selected;

    if (allFiles.length > maxFiles) {
      errorMessage = copy.maxFilesExceeded.replace("{{count}}", String(maxFiles));
    } else if (selected.reduce((sum, item) => sum + item.file.size, 0) > maxTotalBytes) {
      errorMessage = copy.maxTotalBytesExceeded.replace("{{size}}", formatBytes(maxTotalBytes));
    }
  }

  function handleFileChange(event: Event) {
    selectFiles((event.currentTarget as HTMLInputElement).files);
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    if (!(await ensureAuthenticatedForFileSelection())) return;
    selectFiles(event.dataTransfer?.files);
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
  }

  async function publish() {
    errorMessage = "";
    publication = null;
    copied = false;

    if (files.length === 0) {
      await openFilePicker();
      return;
    }

    if (selectedBytes > maxTotalBytes) {
      return;
    }

    if (!(await ensureAuthenticatedForFileSelection())) {
      return;
    }

    busy = true;
    progress = {
      phase: "reading",
      label: copy.progressReading,
      progress: 8,
    };

    try {
      const result = await adapter.publish({
        files,
        onProgress(nextProgress) {
          progress = nextProgress;
        },
      });
      publication = result;
      progress = {
        phase: "publishing",
        label: copy.published,
        progress: 100,
      };
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : copy.errorGeneric;
    } finally {
      busy = false;
    }
  }

  async function loginWithGithub() {
    await login({
      provider: "github",
      phase: "start",
    });
  }

  async function sendEmailLogin() {
    await login({
      provider: "email",
      email,
      phase: "start",
    });
  }

  async function verifyEmailOtp() {
    await login({
      provider: "email",
      email,
      otp,
      phase: "verify",
    });
  }

  async function login(request: Parameters<StaticArtifactUploadAdapter["requestLogin"]>[0]) {
    errorMessage = "";
    busy = true;

    try {
      const result = await adapter.requestLogin(request);
      session = {
        status: result.status,
        ...(result.identityLabel ? { identityLabel: result.identityLabel } : {}),
      };

      if (result.nextStep === "otp") {
        emailStep = "otp";
      } else if (result.nextStep === "sent") {
        emailStep = "sent";
      }

      if (result.status === "authenticated") {
        loginOpen = false;
        if (files.length > 0) {
          await publish();
        }
      } else if (result.message) {
        errorMessage = result.message;
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : copy.authUnavailable;
    } finally {
      busy = false;
    }
  }

  async function copyPublicationUrl() {
    const url = publication?.url;
    if (!url) return;

    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      window.setTimeout(() => {
        copied = false;
      }, 1800);
    } catch {
      copied = false;
    }
  }

  function readFilePath(file: File): string {
    const candidate = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    return candidate?.trim() || file.name;
  }

  function formatBytes(value: number): string {
    if (value < 1024) return `${value} ${copy.byteUnit}`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} ${copy.kilobyteUnit}`;
    return `${(value / (1024 * 1024)).toFixed(1)} ${copy.megabyteUnit}`;
  }
</script>

<Card
  class={cn(
    "min-w-0 p-0",
    isMinimal ? "gap-0 border-0 bg-transparent shadow-none" : "gap-4",
  )}
  data-static-artifact-upload-panel
>
  {#if !isMinimal}
    <CardHeader class={cn("gap-3 pb-0", isCompact ? "p-4" : "p-4")}>
      <Badge variant="secondary" class="normal-case tracking-normal">
        <FileArchiveIcon class="size-3.5 shrink-0" aria-hidden="true" />
        {copy.badge}
      </Badge>
      <div class="grid gap-2">
        <CardTitle class={cn("max-w-xl font-bold leading-snug", isCompact ? "text-lg" : "text-xl")}>
          {copy.title}
        </CardTitle>
        <CardDescription class={cn("max-w-xl text-sm", isCompact ? "leading-5" : "leading-6")}>
          {copy.body}
        </CardDescription>
      </div>
    </CardHeader>
  {/if}

  <CardContent class={cn("grid gap-4", isMinimal ? "p-0" : "p-4", isCompact && "pt-3")}>
    <button
      class={cn(
        "grid cursor-pointer rounded-lg border border-dashed border-border bg-muted/30 p-4 transition-colors",
        isMinimal
          ? "flex min-h-16 items-center gap-3 p-3 text-left"
          : "place-items-center gap-2.5 text-center",
        isCompact ? "min-h-28" : !isMinimal && "min-h-36",
        "hover:border-ring/50 hover:bg-muted/50 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
      )}
      type="button"
      aria-label={copy.chooseFiles}
      ondrop={handleDrop}
      ondragover={handleDragOver}
      onclick={handleUploadSurfaceClick}
      disabled={busy}
    >
      <span class={cn("grid place-items-center rounded-lg border border-border bg-card text-primary", isMinimal ? "size-10" : "size-11")}>
        {#if busy}
          <LoaderCircleIcon class="size-5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        {:else}
          <UploadCloudIcon class="size-5 shrink-0" aria-hidden="true" />
        {/if}
      </span>
      <span class={cn("min-w-0", isMinimal && "flex-1", !isMinimal && "grid place-items-center")}>
        <span class={cn("block font-bold text-foreground", isMinimal ? "truncate text-base" : "max-w-96 text-sm leading-6")}>
          {#if busy && progress}
            {progress.label}
          {:else if files.length > 0}
            {selectedSummary}
          {:else}
            {copy.dropHint}
          {/if}
        </span>
        {#if isMinimal && !publication && session.status === "authenticated"}
          <span class="mt-1 block truncate text-sm text-muted-foreground">
            {copy.chooseFiles}
          </span>
        {/if}
      </span>
      <span class={cn("text-xs font-bold text-primary", isMinimal && "shrink-0 rounded-md border border-border bg-card px-3 py-2 text-sm")}>
        {#if isMinimal && files.length > 0}
          {copy.publish}
        {:else if files.length > 0}
          {copy.chooseAgain}
        {:else}
          {copy.chooseFiles}
        {/if}
      </span>
    </button>

    <Input
      class="sr-only"
      data-slot="static-artifact-upload-file-input"
      type="file"
      multiple
      bind:ref={fileInput}
      onchange={handleFileChange}
    />

    {#if progress}
      <div class="grid gap-2" aria-live="polite">
        <div class="flex items-center justify-between gap-3 text-xs font-bold text-foreground">
          <span>{progress.label}</span>
          <span>{Math.round(progressPercent)}%</span>
        </div>
        <progress
          class="h-2 w-full overflow-hidden rounded-full accent-primary"
          max="100"
          value={progressPercent}
        >
          {Math.round(progressPercent)}%
        </progress>
      </div>
    {/if}

    {#if publication}
      <div
        class="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-3 max-sm:flex-col max-sm:items-stretch"
        data-static-artifact-upload-result
      >
        <div class="min-w-0">
          <span class="block text-xs font-bold text-primary">{copy.published}</span>
          <a
            class="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-sm font-bold text-foreground"
            href={publication.url}
          >
            {publication.url}
          </a>
        </div>
        <Button
          class="max-sm:w-full"
          variant="outline"
          size="sm"
          onclick={copyPublicationUrl}
        >
          {#if copied}
            <CheckIcon class="size-3.5 shrink-0" aria-hidden="true" />
          {:else}
            <CopyIcon class="size-3.5 shrink-0" aria-hidden="true" />
          {/if}
          {copied ? copy.copiedUrl : copy.copyUrl}
        </Button>
      </div>
    {/if}

    {#if errorMessage}
      <p class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive" role="alert">
        {errorMessage}
      </p>
    {/if}
  </CardContent>

  {#if !isMinimal}
    <CardFooter class="flex items-center justify-between gap-3 p-4 max-sm:flex-col max-sm:items-stretch">
      <Button class="max-sm:w-full" size="lg" disabled={!canStartPublish} onclick={publish}>
        {#if busy}
          <LoaderCircleIcon class="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          {copy.publishing}
        {:else}
          <UploadCloudIcon class="size-3.5 shrink-0" aria-hidden="true" />
          {copy.publish}
        {/if}
      </Button>
      <span class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-semibold text-muted-foreground">
        {#if checkingSession}
          {copy.sessionChecking}
        {:else if session.status === "authenticated"}
          {session.identityLabel ?? copy.authenticated}
        {:else}
          {copy.loginTitle}
        {/if}
      </span>
    </CardFooter>
  {/if}

  <Dialog bind:open={loginOpen}>
    <DialogContent closeLabel={copy.close} class="max-w-md">
      <DialogHeader>
        <Badge variant="secondary" class="mb-2 normal-case tracking-normal">
          {copy.badge}
        </Badge>
        <DialogTitle>{copy.loginTitle}</DialogTitle>
        <DialogDescription>{copy.loginBody}</DialogDescription>
      </DialogHeader>

      <div class="grid gap-4 px-5 pb-5">
        {#if githubProvider?.available}
          <Button variant="outline" size="lg" onclick={loginWithGithub} disabled={busy}>
            <svg class="size-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
              <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.04c-3.34.73-4.04-1.41-4.04-1.41-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.08 1.85 1.24 1.85 1.24 1.07 1.84 2.82 1.31 3.51 1 .11-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.43 11.43 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.49 5.93.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57A12 12 0 0 0 12 .5Z" />
            </svg>
            {copy.githubLogin}
          </Button>
        {/if}

        {#if emailProvider?.available}
          <div class="grid gap-2">
            <label class="text-xs font-bold text-foreground" for="static-upload-email">
              {copy.emailLabel}
            </label>
            <Input
              id="static-upload-email"
              type="email"
              placeholder={copy.emailPlaceholder}
              bind:value={email}
              disabled={busy || emailStep !== "email"}
            />
            {#if emailStep === "sent"}
              <p class="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm font-semibold text-muted-foreground">
                {copy.emailLinkSent}
              </p>
              <Button
                class="mt-2"
                variant="outline"
                size="lg"
                onclick={sendEmailLogin}
                disabled={busy || !email.trim()}
              >
                {copy.emailSend}
              </Button>
            {:else if emailStep === "otp"}
              <label class="mt-1 text-xs font-bold text-foreground" for="static-upload-otp">
                {copy.otpLabel}
              </label>
              <Input
                id="static-upload-otp"
                inputmode="numeric"
                placeholder={copy.otpPlaceholder}
                bind:value={otp}
                disabled={busy}
              />
              <Button
                class="mt-2"
                size="lg"
                onclick={verifyEmailOtp}
                disabled={busy || !otp.trim()}
              >
                {copy.otpVerify}
              </Button>
            {:else}
              <Button
                class="mt-2"
                variant="outline"
                size="lg"
                onclick={sendEmailLogin}
                disabled={busy || !email.trim()}
              >
                {copy.emailSend}
              </Button>
            {/if}
          </div>
        {/if}

        {#if !githubProvider?.available && !emailProvider?.available}
          <p class="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive">
            {copy.authUnavailable}
          </p>
        {/if}
      </div>
    </DialogContent>
  </Dialog>
</Card>
