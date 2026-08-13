import { type Kysely, sql } from "kysely";

import { type Database } from "../schema";

export const serverRuntimeTargetProfileMigration = {
  async up(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE servers
      ADD COLUMN IF NOT EXISTS runtime_target_profile jsonb
    `.execute(db);

    await sql`
      ALTER TABLE servers
      ADD CONSTRAINT servers_runtime_target_profile_shape_check
      CHECK (
        runtime_target_profile IS NULL
        OR (
          target_kind = 'orchestrator-cluster'
          AND jsonb_typeof(runtime_target_profile) = 'object'
          AND runtime_target_profile - ARRAY[
            'schemaVersion',
            'connectionReference',
            'credentialReference',
            'placementPolicyReference',
            'routingPolicyReference',
            'registryCredentialReference',
            'capabilityPolicyReference'
          ]::text[] = '{}'::jsonb
          AND runtime_target_profile->>'schemaVersion' = 'runtime-target-profile/v1'
          AND jsonb_typeof(runtime_target_profile->'connectionReference') = 'string'
          AND runtime_target_profile->>'connectionReference'
            ~ '^[A-Za-z][A-Za-z0-9+.-]*://[^[:space:]]+$'
          AND (
            NOT runtime_target_profile ? 'credentialReference'
            OR (
              jsonb_typeof(runtime_target_profile->'credentialReference') = 'string'
              AND runtime_target_profile->>'credentialReference'
                ~ '^[A-Za-z][A-Za-z0-9+.-]*://[^[:space:]]+$'
            )
          )
          AND (
            NOT runtime_target_profile ? 'placementPolicyReference'
            OR (
              jsonb_typeof(runtime_target_profile->'placementPolicyReference') = 'string'
              AND runtime_target_profile->>'placementPolicyReference'
                ~ '^[A-Za-z][A-Za-z0-9+.-]*://[^[:space:]]+$'
            )
          )
          AND (
            NOT runtime_target_profile ? 'routingPolicyReference'
            OR (
              jsonb_typeof(runtime_target_profile->'routingPolicyReference') = 'string'
              AND runtime_target_profile->>'routingPolicyReference'
                ~ '^[A-Za-z][A-Za-z0-9+.-]*://[^[:space:]]+$'
            )
          )
          AND (
            NOT runtime_target_profile ? 'registryCredentialReference'
            OR (
              jsonb_typeof(runtime_target_profile->'registryCredentialReference') = 'string'
              AND runtime_target_profile->>'registryCredentialReference'
                ~ '^[A-Za-z][A-Za-z0-9+.-]*://[^[:space:]]+$'
            )
          )
          AND (
            NOT runtime_target_profile ? 'capabilityPolicyReference'
            OR (
              jsonb_typeof(runtime_target_profile->'capabilityPolicyReference') = 'string'
              AND runtime_target_profile->>'capabilityPolicyReference'
                ~ '^[A-Za-z][A-Za-z0-9+.-]*://[^[:space:]]+$'
            )
          )
        )
      )
    `.execute(db);
  },

  async down(db: Kysely<Database>): Promise<void> {
    await sql`
      ALTER TABLE servers
      DROP COLUMN IF EXISTS runtime_target_profile
    `.execute(db);
  },
};
