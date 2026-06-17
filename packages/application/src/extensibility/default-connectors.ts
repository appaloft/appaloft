import { ConnectorAvailabilityValue, type ConnectorDefinitionSnapshot } from "@appaloft/core";

function unavailable(code: string, message: string) {
  return ConnectorAvailabilityValue.unavailable(code, message).toJSON();
}

function setupRequired(message: string) {
  return ConnectorAvailabilityValue.setupRequired(message).toJSON();
}

function deferred(message: string) {
  return ConnectorAvailabilityValue.deferred(message).toJSON();
}

export interface DefaultConnectorOptions {
  githubSource?: {
    configured?: boolean;
    installUrl?: string;
  };
  cloudflareDns?: {
    configured?: boolean;
    documentationHref?: string;
  };
  vultrInfrastructure?: {
    configured?: boolean;
    documentationHref?: string;
  };
  slackNotification?: {
    configured?: boolean;
    documentationHref?: string;
  };
}

export function createDefaultConnectorDefinitions(
  options: DefaultConnectorOptions = {},
): ConnectorDefinitionSnapshot[] {
  return [
    {
      key: "github-source",
      title: "GitHub Source",
      category: "source",
      providerKey: "github",
      capabilities: [
        {
          key: "source.repositories.browse",
          title: "Browse repositories",
          implemented: true,
        },
        {
          key: "source.events.receive",
          title: "Receive source events",
          implemented: true,
        },
        {
          key: "source.deployment-status.write",
          title: "Write deployment statuses",
          implemented: false,
        },
      ],
      grantKinds: [
        {
          kind: "provider-app-installation",
          title: "GitHub App installation",
          storesLongLivedSecret: false,
          description: "Exchanges app-owned credentials for short-lived installation tokens.",
        },
      ],
      availability: options.githubSource?.configured
        ? ConnectorAvailabilityValue.available("GitHub source connector is configured.").toJSON()
        : setupRequired("Install or configure a GitHub App before source access is available."),
      visibility: "catalog",
      setup: {
        ...(options.githubSource?.installUrl
          ? { connectHref: options.githubSource.installUrl }
          : {}),
      },
    },
    {
      key: "cloudflare-dns",
      title: "Cloudflare DNS",
      category: "dns",
      providerKey: "cloudflare",
      capabilities: [
        {
          key: "dns.records.plan",
          title: "Plan DNS records",
          implemented: true,
        },
        {
          key: "dns.records.apply",
          title: "Apply accepted DNS records",
          implemented: true,
        },
        {
          key: "dns.records.verify",
          title: "Verify DNS readback",
          implemented: true,
        },
        {
          key: "dns.records.cleanup",
          title: "Clean up managed DNS records",
          implemented: true,
        },
      ],
      grantKinds: [
        {
          kind: "persistent-provider-credential",
          title: "Cloudflare API token",
          storesLongLivedSecret: true,
          description:
            "Uses a scoped provider credential or secret reference for deterministic DNS actions.",
        },
      ],
      availability: options.cloudflareDns?.configured
        ? ConnectorAvailabilityValue.available("Cloudflare DNS connector is configured.").toJSON()
        : unavailable(
            "connector.cloudflare_dns.not_configured",
            "Cloudflare DNS requires a provider credential or secret reference.",
          ),
      visibility: "hidden-when-unavailable",
      setup: {
        ...(options.cloudflareDns?.documentationHref
          ? { documentationHref: options.cloudflareDns.documentationHref }
          : {}),
      },
    },
    {
      key: "vultr-infrastructure",
      title: "Vultr Infrastructure",
      category: "infrastructure",
      providerKey: "vultr",
      capabilities: [
        {
          key: "infrastructure.server.propose",
          title: "Propose SSH deployment target",
          implemented: true,
        },
        {
          key: "infrastructure.server.create",
          title: "Create accepted server",
          implemented: false,
        },
        {
          key: "infrastructure.server.cleanup",
          title: "Clean up managed server",
          implemented: false,
        },
      ],
      grantKinds: [
        {
          kind: "persistent-provider-credential",
          title: "Provider API credential",
          storesLongLivedSecret: true,
        },
      ],
      availability: options.vultrInfrastructure?.configured
        ? ConnectorAvailabilityValue.available(
            "Vultr infrastructure connector is configured.",
          ).toJSON()
        : unavailable(
            "connector.vultr_infrastructure.not_configured",
            "Vultr infrastructure requires a provider credential or secret reference.",
          ),
      visibility: "hidden-when-unavailable",
      setup: {
        ...(options.vultrInfrastructure?.documentationHref
          ? { documentationHref: options.vultrInfrastructure.documentationHref }
          : {}),
      },
    },
    {
      key: "slack-notification",
      title: "Slack Notification",
      category: "notification",
      providerKey: "slack",
      capabilities: [
        {
          key: "notification.messages.plan",
          title: "Plan message delivery",
          implemented: true,
        },
        {
          key: "notification.messages.send",
          title: "Send accepted message",
          implemented: true,
        },
      ],
      grantKinds: [
        {
          kind: "manual-secret-reference",
          title: "Slack webhook or app secret reference",
          storesLongLivedSecret: true,
          description: "Uses an operator-managed secret reference for deterministic message sends.",
        },
      ],
      availability: options.slackNotification?.configured
        ? ConnectorAvailabilityValue.available(
            "Slack notification connector is configured.",
          ).toJSON()
        : unavailable(
            "connector.slack_notification.not_configured",
            "Slack notification requires a webhook, app credential, or secret reference.",
          ),
      visibility: "hidden-when-unavailable",
      setup: {
        ...(options.slackNotification?.documentationHref
          ? { documentationHref: options.slackNotification.documentationHref }
          : {}),
      },
    },
    {
      key: "github-identity",
      title: "GitHub Identity",
      category: "identity",
      providerKey: "github",
      capabilities: [
        {
          key: "identity.sign-in",
          title: "Sign in",
          implemented: true,
        },
      ],
      grantKinds: [
        {
          kind: "limited-oauth-grant",
          title: "User OAuth grant",
          storesLongLivedSecret: false,
        },
      ],
      availability: setupRequired("GitHub identity is configured through the auth provider layer."),
      visibility: "catalog",
    },
  ];
}
