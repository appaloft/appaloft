import { type SystemPluginWebExtension } from "@appaloft/contracts";
import { type AppaloftLocale, defaultAppaloftLocale } from "@appaloft/i18n";
import {
  Activity,
  Archive,
  Building2,
  ClipboardList,
  Globe2,
  KeyRound,
  MailPlus,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  UserRound,
  UsersRound,
} from "@lucide/svelte";

import { i18nKeys } from "$lib/i18n";
import {
  systemPluginExtensionIcon,
  systemPluginExtensionTitle,
} from "./web-extension-presentation";

export function accountSettingsItems() {
  return [
    {
      href: "/account/profile",
      labelKey: i18nKeys.console.accountSettings.profileTitle,
      icon: UserRound,
    },
    {
      href: "/account/security",
      labelKey: i18nKeys.console.authAccountSecurity.introTitle,
      icon: KeyRound,
    },
    {
      href: "/account/sessions",
      labelKey: i18nKeys.console.accountSettings.sessionsTitle,
      icon: ShieldCheck,
    },
    {
      href: "/account/danger-zone",
      labelKey: i18nKeys.console.accountSettings.dangerZoneTitle,
      icon: ShieldAlert,
    },
  ];
}

export function organizationSettingsItems(
  extensions: readonly SystemPluginWebExtension[] = [],
  locale: AppaloftLocale = defaultAppaloftLocale,
) {
  return [
    {
      href: "/organization",
      labelKey: i18nKeys.console.organization.profileTitle,
      icon: Building2,
    },
    {
      href: "/organization/members",
      labelKey: i18nKeys.console.organization.membersTitle,
      icon: UsersRound,
    },
    {
      href: "/organization/invitations",
      labelKey: i18nKeys.console.organization.invitationsTitle,
      icon: MailPlus,
    },
    {
      href: "/organization/deploy-tokens",
      labelKey: i18nKeys.console.organization.deployTokensTitle,
      icon: KeyRound,
    },
    {
      href: "/organization/archived-projects",
      labelKey: i18nKeys.console.organization.archivedProjectsTitle,
      icon: Archive,
    },
    ...settingsExtensionItems(extensions, "/organization", locale),
    {
      href: "/organization/danger-zone",
      labelKey: i18nKeys.console.organization.dangerZoneTitle,
      icon: ShieldAlert,
    },
  ];
}

export function instanceSettingsItems(
  extensions: readonly SystemPluginWebExtension[] = [],
  locale: AppaloftLocale = defaultAppaloftLocale,
) {
  return [
    {
      href: "/instance",
      labelKey: i18nKeys.console.instance.overviewTitle,
      icon: Globe2,
    },
    {
      href: "/instance/workers",
      labelKey: i18nKeys.console.instance.workerManagementTitle,
      icon: Activity,
    },
    {
      href: "/instance/maintenance",
      labelKey: i18nKeys.console.instance.maintenanceWorkersTitle,
      icon: ShieldCheck,
    },
    {
      href: "/instance/sessions",
      labelKey: i18nKeys.console.terminal.lifecycleTitle,
      icon: Terminal,
    },
    ...settingsExtensionItems(extensions, "/instance", locale),
    {
      href: "/instance/guidance",
      labelKey: i18nKeys.console.instance.guidanceTitle,
      icon: ClipboardList,
    },
  ];
}

function settingsExtensionItems(
  extensions: readonly SystemPluginWebExtension[],
  scopePath: string,
  locale: AppaloftLocale,
) {
  return extensions
    .filter((extension) => {
      const path = normalizePath(extension.path);
      return (
        extension.placement === "settings" &&
        extension.target === "console-route" &&
        path.startsWith(`${normalizePath(scopePath)}/`)
      );
    })
    .sort((left, right) =>
      systemPluginExtensionTitle(left, locale).localeCompare(
        systemPluginExtensionTitle(right, locale),
      ),
    )
    .map((extension) => ({
      href: normalizePath(extension.path),
      label: systemPluginExtensionTitle(extension, locale),
      icon: systemPluginExtensionIcon(extension),
      matchPrefix: normalizePath(extension.path),
    }));
}

function normalizePath(path: string): string {
  if (!path) return "/";
  const withoutQuery = path.split("?")[0] ?? path;
  const normalized = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  return normalized.length > 1 && normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}
