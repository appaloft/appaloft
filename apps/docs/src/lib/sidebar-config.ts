import { type SidebarConfigItem } from "@cloudflare/nimbus-docs/types";

/**
 * IA v3 top-level groups (`docs/documentation/public-docs-structure.md`).
 * Each zh-CN group has a directory at the content root; each en-US group
 * mirrors it one level down under `en/`. `astro.config.ts` hands this whole
 * flat list to Nimbus's `sidebar.items` (with `scope: "full"`) so every
 * group's landing page and Nimbus's own sidebar helpers (breadcrumbs,
 * prev/next) resolve correctly; `src/lib/locale.ts` then filters the
 * *rendered* tree per page so a zh-CN page only shows zh-CN groups and an
 * en-US page only shows en-US groups.
 *
 * The Cloud group (#10) is included unconditionally in both locales so
 * open-source builds always show it (ADR-101 Cloud-Only Content section) —
 * do not drop it to "clean up" a build without Cloud injection.
 */
const IA_V3_GROUPS: ReadonlyArray<{ directory: string; zh: string; en: string }> = [
  { directory: "start", zh: "开始 · Start", en: "Start" },
  { directory: "deliver", zh: "日常交付 · Deliver", en: "Deliver" },
  { directory: "migrate", zh: "平台迁移 · Migrate", en: "Migrate" },
  { directory: "servers", zh: "目标机器 · Servers", en: "Servers" },
  { directory: "configuration", zh: "配置与环境 · Configuration", en: "Configuration" },
  { directory: "access", zh: "域名与访问 · Access", en: "Access" },
  { directory: "troubleshoot", zh: "排障 · Troubleshoot", en: "Troubleshoot" },
  { directory: "agents", zh: "Agent 与 Sandbox · Agents", en: "Agents" },
  { directory: "reference", zh: "参考 · Reference", en: "Reference" },
  { directory: "self-hosting", zh: "自托管 · Self-Hosting", en: "Self-Hosting" },
];

export const sidebarItems: SidebarConfigItem[] = [
  ...IA_V3_GROUPS.map(
    (group): SidebarConfigItem => ({
      label: group.zh,
      autogenerate: { directory: group.directory },
    }),
  ),
  {
    label: "Cloud",
    autogenerate: { directory: "cloud" },
    badge: { text: "Cloud", variant: "info" },
  },
  ...IA_V3_GROUPS.map(
    (group): SidebarConfigItem => ({
      label: group.en,
      autogenerate: { directory: `en/${group.directory}` },
    }),
  ),
  {
    label: "Cloud",
    autogenerate: { directory: "en/cloud" },
    badge: { text: "Cloud", variant: "info" },
  },
];
