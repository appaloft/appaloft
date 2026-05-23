<script lang="ts">
  import { browser } from "$app/environment";
  import { ArrowLeft, Moon, Play, Sun } from "@lucide/svelte";
  import appaloftIcon from "@appaloft/design/assets/appaloft-icon-light.svg";
  import type { Snippet } from "svelte";

  import { Badge } from "$lib/components/ui/badge";
  import * as Breadcrumb from "$lib/components/ui/breadcrumb";
  import { Button } from "$lib/components/ui/button";
  import { i18nKeys, t } from "$lib/i18n";

  type BreadcrumbItem = {
    label: string;
    href?: string;
  };

  type Props = {
    title: string;
    description: string;
    breadcrumbs?: BreadcrumbItem[];
    children: Snippet;
  };

  let { title, description, breadcrumbs = [], children }: Props = $props();
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
</script>

<div class="min-h-screen bg-background text-foreground">
  <header data-console-header class="sticky top-0 z-20 border-b backdrop-blur-md">
    <div class="flex h-14 w-full items-center justify-between gap-3 px-4 md:px-6">
      <a class="flex min-w-0 items-center gap-3" href="/">
        <img
          src={appaloftIcon}
          alt={$t(i18nKeys.common.app.productName)}
          class="size-7 shrink-0 object-contain"
        />
        <span class="min-w-0">
          <span class="block truncate text-sm font-medium">
            {$t(i18nKeys.common.app.productName)}
          </span>
          <span class="block truncate text-xs text-muted-foreground">
            {title}
          </span>
        </span>
      </a>

      <div class="flex shrink-0 items-center gap-2">
        <Button href="/" size="sm" variant="outline">
          <ArrowLeft class="size-4" />
          {$t(i18nKeys.console.nav.workspace)}
        </Button>
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
    </div>
  </header>

  <div class="w-full px-4 py-6 md:px-6">
    <main data-console-main class="min-w-0 p-0">
      <section class="mb-6 space-y-2">
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
        <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div class="min-w-0 space-y-1">
            <Badge class="console-page-kicker" variant="outline">{title}</Badge>
            <h1 class="text-2xl font-semibold">{title}</h1>
            <p class="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
      </section>

      {@render children()}
    </main>
  </div>
</div>
