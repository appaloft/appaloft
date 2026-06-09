import type * as PageTree from "fumadocs-core/page-tree";
import { withDocsBase } from "@/lib/config";

type Locale = "zh-CN" | "en-US";

type NavPage = {
  name: string;
  slug: string;
};

type NavFolder = {
  name: string;
  children: Array<NavPage | NavFolder>;
};

const zhTree: NavFolder[] = [
  {
    name: "Start Here",
    children: [
      page("First deployment", "start/first-deployment"),
      page("Entrypoints", "start/entrypoints"),
      page("Concepts", "start/concepts"),
    ],
  },
  {
    name: "Deploy",
    children: [
      page("Overview", "deploy/overview"),
      page("One-click deploy", "deploy/one-click"),
      page("Sources", "deploy/sources"),
      page("Lifecycle", "deploy/lifecycle"),
      page("Previews", "deploy/previews"),
      page("Recovery", "deploy/recovery"),
    ],
  },
  {
    name: "Projects And Resources",
    children: [
      page("Overview", "resources/overview"),
      page("Projects", "resources/projects"),
      page("Dependencies", "resources/dependencies"),
      page("Scheduled tasks", "resources/scheduled-tasks"),
      page("Storage volumes", "resources/storage-volumes"),
      folder("Profiles", [
        page("Source and runtime", "resources/profiles/source-runtime"),
        page("Health and network", "resources/profiles/health-network"),
      ]),
    ],
  },
  {
    name: "Servers And Credentials",
    children: [
      page("Overview", "servers/overview"),
      page("Register and connect", "servers/register-connect"),
      page("SSH keys", "servers/credentials/ssh-keys"),
      page("Proxy and terminal", "servers/operations/proxy-and-terminal"),
    ],
  },
  {
    name: "Environments And Configuration",
    children: [
      page("Overview", "environments/overview"),
      page("Model", "environments/model"),
      page("Variable precedence", "environments/variables/precedence"),
      page("Secrets", "environments/variables/secrets"),
      page("Diff and promote", "environments/changes/diff-promote"),
      page("Config file", "environments/reference/config-file"),
    ],
  },
  {
    name: "Access, Domains And TLS",
    children: [
      page("Overview", "access/overview"),
      page("Generated routes", "access/generated-routes"),
      page("Custom domains", "access/domains/custom-domains"),
      page("Ownership", "access/domains/ownership"),
      page("Certificates", "access/tls/certificates"),
      page("Troubleshooting", "access/troubleshooting"),
    ],
  },
  {
    name: "Observe And Troubleshoot",
    children: [
      page("Overview", "observe/overview"),
      page("Status and events", "observe/status-events"),
      page("Logs and health", "observe/logs-health"),
      page("Diagnostics", "observe/diagnostics"),
      page("Recovery", "observe/recovery"),
    ],
  },
  {
    name: "Integrations",
    children: [
      page("GitHub", "integrations/github"),
      page("Providers", "integrations/providers"),
      page("Plugins", "integrations/plugins"),
    ],
  },
  {
    name: "Agent Workflows",
    children: [
      page("Appaloft skill", "agent/appaloft-skill"),
      page("Deploy skill", "agent/deploy-skill"),
      page("MCP server", "agent/mcp-server"),
    ],
  },
  {
    name: "Reference",
    children: [
      page("CLI", "reference/cli"),
      page("HTTP API", "reference/http-api"),
      page("OpenAPI", "reference/openapi"),
      page("TypeScript SDK", "reference/typescript-sdk"),
      page("Web console", "reference/web-console"),
      page("Errors and statuses", "reference/errors-statuses"),
      page("Configuration", "reference/configuration"),
    ],
  },
  {
    name: "Self-Hosting And Operations",
    children: [
      page("Install", "self-hosting/install"),
      page("First admin bootstrap", "self-hosting/first-admin-bootstrap"),
      page("Organization and team", "self-hosting/organization-team-management"),
      page("Action deploy tokens", "self-hosting/action-deploy-token-auth"),
      page("Static assets", "self-hosting/static-assets"),
      page("Database", "self-hosting/database"),
      page("Upgrades", "self-hosting/upgrades"),
      page("Advanced", "self-hosting/advanced"),
    ],
  },
];

const enTree = prefixTree(zhTree, "en");

export function docsTree(locale: Locale): PageTree.Root {
  return {
    name: locale === "en-US" ? "Appaloft Docs" : "Appaloft 文档",
    children: toPageTree(locale === "en-US" ? enTree : zhTree),
  };
}

function page(name: string, slug: string): NavPage {
  return { name, slug };
}

function folder(name: string, children: Array<NavPage | NavFolder>): NavFolder {
  return { name, children };
}

function prefixTree(tree: NavFolder[], prefix: string): NavFolder[] {
  return tree.map((entry) => ({
    name: entry.name,
    children: entry.children.map((child) => prefixEntry(child, prefix)),
  }));
}

function prefixEntry(entry: NavPage | NavFolder, prefix: string): NavPage | NavFolder {
  if ("slug" in entry) {
    return {
      ...entry,
      slug: `${prefix}/${entry.slug}`,
    };
  }

  return {
    ...entry,
    children: entry.children.map((child) => prefixEntry(child, prefix)),
  };
}

function toPageTree(entries: Array<NavPage | NavFolder>): PageTree.Node[] {
  return entries.map((entry) => {
    if ("slug" in entry) {
      return {
        type: "page",
        name: entry.name,
        url: withDocsBase(entry.slug),
      };
    }

    return {
      type: "folder",
      name: entry.name,
      defaultOpen: false,
      children: toPageTree(entry.children),
    };
  });
}
