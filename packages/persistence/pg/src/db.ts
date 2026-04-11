import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { $ } from "bun";
import { Kysely, type MigrationProvider, Migrator, sql } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";

import { initialMigration } from "./migrations/001_initial";
import { PgliteDialect } from "./pglite-dialect";
import { type Database } from "./schema";

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
    const dataDir = resolve(input.pgliteDataDir ?? ".yundu/data/pglite");
    await $`mkdir -p ${dataDir}`;

    const pglite = input.pgliteRuntimeAssets
      ? await PGlite.create(dataDir, input.pgliteRuntimeAssets)
      : await PGlite.create(dataDir);
    const db = new Kysely<Database>({
      dialect: new PgliteDialect(pglite),
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
    throw new Error("YUNDU_DATABASE_URL is required when YUNDU_DATABASE_DRIVER=postgres");
  }

  const connection = postgres(input.databaseUrl, {
    max: 10,
  });

  const db = new Kysely<Database>({
    dialect: new PostgresJSDialect({
      postgres: connection,
    }),
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
