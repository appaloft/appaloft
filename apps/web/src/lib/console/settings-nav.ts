import {
  Building2,
  KeyRound,
  MailPlus,
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

export function organizationSettingsItems() {
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
      href: "/organization/danger-zone",
      labelKey: i18nKeys.console.organization.dangerZoneTitle,
      icon: ShieldAlert,
    },
  ];
}
