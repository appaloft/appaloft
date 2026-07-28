import {
  type SidebarGroupItem,
  type SidebarItem,
  type SidebarTransform,
} from "@cloudflare/nimbus-docs/types";
import { type DocsLocale } from "./locale-preference";

/**
 * Resolve a page's locale from its `docs` collection entry id. IA v3 keeps
 * zh-CN content at the collection root and mirrors en-US content one level
 * down under `en/` (see `docs/documentation/public-docs-structure.md`).
 */
export function localeFromEntryId(entryId: string): DocsLocale {
  return entryId === "en" || entryId.startsWith("en/") ? "en-US" : "zh-CN";
}

/**
 * Nimbus's `sidebar.items` config is one global, locale-unaware tree (see
 * `src/lib/sidebar-config.ts`). This transform runs after Nimbus builds
 * that full tree and keeps only the top-level groups that belong to the
 * requested locale, so a zh-CN page's rail doesn't show the en-US mirror
 * groups (and vice versa) while still sharing one static sidebar config for
 * breadcrumbs, prev/next, and the header section tabs.
 */
export function localeSidebarTransform(locale: DocsLocale): SidebarTransform {
  return ({ tree }) => tree.filter((item) => localeOfSidebarItem(item) === locale);
}

function localeOfSidebarItem(item: SidebarItem): DocsLocale {
  if (item.type !== "group") {
    return localeFromHref("href" in item ? item.href : undefined);
  }

  const routeKey = groupRouteKey(item);

  return localeFromHref(routeKey);
}

function groupRouteKey(item: SidebarGroupItem): string | undefined {
  if (item._routeKey) return item._routeKey;
  if (item._prefix) return item._prefix;
  if (item.segment) return item.segment;
  if (item.indexHref) return item.indexHref;

  return firstDescendantHref(item.children);
}

function firstDescendantHref(children: SidebarItem[]): string | undefined {
  for (const child of children) {
    if (child.type === "link" || child.type === "external") {
      return child.href;
    }

    if (child.type === "group") {
      const href = groupRouteKey(child);
      if (href) return href;
    }
  }

  return undefined;
}

function localeFromHref(href: string | undefined): DocsLocale {
  if (!href) return "zh-CN";

  return href === "/en" || href === "/en/" || href.startsWith("/en/") ? "en-US" : "zh-CN";
}
