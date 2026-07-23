import { describe, expect, test } from "bun:test";

import {
  ApiVersionText,
  ConfigReference,
  ConnectionName,
  CreatedAt,
  DnsRecordPlan,
  DomainConnectSetup,
  ExternalAccountId,
  InfrastructureServerProposal,
  InstalledAt,
  IntegrationConnection,
  IntegrationConnectionId,
  IntegrationKey,
  NotificationMessage,
  NotificationMessageDelivery,
  OccurredAt,
  OwnerId,
  OwnerScopeValue,
  PluginInstallation,
  PluginInstallationId,
  PluginInstallationStatusValue,
  PluginName,
  ProviderConnection,
  ProviderConnectionId,
  ProviderConnectionStatusValue,
  ProviderKey,
  VersionText,
} from "../src";

const createdAt = CreatedAt.rehydrate("2026-07-20T00:00:00.000Z");
const occurredAt = OccurredAt.rehydrate("2026-07-20T00:01:00.000Z");

describe("ProviderConnection", () => {
  test("[CORE-EXT-PROVIDER-001] creates pending connection and activates", () => {
    const connection = ProviderConnection.create({
      id: ProviderConnectionId.rehydrate("pvc_demo"),
      ownerScope: OwnerScopeValue.rehydrate("organization"),
      ownerId: OwnerId.rehydrate("org_demo"),
      providerKey: ProviderKey.rehydrate("cloudflare"),
      name: ConnectionName.rehydrate("Cloudflare DNS"),
      configReference: ConfigReference.rehydrate("cfg://cloudflare/org_demo"),
      createdAt,
    })._unsafeUnwrap();

    expect(connection.toState().status.value).toBe("pending");
    expect(connection.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: "provider_connection.created",
        payload: { providerKey: "cloudflare" },
      }),
    ]);

    connection.activate(occurredAt);
    expect(connection.toState().status.value).toBe("active");
    expect(connection.pullDomainEvents()).toEqual([
      expect.objectContaining({ type: "provider_connection.activated" }),
    ]);
  });
});

describe("IntegrationConnection", () => {
  test("[CORE-EXT-INTEGRATION-001] connects and revokes with external account metadata", () => {
    const connection = IntegrationConnection.create({
      id: IntegrationConnectionId.rehydrate("igc_demo"),
      ownerScope: OwnerScopeValue.rehydrate("organization"),
      ownerId: OwnerId.rehydrate("org_demo"),
      integrationKey: IntegrationKey.rehydrate("github"),
      name: ConnectionName.rehydrate("GitHub App"),
      createdAt,
    })._unsafeUnwrap();
    connection.pullDomainEvents();

    connection.connect(occurredAt, ExternalAccountId.rehydrate("gh_org_123"));
    expect(connection.toState().status.value).toBe("connected");
    expect(connection.toState().externalAccountId?.value).toBe("gh_org_123");
    expect(connection.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: "integration_connection.connected",
        payload: expect.objectContaining({
          integrationKey: "github",
          externalAccountId: "gh_org_123",
        }),
      }),
    ]);

    connection.revoke(OccurredAt.rehydrate("2026-07-20T00:02:00.000Z"));
    expect(connection.toState().status.value).toBe("revoked");
    expect(connection.pullDomainEvents()).toEqual([
      expect.objectContaining({ type: "integration_connection.revoked" }),
    ]);
  });
});

