<script lang="ts">
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import { Button } from "$lib/components/ui/button";
  import * as Dialog from "$lib/components/ui/dialog";
  import { Input } from "$lib/components/ui/input";
  import {
    acceptConsoleModal,
    cancelConsoleModal,
    consoleModalInteraction,
  } from "$lib/console/modal-interaction";
  import { i18nKeys, t } from "$lib/i18n";

  let promptValue = $state("");
  let promptRequestId = $state<number | null>(null);

  $effect(() => {
    const request = $consoleModalInteraction;
    if (request?.kind === "prompt" && request.id !== promptRequestId) {
      promptRequestId = request.id;
      promptValue = request.initialValue ?? "";
      return;
    }

    if (request?.kind !== "prompt") {
      promptRequestId = null;
      promptValue = "";
    }
  });

  function confirmTitle(title?: string): string {
    return title ?? $t(i18nKeys.common.dialog.confirmTitle);
  }

  function promptTitle(title?: string): string {
    return title ?? $t(i18nKeys.common.dialog.promptTitle);
  }

  function confirmLabel(label?: string): string {
    return label ?? $t(i18nKeys.common.actions.confirm);
  }

  function cancelLabel(label?: string): string {
    return label ?? $t(i18nKeys.common.actions.cancel);
  }

  function handleAlertOpenChange(open: boolean): void {
    const request = $consoleModalInteraction;
    if (!open && request?.kind === "confirm") {
      cancelConsoleModal(request);
    }
  }

  function handlePromptOpenChange(open: boolean): void {
    const request = $consoleModalInteraction;
    if (!open && request?.kind === "prompt") {
      cancelConsoleModal(request);
    }
  }

  function submitPrompt(event: SubmitEvent): void {
    event.preventDefault();

    const request = $consoleModalInteraction;
    if (request?.kind === "prompt") {
      acceptConsoleModal(request, promptValue);
    }
  }
</script>

{#if $consoleModalInteraction?.kind === "confirm"}
  {@const request = $consoleModalInteraction}
  <AlertDialog.Root open={true} onOpenChange={handleAlertOpenChange}>
    <AlertDialog.Content>
      <AlertDialog.Header>
        <AlertDialog.Title>{confirmTitle(request.title)}</AlertDialog.Title>
        <AlertDialog.Description class="whitespace-pre-line">
          {request.message}
        </AlertDialog.Description>
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <AlertDialog.Cancel onclick={() => cancelConsoleModal(request)}>
          {cancelLabel(request.cancelLabel)}
        </AlertDialog.Cancel>
        <AlertDialog.Action
          variant={request.destructive ? "destructive" : "default"}
          onclick={() => acceptConsoleModal(request, true)}
        >
          {confirmLabel(request.confirmLabel)}
        </AlertDialog.Action>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
{/if}

{#if $consoleModalInteraction?.kind === "prompt"}
  {@const request = $consoleModalInteraction}
  <Dialog.Root open={true} onOpenChange={handlePromptOpenChange}>
    <Dialog.Content closeLabel={$t(i18nKeys.common.actions.close)} showCloseButton={false}>
      <form class="space-y-5 p-5" onsubmit={submitPrompt}>
        <Dialog.Header>
          <Dialog.Title>{promptTitle(request.title)}</Dialog.Title>
          <Dialog.Description class="whitespace-pre-line">
            {request.message}
          </Dialog.Description>
        </Dialog.Header>
        <label class="grid gap-2 text-sm">
          <span class="font-medium">
            {request.inputLabel ?? $t(i18nKeys.common.dialog.promptInputLabel)}
          </span>
          <Input
            bind:value={promptValue}
            autocomplete="off"
            placeholder={request.placeholder}
          />
        </label>
        <Dialog.Footer>
          <Button type="button" variant="outline" onclick={() => cancelConsoleModal(request)}>
            {cancelLabel(request.cancelLabel)}
          </Button>
          <Button type="submit" variant={request.destructive ? "destructive" : "default"}>
            {confirmLabel(request.confirmLabel)}
          </Button>
        </Dialog.Footer>
      </form>
    </Dialog.Content>
  </Dialog.Root>
{/if}
