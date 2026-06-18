import "reflect-metadata";

import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CompleteConnectionCallbackUseCase,
  type ConnectorAuthorizationAdapter,
  createDefaultConnectorDefinitions,
  createExecutionContext,
  InMemoryConnectorAuthorizationAdapterRegistry,
  InMemoryConnectorRegistry,
  StartConnectionUseCase,
} from "@appaloft/application";
import { ok } from "@appaloft/core";
import {
  createDatabase,
  createMigrator,
  PgConnectorAuthorizationAttemptStore,
  PgConnectorConnectionStore,
} from "../src";

describe("connector lifecycle store pglite integration", () => {
  test("[APP-CONN-022] persists OAuth connection attempts across store instances", async () => {
    const workspaceDir = mkdtempSync(join(tmpdir(), "appaloft-connector-lifecycle-"));
    const database = await createDatabase({
      driver: "pglite",
      pgliteDataDir: join(workspaceDir, "pglite"),
    });

    try {
      const migrations = await createMigrator(database.db).migrateToLatest();
      expect(migrations.error).toBeUndefined();

      const registry = new InMemoryConnectorRegistry(
        createDefaultConnectorDefinitions({
          cloudflareDns: {
            configured: true,
          },
        }),
      );
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
      const ids = ["conn_cloudflare_dns_oauth", "conn_auth_cloudflare_dns", "state_cloudflare_dns"];
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
        new PgConnectorConnectionStore(database.db),
        { now: () => "2026-01-01T00:00:00.000Z" },
        { next: () => ids.shift() ?? "id_extra" },
      ).withAuthorizationLifecycle({
        authorizationAdapterRegistry: authRegistry,
        authorizationAttemptStore: new PgConnectorAuthorizationAttemptStore(database.db),
      });

      const started = await start.execute(context, {
        connectorKey: "cloudflare-dns",
        returnUrl: "/resources/res_123/domains",
        requestedCapabilityKey: "dns.records.apply",
        originalHostname: "pocketbase.appalofttest.xyz",
      });

      expect(started.isOk()).toBe(true);
      expect(started._unsafeUnwrap()).toMatchObject({
        authorizationAttemptId: "conn_auth_cloudflare_dns",
        connection: {
          id: "conn_cloudflare_dns_oauth",
          status: "pending",
          owner: {
            scope: "organization",
            id: "org_alpha",
            tenantId: "tenant_alpha",
          },
        },
      });

      const restartedConnectionStore = new PgConnectorConnectionStore(database.db);
      const restartedAttemptStore = new PgConnectorAuthorizationAttemptStore(database.db);
      const persistedAttempt = await restartedAttemptStore.findByState("state_cloudflare_dns");
      expect(persistedAttempt).toMatchObject({
        id: "conn_auth_cloudflare_dns",
        connectionId: "conn_cloudflare_dns_oauth",
        status: "pending",
      });

      const callback = new CompleteConnectionCallbackUseCase(restartedConnectionStore, {
        now: () => "2026-01-01T00:01:00.000Z",
      }).withAuthorizationLifecycle({
        authorizationAdapterRegistry: authRegistry,
        authorizationAttemptStore: restartedAttemptStore,
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
          storage: "secret-ref",
          redacted: true,
          secretRef: "secretref_org_alpha_cloudflare_dns",
        },
        providerResources: [
          {
            kind: "dns-zone",
            id: "zone_appalofttest",
            name: "appalofttest.xyz",
          },
        ],
      });
      const completedAttempt = await restartedAttemptStore.findById("conn_auth_cloudflare_dns");
      expect(completedAttempt).toMatchObject({
        status: "completed",
        completedAt: "2026-01-01T00:01:00.000Z",
      });
    } finally {
      await database.close();
    }
  });
});
