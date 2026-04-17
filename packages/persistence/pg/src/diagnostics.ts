import { type DiagnosticsPort } from "@appaloft/application";
import { type Kysely, type Migrator } from "kysely";
import { type DatabaseConnectionDescriptor, pingDatabase } from "./db";
import { type Database } from "./schema";

export class PgDiagnostics implements DiagnosticsPort {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly migrator: Migrator,
    private readonly descriptor: DatabaseConnectionDescriptor,
  ) {}

  async readiness() {
    const checks = {
      database: false,
      migrations: false,
    };

    try {
      await pingDatabase(this.db);
      checks.database = true;
    } catch {
      checks.database = false;
    }

    try {
      const status = await this.migrator.getMigrations();
      checks.migrations = status.every((migration) => migration.executedAt !== undefined);
    } catch {
      checks.migrations = false;
    }

    return {
      status: checks.database && checks.migrations ? "ready" : "degraded",
      checks,
      details: {
        databaseDriver: this.descriptor.driver,
        databaseMode: this.descriptor.mode,
        databaseLocation: this.descriptor.location,
      },
    } as const;
  }

  async migrationStatus() {
    const migrations = await this.migrator.getMigrations();
    return {
      pending: migrations
        .filter((migration) => !migration.executedAt)
        .map((migration) => migration.name),
      executed: migrations
        .filter((migration) => migration.executedAt)
        .map((migration) => migration.name),
    };
  }

  async migrate() {
    const result = await this.migrator.migrateToLatest();
    return {
      executed: result.results?.map((item) => item.migrationName) ?? [],
    };
  }
}
