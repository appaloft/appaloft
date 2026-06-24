<script lang="ts">
  import { goto } from "$app/navigation";
  import {
    Activity,
    Archive,
    Box,
    Check,
    CheckCircle2,
    ChevronDown,
    CreditCard,
    Database,
    FileText,
    FolderPlus,
    Globe2,
    HardDrive,
    Layers3,
    Pencil,
    PlugZap,
    PlusCircle,
    RefreshCcw,
    Rocket,
    Server,
    SlidersHorizontal,
    Trash2,
    Undo2,
    UploadCloud,
    WalletCards,
    XCircle,
  } from "@lucide/svelte";
  import type { Component } from "svelte";

  import { buttonVariants } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { cn } from "$lib/utils";

  type ConsolePageTableFilterGroup = {
    label: string;
    type?: "buttons" | "multi-select";
    items: ConsolePageFilterLink[];
  };

  type ConsolePageFilterLink = {
    label: string;
    href: string;
    active?: boolean;
    icon?: ConsolePageIcon;
  };

  type ConsolePageIcon =
    | "activity"
    | "archive"
    | "box"
    | "card"
    | "check"
    | "database"
    | "file"
    | "folder-plus"
    | "globe"
    | "hard-drive"
    | "layers"
    | "pencil"
    | "plug"
    | "plus"
    | "refresh"
    | "rocket"
    | "server"
    | "sliders"
    | "trash"
    | "undo"
    | "upload"
    | "wallet"
    | "x";

  type Props = {
    filterGroup: ConsolePageTableFilterGroup;
  };

  let { filterGroup }: Props = $props();
  let open = $state(false);

  function iconComponent(icon: ConsolePageIcon | undefined): Component {
    if (icon === "activity") return Activity;
    if (icon === "archive") return Archive;
    if (icon === "box") return Box;
    if (icon === "card") return CreditCard;
    if (icon === "check") return CheckCircle2;
    if (icon === "database") return Database;
    if (icon === "file") return FileText;
    if (icon === "folder-plus") return FolderPlus;
    if (icon === "globe") return Globe2;
    if (icon === "hard-drive") return HardDrive;
    if (icon === "layers") return Layers3;
    if (icon === "pencil") return Pencil;
    if (icon === "plug") return PlugZap;
    if (icon === "plus") return PlusCircle;
    if (icon === "refresh") return RefreshCcw;
    if (icon === "rocket") return Rocket;
    if (icon === "server") return Server;
    if (icon === "sliders") return SlidersHorizontal;
    if (icon === "trash") return Trash2;
    if (icon === "undo") return Undo2;
    if (icon === "upload") return UploadCloud;
    if (icon === "x") return XCircle;
    return WalletCards;
  }

  function filterTriggerLabel(group: ConsolePageTableFilterGroup) {
    const activeFilters = group.items.filter((item) => item.active);
    if (activeFilters.length === 0) {
      return group.items[0]?.label ?? group.label;
    }
    if (activeFilters.length === 1) {
      return activeFilters[0].label;
    }
    return `${activeFilters[0].label} +${activeFilters.length - 1}`;
  }

  function navigateFilterHref(event: MouseEvent, href: string | undefined) {
    event.preventDefault();
    event.stopPropagation();
    if (!href) return;
    open = true;
    void goto(href, {
      keepFocus: true,
      noScroll: true,
    });
  }
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger
    class={cn(buttonVariants({ variant: "outline", size: "sm" }), "max-w-[15rem] justify-between gap-2")}
    data-console-page-table-filter-select
  >
    <span class="truncate">{filterTriggerLabel(filterGroup)}</span>
    <ChevronDown class="size-3.5 shrink-0 text-muted-foreground" />
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="start" class="w-64">
    <DropdownMenu.Label class="truncate">
      {filterGroup.label}
    </DropdownMenu.Label>
    <DropdownMenu.Separator />
    {#each filterGroup.items as filter (`${filter.label}:${filter.href}`)}
      {@const FilterIcon = iconComponent(filter.icon)}
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={filter.active ?? false}
        class="relative flex min-h-8 w-full cursor-default select-none items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-sm outline-hidden hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
        onclick={(event) => navigateFilterHref(event, filter.href)}
      >
        <span class="flex min-w-0 items-center gap-2">
          {#if filter.icon}
            <FilterIcon class="size-4 shrink-0 text-muted-foreground" />
          {/if}
          <span class="truncate">{filter.label}</span>
        </span>
        {#if filter.active}
          <Check class="size-4 shrink-0 text-primary" />
        {/if}
      </button>
    {/each}
  </DropdownMenu.Content>
</DropdownMenu.Root>
