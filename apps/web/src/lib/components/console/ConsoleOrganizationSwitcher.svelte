<script lang="ts">
  import { browser } from "$app/environment";
  import { Check, ChevronDown, Settings2, UserRound } from "@lucide/svelte";
  import appaloftIcon from "@appaloft/design/assets/appaloft-icon-light.svg";
  import type { OrganizationContextOrganizationSummary } from "@appaloft/contracts";

  import { capabilities } from "$lib/capabilities";
  import { Avatar, AvatarFallback } from "$lib/components/ui/avatar";
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from "$lib/components/ui/dropdown-menu";
  import { initials } from "$lib/console/utils";
  import {
    instanceAccessCapabilityKey,
    preloadInstanceAccessCapability,
  } from "$lib/console/instance-access";
  import { i18nKeys, t } from "$lib/i18n";

  type Props = {
    currentOrganization?: OrganizationContextOrganizationSummary | null;
    organizations?: OrganizationContextOrganizationSummary[];
    pending?: boolean;
    showManagementLinks?: boolean;
    triggerClass?: string;
    contentClass?: string;
    collapsedClass?: string;
    onNavigate?: (path: string) => void;
    onSwitch?: (organizationId: string) => void;
  };

  let {
    currentOrganization = null,
    organizations = [],
    pending = false,
    showManagementLinks = true,
    triggerClass = "",
    contentClass = "",
    collapsedClass = "group-data-[collapsible=icon]:hidden",
    onNavigate,
    onSwitch,
  }: Props = $props();

  const currentOrganizationName = $derived(
    currentOrganization?.name ?? $t(i18nKeys.common.app.productName),
  );
  const currentOrganizationDetail = $derived(
    currentOrganization
      ? `${currentOrganization.slug} · ${roleLabel(currentOrganization.role)}`
      : $t(i18nKeys.common.app.consoleSubtitle),
  );
  const showInstanceManagementLink = $derived(
    $capabilities.capabilities[instanceAccessCapabilityKey]?.allowed === true,
  );

  $effect(() => {
    if (browser && showManagementLinks) {
      void preloadInstanceAccessCapability();
    }
  });

  function roleLabel(role: string): string {
    if (role === "owner") {
      return $t(i18nKeys.console.organization.roleOwner);
    }
    if (role === "admin") {
      return $t(i18nKeys.console.organization.roleAdmin);
    }
    if (role === "developer") {
      return $t(i18nKeys.console.organization.roleDeveloper);
    }
    if (role === "billing") {
      return $t(i18nKeys.console.organization.roleBilling);
    }
    return $t(i18nKeys.console.organization.roleViewer);
  }

  function switchOrganization(organizationId: string): void {
    if (!organizationId || pending) {
      return;
    }

    if (organizationId === currentOrganization?.organizationId) {
      navigateTo("/");
      return;
    }

    onSwitch?.(organizationId);
  }

  function navigateTo(path: string): void {
    onNavigate?.(path);
  }
</script>

<DropdownMenu>
  <DropdownMenuTrigger
    data-console-organization-switcher-trigger
    class={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 ${triggerClass}`}
  >
    <Avatar size="sm" class="shrink-0">
      <AvatarFallback>{initials(currentOrganizationName)}</AvatarFallback>
    </Avatar>
    <span class={`min-w-0 flex-1 ${collapsedClass}`}>
      <span class="block truncate text-sm font-medium">{currentOrganizationName}</span>
      <span class="block truncate text-xs text-muted-foreground">
        {currentOrganizationDetail}
      </span>
    </span>
    <ChevronDown class={`size-4 shrink-0 text-muted-foreground ${collapsedClass}`} />
  </DropdownMenuTrigger>
  <DropdownMenuContent
    align="start"
    side="bottom"
    sideOffset={6}
    class={`max-h-[min(26rem,calc(100vh-7rem))] w-(--bits-dropdown-menu-anchor-width) min-w-64 ${contentClass}`}
  >
    <DropdownMenuLabel>
      <div class="flex items-center gap-2">
        <img
          src={appaloftIcon}
          alt={$t(i18nKeys.common.app.productName)}
          class="size-5 shrink-0 object-contain"
        />
        <span class="min-w-0 truncate">{$t(i18nKeys.console.organization.switchTitle)}</span>
      </div>
    </DropdownMenuLabel>
    <DropdownMenuSeparator />
    {#if organizations.length > 0}
      {#each organizations as organization (organization.organizationId)}
        {@const organizationIsCurrent = organization.organizationId === currentOrganization?.organizationId}
        <DropdownMenuItem
          disabled={pending}
          onclick={() => switchOrganization(organization.organizationId)}
          class="gap-2"
        >
          <Avatar size="sm">
            <AvatarFallback>{initials(organization.name)}</AvatarFallback>
          </Avatar>
          <span class="min-w-0 flex-1">
            <span class="block truncate">{organization.name}</span>
            <span class="block truncate text-xs text-muted-foreground">
              {organization.slug} · {roleLabel(organization.role)}
            </span>
          </span>
          {#if organizationIsCurrent}
            <Check class="size-4 text-primary" />
          {/if}
        </DropdownMenuItem>
      {/each}
    {:else}
      <DropdownMenuItem disabled>
        <Avatar size="sm">
          <AvatarFallback>{initials(currentOrganizationName)}</AvatarFallback>
        </Avatar>
        <span class="min-w-0 flex-1">
          <span class="block truncate">{currentOrganizationName}</span>
          <span class="block truncate text-xs text-muted-foreground">
            {currentOrganizationDetail}
          </span>
        </span>
      </DropdownMenuItem>
    {/if}
    {#if showManagementLinks}
      <DropdownMenuSeparator />
      <DropdownMenuItem onclick={() => navigateTo("/organization")}>
        <UserRound class="size-4" />
        {$t(i18nKeys.console.nav.organization)}
      </DropdownMenuItem>
      {#if showInstanceManagementLink}
        <DropdownMenuItem onclick={() => navigateTo("/instance")}>
          <Settings2 class="size-4" />
          {$t(i18nKeys.console.nav.instance)}
        </DropdownMenuItem>
      {/if}
    {/if}
  </DropdownMenuContent>
</DropdownMenu>
