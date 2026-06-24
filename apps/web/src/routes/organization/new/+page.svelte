<script lang="ts">
  import { Building2, CheckCircle2 } from "@lucide/svelte";

  import OrganizationCreateForm from "$lib/components/console/OrganizationCreateForm.svelte";
  import SettingsShell from "$lib/components/console/SettingsShell.svelte";
  import { organizationSettingsItems } from "$lib/console/settings-nav";
  import { i18nKeys, t } from "$lib/i18n";
</script>

<svelte:head>
  <title>{$t(i18nKeys.console.organization.createOrganizationTitle)} · Appaloft</title>
</svelte:head>

<SettingsShell
  title={$t(i18nKeys.console.organization.createOrganizationTitle)}
  description={$t(i18nKeys.console.organization.createOrganizationDescription)}
  groupLabel={$t(i18nKeys.console.organization.pageTitle)}
  activePath="/organization/new"
  items={organizationSettingsItems()}
  breadcrumbs={[
    { label: $t(i18nKeys.console.nav.workspace), href: "/" },
    { label: $t(i18nKeys.console.organization.pageTitle), href: "/organization" },
    { label: $t(i18nKeys.console.organization.createOrganizationTitle) },
  ]}
>
  <div class="mx-auto grid max-w-5xl gap-6 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
    <section class="console-panel space-y-5 p-5" data-organization-create-surface>
      <div class="flex items-start gap-3">
        <div class="rounded-[calc(var(--radius-lg)-2px)] border bg-muted/30 p-2">
          <Building2 class="size-5 text-primary" />
        </div>
        <div class="min-w-0 space-y-1">
          <h1 class="text-lg font-semibold">
            {$t(i18nKeys.console.organization.createOrganizationTitle)}
          </h1>
          <p class="text-sm leading-6 text-muted-foreground">
            {$t(i18nKeys.console.organization.createOrganizationDescription)}
          </p>
        </div>
      </div>

      <OrganizationCreateForm />
    </section>

    <aside class="console-panel h-fit space-y-3 p-5">
      <div class="flex items-center gap-3">
        <CheckCircle2 class="size-5 text-primary" />
        <h2 class="text-base font-semibold">
          {$t(i18nKeys.console.organization.currentOrganizationTitle)}
        </h2>
      </div>
      <p class="text-sm leading-6 text-muted-foreground">
        {$t(i18nKeys.console.organization.createOrganizationDescription)}
      </p>
    </aside>
  </div>
</SettingsShell>
