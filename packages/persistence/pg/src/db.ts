import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { $ } from "bun";
import { Kysely, type MigrationProvider, Migrator, sql } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";

import { initialMigration } from "./migrations/001_initial";
import { betterAuthMigration } from "./migrations/002_better_auth";
import { destinationBackfillMigration } from "./migrations/003_destination_backfill";
import { legacyDeploymentResourcesMigration } from "./migrations/004_legacy_deployment_resources";
import { serverCredentialsMigration } from "./migrations/005_server_credentials";
import { sshCredentialsMigration } from "./migrations/006_ssh_credentials";
import { serverEdgeProxyMigration } from "./migrations/007_server_edge_proxy";
import { domainBindingsMigration } from "./migrations/008_domain_bindings";
import { resourceProfilesMigration } from "./migrations/009_resource_profiles";
import { resourceNetworkProfileMigration } from "./migrations/010_resource_network_profile";
import { serverEdgeProxyBackfillMigration } from "./migrations/011_server_edge_proxy_backfill";
import { certificatesMigration } from "./migrations/012_certificates";
import { domainBindingRouteFailureMigration } from "./migrations/013_domain_binding_route_failure";
import { domainBindingDnsObservationMigration } from "./migrations/014_domain_binding_dns_observation";
import { PgliteDialect } from "./pglite-dialect";
import { type Database } from "./schema";
import { TracingDialect } from "./tracing-dialect";

export interface DatabaseConnectionDescriptor {
  driver: "postgres" | "pglite";
  mode: "external" | "embedded";
  location: string;
}

export interface DatabaseConnection {
  db: Kysely<Database>;
  descriptor: DatabaseConnectionDescriptor;
  close(): Promise<void>;
}

export interface CreateDatabaseInput {
  driver: "postgres" | "pglite";
  databaseUrl?: string;
  pgliteDataDir?: string;
  pgliteRuntimeAssets?: PgliteRuntimeAssets;
}

export interface PgliteRuntimeAssets {
  fsBundle?: Blob;
  pgliteWasmModule?: WebAssembly.Module;
  initdbWasmModule?: WebAssembly.Module;
}

export async function createDatabase(input: CreateDatabaseInput): Promise<DatabaseConnection> {
  if (input.driver === "pglite") {
    const dataDir = resolve(input.pgliteDataDir ?? ".appaloft/data/pglite");
    await $`mkdir -p ${dataDir}`;

    const pglite = input.pgliteRuntimeAssets
      ? await PGlite.create(dataDir, input.pgliteRuntimeAssets)
      : await PGlite.create(dataDir);
    const db = new Kysely<Database>({
      dialect: new TracingDialect(new PgliteDialect(pglite), {
        driver: "pglite",
        location: dataDir,
      }),
    });

    return {
      db,
      descriptor: {
        driver: "pglite",
        mode: "embedded",
        location: dataDir,
      },
      async close(): Promise<void> {
        await db.destroy();
      },
    };
  }

  if (!input.databaseUrl) {
    throw new Error("APPALOFT_DATABASE_URL is required when APPALOFT_DATABASE_DRIVER=postgres");
  }

  const connection = postgres(input.databaseUrl, {
    max: 10,
  });

  const db = new Kysely<Database>({
    dialect: new TracingDialect(
      new PostgresJSDialect({
        postgres: connection,
      }),
      {
        driver: "postgres",
        location: new URL(input.databaseUrl).hostname,
      },
    ),
  });

  return {
    db,
    descriptor: {
      driver: "postgres",
      mode: "external",
      location: input.databaseUrl,
    },
    async close(): Promise<void> {
      await db.destroy();
      await connection.end();
    },
  };
}

class StaticMigrationProvider implements MigrationProvider {
  async getMigrations() {
    return {
      "001_initial": initialMigration,
      "002_better_auth": betterAuthMigration,
      "003_destination_backfill": destinationBackfillMigration,
      "004_legacy_deployment_resources": legacyDeploymentResourcesMigration,
      "005_server_credentials": serverCredentialsMigration,
      "006_ssh_credentials": sshCredentialsMigration,
      "007_server_edge_proxy": serverEdgeProxyMigration,
      "008_domain_bindings": domainBindingsMigration,
      "009_resource_profiles": resourceProfilesMigration,
      "010_resource_network_profile": resourceNetworkProfileMigration,
      "011_server_edge_proxy_backfill": serverEdgeProxyBackfillMigration,
      "012_certificates": certificatesMigration,
      "013_domain_binding_route_failure": domainBindingRouteFailureMigration,
      "014_domain_binding_dns_observation": domainBindingDnsObservationMigration,
    };
  }
}

export function createMigrator(db: Kysely<Database>): Migrator {
  return new Migrator({
    db,
    provider: new StaticMigrationProvider(),
  });
}

export async function pingDatabase(db: Kysely<Database>): Promise<void> {
  await db.selectNoFrom(() => [sql<number>`1`.as("ping")]).executeTakeFirst();
}
