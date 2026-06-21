import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  createRoutingDomainTlsFixture,
  type DomainBindingSummary,
  expectDomainBindingSummary,
  findDomainBinding,
  type RoutingDomainTlsFixture,
  waitForCliDomainBindingStatus,
  waitForCliDurableRoute,
} from "./support/routing-domain-tls-fixture";
import {
  createShellHttpAdminSession,
  expectCliSuccess,
  parseJson,
  runShellCli,
  type ShellHttpAdminSession,
  startShellHttpServer,
} from "./support/shell-e2e-fixture";

type DomainBindingListResponse = {
  items: DomainBindingSummary[];
};

describe("domain-bindings command e2e", () => {
  let fixture: RoutingDomainTlsFixture;
  let httpAdminSession: ShellHttpAdminSession | null = null;

  async function getHttpAdminSession(baseUrl: string): Promise<ShellHttpAdminSession> {
    httpAdminSession ??= await createShellHttpAdminSession(baseUrl);

    return httpAdminSession;
  }

  beforeAll(() => {
    fixture = createRoutingDomainTlsFixture({
      appVersion: "0.1.0-domain-bindings-command-e2e",
      prefix: "appaloft-domain-bindings-command-",
    });
  }, 60000);

  afterAll(() => {
    fixture?.cleanup();
  }, 60000);

  test("[ROUTE-TLS-ENTRY-010][ROUTE-TLS-WORKFLOW-003] CLI observes DNS pending before ownership confirmation", () => {
    const suffix = crypto.randomUUID().slice(0, 6);
    const context = fixture.deployWorkspaceResource({
      appPort: 4600 + Math.floor(Math.random() * 100),
      suffix,
    });
    const domainName = `${suffix}.example.com`;

    const created = runShellCli(
      [
        "domain-binding",
        "create",
        domainName,
        "--project-id",
        context.projectId,
        "--environment-id",
        context.environmentId,
        "--resource-id",
        context.resourceId,
        "--server-id",
        context.serverId,
        "--destination-id",
        context.destinationId,
        "--tls-mode",
        "auto",
      ],
      fixture.cliOptions,
    );
    expectCliSuccess(created, "create domain binding through CLI");
    const domainBindingId = parseJson<{ id: string }>(created.stdout).id;

    const pendingListed = runShellCli(
      ["domain-binding", "list", "--resource", context.resourceId],
      fixture.cliOptions,
    );
    expectCliSuccess(pendingListed, "list pending domain binding through CLI");
    const pendingBinding = findDomainBinding({
      domainBindingId,
      items: parseJson<DomainBindingListResponse>(pendingListed.stdout).items,
    });
    expectDomainBindingSummary({
      binding: pendingBinding,
      domainName,
      resourceId: context.resourceId,
      status: "pending_verification",
    });
    expect(pendingBinding.dnsObservation).toEqual(
      expect.objectContaining({
        expectedTargets: ["127.0.0.1"],
        observedTargets: [],
        status: "pending",
      }),
    );

    const confirmed = runShellCli(
      [
        "domain-binding",
        "confirm-ownership",
        domainBindingId,
        "--verification-mode",
        "manual",
        "--confirmed-by",
        "cli-e2e",
        "--evidence",
        "manual DNS ownership confirmed",
      ],
      fixture.cliOptions,
    );
    expectCliSuccess(confirmed, "confirm domain ownership through CLI");
    expect(parseJson<{ id: string; verificationAttemptId: string }>(confirmed.stdout)).toEqual({
      id: domainBindingId,
      verificationAttemptId: expect.stringMatching(/^dva_/),
    });

    const listed = runShellCli(
      ["domain-binding", "list", "--resource", context.resourceId],
      fixture.cliOptions,
    );
    expectCliSuccess(listed, "list domain bindings through CLI");
    expectDomainBindingSummary({
      binding: findDomainBinding({
        domainBindingId,
        items: parseJson<DomainBindingListResponse>(listed.stdout).items,
      }),
      domainName,
      resourceId: context.resourceId,
      status: "bound",
    });
  }, 60000);

  test("[ROUTE-TLS-ENTRY-011] HTTP confirms ownership and HTTP list observes the bound binding", async () => {
    const suffix = crypto.randomUUID().slice(0, 6);
    const context = fixture.deployWorkspaceResource({
      appPort: 4700 + Math.floor(Math.random() * 100),
      suffix,
    });
    const domainName = `${suffix}.example.net`;
    const httpServer = await startShellHttpServer(fixture.cliOptions);

    try {
      const auth = await getHttpAdminSession(httpServer.baseUrl);
      const created = await fetch(`${httpServer.baseUrl}/api/domain-bindings`, {
        body: JSON.stringify({
          destinationId: context.destinationId,
          domainName,
          environmentId: context.environmentId,
          pathPrefix: "/",
          projectId: context.projectId,
          proxyKind: "traefik",
          resourceId: context.resourceId,
          serverId: context.serverId,
          tlsMode: "auto",
        }),
        headers: {
          ...auth.headers,
          "content-type": "application/json",
        },
        method: "POST",
      });
      expect(created.status).toBe(201);
      const domainBindingId = ((await created.json()) as { id: string }).id;

      const confirmed = await fetch(
        `${httpServer.baseUrl}/api/domain-bindings/${domainBindingId}/ownership-confirmations`,
        {
          body: JSON.stringify({
            confirmedBy: "http-e2e",
            domainBindingId,
            evidence: "manual DNS ownership confirmed",
            verificationMode: "manual",
          }),
          headers: {
            ...auth.headers,
            "content-type": "application/json",
          },
          method: "POST",
        },
      );
      expect(confirmed.status).toBe(200);
      expect((await confirmed.json()) as { id: string; verificationAttemptId: string }).toEqual({
        id: domainBindingId,
        verificationAttemptId: expect.stringMatching(/^dva_/),
      });

      const listed = await fetch(
        `${httpServer.baseUrl}/api/domain-bindings?resourceId=${context.resourceId}`,
        { headers: auth.headers },
      );
      expect(listed.ok).toBe(true);
      expectDomainBindingSummary({
        binding: findDomainBinding({
          domainBindingId,
          items: ((await listed.json()) as DomainBindingListResponse).items,
        }),
        domainName,
        resourceId: context.resourceId,
        status: "bound",
      });
    } finally {
      await httpServer.stop();
    }
  }, 60000);

  test("[ROUTE-TLS-ENTRY-024] CLI checks and deletes a domain binding while preserving default access", async () => {
    const suffix = crypto.randomUUID().slice(0, 6);
    const context = fixture.createResource({
      internalPort: 4725 + Math.floor(Math.random() * 100),
      suffix,
    });
    const domainName = `${suffix}.delete.example.net`;
    const httpServer = await startShellHttpServer(fixture.cliOptions);
    let domainBindingId = "";

    try {
      const auth = await getHttpAdminSession(httpServer.baseUrl);
      const created = await fetch(`${httpServer.baseUrl}/api/domain-bindings`, {
        body: JSON.stringify({
          domainName,
          environmentId: context.environmentId,
          pathPrefix: "/",
          projectId: context.projectId,
          proxyKind: "traefik",
          resourceId: context.resourceId,
          tlsMode: "auto",
        }),
        headers: {
          ...auth.headers,
          "content-type": "application/json",
        },
        method: "POST",
      });
      expect(created.status).toBe(201);
      domainBindingId = ((await created.json()) as { id: string }).id;
    } finally {
      await httpServer.stop();
    }

    const deleteCheck = runShellCli(
      ["domain-binding", "delete-check", domainBindingId],
      fixture.cliOptions,
    );
    expectCliSuccess(deleteCheck, "check domain binding delete safety through CLI");
    expect(
      parseJson<{ safeToDelete: boolean; preservesGeneratedAccess: boolean }>(deleteCheck.stdout),
    ).toMatchObject({
      safeToDelete: true,
      preservesGeneratedAccess: true,
    });

    const deleted = runShellCli(
      ["domain-binding", "delete", domainBindingId, "--confirm", domainBindingId],
      fixture.cliOptions,
    );
    expectCliSuccess(deleted, "delete domain binding through CLI");
    expect(parseJson<{ id: string }>(deleted.stdout)).toEqual({ id: domainBindingId });

    const listed = runShellCli(
      ["domain-binding", "list", "--resource", context.resourceId],
      fixture.cliOptions,
    );
    expectCliSuccess(listed, "list domain bindings after CLI delete");
    expect(
      findDomainBinding({
        domainBindingId,
        items: parseJson<DomainBindingListResponse>(listed.stdout).items,
      }),
    ).toMatchObject({
      id: domainBindingId,
      status: "deleted",
    });
  }, 60000);

  test("[ROUTE-TLS-ENTRY-023][ROUTE-TLS-ENTRY-024] HTTP checks and deletes a domain binding", async () => {
    const suffix = crypto.randomUUID().slice(0, 6);
    const context = fixture.createResource({
      internalPort: 4775 + Math.floor(Math.random() * 100),
      suffix,
    });
    const domainName = `${suffix}.delete-http.example.net`;
    const httpServer = await startShellHttpServer(fixture.cliOptions);

    try {
      const auth = await getHttpAdminSession(httpServer.baseUrl);
      const created = await fetch(`${httpServer.baseUrl}/api/domain-bindings`, {
        body: JSON.stringify({
          domainName,
          environmentId: context.environmentId,
          pathPrefix: "/",
          projectId: context.projectId,
          proxyKind: "traefik",
          resourceId: context.resourceId,
          tlsMode: "auto",
        }),
        headers: {
          ...auth.headers,
          "content-type": "application/json",
        },
        method: "POST",
      });
      expect(created.status).toBe(201);
      const domainBindingId = ((await created.json()) as { id: string }).id;

      const deleteCheck = await fetch(
        `${httpServer.baseUrl}/api/domain-bindings/${domainBindingId}/delete-check`,
        { headers: auth.headers },
      );
      expect(deleteCheck.status).toBe(200);
      expect((await deleteCheck.json()) as { safeToDelete: boolean }).toMatchObject({
        domainBindingId,
        safeToDelete: true,
        preservesGeneratedAccess: true,
      });

      const deleted = await fetch(`${httpServer.baseUrl}/api/domain-bindings/${domainBindingId}`, {
        body: JSON.stringify({
          domainBindingId,
          confirmation: { domainBindingId },
        }),
        headers: {
          ...auth.headers,
          "content-type": "application/json",
        },
        method: "DELETE",
      });
      expect(deleted.status).toBe(200);
      expect((await deleted.json()) as { id: string }).toEqual({ id: domainBindingId });

      const listed = await fetch(
        `${httpServer.baseUrl}/api/domain-bindings?resourceId=${context.resourceId}`,
        { headers: auth.headers },
      );
      expect(listed.ok).toBe(true);
      expect(
        findDomainBinding({
          domainBindingId,
          items: ((await listed.json()) as DomainBindingListResponse).items,
        }),
      ).toMatchObject({
        id: domainBindingId,
        status: "deleted",
      });
    } finally {
      await httpServer.stop();
    }
  }, 60000);

  test("[ROUTE-TLS-ENTRY-016] CLI creates canonical redirect binding", () => {
    const suffix = crypto.randomUUID().slice(0, 6);
    const context = fixture.deployWorkspaceResource({
      appPort: 4750 + Math.floor(Math.random() * 100),
      suffix,
    });
    const canonicalDomain = `${suffix}.example.dev`;
    const redirectDomain = `www-${suffix}.example.dev`;

    const canonicalCreated = runShellCli(
      [
        "domain-binding",
        "create",
        canonicalDomain,
        "--project-id",
        context.projectId,
        "--environment-id",
        context.environmentId,
        "--resource-id",
        context.resourceId,
        "--server-id",
        context.serverId,
        "--destination-id",
        context.destinationId,
        "--tls-mode",
        "auto",
      ],
      fixture.cliOptions,
    );
    expectCliSuccess(canonicalCreated, "create canonical domain binding through CLI");

    const redirectCreated = runShellCli(
      [
        "domain-binding",
        "create",
        redirectDomain,
        "--project-id",
        context.projectId,
        "--environment-id",
        context.environmentId,
        "--resource-id",
        context.resourceId,
        "--server-id",
        context.serverId,
        "--destination-id",
        context.destinationId,
        "--tls-mode",
        "auto",
        "--redirect-to",
        canonicalDomain,
        "--redirect-status",
        "308",
      ],
      fixture.cliOptions,
    );
    expectCliSuccess(redirectCreated, "create redirect domain binding through CLI");
    const redirectBindingId = parseJson<{ id: string }>(redirectCreated.stdout).id;

    const listed = runShellCli(
      ["domain-binding", "list", "--resource", context.resourceId],
      fixture.cliOptions,
    );
    expectCliSuccess(listed, "list redirect domain bindings through CLI");
    expect(
      findDomainBinding({
        domainBindingId: redirectBindingId,
        items: parseJson<DomainBindingListResponse>(listed.stdout).items,
      }),
    ).toMatchObject({
      domainName: redirectDomain,
      redirectTo: canonicalDomain,
      redirectStatus: 308,
      resourceId: context.resourceId,
      status: "pending_verification",
    });
  }, 60000);

  test("[ROUTE-TLS-ENTRY-012] CLI observes a TLS-disabled ready durable route through resource list", async () => {
    const suffix = crypto.randomUUID().slice(0, 6);
    const context = fixture.deployWorkspaceResource({
      appPort: 4800 + Math.floor(Math.random() * 100),
      suffix,
    });
    const domainName = `${suffix}.example.org`;
    const expectedUrl = `http://${domainName}`;

    const created = runShellCli(
      [
        "domain-binding",
        "create",
        domainName,
        "--project-id",
        context.projectId,
        "--environment-id",
        context.environmentId,
        "--resource-id",
        context.resourceId,
        "--server-id",
        context.serverId,
        "--destination-id",
        context.destinationId,
        "--tls-mode",
        "disabled",
      ],
      fixture.cliOptions,
    );
    expectCliSuccess(created, "create TLS-disabled domain binding through CLI");
    const domainBindingId = parseJson<{ id: string }>(created.stdout).id;

    const confirmed = runShellCli(
      ["domain-binding", "confirm-ownership", domainBindingId, "--verification-mode", "manual"],
      fixture.cliOptions,
    );
    expectCliSuccess(confirmed, "confirm TLS-disabled domain ownership through CLI");

    expectDomainBindingSummary({
      binding: await waitForCliDomainBindingStatus({
        domainBindingId,
        options: fixture.cliOptions,
        resourceId: context.resourceId,
        status: "ready",
      }),
      domainName,
      resourceId: context.resourceId,
      status: "ready",
    });

    const resource = await waitForCliDurableRoute({
      expectedUrl,
      options: fixture.cliOptions,
      resourceId: context.resourceId,
    });

    expect(resource.accessSummary?.latestDurableDomainRoute).toEqual(
      expect.objectContaining({
        hostname: domainName,
        scheme: "http",
        url: expectedUrl,
      }),
    );
  }, 90000);
});
