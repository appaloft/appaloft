import { readFileSync } from "node:fs";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

const rootPackage = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
);
const appaloftVersion = process.env.APPALOFT_APP_VERSION || rootPackage.version;
const docsBase = normalizeDocsBase(process.env.APPALOFT_DOCS_BASE);
const docsSite = normalizeDocsSite(process.env.APPALOFT_DOCS_SITE);
const docsBasePrefix = docsBase === "/" ? "" : docsBase;

function normalizeDocsBase(value) {
  const trimmed = value?.trim() || "/docs";
  if (trimmed === "/") return "/";

  return `/${trimmed.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function normalizeDocsSite(value) {
  return (value?.trim() || "https://appaloft.dev").replace(/\/+$/, "");
}

function rewriteDocsPathForBase(value) {
  if (value === "/docs") {
    return docsBase;
  }

  if (!value.startsWith("/docs/")) {
    return value;
  }

  return `${docsBasePrefix}${value.slice("/docs".length)}` || "/";
}

function rewriteElementProperty(properties, key) {
  const value = properties[key];
  if (typeof value === "string") {
    properties[key] = rewriteDocsPathForBase(value);
  }
}

function rewriteDocsBaseLinks(node) {
  if (!node || typeof node !== "object") {
    return;
  }

  if (node.type === "element" && node.properties && typeof node.properties === "object") {
    rewriteElementProperty(node.properties, "href");
    rewriteElementProperty(node.properties, "src");
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      rewriteDocsBaseLinks(child);
    }
  }
}

function rehypeAppaloftDocsBaseLinks() {
  return (tree) => rewriteDocsBaseLinks(tree);
}

const sidebar = [
  {
    label: "Start Here",
    items: [
      {
        label: "Getting Started",
        items: [{ slug: "start/first-deployment" }, { slug: "start/entrypoints" }],
      },
      {
        label: "Mental Model",
        items: [{ slug: "start/concepts" }],
      },
    ],
  },
  {
    label: "Deploy",
    items: [
      { slug: "deploy/overview" },
      {
        label: "Inputs",
        items: [{ slug: "deploy/sources" }],
      },
      {
        label: "Lifecycle",
        items: [{ slug: "deploy/lifecycle" }, { slug: "deploy/recovery" }],
      },
    ],
  },
  {
    label: "Projects And Resources",
    items: [
      { slug: "resources/overview" },
      {
        label: "Model",
        items: [{ slug: "resources/projects" }],
      },
      {
        label: "Profiles",
        items: [
          { slug: "resources/profiles/source-runtime" },
          { slug: "resources/profiles/health-network" },
        ],
      },
    ],
  },
  {
    label: "Servers And Credentials",
    items: [
      { slug: "servers/overview" },
      {
        label: "Connect",
        items: [{ slug: "servers/register-connect" }],
      },
      {
        label: "Credentials",
        items: [{ slug: "servers/credentials/ssh-keys" }],
      },
      {
        label: "Operations",
        items: [{ slug: "servers/operations/proxy-and-terminal" }],
      },
    ],
  },
  {
    label: "Environments And Configuration",
    items: [
      { slug: "environments/overview" },
      {
        label: "Model",
        items: [{ slug: "environments/model" }],
      },
      {
        label: "Variables",
        items: [
          { slug: "environments/variables/precedence" },
          { slug: "environments/variables/secrets" },
        ],
      },
      {
        label: "Changes",
        items: [{ slug: "environments/changes/diff-promote" }],
      },
      {
        label: "Reference",
        items: [{ slug: "environments/reference/config-file" }],
      },
    ],
  },
  {
    label: "Access, Domains And TLS",
    items: [
      { slug: "access/overview" },
      {
        label: "Default Access",
        items: [{ slug: "access/generated-routes" }],
      },
      {
        label: "Domains",
        items: [{ slug: "access/domains/custom-domains" }, { slug: "access/domains/ownership" }],
      },
      {
        label: "TLS",
        items: [{ slug: "access/tls/certificates" }],
      },
      {
        label: "Troubleshooting",
        items: [{ slug: "access/troubleshooting" }],
      },
    ],
  },
  {
    label: "Observe And Troubleshoot",
    items: [
      { slug: "observe/overview" },
      {
        label: "Inspect",
        items: [{ slug: "observe/status-events" }, { slug: "observe/logs-health" }],
      },
      {
        label: "Support",
        items: [{ slug: "observe/diagnostics" }, { slug: "observe/recovery" }],
      },
    ],
  },
  {
    label: "Integrations",
    items: [
      {
        label: "Source Control",
        items: [{ slug: "integrations/github" }],
      },
      {
        label: "Extensibility",
        items: [{ slug: "integrations/providers" }, { slug: "integrations/plugins" }],
      },
    ],
  },
  {
    label: "Reference",
    items: [
      {
        label: "Entrypoints",
        items: [
          { slug: "reference/cli" },
          { slug: "reference/http-api" },
          { slug: "reference/web-console" },
        ],
      },
      {
        label: "Contracts",
        items: [{ slug: "reference/errors-statuses" }, { slug: "reference/configuration" }],
      },
    ],
  },
  {
    label: "Self-Hosting And Operations",
    items: [
      {
        label: "Run Appaloft",
        items: [
          { slug: "self-hosting/install" },
          { slug: "self-hosting/static-assets" },
          { slug: "self-hosting/database" },
          { slug: "self-hosting/upgrades" },
        ],
      },
      {
        label: "Advanced",
        items: [{ slug: "self-hosting/advanced" }],
      },
    ],
  },
];

export default defineConfig({
  base: docsBase,
  site: docsSite,
  markdown: {
    rehypePlugins: [rehypeAppaloftDocsBaseLinks],
  },
  vite: {
    define: {
      "import.meta.env.PUBLIC_APPALOFT_VERSION": JSON.stringify(appaloftVersion),
    },
  },
  integrations: [
    starlight({
      title: {
        "zh-CN": "Appaloft 文档",
        en: "Appaloft Docs",
      },
      logo: {
        dark: "@appaloft/design/assets/appaloft-icon-dark.svg",
        light: "@appaloft/design/assets/appaloft-icon-light.svg",
        alt: "",
      },
      description: "Task-oriented Appaloft documentation for CLI, HTTP API, and Web console users.",
      defaultLocale: "root",
      locales: {
        root: {
          label: "简体中文",
          lang: "zh-CN",
        },
        en: {
          label: "English",
          lang: "en-US",
        },
      },
      customCss: ["./src/styles/appaloft-docs.css"],
      components: {
        Header: "./src/components/Header.astro",
      },
      sidebar,
      tableOfContents: {
        minHeadingLevel: 2,
        maxHeadingLevel: 3,
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/appaloft/appaloft",
        },
      ],
      credits: false,
      lastUpdated: true,
      pagination: true,
    }),
  ],
});
