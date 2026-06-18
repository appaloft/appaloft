import "reflect-metadata";
import { describe, expect, test } from "bun:test";
import { ok } from "@appaloft/core";

import {
  AcceptConnectorCapabilityPlanUseCase,
  ApplyConnectorCapabilityUseCase,
  CompleteConnectionCallbackUseCase,
  type ConnectorAuthorizationAdapter,
  createDefaultConnectorDefinitions,
  createExecutionContext,
  FakeDnsConnectorProviderAdapter,
  FakeInfrastructureConnectorProviderAdapter,
  FakeNotificationConnectorProviderAdapter,
  FakeSourceConnectorProviderAdapter,
  InMemoryAcceptedConnectionCapabilityPlanStore,
  InMemoryConnectorAuthorizationAdapterRegistry,
  InMemoryConnectorAuthorizationAttemptStore,
  InMemoryConnectorConnectionStore,
  InMemoryConnectorProviderAdapterRegistry,
  InMemoryConnectorRegistry,
  ListConnectionsQueryService,
  ListConnectorCategoriesQueryService,
  ListConnectorsQueryService,
  PlanConnectorCapabilityQueryService,
  RevokeConnectionUseCase,
  ShowConnectionQueryService,
  StartConnectionUseCase,
} from "../src";

describe("connector catalog", () => {
  test("[APP-CONN-002] lists categories independently from implemented providers", async () => {
    const service = new ListConnectorCategoriesQueryService();
    const result = await service.execute(createExecutionContext({ entrypoint: "system" }));

    expect(result.items.map((item) => item.key)).toEqual([
      "source",
      "dns",
      "infrastructure",
      "notification",
      "billing",
      "identity",
      "observability",
      "storage",
    ]);
  });

  test("[APP-CONN-002] keeps DNS as a category rather than an installable connector", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: {
          configured: true,
        },
      }),
    );
    const service = new ListConnectorsQueryService(registry);
    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      category: "dns",
      includeUnavailable: true,
    });

    expect(result.items.map((item) => item.key)).toEqual(["cloudflare-dns"]);
    expect(result.items.every((item) => item.category === "dns")).toBe(true);
    expect(result.items.map((item) => item.key)).not.toContain("dns");
  });

  test("[APP-CONN-004] exposes Cloudflare DNS as the primary DNS connector when configured", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: {
          configured: true,
        },
      }),
    );
    const service = new ListConnectorsQueryService(registry);
    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      category: "dns",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.key).toBe("cloudflare-dns");
    expect(result.items[0]?.availability.status).toBe("available");
    expect(result.items[0]?.capabilities.map((capability) => capability.key)).toContain(
      "dns.records.plan",
    );
  });

  test("[APP-CONN-002] hides unavailable Cloudflare DNS unless the catalog requests unavailable entries", async () => {
    const registry = new InMemoryConnectorRegistry(createDefaultConnectorDefinitions());
    const service = new ListConnectorsQueryService(registry);

    const visible = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      category: "dns",
    });
    const catalog = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      category: "dns",
      includeUnavailable: true,
    });

    expect(visible.items).toEqual([]);
    expect(catalog.items.map((item) => item.key)).toEqual(["cloudflare-dns"]);
    expect(catalog.items[0]?.availability.status).toBe("unavailable");
  });

  test("[APP-CONN-007] maps existing GitHub App capability into a source connector", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        githubSource: {
          configured: true,
          installUrl: "https://github.com/apps/appaloft/installations/new",
        },
      }),
    );
    const service = new ListConnectorsQueryService(registry);
    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      category: "source",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.key).toBe("github-source");
    expect(result.items[0]?.setup?.connectHref).toBe(
      "https://github.com/apps/appaloft/installations/new",
    );
    expect(result.items[0]?.grantKinds.map((grant) => grant.kind)).toEqual([
      "provider-app-installation",
    ]);
  });

  test("[APP-CONN-006] keeps GitHub identity login separate from GitHub source access", async () => {
    const registry = new InMemoryConnectorRegistry(createDefaultConnectorDefinitions());
    const listService = new ListConnectorsQueryService(registry);

    const sourceCatalog = await listService.execute(
      createExecutionContext({ entrypoint: "system" }),
      {
        category: "source",
        includeUnavailable: true,
      },
    );
    const identityCatalog = await listService.execute(
      createExecutionContext({ entrypoint: "system" }),
      {
        category: "identity",
        includeUnavailable: true,
      },
    );

    expect(sourceCatalog.items.map((connector) => connector.key)).toEqual(["github-source"]);
    expect(identityCatalog.items.map((connector) => connector.key)).toEqual(["github-identity"]);
    expect(identityCatalog.items[0]?.grantKinds.map((grant) => grant.kind)).toEqual([
      "limited-oauth-grant",
    ]);
    expect(identityCatalog.items[0]?.capabilities.map((capability) => capability.key)).toEqual([
      "identity.sign-in",
    ]);
    expect(
      identityCatalog.items[0]?.capabilities.map((capability) => capability.key),
    ).not.toContain("source.repositories.browse");

    const planService = new PlanConnectorCapabilityQueryService(
      registry,
      new InMemoryConnectorProviderAdapterRegistry([]),
    );
    const sourceAccessFromIdentity = await planService.execute(
      createExecutionContext({ entrypoint: "system" }),
      {
        connectorKey: "github-identity",
        capabilityKey: "source.repositories.browse",
        parameters: {
          repositoryFullNames: ["acme/app"],
        },
      },
    );

    expect(sourceAccessFromIdentity.isErr()).toBe(true);
    expect(sourceAccessFromIdentity._unsafeUnwrapErr()).toMatchObject({
      code: "validation_error",
      category: "user",
      retryable: false,
    });
    expect(sourceAccessFromIdentity._unsafeUnwrapErr().message).toContain(
      "Connector github-identity does not implement source.repositories.browse",
    );
  });

  test("[APP-CONN-008][APP-CONN-016] plans GitHub source repository access with redacted short-lived provider-app token lease", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        githubSource: {
          configured: true,
        },
      }),
    );
    const service = new PlanConnectorCapabilityQueryService(
      registry,
      new InMemoryConnectorProviderAdapterRegistry([
        new FakeSourceConnectorProviderAdapter({
          connectorKey: "github-source",
          providerKey: "github",
          providerTitle: "GitHub Source",
          installationId: "98765",
          accountLogin: "acme",
          permissions: ["contents:read", "metadata:read", "pull_requests:read"],
          expiresAt: "2026-06-17T10:00:00.000Z",
          now: "2026-06-17T09:30:00.000Z",
        }),
      ]),
    );

    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      connectorKey: "github-source",
      capabilityKey: "source.repositories.browse",
      parameters: {
        repositoryFullNames: ["acme/app"],
        permissions: ["contents:read"],
      },
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan.providerPlan?.kind).toBe("source-repository-access");
    expect(plan.providerPlan?.sourceRepositoryAccess).toMatchObject({
      providerKey: "github",
      installationId: "98765",
      accountLogin: "acme",
      repositoriesSelection: "selected",
      repositories: [
        {
          fullName: "acme/app",
          private: true,
        },
      ],
      tokenLease: {
        providerKey: "github",
        installationId: "98765",
        expiresAt: "2026-06-17T10:00:00.000Z",
        redacted: true,
        expired: false,
        permissions: ["contents:read"],
        repositoryFullNames: ["acme/app"],
      },
    });
    expect(plan.effects.map((effect) => effect.kind)).toContain(
      "source.provider-app-token.exchange",
    );
    expect(JSON.stringify(plan)).not.toContain("ghs_");
    expect(JSON.stringify(plan)).not.toContain("provider_token_value");
  });

  test("[APP-CONN-008][APP-CONN-016] marks expired provider-app token leases without returning token material", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        githubSource: {
          configured: true,
        },
      }),
    );
    const service = new PlanConnectorCapabilityQueryService(
      registry,
      new InMemoryConnectorProviderAdapterRegistry([
        new FakeSourceConnectorProviderAdapter({
          connectorKey: "github-source",
          providerKey: "github",
          providerTitle: "GitHub Source",
          expiresAt: "2026-06-17T09:00:00.000Z",
          now: "2026-06-17T09:30:00.000Z",
        }),
      ]),
    );

    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      connectorKey: "github-source",
      capabilityKey: "source.repositories.browse",
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan.providerPlan?.sourceRepositoryAccess?.tokenLease).toMatchObject({
      redacted: true,
      expired: true,
    });
    expect(JSON.stringify(plan)).not.toContain("ghs_");
    expect(JSON.stringify(plan)).not.toContain("provider_token_value");
  });

  test("[APP-CONN-012] keeps billing as a category without implementing a billing connector", async () => {
    const registry = new InMemoryConnectorRegistry(createDefaultConnectorDefinitions());
    const service = new ListConnectorsQueryService(registry);
    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      category: "billing",
      includeUnavailable: true,
    });

    expect(result.items).toEqual([]);
  });

  test("[APP-CONN-011] exposes Slack as the primary notification connector when configured", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        slackNotification: {
          configured: true,
        },
      }),
    );
    const service = new ListConnectorsQueryService(registry);
    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      category: "notification",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.key).toBe("slack-notification");
    expect(result.items[0]?.availability.status).toBe("available");
    expect(result.items[0]?.capabilities.map((capability) => capability.key)).toEqual([
      "notification.messages.plan",
      "notification.messages.send",
    ]);
  });

  test("[APP-CONN-009] exposes Vultr as the primary infrastructure connector when configured", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        vultrInfrastructure: {
          configured: true,
        },
      }),
    );
    const service = new ListConnectorsQueryService(registry);
    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      category: "infrastructure",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.key).toBe("vultr-infrastructure");
    expect(result.items[0]?.availability.status).toBe("available");
    expect(result.items[0]?.capabilities.map((capability) => capability.key)).toContain(
      "infrastructure.server.propose",
    );
  });

  test("[APP-CONN-009][APP-CONN-010][APP-CONN-016] plans infrastructure server proposals through a provider adapter", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        vultrInfrastructure: {
          configured: true,
        },
      }),
    );
    const service = new PlanConnectorCapabilityQueryService(
      registry,
      new InMemoryConnectorProviderAdapterRegistry([
        new FakeInfrastructureConnectorProviderAdapter({
          connectorKey: "vultr-infrastructure",
          providerKey: "vultr",
          providerTitle: "Vultr Infrastructure",
        }),
      ]),
    );

    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      connectorKey: "vultr-infrastructure",
      capabilityKey: "infrastructure.server.propose",
      parameters: {
        region: "ewr",
        size: "vc2-4c-8gb",
        image: "ubuntu-24.04",
        serverName: "appaloft-edge-prod",
        sshPublicKeyRef: "sshkey_prod",
        estimatedMonthlyCostUsd: 96,
      },
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan.connectorKey).toBe("vultr-infrastructure");
    expect(plan.riskLevel).toBe("high");
    expect(plan.requiresExplicitAcceptance).toBe(true);
    expect(plan.providerPlan?.kind).toBe("infrastructure-server-proposal");
    expect(plan.providerPlan?.infrastructureServerProposal).toMatchObject({
      providerKey: "vultr",
      region: "ewr",
      size: "vc2-4c-8gb",
      image: "ubuntu-24.04",
      recommendedServerName: "appaloft-edge-prod",
      sshPublicKeyRef: "sshkey_prod",
      costRiskLevel: "high",
      cleanupSupported: true,
    });
    expect(plan.effects.map((effect) => effect.kind)).toContain("infrastructure.cost.estimate");
    expect(JSON.stringify(plan)).not.toContain("token");
  });

  test("[APP-CONN-010][APP-CONN-016] stores accepted high-cost connector capability plans without secrets", async () => {
    const store = new InMemoryAcceptedConnectionCapabilityPlanStore();
    const service = new AcceptConnectorCapabilityPlanUseCase(store);

    const result = await service.execute(
      createExecutionContext({
        entrypoint: "system",
        actor: {
          kind: "user",
          id: "actor_deployer",
          label: "Deployer",
        },
      }),
      {
        planId: "infra_plan_high_cost",
        connectorKey: "vultr-infrastructure",
        capabilityKey: "infrastructure.server.create",
        ownerRef: {
          scope: "project",
          id: "proj_prod",
        },
        riskLevel: "high",
        summary: "Create a 4 CPU / 8 GB server in ewr.",
        effects: [
          {
            kind: "infrastructure.server.create",
            title: "Create appaloft-edge-prod",
            description: "Estimated monthly cost is 96 USD.",
          },
        ],
        cleanup: {
          supported: true,
          description: "Destroy the provider server and remove generated SSH access.",
        },
      },
    );

    expect(result.isOk()).toBe(true);
    const accepted = result._unsafeUnwrap();
    expect(accepted.acceptedPlanId).toStartWith("accepted_");
    expect(accepted.acceptedBy).toBe("actor_deployer");
    expect(accepted.riskLevel).toBe("high");
    expect(store.findById(accepted.acceptedPlanId)).toMatchObject({
      connectorKey: "vultr-infrastructure",
      capabilityKey: "infrastructure.server.create",
      ownerRef: {
        scope: "project",
        id: "proj_prod",
      },
    });
    expect(JSON.stringify(accepted)).not.toContain("token=");
    expect(JSON.stringify(accepted)).not.toContain("private_key");
  });

  test("[APP-CONN-011][APP-CONN-016] plans Slack notification messages with payload redaction", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        slackNotification: {
          configured: true,
        },
      }),
    );
    const service = new PlanConnectorCapabilityQueryService(
      registry,
      new InMemoryConnectorProviderAdapterRegistry([
        new FakeNotificationConnectorProviderAdapter({
          connectorKey: "slack-notification",
          providerKey: "slack",
          providerTitle: "Slack Notification",
          defaultChannelRef: "#deployments",
        }),
      ]),
    );

    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      connectorKey: "slack-notification",
      capabilityKey: "notification.messages.plan",
      parameters: {
        channelRef: "#deployments",
        subject: "Deploy finished",
        body: "Deploy finished for owner@example.com token=secret-token",
        payload: {
          deploymentId: "dep_123",
          actorEmail: "owner@example.com",
          token: "secret-token",
        },
        metadata: {
          resourceId: "res_123",
        },
      },
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan.connectorKey).toBe("slack-notification");
    expect(plan.riskLevel).toBe("medium");
    expect(plan.requiresExplicitAcceptance).toBe(true);
    expect(plan.providerPlan?.kind).toBe("notification-message");
    expect(plan.providerPlan?.notificationMessage).toMatchObject({
      providerKey: "slack",
      channelRef: "#deployments",
      subject: "Deploy finished",
      bodyPreview: "Deploy finished for [redacted-email] token=[redacted]",
      payloadSensitivity: "sensitive",
      redactedFields: ["actorEmail", "token"],
      metadata: {
        resourceId: "res_123",
      },
    });
    expect(JSON.stringify(plan)).not.toContain("owner@example.com");
    expect(JSON.stringify(plan)).not.toContain("secret-token");
  });

  test("[APP-CONN-011][APP-CONN-016] sends accepted Slack notification messages without exposing provider secrets", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        slackNotification: {
          configured: true,
        },
      }),
    );
    const acceptedPlanStore = new InMemoryAcceptedConnectionCapabilityPlanStore();
    const accepted = await new AcceptConnectorCapabilityPlanUseCase(acceptedPlanStore).execute(
      createExecutionContext({ entrypoint: "system" }),
      {
        planId: "notifyplan_test",
        connectorKey: "slack-notification",
        capabilityKey: "notification.messages.send",
        riskLevel: "medium",
        summary: "Send deployment notification to Slack.",
        effects: [
          {
            kind: "notification.message.sent",
            title: "Send Slack message",
          },
        ],
      },
    );
    expect(accepted.isOk()).toBe(true);
    const service = new ApplyConnectorCapabilityUseCase(
      registry,
      new InMemoryConnectorProviderAdapterRegistry([
        new FakeNotificationConnectorProviderAdapter({
          connectorKey: "slack-notification",
          providerKey: "slack",
          providerTitle: "Slack Notification",
        }),
      ]),
      acceptedPlanStore,
    );

    const rejected = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      connectorKey: "slack-notification",
      capabilityKey: "notification.messages.send",
      parameters: {
        channelRef: "#deployments",
        subject: "Deploy finished",
        body: "Deploy finished for owner@example.com",
        payload: {
          actorEmail: "owner@example.com",
        },
      },
    });
    expect(rejected.isErr()).toBe(true);
    expect(rejected._unsafeUnwrapErr().code).toBe("conflict");

    const sent = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      connectorKey: "slack-notification",
      capabilityKey: "notification.messages.send",
      acceptedPlanId: accepted._unsafeUnwrap().acceptedPlanId,
      parameters: {
        channelRef: "#deployments",
        subject: "Deploy finished",
        body: "Deploy finished for owner@example.com",
        payload: {
          actorEmail: "owner@example.com",
        },
      },
    });

    expect(sent.isOk()).toBe(true);
    const result = sent._unsafeUnwrap();
    expect(result.status).toBe("applied");
    expect(result.effects.map((effect) => effect.kind)).toEqual(["notification.message.sent"]);
    expect(result.providerResult?.notificationDelivery).toMatchObject({
      providerKey: "slack",
      channelRef: "#deployments",
      subject: "Deploy finished",
      status: "sent",
      payloadSensitivity: "sensitive",
      redactedFields: ["actorEmail"],
    });
    expect(JSON.stringify(result)).not.toContain("owner@example.com");
    expect(JSON.stringify(result)).not.toContain("slack_secret_token");
  });

  test("[APP-CONN-004][APP-CONN-014][APP-CONN-016] plans Cloudflare DNS records through a provider adapter", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: {
          configured: true,
        },
      }),
    );
    const service = new PlanConnectorCapabilityQueryService(
      registry,
      new InMemoryConnectorProviderAdapterRegistry([
        new FakeDnsConnectorProviderAdapter({
          connectorKey: "cloudflare-dns",
          providerTitle: "Cloudflare DNS",
        }),
      ]),
    );

    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.plan",
      parameters: {
        zoneName: "example.com",
        hostname: "app.example.com",
        target: "edge.appaloft.dev",
        recordType: "CNAME",
      },
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan.connectorKey).toBe("cloudflare-dns");
    expect(plan.providerPlan?.dnsRecords?.records).toEqual([
      {
        name: "app.example.com",
        type: "CNAME",
        value: "edge.appaloft.dev",
        purpose: "domain-routing",
      },
    ]);
    expect(JSON.stringify(plan)).not.toContain("token");
  });

  test("[APP-CONN-003][APP-CONN-016] starts temporary Domain Connect setup without storing provider tokens", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: {
          configured: true,
        },
      }),
    );
    const service = new PlanConnectorCapabilityQueryService(
      registry,
      new InMemoryConnectorProviderAdapterRegistry([
        new FakeDnsConnectorProviderAdapter({
          connectorKey: "cloudflare-dns",
          providerTitle: "Cloudflare DNS",
          domainConnect: {
            consentBaseUrl: "https://domainconnect.test/providers",
          },
        }),
      ]),
    );

    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.domain-connect.start",
      parameters: {
        zoneName: "example.com",
        hostname: "app.example.com",
        target: "edge.appaloft.dev",
        recordType: "CNAME",
      },
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan.riskLevel).toBe("low");
    expect(plan.requiresExplicitAcceptance).toBe(false);
    expect(plan.providerPlan?.kind).toBe("domain-connect-setup");
    expect(plan.providerPlan?.domainConnectSetup).toMatchObject({
      providerKey: "cloudflare",
      zoneName: "example.com",
      hostname: "app.example.com",
      serviceId: "appaloft",
      templateId: "appaloft-domain",
      records: [
        {
          name: "app.example.com",
          type: "CNAME",
          value: "edge.appaloft.dev",
          purpose: "domain-routing",
        },
      ],
    });
    expect(plan.providerPlan?.domainConnectSetup?.redirectUrl).toContain(
      "https://domainconnect.test/providers/cloudflare/services/appaloft/templates/appaloft-domain/apply",
    );
    expect(JSON.stringify(plan)).not.toContain("provider_token_value");
    expect(JSON.stringify(plan)).not.toContain("secret");
  });

  test("[APP-CONN-003][APP-CONN-016] completes temporary Domain Connect setup through DNS readback", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: {
          configured: true,
        },
      }),
    );
    const adapter = new FakeDnsConnectorProviderAdapter({
      connectorKey: "cloudflare-dns",
      providerTitle: "Cloudflare DNS",
    });
    const service = new ApplyConnectorCapabilityUseCase(
      registry,
      new InMemoryConnectorProviderAdapterRegistry([adapter]),
    );

    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.domain-connect.complete",
      parameters: {
        zoneName: "example.com",
        hostname: "app.example.com",
        target: "edge.appaloft.dev",
        recordType: "CNAME",
        state: "dc_state_test",
      },
    });

    expect(result.isOk()).toBe(true);
    const completed = result._unsafeUnwrap();
    expect(completed.status).toBe("applied");
    expect(completed.effects.map((effect) => effect.kind)).toContain(
      "dns.domain-connect.completed",
    );
    expect(completed.providerResult?.kind).toBe("domain-connect-apply");
    expect(completed.providerResult?.domainConnectApply).toMatchObject({
      providerKey: "cloudflare",
      zoneName: "example.com",
      hostname: "app.example.com",
      status: "applied",
      state: "dc_state_test",
    });
    expect(completed.providerResult?.domainConnectApply?.dnsRecords.records).toEqual([
      {
        name: "app.example.com",
        type: "CNAME",
        value: "edge.appaloft.dev",
        purpose: "domain-routing",
      },
    ]);
    expect(JSON.stringify(completed)).not.toContain("token");
  });

  test("[APP-CONN-005][APP-CONN-016] fake DNS provider reports conflicts without applying changes", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: {
          configured: true,
        },
      }),
    );
    const service = new PlanConnectorCapabilityQueryService(
      registry,
      new InMemoryConnectorProviderAdapterRegistry([
        new FakeDnsConnectorProviderAdapter({
          connectorKey: "cloudflare-dns",
          providerTitle: "Cloudflare DNS",
          existingRecords: [
            {
              name: "app.example.com",
              type: "A",
              value: "203.0.113.10",
              purpose: "manual",
            },
          ],
        }),
      ]),
    );

    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.plan",
      parameters: {
        zoneName: "example.com",
        hostname: "app.example.com",
        target: "edge.appaloft.dev",
        recordType: "CNAME",
      },
    });

    expect(result.isOk()).toBe(true);
    const plan = result._unsafeUnwrap();
    expect(plan.riskLevel).toBe("medium");
    expect(plan.requiresExplicitAcceptance).toBe(true);
    expect(plan.providerPlan?.dnsRecords?.conflicts).toHaveLength(1);
    expect(plan.effects.map((effect) => effect.kind)).toContain("dns.record.conflict");
  });

  test("[APP-CONN-004][APP-CONN-014][APP-CONN-016] applies and verifies Cloudflare DNS records through a provider adapter", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: {
          configured: true,
        },
      }),
    );
    const adapter = new FakeDnsConnectorProviderAdapter({
      connectorKey: "cloudflare-dns",
      providerTitle: "Cloudflare DNS",
    });
    const acceptedPlanStore = new InMemoryAcceptedConnectionCapabilityPlanStore();
    const accepted = await new AcceptConnectorCapabilityPlanUseCase(acceptedPlanStore).execute(
      createExecutionContext({ entrypoint: "system" }),
      {
        planId: "dnsplan_test",
        connectorKey: "cloudflare-dns",
        capabilityKey: "dns.records.apply",
        riskLevel: "low",
        summary: "Apply one Cloudflare DNS record.",
        effects: [
          {
            kind: "dns.record.upsert",
            title: "CNAME app.example.com",
          },
        ],
        cleanup: {
          supported: true,
        },
      },
    );
    expect(accepted.isOk()).toBe(true);
    const service = new ApplyConnectorCapabilityUseCase(
      registry,
      new InMemoryConnectorProviderAdapterRegistry([adapter]),
      acceptedPlanStore,
    );

    const apply = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.apply",
      acceptedPlanId: accepted._unsafeUnwrap().acceptedPlanId,
      parameters: {
        zoneName: "example.com",
        hostname: "app.example.com",
        target: "edge.appaloft.dev",
        recordType: "CNAME",
      },
    });

    expect(apply.isOk()).toBe(true);
    const applied = apply._unsafeUnwrap();
    expect(applied.status).toBe("applied");
    expect(applied.effects.map((effect) => effect.kind)).toEqual(["dns.record.upsert"]);
    expect(applied.providerResult?.dnsRecords?.records).toEqual([
      {
        name: "app.example.com",
        type: "CNAME",
        value: "edge.appaloft.dev",
        purpose: "domain-routing",
      },
    ]);
    expect(JSON.stringify(applied)).not.toContain("token");

    const mismatchedAcceptance = await service.execute(
      createExecutionContext({ entrypoint: "system" }),
      {
        connectorKey: "cloudflare-dns",
        capabilityKey: "dns.records.cleanup",
        acceptedPlanId: accepted._unsafeUnwrap().acceptedPlanId,
        parameters: {
          zoneName: "example.com",
          hostname: "app.example.com",
          target: "edge.appaloft.dev",
          recordType: "CNAME",
        },
      },
    );

    expect(mismatchedAcceptance.isErr()).toBe(true);
    expect(mismatchedAcceptance._unsafeUnwrapErr().code).toBe("conflict");

    const verify = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.verify",
      parameters: {
        zoneName: "example.com",
        hostname: "app.example.com",
        target: "edge.appaloft.dev",
        recordType: "CNAME",
      },
    });

    expect(verify.isOk()).toBe(true);
    expect(verify._unsafeUnwrap().status).toBe("verified");
    expect(verify._unsafeUnwrap().providerResult?.dnsRecords?.missingRecords).toEqual([]);
  });

  test("[APP-CONN-005][APP-CONN-016] DNS apply fails closed on provider conflict", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: {
          configured: true,
        },
      }),
    );
    const adapter = new FakeDnsConnectorProviderAdapter({
      connectorKey: "cloudflare-dns",
      providerTitle: "Cloudflare DNS",
      existingRecords: [
        {
          name: "app.example.com",
          type: "A",
          value: "203.0.113.10",
          purpose: "manual",
        },
      ],
    });
    const service = new ApplyConnectorCapabilityUseCase(
      registry,
      new InMemoryConnectorProviderAdapterRegistry([adapter]),
    );

    const apply = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.apply",
      parameters: {
        zoneName: "example.com",
        hostname: "app.example.com",
        target: "edge.appaloft.dev",
        recordType: "CNAME",
      },
    });

    expect(apply.isErr()).toBe(true);
    expect(apply._unsafeUnwrapErr().code).toBe("conflict");

    const verify = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.verify",
      parameters: {
        zoneName: "example.com",
        hostname: "app.example.com",
        target: "edge.appaloft.dev",
        recordType: "CNAME",
      },
    });

    expect(verify.isOk()).toBe(true);
    expect(verify._unsafeUnwrap().status).toBe("conflict");
    expect(verify._unsafeUnwrap().providerResult?.dnsRecords?.missingRecords).toHaveLength(1);
  });

  test("[APP-CONN-016] fake DNS provider simulates retryable provider rate limits", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: {
          configured: true,
        },
      }),
    );
    const service = new PlanConnectorCapabilityQueryService(
      registry,
      new InMemoryConnectorProviderAdapterRegistry([
        new FakeDnsConnectorProviderAdapter({
          connectorKey: "cloudflare-dns",
          providerTitle: "Cloudflare DNS",
          failureMode: "rate-limit",
        }),
      ]),
    );

    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.plan",
      parameters: {
        zoneName: "example.com",
        hostname: "app.example.com",
        target: "edge.appaloft.dev",
        recordType: "CNAME",
      },
    });

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error).toMatchObject({
      code: "connector_provider_rate_limited",
      category: "retryable",
      retryable: true,
      details: {
        providerKind: "dns",
        operation: "read",
        failureMode: "rate-limit",
      },
    });
    expect(JSON.stringify(error)).not.toContain("token");
  });

  test("[APP-CONN-016] fake DNS provider simulates revoked provider credentials", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: {
          configured: true,
        },
      }),
    );
    const service = new ApplyConnectorCapabilityUseCase(
      registry,
      new InMemoryConnectorProviderAdapterRegistry([
        new FakeDnsConnectorProviderAdapter({
          connectorKey: "cloudflare-dns",
          providerTitle: "Cloudflare DNS",
          failureMode: "revoked-credential",
        }),
      ]),
    );

    const result = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.apply",
      parameters: {
        zoneName: "example.com",
        hostname: "app.example.com",
        target: "edge.appaloft.dev",
        recordType: "CNAME",
      },
    });

    expect(result.isErr()).toBe(true);
    const error = result._unsafeUnwrapErr();
    expect(error).toMatchObject({
      code: "connector_provider_credential_revoked",
      category: "provider",
      retryable: false,
      details: {
        providerKind: "dns",
        operation: "apply",
        failureMode: "revoked-credential",
      },
    });
    expect(JSON.stringify(error)).not.toContain("edge.appaloft.dev");
  });

  test("[APP-CONN-004][APP-CONN-016] DNS cleanup removes only Appaloft-managed records", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: {
          configured: true,
        },
      }),
    );
    const adapter = new FakeDnsConnectorProviderAdapter({
      connectorKey: "cloudflare-dns",
      providerTitle: "Cloudflare DNS",
      existingRecords: [
        {
          name: "manual.example.com",
          type: "CNAME",
          value: "edge.appaloft.dev",
          purpose: "manual",
        },
      ],
    });
    const service = new ApplyConnectorCapabilityUseCase(
      registry,
      new InMemoryConnectorProviderAdapterRegistry([adapter]),
    );

    await service.execute(createExecutionContext({ entrypoint: "system" }), {
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.apply",
      parameters: {
        zoneName: "example.com",
        hostname: "app.example.com",
        target: "edge.appaloft.dev",
        recordType: "CNAME",
      },
    });

    const cleanupManaged = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.cleanup",
      parameters: {
        zoneName: "example.com",
        hostname: "app.example.com",
        target: "edge.appaloft.dev",
        recordType: "CNAME",
      },
    });
    const cleanupManual = await service.execute(createExecutionContext({ entrypoint: "system" }), {
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.cleanup",
      parameters: {
        zoneName: "example.com",
        hostname: "manual.example.com",
        target: "edge.appaloft.dev",
        recordType: "CNAME",
      },
    });

    expect(cleanupManaged.isOk()).toBe(true);
    expect(cleanupManaged._unsafeUnwrap().status).toBe("cleaned-up");
    expect(cleanupManaged._unsafeUnwrap().effects.map((effect) => effect.kind)).toEqual([
      "dns.record.cleanup.deleted",
    ]);
    expect(cleanupManual.isOk()).toBe(true);
    expect(cleanupManual._unsafeUnwrap().status).toBe("skipped");
    expect(cleanupManual._unsafeUnwrap().effects.map((effect) => effect.kind)).toEqual([
      "dns.record.cleanup.skipped",
    ]);
  });

  test("[APP-CONN-014][APP-CONN-013] starts, lists, shows, and redacts connection instances", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: {
          configured: true,
        },
      }),
    );
    const store = new InMemoryConnectorConnectionStore();
    const clock = { now: () => "2026-01-01T00:00:00.000Z" };
    const idGenerator = { next: () => "conn_cloudflare_dns_test" };
    const start = new StartConnectionUseCase(registry, store, clock, idGenerator);
    const list = new ListConnectionsQueryService(store);
    const show = new ShowConnectionQueryService(store);

    const started = await start.execute({
      connectorKey: "cloudflare-dns",
      owner: { scope: "project", id: "project_123" },
      credentialGrant: {
        kind: "manual-secret-reference",
        storage: "secret-ref",
        secretRef: "secretref_cloudflare_dns",
        externalAccountId: "acct_example",
      },
    });

    expect(started.isOk()).toBe(true);
    const result = started._unsafeUnwrap();
    expect(result.connection.status).toBe("connected");
    expect(result.nextAction).toBe("ready");
    expect(result.connection.credentialGrant).toMatchObject({
      kind: "manual-secret-reference",
      storage: "secret-ref",
      redacted: true,
      secretRef: "secretref_cloudflare_dns",
    });
    expect(JSON.stringify(result)).not.toContain("cf_token");

    const listed = await list.execute(createExecutionContext({ entrypoint: "system" }), {
      owner: { scope: "project", id: "project_123" },
      category: "dns",
    });
    expect(listed.items.map((connection) => connection.id)).toEqual(["conn_cloudflare_dns_test"]);

    const shown = await show.execute(createExecutionContext({ entrypoint: "system" }), {
      connectionId: "conn_cloudflare_dns_test",
    });
    expect(shown.isOk()).toBe(true);
    expect(shown._unsafeUnwrap().connectorKey).toBe("cloudflare-dns");
  });

  test("[APP-CONN-020][APP-CONN-021] completes provider authorization through an attempt and redacted credential ref", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: {
          configured: true,
        },
      }),
    );
    const store = new InMemoryConnectorConnectionStore();
    const attemptStore = new InMemoryConnectorAuthorizationAttemptStore();
    const authAdapter: ConnectorAuthorizationAdapter = {
      connectorKey: "cloudflare-dns",
      async startAuthorization(_context, input) {
        return ok({
          authorizationUrl: `https://dash.cloudflare.test/oauth/authorize?state=${input.attempt.state}`,
          nextAction: "authorize-in-browser",
        });
      },
      async completeAuthorization(_context, input) {
        expect(input.callbackParameters).toMatchObject({ code: "cf_oauth_code" });
        return ok({
          credentialGrant: {
            kind: "persistent-provider-credential",
            storage: "secret-ref",
            secretRef: "secretref_org_alpha_cloudflare_dns",
          },
          externalAccountId: "cloudflare_account_alpha",
          expiresAt: "2026-01-01T01:00:00.000Z",
          providerResources: [
            {
              kind: "dns-zone",
              id: "zone_appalofttest",
              name: "appalofttest.xyz",
              providerAccountId: "cloudflare_account_alpha",
            },
          ],
        });
      },
    };
    const authRegistry = new InMemoryConnectorAuthorizationAdapterRegistry([authAdapter]);
    const clock = { now: () => "2026-01-01T00:00:00.000Z" };
    const ids = ["conn_cloudflare_dns_oauth", "conn_auth_cloudflare_dns", "state_cloudflare_dns"];
    const idGenerator = { next: () => ids.shift() ?? "id_extra" };
    const context = createExecutionContext({
      entrypoint: "http",
      tenant: {
        tenantId: "tenant_alpha",
        organizationId: "org_alpha",
        source: "product-session",
      },
    });
    const start = new StartConnectionUseCase(
      registry,
      store,
      clock,
      idGenerator,
    ).withAuthorizationLifecycle({
      authorizationAdapterRegistry: authRegistry,
      authorizationAttemptStore: attemptStore,
    });
    const callback = new CompleteConnectionCallbackUseCase(store, {
      now: () => "2026-01-01T00:01:00.000Z",
    }).withAuthorizationLifecycle({
      authorizationAdapterRegistry: authRegistry,
      authorizationAttemptStore: attemptStore,
    });

    const started = await start.execute(context, {
      connectorKey: "cloudflare-dns",
      returnUrl: "/resources/res_123/domains",
      requestedCapabilityKey: "dns.records.apply",
      originalHostname: "pocketbase.appalofttest.xyz",
    });

    expect(started.isOk()).toBe(true);
    const startResult = started._unsafeUnwrap();
    expect(startResult.nextAction).toBe("authorize-in-browser");
    expect(startResult.authorizationAttemptId).toBe("conn_auth_cloudflare_dns");
    expect(startResult.authorizationUrl).toContain("state_cloudflare_dns");
    expect(startResult.connection.status).toBe("pending");
    expect(attemptStore.findById("conn_auth_cloudflare_dns")).toMatchObject({
      status: "pending",
      originalHostname: "pocketbase.appalofttest.xyz",
      owner: {
        scope: "organization",
        id: "org_alpha",
        tenantId: "tenant_alpha",
      },
    });
    expect(attemptStore.findByState("state_cloudflare_dns")).toMatchObject({
      id: "conn_auth_cloudflare_dns",
      connectionId: "conn_cloudflare_dns_oauth",
    });

    const completed = await callback.execute(context, {
      connectionId: "conn_cloudflare_dns_oauth",
      authorizationAttemptId: "conn_auth_cloudflare_dns",
      callbackParameters: { code: "cf_oauth_code", state: "state_cloudflare_dns" },
      status: "success",
    });

    expect(completed.isOk()).toBe(true);
    expect(completed._unsafeUnwrap().connection).toMatchObject({
      status: "connected",
      credentialGrant: {
        kind: "persistent-provider-credential",
        storage: "secret-ref",
        redacted: true,
        secretRef: "secretref_org_alpha_cloudflare_dns",
        externalAccountId: "cloudflare_account_alpha",
      },
      providerResources: [
        {
          kind: "dns-zone",
          id: "zone_appalofttest",
          name: "appalofttest.xyz",
          providerAccountId: "cloudflare_account_alpha",
        },
      ],
    });
    expect(JSON.stringify(completed._unsafeUnwrap())).not.toContain("cf_oauth_code");
    expect(attemptStore.findById("conn_auth_cloudflare_dns")).toMatchObject({
      status: "completed",
      completedAt: "2026-01-01T00:01:00.000Z",
    });

    const replay = await callback.execute(context, {
      connectionId: "conn_cloudflare_dns_oauth",
      authorizationAttemptId: "conn_auth_cloudflare_dns",
      callbackParameters: { code: "cf_oauth_code", state: "state_cloudflare_dns" },
      status: "success",
    });
    expect(replay.isErr()).toBe(true);
    expect(replay._unsafeUnwrapErr().code).toBe("conflict");
  });

  test("[APP-CONN-020] fails closed for expired and canceled authorization attempts", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: {
          configured: true,
        },
      }),
    );
    const store = new InMemoryConnectorConnectionStore();
    const attemptStore = new InMemoryConnectorAuthorizationAttemptStore();
    const authAdapter: ConnectorAuthorizationAdapter = {
      connectorKey: "cloudflare-dns",
      async startAuthorization(_context, input) {
        return ok({
          authorizationUrl: `https://dash.cloudflare.test/oauth/authorize?state=${input.attempt.state}`,
          nextAction: "authorize-in-browser",
        });
      },
      async completeAuthorization() {
        throw new Error("Expired or canceled attempts must not exchange provider credentials.");
      },
    };
    const authRegistry = new InMemoryConnectorAuthorizationAdapterRegistry([authAdapter]);
    const idGenerator = {
      next: (() => {
        const ids = [
          "conn_expired_dns",
          "conn_auth_expired_dns",
          "state_expired_dns",
          "conn_cancel_dns",
          "conn_auth_cancel_dns",
          "state_cancel_dns",
        ];
        return () => ids.shift() ?? "id_extra";
      })(),
    };
    const context = createExecutionContext({
      entrypoint: "http",
      tenant: {
        tenantId: "tenant_alpha",
        organizationId: "org_alpha",
        source: "product-session",
      },
    });
    const start = new StartConnectionUseCase(
      registry,
      store,
      { now: () => "2026-01-01T00:00:00.000Z" },
      idGenerator,
    ).withAuthorizationLifecycle({
      authorizationAdapterRegistry: authRegistry,
      authorizationAttemptStore: attemptStore,
    });

    const expiredStart = await start.execute(context, {
      connectorKey: "cloudflare-dns",
      originalHostname: "expired.appalofttest.xyz",
    });
    expect(expiredStart.isOk()).toBe(true);
    const expiredCallback = new CompleteConnectionCallbackUseCase(store, {
      now: () => "2026-01-01T00:16:00.000Z",
    }).withAuthorizationLifecycle({
      authorizationAdapterRegistry: authRegistry,
      authorizationAttemptStore: attemptStore,
    });
    const expired = await expiredCallback.execute(context, {
      connectionId: "conn_expired_dns",
      authorizationAttemptId: "conn_auth_expired_dns",
      callbackParameters: { code: "late_code", state: "state_expired_dns" },
      status: "success",
    });

    expect(expired.isErr()).toBe(true);
    expect(expired._unsafeUnwrapErr().code).toBe("conflict");
    expect(attemptStore.findById("conn_auth_expired_dns")).toMatchObject({
      status: "expired",
      diagnostics: [
        {
          code: "connection.authorization.expired",
          severity: "warning",
        },
      ],
    });
    expect(store.findById("conn_expired_dns")?.status).toBe("pending");

    const cancelStart = await start.execute(context, {
      connectorKey: "cloudflare-dns",
      originalHostname: "cancel.appalofttest.xyz",
    });
    expect(cancelStart.isOk()).toBe(true);
    const canceled = await new CompleteConnectionCallbackUseCase(store, {
      now: () => "2026-01-01T00:02:00.000Z",
    })
      .withAuthorizationLifecycle({
        authorizationAdapterRegistry: authRegistry,
        authorizationAttemptStore: attemptStore,
      })
      .execute(context, {
        connectionId: "conn_cancel_dns",
        authorizationAttemptId: "conn_auth_cancel_dns",
        status: "cancel",
      });

    expect(canceled.isOk()).toBe(true);
    expect(canceled._unsafeUnwrap().connection).toMatchObject({
      status: "failed",
      diagnostics: [
        {
          code: "connection.callback.cancel",
          severity: "warning",
          message: "Connection authorization was cancelled.",
        },
      ],
    });
    expect(attemptStore.findById("conn_auth_cancel_dns")).toMatchObject({
      status: "failed",
      diagnostics: [
        {
          code: "connection.callback.cancel",
          severity: "warning",
        },
      ],
    });
  });

  test("[APP-CONN-014] scopes connection lifecycle reads and mutations to the execution tenant", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: {
          configured: true,
        },
      }),
    );
    const store = new InMemoryConnectorConnectionStore();
    const clock = { now: () => "2026-01-01T00:00:00.000Z" };
    const tenantAlphaContext = createExecutionContext({
      entrypoint: "http",
      tenant: {
        tenantId: "tenant_alpha",
        organizationId: "org_alpha",
        source: "product-session",
      },
    });
    const tenantBetaContext = createExecutionContext({
      entrypoint: "http",
      tenant: {
        tenantId: "tenant_beta",
        organizationId: "org_beta",
        source: "product-session",
      },
    });
    const startAlpha = new StartConnectionUseCase(registry, store, clock, {
      next: () => "conn_alpha_dns",
    });
    const startBeta = new StartConnectionUseCase(registry, store, clock, {
      next: () => "conn_beta_dns",
    });
    const list = new ListConnectionsQueryService(store);
    const show = new ShowConnectionQueryService(store);
    const callback = new CompleteConnectionCallbackUseCase(store, {
      now: () => "2026-01-01T00:01:00.000Z",
    });
    const revoke = new RevokeConnectionUseCase(store, {
      now: () => "2026-01-01T00:02:00.000Z",
    });

    const alpha = await startAlpha.execute(tenantAlphaContext, {
      connectorKey: "cloudflare-dns",
      credentialGrant: {
        kind: "manual-secret-reference",
        storage: "secret-ref",
        secretRef: "secretref_alpha_cloudflare",
      },
    });
    const beta = await startBeta.execute(tenantBetaContext, {
      connectorKey: "cloudflare-dns",
      credentialGrant: {
        kind: "manual-secret-reference",
        storage: "secret-ref",
        secretRef: "secretref_beta_cloudflare",
      },
    });

    expect(alpha.isOk()).toBe(true);
    expect(beta.isOk()).toBe(true);
    expect(alpha._unsafeUnwrap().connection.owner).toEqual({
      scope: "organization",
      id: "org_alpha",
      tenantId: "tenant_alpha",
    });
    expect(beta._unsafeUnwrap().connection.owner).toEqual({
      scope: "organization",
      id: "org_beta",
      tenantId: "tenant_beta",
    });

    const crossTenantStart = await startAlpha.execute(tenantAlphaContext, {
      connectorKey: "cloudflare-dns",
      owner: {
        scope: "organization",
        id: "org_beta",
        tenantId: "tenant_beta",
      },
      credentialGrant: {
        kind: "manual-secret-reference",
        storage: "secret-ref",
        secretRef: "secretref_cross_tenant_cloudflare",
      },
    });
    expect(crossTenantStart.isErr()).toBe(true);
    expect(crossTenantStart._unsafeUnwrapErr().code).toBe("not_found");

    const alphaList = await list.execute(tenantAlphaContext, { category: "dns" });
    const betaList = await list.execute(tenantBetaContext, { category: "dns" });
    expect(alphaList.items.map((connection) => connection.id)).toEqual(["conn_alpha_dns"]);
    expect(betaList.items.map((connection) => connection.id)).toEqual(["conn_beta_dns"]);

    const crossTenantShow = await show.execute(tenantBetaContext, {
      connectionId: "conn_alpha_dns",
    });
    expect(crossTenantShow.isErr()).toBe(true);
    expect(crossTenantShow._unsafeUnwrapErr().code).toBe("not_found");

    const crossTenantCallback = await callback.execute(tenantBetaContext, {
      connectionId: "conn_alpha_dns",
      status: "error",
      errorCode: "provider_denied",
    });
    expect(crossTenantCallback.isErr()).toBe(true);
    expect(crossTenantCallback._unsafeUnwrapErr().code).toBe("not_found");

    const crossTenantRevoke = await revoke.execute(tenantBetaContext, {
      connectionId: "conn_alpha_dns",
    });
    expect(crossTenantRevoke.isErr()).toBe(true);
    expect(crossTenantRevoke._unsafeUnwrapErr().code).toBe("not_found");

    const alphaShow = await show.execute(tenantAlphaContext, {
      connectionId: "conn_alpha_dns",
    });
    expect(alphaShow.isOk()).toBe(true);
    expect(alphaShow._unsafeUnwrap().status).toBe("connected");
  });

  test("[APP-CONN-014] revokes connection instances without deleting safe readback", async () => {
    const registry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions({
        cloudflareDns: {
          configured: true,
        },
      }),
    );
    const store = new InMemoryConnectorConnectionStore();
    const start = new StartConnectionUseCase(
      registry,
      store,
      { now: () => "2026-01-01T00:00:00.000Z" },
      { next: () => "conn_revoke_test" },
    );
    const revoke = new RevokeConnectionUseCase(store, {
      now: () => "2026-01-01T00:01:00.000Z",
    });

    const started = await start.execute({
      connectorKey: "cloudflare-dns",
      credentialGrant: {
        kind: "manual-secret-reference",
        storage: "secret-ref",
        secretRef: "secretref_cloudflare_dns",
      },
    });
    expect(started.isOk()).toBe(true);

    const revoked = await revoke.execute({ connectionId: "conn_revoke_test" });
    expect(revoked.isOk()).toBe(true);
    expect(revoked._unsafeUnwrap().connection.status).toBe("revoked");
    expect(revoked._unsafeUnwrap().connection.revokedAt).toBe("2026-01-01T00:01:00.000Z");
    expect(revoked._unsafeUnwrap().connection.credentialGrant.redacted).toBe(true);
  });
});
