import { describe, expect, test } from "bun:test";

import {
  AcceptedConnectionCapabilityPlan,
  Connection,
  ConnectionStatusValue,
  ConnectorAvailabilityValue,
  ConnectorDefinition,
  CreatedAt,
  OccurredAt,
} from "../src";

const createdAt = CreatedAt.rehydrate("2026-07-20T00:00:00.000Z");
const connectedAt = OccurredAt.rehydrate("2026-07-20T00:01:00.000Z");
const failedAt = OccurredAt.rehydrate("2026-07-20T00:02:00.000Z");
const revokedAt = OccurredAt.rehydrate("2026-07-20T00:03:00.000Z");

function dnsConnector() {
  return ConnectorDefinition.create({
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
        title: "Apply DNS records",
        implemented: false,
      },
    ],
    grantKinds: [
      {
        kind: "persistent-provider-credential",
        title: "Provider credential",
        storesLongLivedSecret: true,
      },
    ],
    availability: ConnectorAvailabilityValue.available().toJSON(),
    visibility: "catalog",
  })._unsafeUnwrap();
}

describe("Connection", () => {
  test("[CORE-CONN-001] starts a pending connection with implemented capabilities only", () => {
    const connection = Connection.start({
      id: "conn_demo",
      connector: dnsConnector().toJSON(),
      owner: { scope: "organization", id: "org_demo" },
      createdAt,
      credentialGrant: {
        kind: "persistent-provider-credential",
        storage: "secret-ref",
        secretRef: "secret://connections/conn_demo",
      },
    })._unsafeUnwrap();

    expect(connection.toJSON()).toMatchObject({
      id: "conn_demo",
      connectorKey: "cloudflare-dns",
      category: "dns",
      status: "pending",
      capabilities: ["dns.records.plan"],
      credentialGrant: expect.objectContaining({
        redacted: true,
        secretRef: "secret://connections/conn_demo",
      }),
    });
    expect(connection.pullDomainEvents()).toEqual([
      expect.objectContaining({
        type: "connection.started",
        payload: expect.objectContaining({
          connectorKey: "cloudflare-dns",
          category: "dns",
          ownerScope: "organization",
        }),
      }),
    ]);
  });

  test("[CORE-CONN-002] establishes, fails, and revokes with fail-closed status rules", () => {
    const connection = Connection.start({
      id: "conn_demo",
      connector: dnsConnector().toJSON(),
      owner: { scope: "organization", id: "org_demo" },
      createdAt,
    })._unsafeUnwrap();
    connection.pullDomainEvents();

    expect(
      connection
        .connect(connectedAt, {
          storage: "secret-ref",
          secretRef: "secret://connections/conn_demo",
          externalAccountId: "cf_account",
        })
        .isOk(),
    ).toBe(true);
    expect(connection.toJSON().status).toBe("connected");
    expect(connection.pullDomainEvents()).toEqual([
      expect.objectContaining({ type: "connection.established" }),
    ]);

    connection.fail(failedAt, {
      code: "provider_unreachable",
      severity: "error",
      message: "upstream timeout",
    });
    expect(connection.toJSON().status).toBe("failed");
    expect(connection.toJSON().diagnostics).toEqual([
      expect.objectContaining({ code: "provider_unreachable" }),
    ]);

    connection.revoke(revokedAt);
    expect(connection.toJSON().status).toBe("revoked");
    expect(connection.toJSON().revokedAt).toBe(revokedAt.value);

    const reestablish = ConnectionStatusValue.rehydrate("revoked").establish();
    expect(reestablish.isErr()).toBe(true);
    expect(reestablish._unsafeUnwrapErr().message).toBe(
      "Revoked connections cannot be established again",
    );
  });

  test("[CORE-CONN-003] rejects secret-like credential grant material", () => {
    const started = Connection.start({
      id: "conn_bad",
      connector: dnsConnector().toJSON(),
      owner: { scope: "project", id: "prj_demo" },
      createdAt,
      credentialGrant: {
        kind: "manual-secret-reference",
        storage: "secret-ref",
        secretRef: "token=ghp_abcdefghijklmnopqrstuvwxyz012345",
      },
    });

    expect(started.isErr()).toBe(true);
  });
});

describe("AcceptedConnectionCapabilityPlan", () => {
  test("[CORE-CONN-PLAN-001] accepts a plan and matches owner/capability", () => {
    const accepted = AcceptedConnectionCapabilityPlan.accept({
      planId: "plan_dns_apply",
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.apply",
      ownerRef: { scope: "organization", id: "org_demo" },
      acceptedBy: "usr_admin",
      acceptedAt: connectedAt,
      riskLevel: "medium",
      summary: "Allow Cloudflare DNS apply",
      effects: [
        {
          kind: "dns.write",
          title: "Write DNS records",
          description: "Create and update DNS records in the selected zone",
        },
      ],
      cleanup: {
        supported: true,
        description: "Revoke connection grant",
      },
    })._unsafeUnwrap();

    expect(accepted.toJSON()).toMatchObject({
      planId: "plan_dns_apply",
      connectorKey: "cloudflare-dns",
      capabilityKey: "dns.records.apply",
      riskLevel: "medium",
      acceptedBy: "usr_admin",
    });
    expect(accepted.toJSON().acceptedPlanId).toMatch(/^accepted_/);
    expect(
      accepted.matches({
        connectorKey: "cloudflare-dns",
        capabilityKey: "dns.records.apply",
        ownerRef: { scope: "organization", id: "org_demo" },
      }),
    ).toBe(true);
    expect(
      accepted.matches({
        connectorKey: "cloudflare-dns",
        capabilityKey: "dns.records.apply",
        ownerRef: { scope: "project", id: "prj_demo" },
      }),
    ).toBe(false);
  });

  test("[CORE-CONN-PLAN-002] rejects blank fields, secrets, empty effects, and bad risk", () => {
    expect(
      AcceptedConnectionCapabilityPlan.accept({
        planId: " ",
        connectorKey: "cloudflare-dns",
        capabilityKey: "dns.records.apply",
        acceptedBy: "usr_admin",
        acceptedAt: connectedAt,
        riskLevel: "low",
        summary: "x",
        effects: [{ kind: "dns.write", title: "Write" }],
      }).isErr(),
    ).toBe(true);

    expect(
      AcceptedConnectionCapabilityPlan.accept({
        planId: "plan_1",
        connectorKey: "cloudflare-dns",
        capabilityKey: "dns.records.apply",
        acceptedBy: "usr_admin",
        acceptedAt: connectedAt,
        riskLevel: "low",
        summary: "token=sk-abcdefghijklmnopqrstuvwxyz",
        effects: [{ kind: "dns.write", title: "Write" }],
      }).isErr(),
    ).toBe(true);

    expect(
      AcceptedConnectionCapabilityPlan.accept({
        planId: "plan_1",
        connectorKey: "cloudflare-dns",
        capabilityKey: "dns.records.apply",
        acceptedBy: "usr_admin",
        acceptedAt: connectedAt,
        // @ts-expect-error intentional invalid risk
        riskLevel: "critical",
        summary: "Allow apply",
        effects: [{ kind: "dns.write", title: "Write" }],
      }).isErr(),
    ).toBe(true);

    expect(
      AcceptedConnectionCapabilityPlan.accept({
        planId: "plan_1",
        connectorKey: "cloudflare-dns",
        capabilityKey: "dns.records.apply",
        acceptedBy: "usr_admin",
        acceptedAt: connectedAt,
        riskLevel: "high",
        summary: "Allow apply",
        effects: [],
      }).isErr(),
    ).toBe(true);
  });
});
