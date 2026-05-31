import { type SystemPluginWebExtension } from "@appaloft/contracts";
import {
  Building2,
  KeyRound,
  MailPlus,
  Puzzle,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "@lucide/svelte";

import { i18nKeys } from "$lib/i18n";

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

export function organizationSettingsItems(extensions: readonly SystemPluginWebExtension[] = []) {
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
    ...settingsExtensionItems(extensions, "/organization"),
    {
      href: "/organization/danger-zone",
      labelKey: i18nKeys.console.organization.dangerZoneTitle,
      icon: ShieldAlert,
    },
  ];
}

function settingsExtensionItems(
  extensions: readonly SystemPluginWebExtension[],
  scopePath: string,
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
    .sort((left, right) => left.title.localeCompare(right.title))
    .map((extension) => ({
      href: normalizePath(extension.path),
      label: extension.title,
      icon: Puzzle,
      matchPrefix: normalizePath(extension.path),
    }));
}

function normalizePath(path: string): string {
  if (!path) return "/";
  const withoutQuery = path.split("?")[0] ?? path;
  const normalized = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  return normalized.length > 1 && normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}
