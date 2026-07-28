import { unified } from "@astrojs/markdown-remark";
import nimbus, { defineConfig as defineNimbusConfig } from "@cloudflare/nimbus-docs";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import icon from "astro-icon";
import mermaid from "astro-mermaid";
import { type EnvironmentOptions, type Plugin } from "vite";
import { docsBase, docsSite } from "./src/lib/config";
import { rehypeMermaid, remarkMermaid } from "./src/lib/mermaid-plugins";
import { sidebarItems } from "./src/lib/sidebar-config";

/**
 * Nimbus's markdown-twin generator (`/llms.txt`, `[...slug]/index.md.ts`)
 * always imports Sätteri's `mdxToMdast` to parse MDX — independent of the
 * `unified()` `markdown.processor` override below, which only replaces the
 * HTML rendering pipeline. Sätteri ships a native `.node` binding
 * (`@bruits/satteri-<platform>`), and when Astro's static build bundles
 * `satteri` into the "prerender" environment's Vite build (Astro 7's
 * `astro build` runs page code through a bundled Vite/Rolldown chunk, not
 * plain `node_modules` resolution), the bundled `require()` call for the
 * native binding runs from the chunk's location under `dist/.prerender/`
 * instead of Sätteri's real install location, and fails with "Cannot find
 * native binding" even though the binding is installed.
 *
 * Astro's own dependency crawl (`vitefu`'s `crawlFrameworkPkgs`) decides
 * per-environment `resolve.external`/`noExternal` and ignores a plain
 * `vite.ssr.external` entry for the "prerender"/"ssr"/"client" environments
 * (it only *filters* the auto-crawled list against user config, it doesn't
 * append to it) — so this must be added via a `configEnvironment` Vite
 * plugin hook instead, which Vite merges alongside Astro's own hook output.
 */
// Rolldown's `resolve.external` only accepts `true` or a plain string array
// (no RegExp) — list every platform Sätteri ships a native binding for
// (`satteri`'s own `optionalDependencies`) rather than pattern-matching.
const SATTERI_EXTERNAL_SPECIFIERS = [
  "satteri",
  "@astrojs/markdown-satteri",
  "@bruits/satteri-linux-x64-gnu",
  "@bruits/satteri-linux-arm64-gnu",
  "@bruits/satteri-linux-x64-musl",
  "@bruits/satteri-linux-arm64-musl",
  "@bruits/satteri-darwin-x64",
  "@bruits/satteri-darwin-arm64",
  "@bruits/satteri-win32-x64-msvc",
  "@bruits/satteri-win32-arm64-msvc",
  "@bruits/satteri-wasm32-wasi",
];

function keepSatteriNativeBindingExternal(): Plugin {
  return {
    name: "appaloft:keep-satteri-native-binding-external",
    configEnvironment(_name: string, options: EnvironmentOptions) {
      return {
        resolve: {
          external: [
            ...(Array.isArray(options.resolve?.external) ? options.resolve.external : []),
            ...SATTERI_EXTERNAL_SPECIFIERS,
          ],
        },
      };
    },
  };
}

// ADR-101 Decision item 6/7: `unified(...)` from `@astrojs/markdown-remark`
// replaces Nimbus's default Sätteri processor so Mermaid fences can render
// through the standard remark/rehype ecosystem.
//
// Important: Nimbus compiles MDX through the processor passed to
// `nimbus(..., { markdown.processor })`, which is a *separate* instance from
// Astro's top-level `markdown.processor`. `astro-mermaid` only patches Astro's
// top-level processor, so Mermaid transforms must also be attached here or
// ```mermaid fences stay as ordinary Shiki code blocks (language chip "MERM").
const markdownProcessor = unified({
  remarkPlugins: [remarkMermaid],
  rehypePlugins: [rehypeMermaid],
});

const nimbusConfig = defineNimbusConfig({
  site: docsSite,
  title: "Appaloft 文档",
  description: "Appaloft 文档帮助你部署应用、接入服务器、配置访问地址、管理环境变量并排查问题。",
  locale: "zh-CN",
  github: "https://github.com/appaloft/appaloft",
  editPattern: "https://github.com/appaloft/appaloft/edit/main/apps/docs/src/content/docs/{path}",
  socialImageAlt: "Appaloft 文档预览",
  sidebar: {
    // "full" so every IA v3 group stays visible at once (an accordion-style
    // rail); `src/lib/locale.ts` then filters the rendered tree per page so
    // a zh-CN page only shows the zh-CN groups and an en-US page only shows
    // the en-US groups. See AGENT.md for the tracked follow-up to move this
    // to Nimbus's native sibling-collection i18n primitive.
    scope: "full",
    items: sidebarItems,
  },
});

export default defineConfig({
  site: docsSite,
  base: docsBase,
  output: "static",
  outDir: "dist",
  markdown: {
    processor: markdownProcessor,
  },
  // Tailwind v4 via its Vite plugin — the integration Astro recommends for
  // Tailwind v4 (replaces the PostCSS plugin, which doesn't build under
  // Astro 7's Vite 8 bundler).
  vite: {
    plugins: [tailwindcss(), keepSatteriNativeBindingExternal()],
  },
  // Hover-prefetch link targets so full-page navigations feel instant
  // without a client-side router.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: "hover",
  },
  integrations: [
    // Must run before `nimbus()` — astro-mermaid registers its remark/rehype
    // transforms during `astro:config:setup` and needs to see the final
    // markdown pipeline before Nimbus's own MDX validation pass runs.
    mermaid({
      theme: "neutral",
      autoTheme: true,
    }),
    icon(),
    nimbus(nimbusConfig, {
      // Keep in sync with the top-level `markdown.processor` above so
      // Nimbus's own MDX validation pass sees the same unified() pipeline
      // instead of defaulting back to Sätteri.
      markdown: {
        processor: markdownProcessor,
      },
      rules: {
        "nimbus/frontmatter-shape": "error",
        "nimbus/internal-link": "error",
      },
    }),
  ],
});
