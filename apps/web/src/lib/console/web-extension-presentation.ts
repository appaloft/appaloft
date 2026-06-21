import { type SystemPluginWebExtension } from "@appaloft/contracts";
import { type AppaloftLocale } from "@appaloft/i18n";
import {
  Activity,
  Archive,
  Building2,
  ClipboardList,
  Database,
  FileText,
  GitPullRequestArrow,
  Globe2,
  KeyRound,
  Package,
  PlugZap,
  Puzzle,
  Server,
  ShieldCheck,
  Terminal,
  WalletCards,
} from "@lucide/svelte";
import { type Component } from "svelte";

export function systemPluginExtensionTitle(
  extension: SystemPluginWebExtension,
  locale: AppaloftLocale,
): string {
  return extension.localizations?.[locale]?.title ?? extension.title;
}

export function systemPluginExtensionDescription(
  extension: SystemPluginWebExtension,
  locale: AppaloftLocale,
): string | undefined {
  return extension.localizations?.[locale]?.description ?? extension.description;
}

export function systemPluginExtensionIcon(extension: SystemPluginWebExtension): Component {
  switch (extension.icon) {
    case "activity":
      return Activity;
    case "archive":
      return Archive;
    case "building":
      return Building2;
    case "clipboard-list":
      return ClipboardList;
    case "database":
      return Database;
    case "file-text":
      return FileText;
    case "git-pull-request":
      return GitPullRequestArrow;
    case "globe":
      return Globe2;
    case "key":
      return KeyRound;
    case "package":
      return Package;
    case "plug":
      return PlugZap;
    case "server":
      return Server;
    case "shield":
      return ShieldCheck;
    case "terminal":
      return Terminal;
    case "wallet":
      return WalletCards;
    default:
      return Puzzle;
  }
}
