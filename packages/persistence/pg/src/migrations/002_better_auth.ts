import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const betterAuthMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await db.schema
      .createTable("user")
      .addColumn("id", "text", (column) => column.primaryKey().notNull())
      .addColumn("name", "text", (column) => column.notNull())
      .addColumn("email", "text", (column) => column.notNull().unique())
      .addColumn("emailVerified", "boolean", (column) => column.notNull())
      .addColumn("image", "text")
      .addColumn("createdAt", "timestamptz", (column) =>
        column.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
      )
      .addColumn("updatedAt", "timestamptz", (column) =>
        column.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
      )
      .execute();

    await db.schema
      .createTable("session")
      .addColumn("id", "text", (column) => column.primaryKey().notNull())
      .addColumn("expiresAt", "timestamptz", (column) => column.notNull())
      .addColumn("token", "text", (column) => column.notNull().unique())
      .addColumn("createdAt", "timestamptz", (column) =>
        column.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
      )
      .addColumn("updatedAt", "timestamptz", (column) => column.notNull())
      .addColumn("ipAddress", "text")
      .addColumn("userAgent", "text")
      .addColumn("userId", "text", (column) =>
        column.notNull().references("user.id").onDelete("cascade"),
      )
      .addColumn("activeOrganizationId", "text")
      .execute();

    await db.schema
      .createTable("account")
      .addColumn("id", "text", (column) => column.primaryKey().notNull())
      .addColumn("accountId", "text", (column) => column.notNull())
      .addColumn("providerId", "text", (column) => column.notNull())
      .addColumn("userId", "text", (column) =>
        column.notNull().references("user.id").onDelete("cascade"),
      )
      .addColumn("accessToken", "text")
      .addColumn("refreshToken", "text")
      .addColumn("idToken", "text")
      .addColumn("accessTokenExpiresAt", "timestamptz")
      .addColumn("refreshTokenExpiresAt", "timestamptz")
      .addColumn("scope", "text")
      .addColumn("password", "text")
      .addColumn("createdAt", "timestamptz", (column) =>
        column.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
      )
      .addColumn("updatedAt", "timestamptz", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("verification")
      .addColumn("id", "text", (column) => column.primaryKey().notNull())
      .addColumn("identifier", "text", (column) => column.notNull())
      .addColumn("value", "text", (column) => column.notNull())
      .addColumn("expiresAt", "timestamptz", (column) => column.notNull())
      .addColumn("createdAt", "timestamptz", (column) =>
        column.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
      )
      .addColumn("updatedAt", "timestamptz", (column) =>
        column.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
      )
      .execute();

    await db.schema
      .createTable("organization")
      .addColumn("id", "text", (column) => column.primaryKey().notNull())
      .addColumn("name", "text", (column) => column.notNull())
      .addColumn("slug", "text", (column) => column.notNull().unique())
      .addColumn("logo", "text")
      .addColumn("createdAt", "timestamptz", (column) => column.notNull())
      .addColumn("metadata", "text")
      .execute();

    await db.schema
      .createTable("member")
      .addColumn("id", "text", (column) => column.primaryKey().notNull())
      .addColumn("organizationId", "text", (column) =>
        column.notNull().references("organization.id").onDelete("cascade"),
      )
      .addColumn("userId", "text", (column) =>
        column.notNull().references("user.id").onDelete("cascade"),
      )
      .addColumn("role", "text", (column) => column.notNull())
      .addColumn("createdAt", "timestamptz", (column) => column.notNull())
      .execute();

    await db.schema
      .createTable("invitation")
      .addColumn("id", "text", (column) => column.primaryKey().notNull())
      .addColumn("organizationId", "text", (column) =>
        column.notNull().references("organization.id").onDelete("cascade"),
      )
      .addColumn("email", "text", (column) => column.notNull())
      .addColumn("role", "text")
      .addColumn("status", "text", (column) => column.notNull())
      .addColumn("expiresAt", "timestamptz", (column) => column.notNull())
      .addColumn("createdAt", "timestamptz", (column) =>
        column.defaultTo(sql`CURRENT_TIMESTAMP`).notNull(),
      )
      .addColumn("inviterId", "text", (column) =>
        column.notNull().references("user.id").onDelete("cascade"),
      )
      .execute();

    await db.schema.createIndex("session_userId_idx").on("session").column("userId").execute();
    await db.schema.createIndex("account_userId_idx").on("account").column("userId").execute();
    await db.schema
      .createIndex("verification_identifier_idx")
      .on("verification")
      .column("identifier")
      .execute();
    await db.schema
      .createIndex("organization_slug_uidx")
      .unique()
      .on("organization")
      .column("slug")
      .execute();
    await db.schema
      .createIndex("member_organizationId_idx")
      .on("member")
      .column("organizationId")
      .execute();
    await db.schema.createIndex("member_userId_idx").on("member").column("userId").execute();
    await db.schema
      .createIndex("invitation_organizationId_idx")
      .on("invitation")
      .column("organizationId")
      .execute();
    await db.schema.createIndex("invitation_email_idx").on("invitation").column("email").execute();
  },

  async down(db: Kysely<Database>): Promise<void> {
    await db.schema.dropTable("invitation").ifExists().execute();
    await db.schema.dropTable("member").ifExists().execute();
    await db.schema.dropTable("organization").ifExists().execute();
    await db.schema.dropTable("verification").ifExists().execute();
    await db.schema.dropTable("account").ifExists().execute();
    await db.schema.dropTable("session").ifExists().execute();
    await db.schema.dropTable("user").ifExists().execute();
  },
};
