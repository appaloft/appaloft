import {
  type DependencyResourceBackupProviderInput,
  type DependencyResourceRestoreProviderInput,
} from "@appaloft/application";
import { type AshScript, ash } from "@appaloft/ash";
import { type DomainError, ok, type Result } from "@appaloft/core";
import { backupPath, dockerManagedDependencyServices } from "./docker-shared";

const postgresDefinition = dockerManagedDependencyServices.postgres;
const redisDefinition = dockerManagedDependencyServices.redis;

export const dockerBackupCapabilities = [
  {
    definition: postgresDefinition,
    createCommand(
      input: DependencyResourceBackupProviderInput & { container: string; path: string },
    ) {
      return postgresBackupCommand(input);
    },
    restoreCommand(
      input: DependencyResourceRestoreProviderInput & { container: string; path: string },
    ) {
      return postgresRestoreCommand(input);
    },
    pathForBackup(input: Parameters<typeof backupPath>[1]) {
      return backupPath(postgresDefinition, input);
    },
  },
  {
    definition: redisDefinition,
    createCommand(
      input: DependencyResourceBackupProviderInput & { container: string; path: string },
    ) {
      return redisBackupCommand(input);
    },
    restoreCommand(
      input: DependencyResourceRestoreProviderInput & { container: string; path: string },
    ) {
      void input.connectionSecretValue;
      return ok(redisRestoreCommand(input));
    },
    pathForBackup(input: Parameters<typeof backupPath>[1]) {
      return backupPath(redisDefinition, input);
    },
  },
];

function postgresBackupCommand(input: {
  container: string;
  path: string;
  connectionSecretValue?: string;
}): Result<AshScript, DomainError> {
  void input.connectionSecretValue;
  return ok(
    ash`
      set -eu
      ${renderBackupPathSetup(input.path)}
      mkdir -p "$(dirname "$APPALOFT_DEPENDENCY_BACKUP_PATH")"
      docker exec ${ash.arg(input.container)} sh -lc ${ash.arg(
        ash.render(
          ash`PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc`,
        ),
      )} > "$APPALOFT_DEPENDENCY_BACKUP_PATH"
    `,
  );
}

function postgresRestoreCommand(input: {
  container: string;
  path: string;
  connectionSecretValue?: string;
}): Result<AshScript, DomainError> {
  void input.connectionSecretValue;
  return ok(
    ash`
      set -eu
      ${renderBackupPathSetup(input.path)}
      test -f "$APPALOFT_DEPENDENCY_BACKUP_PATH"
      cat "$APPALOFT_DEPENDENCY_BACKUP_PATH" | docker exec -i ${ash.arg(
        input.container,
      )} sh -lc ${ash.arg(
        ash.render(
          ash`PGPASSWORD="$POSTGRES_PASSWORD" pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists`,
        ),
      )}
    `,
  );
}

function redisBackupCommand(input: {
  container: string;
  path: string;
  connectionSecretValue?: string;
}): Result<AshScript, DomainError> {
  void input.connectionSecretValue;
  return ok(
    ash`
      set -eu
      ${renderBackupPathSetup(input.path)}
      mkdir -p "$(dirname "$APPALOFT_DEPENDENCY_BACKUP_PATH")"
      docker exec ${ash.arg(input.container)} sh -lc ${ash.arg(
        ash.render(
          ash`password="$(tr "\\0" "\\n" </proc/1/cmdline | tail -n 1)"; redis-cli -a "$password" --no-auth-warning SAVE >/dev/null`,
        ),
      )}
      docker cp ${ash.arg(`${input.container}:/data/dump.rdb`)} "$APPALOFT_DEPENDENCY_BACKUP_PATH"
    `,
  );
}

function redisRestoreCommand(input: { container: string; path: string }): AshScript {
  return ash`
    set -eu
    ${renderBackupPathSetup(input.path)}
    test -f "$APPALOFT_DEPENDENCY_BACKUP_PATH"
    docker stop ${ash.arg(input.container)} >/dev/null
    docker cp "$APPALOFT_DEPENDENCY_BACKUP_PATH" ${ash.arg(`${input.container}:/data/dump.rdb`)}
    docker start ${ash.arg(input.container)} >/dev/null
  `;
}

function renderBackupPathSetup(path: string): AshScript {
  const homePrefix = "$HOME/";
  if (!path.startsWith(homePrefix)) {
    throw new TypeError("Managed dependency backup path must be rooted below $HOME");
  }
  return ash`
    ${ash.env("APPALOFT_DEPENDENCY_BACKUP_RELATIVE_PATH", path.slice(homePrefix.length))}
    APPALOFT_DEPENDENCY_BACKUP_PATH="$HOME/$APPALOFT_DEPENDENCY_BACKUP_RELATIVE_PATH"
  `;
}
