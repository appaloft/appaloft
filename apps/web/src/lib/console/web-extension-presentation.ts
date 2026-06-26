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

export type SystemPluginExtensionIconPresentation =
  | {
      kind: "component";
      component: Component;
    }
  | {
      kind: "image";
      src: string;
      label?: string;
    };

export interface SystemPluginExtensionAccountMenuBadgePresentation {
  endpoint: string;
  valuePath: string;
}

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

export function systemPluginExtensionIconPresentation(
  extension: SystemPluginWebExtension,
): SystemPluginExtensionIconPresentation {
  const icon = extension.icon;
  if (icon && typeof icon === "object") {
    return {
      kind: "image",
      src: icon.src,
      ...(icon.label ? { label: icon.label } : {}),
    };
  }

  return {
    kind: "component",
    component: systemPluginExtensionIcon(extension),
  };
}

export function systemPluginExtensionAccountMenuBadgePresentation(
  extension: SystemPluginWebExtension,
): SystemPluginExtensionAccountMenuBadgePresentation | null {
  const metadata = extension.metadata;
  if (!isRecord(metadata)) {
    return null;
  }

  const badge = metadata.accountMenuBadge;
  if (!isRecord(badge)) {
    return null;
  }

  const endpoint = badge.endpoint;
  if (typeof endpoint !== "string" || endpoint.length === 0) {
    return null;
  }

  const valuePath = badge.valuePath;
  return {
    endpoint,
    valuePath: typeof valuePath === "string" && valuePath.length > 0 ? valuePath : "label",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function systemPluginExtensionIcon(extension: SystemPluginWebExtension): Component {
  switch (typeof extension.icon === "string" ? extension.icon : undefined) {
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
