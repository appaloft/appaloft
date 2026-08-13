import { type MigrationSecretResolver } from "@appaloft/application";
import { domainError, err, ok, type Result } from "@appaloft/core";

const environmentSecretReferencePrefix = "env://";
const environmentVariableNamePattern = /^[A-Z_][A-Z0-9_]*$/;

export type MigrationSecretEnvironment = Readonly<Record<string, string | undefined>>;

export class ProcessEnvironmentMigrationSecretResolver implements MigrationSecretResolver {
  constructor(private readonly environment: MigrationSecretEnvironment = process.env) {}

  async resolve(secretRef: string): Promise<Result<string>> {
    if (!secretRef.startsWith(environmentSecretReferencePrefix)) {
      return err(
        domainError.validation("Migration secret reference must use the env:// scheme", {
          reason: "unsupported_migration_secret_reference_scheme",
        }),
      );
    }

    const variableName = secretRef.slice(environmentSecretReferencePrefix.length);
    if (!environmentVariableNamePattern.test(variableName)) {
      return err(
        domainError.validation("Migration secret environment variable name is invalid", {
          reason: "invalid_migration_secret_environment_name",
        }),
      );
    }

    const value = this.environment[variableName];
    if (value === undefined || value.length === 0) {
      return err(
        domainError.validation("Migration secret environment value is unavailable", {
          reason: "migration_secret_environment_value_unavailable",
        }),
      );
    }

    return ok(value);
  }
}
