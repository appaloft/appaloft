<script lang="ts">
  import { Boxes, Database, Globe2, Layers3, Server, Waypoints } from "@lucide/svelte";
  import type { ResourceSummary } from "@appaloft/contracts";

  import { Badge } from "$lib/components/ui/badge";
  import { i18nKeys, t } from "$lib/i18n";

  type Props = {
    resource: ResourceSummary;
    projectName: string;
    environmentName: string;
    destinationId: string;
  };

  let { resource, projectName, environmentName, destinationId }: Props = $props();

  const profileTone = $derived.by(() => {
    switch (resource.kind) {
      case "compose-stack":
        return {
          icon: Layers3,
          title: $t(i18nKeys.console.resources.composeProfileTitle),
          description: $t(i18nKeys.console.resources.composeProfileDescription),
        };
      case "database":
      case "cache":
        return {
          icon: Database,
          title: $t(i18nKeys.console.resources.dataProfileTitle),
          description: $t(i18nKeys.console.resources.dataProfileDescription),
        };
      case "worker":
        return {
          icon: Server,
          title: $t(i18nKeys.console.resources.workerProfileTitle),
          description: $t(i18nKeys.console.resources.workerProfileDescription),
        };
      case "external":
        return {
          icon: Globe2,
          title: $t(i18nKeys.console.resources.externalProfileTitle),
          description: $t(i18nKeys.console.resources.externalProfileDescription),
        };
      case "application":
      case "service":
      case "static-site":
        return {
          icon: Boxes,
          title: $t(i18nKeys.console.resources.applicationProfileTitle),
          description: $t(i18nKeys.console.resources.applicationProfileDescription),
        };
    }
  });
</script>

<section class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
  <article class="rounded-md border bg-background p-4">
    <div class="flex items-start gap-3">
      <div class="rounded-md border bg-muted p-2">
        <profileTone.icon class="size-4" />
      </div>
      <div class="min-w-0">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="text-lg font-semibold">{profileTone.title}</h2>
          <Badge variant="secondary">{resource.kind}</Badge>
        </div>
        <p class="mt-1 text-sm leading-6 text-muted-foreground">{profileTone.description}</p>
      </div>
    </div>

    <div class="mt-5 grid gap-3 sm:grid-cols-2">
      <div class="rounded-md bg-muted/30 px-3 py-2">
        <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.name)}</p>
        <p class="mt-1 truncate text-sm font-medium">{resource.name}</p>
      </div>
      <div class="rounded-md bg-muted/30 px-3 py-2">
        <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.slug)}</p>
        <p class="mt-1 truncate text-sm font-medium">{resource.slug}</p>
      </div>
      <div class="rounded-md bg-muted/30 px-3 py-2">
        <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.project)}</p>
        <p class="mt-1 truncate text-sm font-medium">{projectName}</p>
      </div>
      <div class="rounded-md bg-muted/30 px-3 py-2">
        <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.environment)}</p>
        <p class="mt-1 truncate text-sm font-medium">{environmentName}</p>
      </div>
    </div>
  </article>

  <article class="rounded-md border bg-background p-4">
    <div class="flex items-start gap-3">
      <div class="rounded-md border bg-muted p-2">
        <Waypoints class="size-4" />
      </div>
      <div>
        <h2 class="text-lg font-semibold">
          {$t(i18nKeys.console.resources.networkProfileTitle)}
        </h2>
        <p class="mt-1 text-sm leading-6 text-muted-foreground">
          {$t(i18nKeys.console.resources.networkProfileDescription)}
        </p>
      </div>
    </div>

    <div class="mt-5 grid gap-3">
      <div class="rounded-md bg-muted/30 px-3 py-2">
        <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.port)}</p>
        <p class="mt-1 truncate text-sm font-medium">
          {resource.networkProfile?.internalPort ?? "-"}
        </p>
      </div>
      <div class="rounded-md bg-muted/30 px-3 py-2">
        <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.protocol)}</p>
        <p class="mt-1 truncate text-sm font-medium">
          {resource.networkProfile?.upstreamProtocol ?? "-"}
        </p>
      </div>
      <div class="rounded-md bg-muted/30 px-3 py-2">
        <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.exposure)}</p>
        <p class="mt-1 truncate text-sm font-medium">
          {resource.networkProfile?.exposureMode ?? "-"}
        </p>
      </div>
      <div class="rounded-md bg-muted/30 px-3 py-2">
        <p class="text-xs text-muted-foreground">{$t(i18nKeys.common.domain.destination)}</p>
        <p class="mt-1 truncate text-sm font-medium">{destinationId || "-"}</p>
      </div>
      {#if resource.networkProfile?.targetServiceName}
        <div class="rounded-md bg-muted/30 px-3 py-2">
          <p class="text-xs text-muted-foreground">
            {$t(i18nKeys.console.resources.targetServiceName)}
          </p>
          <p class="mt-1 truncate text-sm font-medium">
            {resource.networkProfile.targetServiceName}
          </p>
        </div>
      {/if}
    </div>
  </article>
</section>

<section class="rounded-md border bg-background">
  <div class="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
    <div>
      <h2 class="text-lg font-semibold">
        {resource.kind === "compose-stack"
          ? $t(i18nKeys.console.resources.composeServicesTitle)
          : $t(i18nKeys.console.resources.serviceTopologyTitle)}
      </h2>
      <p class="mt-1 text-sm leading-6 text-muted-foreground">
        {resource.kind === "compose-stack"
          ? $t(i18nKeys.console.resources.composeServicesDescription)
          : $t(i18nKeys.console.resources.serviceTopologyDescription)}
      </p>
    </div>
    <Badge variant="outline">{resource.services.length}</Badge>
  </div>

  <div class="divide-y border-t">
    {#if resource.services.length > 0}
      {#each resource.services as service (service.name)}
        <div class="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <div class="min-w-0">
            <p class="truncate text-sm font-medium">{service.name}</p>
            {#if resource.networkProfile?.targetServiceName === service.name}
              <p class="mt-1 text-xs text-muted-foreground">
                {$t(i18nKeys.console.resources.targetServiceName)}
              </p>
            {/if}
          </div>
          <Badge class="w-fit sm:justify-self-end" variant="secondary">{service.kind}</Badge>
        </div>
      {/each}
    {:else}
      <div class="px-4 py-6 text-sm text-muted-foreground">
        {$t(i18nKeys.console.resources.noServices)}
      </div>
    {/if}
  </div>
</section>
