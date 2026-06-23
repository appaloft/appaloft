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
    name: "开始使用",
    children: [
      page("第一次部署", "start/first-deployment"),
      page("入口", "start/entrypoints"),
      page("核心概念", "start/concepts"),
    ],
  },
  {
    name: "部署",
    children: [
      page("概览", "deploy/overview"),
      page("一键部署", "deploy/one-click"),
      page("来源", "deploy/sources"),
      page("生命周期", "deploy/lifecycle"),
      page("预览环境", "deploy/previews"),
      page("恢复", "deploy/recovery"),
    ],
  },
  {
    name: "项目与资源",
    children: [
      page("概览", "resources/overview"),
      page("项目", "resources/projects"),
      page("依赖资源", "resources/dependencies"),
      page("计划任务", "resources/scheduled-tasks"),
      page("存储卷", "resources/storage-volumes"),
      folder("资源配置档案", [
        page("来源与运行时", "resources/profiles/source-runtime"),
        page("健康与网络", "resources/profiles/health-network"),
      ]),
    ],
  },
  {
    name: "服务器与凭据",
    children: [
      page("概览", "servers/overview"),
      page("注册与连接", "servers/register-connect"),
      page("SSH 密钥", "servers/credentials/ssh-keys"),
      page("代理与终端", "servers/operations/proxy-and-terminal"),
    ],
  },
  {
    name: "环境与配置",
    children: [
      page("概览", "environments/overview"),
      page("模型", "environments/model"),
      page("变量优先级", "environments/variables/precedence"),
      page("密钥", "environments/variables/secrets"),
      page("差异与提升", "environments/changes/diff-promote"),
      page("配置文件", "environments/reference/config-file"),
    ],
  },
  {
    name: "访问、域名与 TLS",
    children: [
      page("概览", "access/overview"),
      page("生成访问地址", "access/generated-routes"),
      page("自定义域名", "access/domains/custom-domains"),
      page("所有权验证", "access/domains/ownership"),
      page("证书", "access/tls/certificates"),
      page("排查", "access/troubleshooting"),
    ],
  },
  {
    name: "观测与排障",
    children: [
      page("概览", "observe/overview"),
      page("状态与事件", "observe/status-events"),
      page("日志与健康", "observe/logs-health"),
      page("诊断", "observe/diagnostics"),
      page("恢复", "observe/recovery"),
    ],
  },
  {
    name: "集成",
    children: [
      page("连接", "integrations/connections"),
      page("GitHub", "integrations/github"),
      page("提供方", "integrations/providers"),
      page("插件", "integrations/plugins"),
    ],
  },
  {
    name: "Agent 工作流",
    children: [
      page("Appaloft skill", "agent/appaloft-skill"),
      page("部署 skill", "agent/deploy-skill"),
      page("MCP 服务器", "agent/mcp-server"),
    ],
  },
  {
    name: "参考",
    children: [
      page("CLI", "reference/cli"),
      page("HTTP API", "reference/http-api"),
      page("OpenAPI", "reference/openapi"),
      page("TypeScript SDK", "reference/typescript-sdk"),
      page("Web 控制台", "reference/web-console"),
      page("错误与状态", "reference/errors-statuses"),
      page("配置", "reference/configuration"),
    ],
  },
  {
    name: "自托管与运维",
    children: [
      page("安装", "self-hosting/install"),
      page("首个管理员初始化", "self-hosting/first-admin-bootstrap"),
      page("组织与团队", "self-hosting/organization-team-management"),
      page("Action 部署令牌", "self-hosting/action-deploy-token-auth"),
      page("静态资源", "self-hosting/static-assets"),
      page("数据库", "self-hosting/database"),
      page("升级", "self-hosting/upgrades"),
      page("高级", "self-hosting/advanced"),
    ],
  },
];

const enTree = prefixTree(
  [
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
        page("Connections", "integrations/connections"),
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
  ],
  "en",
);

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