describe("PluginInstallation", () => {
  test("[CORE-EXT-PLUGIN-001] installs, disables, and marks incompatible", () => {
    const installation = PluginInstallation.install({
      id: PluginInstallationId.rehydrate("pli_demo"),
      ownerScope: OwnerScopeValue.rehydrate("system"),
      ownerId: OwnerId.rehydrate("sys_local"),
      pluginName: PluginName.rehydrate("audit-exporter"),
      version: VersionText.rehydrate("1.2.0"),
      apiVersion: ApiVersionText.rehydrate("v1"),
      status: PluginInstallationStatusValue.rehydrate("installed"),
      installedAt: InstalledAt.rehydrate("2026-07-20T00:00:00.000Z"),
    })._unsafeUnwrap();

    expect(installation.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: "plugin_installation.installed",
        payload: {
          pluginName: "audit-exporter",
          version: "1.2.0",
        },
      }),
    ]);

    installation.disable(occurredAt);
    expect(installation.toState().status.value).toBe("disabled");
    expect(installation.pullDomainEvents()).toEqual([
      expect.objectContaining({ type: "plugin_installation.disabled" }),
    ]);

    installation.markIncompatible(OccurredAt.rehydrate("2026-07-20T00:03:00.000Z"));
    expect(installation.toState().status.value).toBe("incompatible");
    expect(installation.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: "plugin_installation.incompatible",
        payload: expect.objectContaining({
          apiVersion: "v1",
        }),
      }),
    ]);
  });
});

describe("InfrastructureServerProposal", () => {
  test("[CORE-EXT-INFRA-001] creates a proposal and rejects invalid ports/costs/risk", () => {
    const proposal = InfrastructureServerProposal.create({
      providerKey: " Vultr ",
      region: " ewr ",
      size: " vc2-1c-1gb ",
      image: " ubuntu-24.04 ",
      recommendedServerName: " App-Edge-1 ",
      osUser: " root ",
      sshPort: 22,
      estimatedMonthlyCostUsd: 6,
      costRiskLevel: "medium",
      cleanupSupported: true,
      notes: ["ephemeral"],
      tags: ["edge"],
      sshPublicKeyRef: "secret://ssh/deploy",
    })._unsafeUnwrap();

    expect(proposal.requiresExplicitAcceptance()).toBe(true);
    expect(proposal.riskLevel()).toBe("medium");
    expect(proposal.toJSON()).toMatchObject({
      providerKey: "vultr",
      region: "ewr",
      size: "vc2-1c-1gb",
      recommendedServerName: "app-edge-1",
      sshPort: 22,
      estimatedMonthlyCostUsd: 6,
    });
    expect(proposal.summary()).toContain("vultr");
    expect(proposal.description()).toContain("SSH root@");

    expect(
      InfrastructureServerProposal.create({
        ...proposal.toJSON(),
        sshPort: 70000,
      }).isErr(),
    ).toBe(true);
    expect(
      InfrastructureServerProposal.create({
        ...proposal.toJSON(),
        estimatedMonthlyCostUsd: -1,
      }).isErr(),
    ).toBe(true);
    expect(
      InfrastructureServerProposal.create({
        ...proposal.toJSON(),
        // @ts-expect-error intentional invalid risk
        costRiskLevel: "extreme",
      }).isErr(),
    ).toBe(true);
    expect(
      InfrastructureServerProposal.create({
        ...proposal.toJSON(),
        providerKey: " ",
      }).isErr(),
    ).toBe(true);
  });
});

describe("NotificationMessage", () => {
  test("[CORE-EXT-NOTIFY-001] models sensitive delivery and rejects invalid payloads", () => {
    const message = NotificationMessage.create({
      providerKey: " Slack ",
      channelRef: " #ops ",
      subject: " Deploy failed ",
      bodyPreview: "Deployment dep_demo failed health checks",
      payloadSensitivity: "sensitive",
      redactedFields: ["token", " password ", "token"],
      metadata: { deploymentId: "dep_demo", empty: "" },
    })._unsafeUnwrap();

    expect(message.requiresExplicitAcceptance()).toBe(true);
    expect(message.riskLevel()).toBe("medium");
    expect(message.toJSON()).toMatchObject({
      providerKey: "slack",
      channelRef: "#ops",
      subject: "Deploy failed",
      payloadSensitivity: "sensitive",
      redactedFields: ["token", "password"],
    });
    expect(message.description()).toContain("Redacted fields: token, password");

    const delivery = NotificationMessageDelivery.create({
      ...message.toJSON(),
      providerMessageId: "msg_123",
      status: "sent",
    })._unsafeUnwrap();
    expect(delivery.toJSON().status).toBe("sent");
    expect(delivery.toJSON().providerMessageId).toBe("msg_123");

    expect(
      NotificationMessage.create({
        ...message.toJSON(),
        // @ts-expect-error intentional invalid sensitivity
        payloadSensitivity: "public",
      }).isErr(),
    ).toBe(true);
    expect(
      NotificationMessageDelivery.create({
        ...message.toJSON(),
        providerMessageId: "msg_1",
        // @ts-expect-error intentional invalid status
        status: "queued",
      }).isErr(),
    ).toBe(true);
  });
});

