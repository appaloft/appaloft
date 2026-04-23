import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

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
  base: "/docs",
  site: "https://appaloft.dev",
  integrations: [
    starlight({
      title: {
        "zh-CN": "Appaloft 文档",
        en: "Appaloft Docs",
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
