import { type Kysely } from "kysely";

import { type Database } from "../schema";

export const initialMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await db.schema
      .createTable("projects")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("name", "text", (column) => column.notNull())
      .addColumn("slug", "text", (column) => column.notNull().unique())
      .addColumn("description", "text")
      .addColumn("created_at", "timestamptz", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("servers")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("name", "text", (column) => column.notNull())
      .addColumn("host", "text", (column) => column.notNull())
      .addColumn("port", "integer", (column) => column.notNull())
      .addColumn("provider_key", "text", (column) => column.notNull())
      .addColumn("credential_kind", "text")
      .addColumn("credential_username", "text")
      .addColumn("credential_public_key", "text")
      .addColumn("credential_private_key", "text")
      .addColumn("created_at", "timestamptz", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("destinations")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("server_id", "text", (column) =>
        column.notNull().references("servers.id").onDelete("cascade"),
      )
      .addColumn("name", "text", (column) => column.notNull())
      .addColumn("kind", "text", (column) => column.notNull())
      .addColumn("created_at", "timestamptz", (column) => column.notNull())
      .addUniqueConstraint("destinations_server_name_unique", ["server_id", "name"])
      .execute();

    await db.schema
      .createTable("environments")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("project_id", "text", (column) =>
        column.notNull().references("projects.id").onDelete("cascade"),
      )
      .addColumn("name", "text", (column) => column.notNull())
      .addColumn("kind", "text", (column) => column.notNull())
      .addColumn("parent_environment_id", "text", (column) => column.references("environments.id"))
      .addColumn("created_at", "timestamptz", (column) => column.notNull())
      .addUniqueConstraint("environments_project_name_unique", ["project_id", "name"])
      .execute();

    await db.schema
      .createTable("environment_variables")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("environment_id", "text", (column) =>
        column.notNull().references("environments.id").onDelete("cascade"),
      )
      .addColumn("key", "text", (column) => column.notNull())
      .addColumn("value", "text", (column) => column.notNull())
      .addColumn("kind", "text", (column) => column.notNull())
      .addColumn("exposure", "text", (column) => column.notNull())
      .addColumn("scope", "text", (column) => column.notNull())
      .addColumn("is_secret", "boolean", (column) => column.notNull().defaultTo(false))
      .addColumn("updated_at", "timestamptz", (column) => column.notNull())
      .addUniqueConstraint("environment_variables_unique_identity", [
        "environment_id",
        "key",
        "exposure",
        "scope",
      ])
      .execute();

    await db.schema
      .createTable("resources")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("project_id", "text", (column) =>
        column.notNull().references("projects.id").onDelete("cascade"),
      )
      .addColumn("environment_id", "text", (column) =>
        column.notNull().references("environments.id").onDelete("cascade"),
      )
      .addColumn("destination_id", "text", (column) =>
        column.references("destinations.id").onDelete("set null"),
      )
      .addColumn("name", "text", (column) => column.notNull())
      .addColumn("slug", "text", (column) => column.notNull())
      .addColumn("kind", "text", (column) => column.notNull())
      .addColumn("description", "text")
      .addColumn("services", "jsonb", (column) => column.notNull().defaultTo("[]"))
      .addColumn("created_at", "timestamptz", (column) => column.notNull())
      .addUniqueConstraint("resources_environment_slug_unique", [
        "project_id",
        "environment_id",
        "slug",
      ])
      .execute();

    await db.schema
      .createTable("deployments")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("project_id", "text", (column) =>
        column.notNull().references("projects.id").onDelete("cascade"),
      )
      .addColumn("environment_id", "text", (column) =>
        column.notNull().references("environments.id").onDelete("cascade"),
      )
      .addColumn("resource_id", "text", (column) =>
        column.notNull().references("resources.id").onDelete("cascade"),
      )
      .addColumn("server_id", "text", (column) =>
        column.notNull().references("servers.id").onDelete("cascade"),
      )
      .addColumn("destination_id", "text", (column) =>
        column.notNull().references("destinations.id").onDelete("cascade"),
      )
      .addColumn("status", "text", (column) => column.notNull())
      .addColumn("runtime_plan", "jsonb", (column) => column.notNull())
      .addColumn("environment_snapshot", "jsonb", (column) => column.notNull())
      .addColumn("logs", "jsonb", (column) => column.notNull().defaultTo("[]"))
      .addColumn("created_at", "timestamptz", (column) => column.notNull())
      .addColumn("started_at", "timestamptz")
      .addColumn("finished_at", "timestamptz")
      .addColumn("rollback_of_deployment_id", "text", (column) =>
        column.references("deployments.id"),
      )
      .execute();

    await db.schema
      .createTable("audit_logs")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("aggregate_id", "text", (column) => column.notNull())
      .addColumn("event_type", "text", (column) => column.notNull())
      .addColumn("payload", "jsonb", (column) => column.notNull())
      .addColumn("created_at", "timestamptz", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("provider_job_logs")
      .addColumn("id", "text", (column) => column.primaryKey())
      .addColumn("deployment_id", "text", (column) =>
        column.notNull().references("deployments.id").onDelete("cascade"),
      )
      .addColumn("provider_key", "text", (column) => column.notNull())
      .addColumn("payload", "jsonb", (column) => column.notNull())
      .addColumn("created_at", "timestamptz", (column) => column.notNull())
      .execute();
  },

  async down(db: Kysely<Database>): Promise<void> {
    await db.schema.dropTable("provider_job_logs").ifExists().execute();
    await db.schema.dropTable("audit_logs").ifExists().execute();
    await db.schema.dropTable("deployments").ifExists().execute();
    await db.schema.dropTable("resources").ifExists().execute();
    await db.schema.dropTable("environment_variables").ifExists().execute();
    await db.schema.dropTable("environments").ifExists().execute();
    await db.schema.dropTable("destinations").ifExists().execute();
    await db.schema.dropTable("servers").ifExists().execute();
    await db.schema.dropTable("projects").ifExists().execute();
  },
};