describe("DnsRecordPlan and DomainConnectSetup", () => {
  test("[CORE-EXT-DNS-001] detects conflicts and blocks apply while conflicted", () => {
    const conflicted = DnsRecordPlan.create({
      zoneName: "Example.COM.",
      records: [
        {
          name: "app.example.com",
          type: "CNAME",
          value: "edge.appaloft.test",
          purpose: "domain-routing",
        },
      ],
      existingRecords: [
        {
          name: "app.example.com",
          type: "A",
          value: "1.2.3.4",
          purpose: "manual",
        },
      ],
    })._unsafeUnwrap();

    expect(conflicted.hasConflicts()).toBe(true);
    expect(conflicted.ensureApplicable().isErr()).toBe(true);
    expect(conflicted.summary()).toContain("1 conflict");

    const clean = DnsRecordPlan.create({
      zoneName: "example.com",
      records: [
        {
          name: "api.example.com",
          type: "CNAME",
          value: "edge.appaloft.test",
          purpose: "domain-routing",
          ttl: 300,
        },
      ],
      existingRecords: [
        {
          name: "www.example.com",
          type: "A",
          value: "1.2.3.4",
          purpose: "manual",
        },
      ],
    })._unsafeUnwrap();

    expect(clean.hasConflicts()).toBe(false);
    expect(clean.ensureApplicable().isOk()).toBe(true);
    expect(
      clean
        .missingFrom([
          {
            name: "www.example.com",
            type: "A",
            value: "1.2.3.4",
            purpose: "manual",
          },
        ])
        ._unsafeUnwrap()
        .map((record) => record.toJSON().name),
    ).toEqual(["api.example.com"]);
  });

  test("[CORE-EXT-DNS-002] creates Domain Connect setup without storing reusable tokens", () => {
    const setup = DomainConnectSetup.create({
      providerKey: " Cloudflare ",
      zoneName: " Example.COM. ",
      hostname: "app.example.com",
      serviceId: " appaloft-route ",
      templateId: " appaloft-v1 ",
      redirectUrl: " https://console.example.test/domain-connect/callback ",
      state: " state_abc ",
      records: [
        {
          name: "app.example.com",
          type: "CNAME",
          value: "edge.appaloft.test",
          purpose: "domain-routing",
        },
      ],
    })._unsafeUnwrap();

    expect(setup.summary()).toContain("cloudflare");
    expect(setup.description()).toContain("no reusable provider token");
    expect(setup.toJSON()).toMatchObject({
      providerKey: "cloudflare",
      zoneName: "example.com",
      hostname: "app.example.com",
      serviceId: "appaloft-route",
      templateId: "appaloft-v1",
    });
    expect(setup.records()).toHaveLength(1);

    expect(
      DomainConnectSetup.create({
        providerKey: "cloudflare",
        zoneName: "example.com",
        hostname: "app.example.com",
        serviceId: "svc",
        templateId: "tpl",
        redirectUrl: "https://example.test",
        state: "state",
        records: [],
      }).isErr(),
    ).toBe(true);
  });

  test("[CORE-EXT-DNS-003] rejects empty plans and invalid record vocabulary", () => {
    expect(DnsRecordPlan.create({ records: [] }).isErr()).toBe(true);
    expect(
      DnsRecordPlan.create({
        records: [
          {
            name: "app.example.com",
            // @ts-expect-error intentional invalid type
            type: "TXTX",
            value: "v",
            purpose: "domain-routing",
          },
        ],
      }).isErr(),
    ).toBe(true);
  });
});
