<script lang="ts">
  import { browser } from "$app/environment";
  import { ArrowLeft, Moon, Play, Sun } from "@lucide/svelte";
  import appaloftIcon from "@appaloft/design/assets/appaloft-icon-light.svg";
  import type { Component, Snippet } from "svelte";

  import * as Breadcrumb from "$lib/components/ui/breadcrumb";
  import { Button } from "$lib/components/ui/button";
  import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarInset,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarProvider,
    SidebarTrigger,
  } from "$lib/components/ui/sidebar";
  import { i18nKeys, t } from "$lib/i18n";
  import type { TranslationKey } from "@appaloft/i18n";

  type BreadcrumbItem = {
    label: string;
    href?: string;
  };

  export type SettingsShellItem = {
    href: string;
    icon: Component;
    labelKey: TranslationKey;
    matchPrefix?: string;
  };

  type Props = {
    title: string;
    description: string;
    groupLabel: string;
    activePath: string;
    items: SettingsShellItem[];
    breadcrumbs?: BreadcrumbItem[];
    children: Snippet;
  };

  let {
    title,
    description,
    groupLabel,
    activePath,
    items,
    breadcrumbs = [],
    children,
  }: Props = $props();
  let colorMode = $state<"light" | "dark">("light");
  let colorModeReady = $state(false);

  const colorModeLabel = $derived(
    colorMode === "dark"
      ? $t(i18nKeys.common.actions.switchToLightMode)
      : $t(i18nKeys.common.actions.switchToDarkMode),
  );

  $effect(() => {
    if (!browser) {
      return;
    }

    const storedMode = window.localStorage.getItem("appaloft:color-mode");
    if (storedMode === "light" || storedMode === "dark") {
      colorMode = storedMode;
    }
    colorModeReady = true;
  });

  $effect(() => {
    if (!browser || !colorModeReady) {
      return;
    }

    document.documentElement.classList.toggle("dark", colorMode === "dark");
    document.documentElement.style.colorScheme = colorMode;
    window.localStorage.setItem("appaloft:color-mode", colorMode);
  });

  function toggleColorMode(): void {
    colorMode = colorMode === "dark" ? "light" : "dark";
  }

  function itemIsActive(item: SettingsShellItem): boolean {
    return activePath === item.href || Boolean(item.matchPrefix && activePath.startsWith(item.matchPrefix));
  }
</script>

<SidebarProvider>
  <Sidebar variant="sidebar" collapsible="offcanvas">
    <SidebarHeader class="gap-3">
      <a class="flex min-w-0 items-center gap-3 rounded-md px-2 py-2 hover:bg-sidebar-accent" href="/">
        <img
          src={appaloftIcon}
          alt={$t(i18nKeys.common.app.productName)}
          class="size-7 shrink-0 object-contain"
        />
        <span class="min-w-0">
          <span class="block truncate text-sm font-semibold">
            {$t(i18nKeys.common.app.productName)}
          </span>
          <span class="block truncate text-xs text-muted-foreground">{title}</span>
        </span>
      </a>
    </SidebarHeader>

    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {#each items as item (item.href)}
              <SidebarMenuItem>
                <SidebarMenuButton isActive={itemIsActive(item)} tooltipContent={$t(item.labelKey)}>
                  {#snippet child({ props })}
                    <a href={item.href} {...props}>
                      <item.icon class="size-4" />
                      <span>{$t(item.labelKey)}</span>
                    </a>
                  {/snippet}
                </SidebarMenuButton>
              </SidebarMenuItem>
            {/each}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>

    <SidebarFooter>
      <Button href="/" variant="outline" class="justify-start">
        <ArrowLeft class="size-4" />
        {$t(i18nKeys.console.nav.workspace)}
      </Button>
    </SidebarFooter>
  </Sidebar>

  <SidebarInset>
    <header
      data-settings-shell-header
      class="sticky top-0 z-10 flex h-14 items-center justify-between border-b px-4 backdrop-blur-md md:px-6"
    >
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <SidebarTrigger />
        <div class="min-w-0">
          {#if breadcrumbs.length > 0}
            <Breadcrumb.Root class="min-w-0">
              <Breadcrumb.List class="flex-nowrap gap-1 overflow-hidden sm:gap-1.5">
                {#each breadcrumbs as item, index (`${item.label}-${index}`)}
                  <Breadcrumb.Item class="min-w-0">
                    {#if item.href && index < breadcrumbs.length - 1}
                      <Breadcrumb.Link class="truncate" href={item.href}>
                        {item.label}
                      </Breadcrumb.Link>
                    {:else}
                      <Breadcrumb.Page class="truncate">{item.label}</Breadcrumb.Page>
                    {/if}
                  </Breadcrumb.Item>
                  {#if index < breadcrumbs.length - 1}
                    <Breadcrumb.Separator class="shrink-0" />
                  {/if}
                {/each}
              </Breadcrumb.List>
            </Breadcrumb.Root>
          {/if}
          <p class="truncate text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <Button
          aria-label={colorModeLabel}
          title={colorModeLabel}
          size="icon-sm"
          variant="outline"
          onclick={toggleColorMode}
        >
          {#if colorMode === "dark"}
            <Sun class="size-4" />
          {:else}
            <Moon class="size-4" />
          {/if}
        </Button>
        <Button href="/deploy" size="sm" variant="outline">
          <Play class="size-4" />
          {$t(i18nKeys.common.actions.quickDeploy)}
        </Button>
      </div>
    </header>

    <main data-console-main class="min-w-0 flex-1 p-4 md:p-6">
      {@render children()}
    </main>
  </SidebarInset>
</SidebarProvider>
