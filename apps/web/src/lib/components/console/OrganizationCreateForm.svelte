<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { Building2 } from "@lucide/svelte";

  import { buildApiUrl } from "$lib/api/client";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { i18nKeys, localeHeaders, t } from "$lib/i18n";
  import { orpcClient } from "$lib/orpc";
  import { queryClient } from "$lib/query-client";

  let organizationName = $state("");
  let organizationSlug = $state("");
  let operationError = $state("");
  let operationNotice = $state("");
  let submitting = $state(false);

  const resolvedOrganizationSlug = $derived(
    organizationSlug.trim() || slugify(organizationName) || "organization",
  );
  const canSubmit = $derived(organizationName.trim().length > 0 && !submitting);

  function slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
  }

  function errorMessageFromResponseBody(body: string): string {
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      return "";
    }

    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (parsed && typeof parsed === "object") {
        const message = (parsed as Record<string, unknown>).message;
        if (typeof message === "string" && message.trim().length > 0) {
          return message.trim();
        }
      }
    } catch {
      return trimmed;
    }

    return trimmed;
  }

  function readOrganizationId(value: unknown): string | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    const record = value as Record<string, unknown>;
    for (const key of ["id", "organizationId"]) {
      const candidate = record[key];
      if (typeof candidate === "string" && candidate.length > 0) {
        return candidate;
      }
    }

    return null;
  }

  async function postJson(path: string, body: Record<string, unknown>): Promise<Response> {
    return fetch(buildApiUrl(path), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...localeHeaders(),
      },
      body: JSON.stringify(body),
    });
  }

  async function expectOkWithBody(response: Response): Promise<unknown> {
    if (response.ok) {
      return response.json().catch(() => null);
    }

    const detail = (await response.text().catch(() => "")).trim();
    throw new Error(errorMessageFromResponseBody(detail) || `${response.status}`);
  }

  async function submitOrganizationCreate(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    submitting = true;
    operationError = "";
    operationNotice = "";

    try {
      const created = await expectOkWithBody(
        await postJson("/api/auth/organization/create", {
          keepCurrentActiveOrganization: false,
          name: organizationName,
          slug: resolvedOrganizationSlug,
        }),
      );
      const organizationId = readOrganizationId(created);
      if (!organizationId) {
        throw new Error($t(i18nKeys.errors.web.unknownRequestFailure));
      }

      await orpcClient.organizations.switchCurrent({ organizationId });
      await queryClient.invalidateQueries();
      operationNotice = $t(i18nKeys.console.organization.createOrganizationSucceeded);
      if (browser) {
        await goto("/");
      }
    } catch (error) {
      operationError =
        error instanceof Error ? error.message : $t(i18nKeys.errors.web.unknownRequestFailure);
    } finally {
      submitting = false;
    }
  }
</script>

{#if operationNotice}
  <div
    class="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100"
  >
    {operationNotice}
  </div>
{/if}
{#if operationError}
  <div
    class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
  >
    {operationError}
  </div>
{/if}

<form class="space-y-4" onsubmit={submitOrganizationCreate}>
  <label class="grid gap-2">
    <span class="text-sm font-medium">{$t(i18nKeys.console.organization.nameLabel)}</span>
    <Input
      bind:value={organizationName}
      autocomplete="organization"
      placeholder={$t(i18nKeys.console.organization.createOrganizationNamePlaceholder)}
      required
    />
  </label>

  <label class="grid gap-2">
    <span class="text-sm font-medium">{$t(i18nKeys.common.domain.slug)}</span>
    <Input bind:value={organizationSlug} autocomplete="off" placeholder={resolvedOrganizationSlug} />
    <span class="text-xs leading-5 text-muted-foreground">
      {$t(i18nKeys.console.organization.createOrganizationSlugDescription)}
    </span>
  </label>

  <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
    <Button type="button" variant="outline" href="/organization">
      {$t(i18nKeys.common.actions.cancel)}
    </Button>
    <Button type="submit" disabled={!canSubmit}>
      {#if submitting}
        {$t(i18nKeys.console.organization.switchingAction)}
      {:else}
        <Building2 class="size-4" />
        {$t(i18nKeys.console.organization.createOrganizationAction)}
      {/if}
    </Button>
  </div>
</form>
