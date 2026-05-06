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
import { domainBindingCanonicalRedirectMigration } from "./migrations/015_domain_binding_canonical_redirect";
import { resourceLifecycleMigration } from "./migrations/016_resource_lifecycle";
import { resourceDeleteTombstoneMigration } from "./migrations/017_resource_delete_tombstone";
import { auditLogAggregateIndexMigration } from "./migrations/018_audit_log_aggregate_index";
import { sourceLinksMigration } from "./migrations/019_source_links";
import { serverAppliedRouteStatesMigration } from "./migrations/020_server_applied_route_states";
import { defaultAccessDomainPoliciesMigration } from "./migrations/021_default_access_domain_policies";
import { certificateImportsMigration } from "./migrations/022_certificate_imports";
import { certificateSecretsMigration } from "./migrations/023_certificate_secrets";
import { deploymentAdmissionAndSupersedeMigration } from "./migrations/024_deployment_admission_and_supersede";
import { deploymentSupersedeFencingMigration } from "./migrations/025_deployment_supersede_fencing";
import { mutationCoordinationsMigration } from "./migrations/026_mutation_coordinations";
import { resourceVariablesMigration } from "./migrations/027_resource_variables";
import { projectLifecycleMigration } from "./migrations/028_project_lifecycle";
import { serverLifecycleMigration } from "./migrations/029_server_lifecycle";
import { serverDeleteTombstoneMigration } from "./migrations/030_server_delete_tombstone";
import { sshCredentialRotationMigration } from "./migrations/031_ssh_credential_rotation";
import { environmentLifecycleMigration } from "./migrations/032_environment_lifecycle";
import { environmentLockLifecycleMigration } from "./migrations/033_environment_lock_lifecycle";
import { resourceAccessProfileMigration } from "./migrations/034_resource_access_profile";
import { processAttemptJournalMigration } from "./migrations/035_process_attempt_journal";
import { domainBindingDeletedStatusMigration } from "./migrations/036_domain_binding_deleted_status";
import { resourceAccessFailureEvidenceMigration } from "./migrations/037_resource_access_failure_evidence";
import { storageVolumesMigration } from "./migrations/038_storage_volumes";
import { dependencyResourcesMigration } from "./migrations/039_dependency_resources";
import { resourceDependencyBindingsMigration } from "./migrations/040_resource_dependency_bindings";
import { deploymentDependencyBindingReferencesMigration } from "./migrations/041_deployment_dependency_binding_references";
import { dependencyBindingSecretRotationMigration } from "./migrations/042_dependency_binding_secret_rotation";
import { dependencyResourceProviderRealizationMigration } from "./migrations/043_dependency_resource_provider_realization";
import { dependencyResourceBackupsMigration } from "./migrations/044_dependency_resource_backups";
import { deploymentRecoveryMetadataMigration } from "./migrations/045_deployment_recovery_metadata";
import { deploymentRollbackMetadataMigration } from "./migrations/046_deployment_rollback_metadata";
import { resourceRuntimeControlAttemptsMigration } from "./migrations/047_resource_runtime_control_attempts";
import { resourceAutoDeployPolicyMigration } from "./migrations/048_resource_auto_deploy_policy";
import { sourceEventsMigration } from "./migrations/049_source_events";
import { serverTargetKindMigration } from "./migrations/050_server_target_kind";
import { scheduledTaskDefinitionsMigration } from "./migrations/051_scheduled_task_definitions";
import { scheduledTaskRunAttemptsMigration } from "./migrations/052_scheduled_task_run_attempts";
import { scheduledTaskRunLogsMigration } from "./migrations/053_scheduled_task_run_logs";
import { previewEnvironmentsMigration } from "./migrations/054_preview_environments";
import { previewPoliciesMigration } from "./migrations/055_preview_policies";
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
      "015_domain_binding_canonical_redirect": domainBindingCanonicalRedirectMigration,
      "016_resource_lifecycle": resourceLifecycleMigration,
      "017_resource_delete_tombstone": resourceDeleteTombstoneMigration,
      "018_audit_log_aggregate_index": auditLogAggregateIndexMigration,
      "019_source_links": sourceLinksMigration,
      "020_server_applied_route_states": serverAppliedRouteStatesMigration,
      "021_default_access_domain_policies": defaultAccessDomainPoliciesMigration,
      "022_certificate_imports": certificateImportsMigration,
      "023_certificate_secrets": certificateSecretsMigration,
      "024_deployment_admission_and_supersede": deploymentAdmissionAndSupersedeMigration,
      "025_deployment_supersede_fencing": deploymentSupersedeFencingMigration,
      "026_mutation_coordinations": mutationCoordinationsMigration,
      "027_resource_variables": resourceVariablesMigration,
      "028_project_lifecycle": projectLifecycleMigration,
      "029_server_lifecycle": serverLifecycleMigration,
      "030_server_delete_tombstone": serverDeleteTombstoneMigration,
      "031_ssh_credential_rotation": sshCredentialRotationMigration,
      "032_environment_lifecycle": environmentLifecycleMigration,
      "033_environment_lock_lifecycle": environmentLockLifecycleMigration,
      "034_resource_access_profile": resourceAccessProfileMigration,
      "035_process_attempt_journal": processAttemptJournalMigration,
      "036_domain_binding_deleted_status": domainBindingDeletedStatusMigration,
      "037_resource_access_failure_evidence": resourceAccessFailureEvidenceMigration,
      "038_storage_volumes": storageVolumesMigration,
      "039_dependency_resources": dependencyResourcesMigration,
      "040_resource_dependency_bindings": resourceDependencyBindingsMigration,
      "041_deployment_dependency_binding_references":
        deploymentDependencyBindingReferencesMigration,
      "042_dependency_binding_secret_rotation": dependencyBindingSecretRotationMigration,
      "043_dependency_resource_provider_realization":
        dependencyResourceProviderRealizationMigration,
      "044_dependency_resource_backups": dependencyResourceBackupsMigration,
      "045_deployment_recovery_metadata": deploymentRecoveryMetadataMigration,
      "046_deployment_rollback_metadata": deploymentRollbackMetadataMigration,
      "047_resource_runtime_control_attempts": resourceRuntimeControlAttemptsMigration,
      "048_resource_auto_deploy_policy": resourceAutoDeployPolicyMigration,
      "049_source_events": sourceEventsMigration,
      "050_server_target_kind": serverTargetKindMigration,
      "051_scheduled_task_definitions": scheduledTaskDefinitionsMigration,
      "052_scheduled_task_run_attempts": scheduledTaskRunAttemptsMigration,
      "053_scheduled_task_run_logs": scheduledTaskRunLogsMigration,
      "054_preview_environments": previewEnvironmentsMigration,
      "055_preview_policies": previewPoliciesMigration,
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
