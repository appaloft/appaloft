import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  CreateDeploymentCommand,
  CreateEnvironmentCommand,
  CreateProjectCommand,
  DbMigrateCommand,
  DbStatusQuery,
  DeploymentLogsQuery,
  DiffEnvironmentsQuery,
  DoctorQuery,
  type ExecutionContextFactory,
  ListEnvironmentsQuery,
  ListPluginsQuery,
  ListProjectsQuery,
  ListProvidersQuery,
  ListServersQuery,
  PromoteEnvironmentCommand,
  type QueryBus,
  RegisterServerCommand,
  RollbackDeploymentCommand,
  SetEnvironmentVariableCommand,
  ShowEnvironmentQuery,
  UnsetEnvironmentVariableCommand,
} from "@yundu/application";
import { type DomainError, type Result } from "@yundu/core";
import { Command } from "commander";

function print(value: unknown): void {
  const serialized = JSON.stringify(value, null, 2);
  console.log(serialized ?? "null");
}

function printError(error: DomainError): void {
  console.error(
    JSON.stringify(
      {
        error,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}

function unwrapMessage<T>(message: Result<T>): T | null {
  return message.match<T | null>(
    (value) => value,
    (error) => {
      printError(error);
      return null;
    },
  );
}

async function handleBusResult<T>(promise: Promise<Result<T>>): Promise<void> {
  const result = await promise;
  result.match(
    (value) => {
      print(value);
    },
    (error) => {
      printError(error as DomainError);
    },
  );
}

export function createCliProgram(input: {
  version: string;
  startServer(): Promise<void>;
  commandBus: CommandBus;
  queryBus: QueryBus;
  executionContextFactory: ExecutionContextFactory;
}): Command {
  const program = new Command();
  const executeCommand = <T>(message: AppCommand<T>) =>
    input.commandBus.execute(
      input.executionContextFactory.create({
        entrypoint: "cli",
        actor: {
          kind: "system",
          id: "cli",
          label: "yundu-cli",
        },
      }),
      message,
    );
  const executeQuery = <T>(message: AppQuery<T>) =>
    input.queryBus.execute(
      input.executionContextFactory.create({
        entrypoint: "cli",
        actor: {
          kind: "system",
          id: "cli",
          label: "yundu-cli",
        },
      }),
      message,
    );

  program
    .name("yundu")
    .description("AI Native local-to-cloud deployment platform")
    .version(input.version);

  program
    .command("version")
    .description("Show CLI and API version metadata")
    .action(() => {
      print({
        name: "Yundu",
        version: input.version,
      });
    });

  program
    .command("serve")
    .description("Start the Yundu backend service")
    .action(async () => {
      await input.startServer();
      await new Promise<void>(() => {});
    });

  program
    .command("init")
    .description("Print local bootstrap guidance")
    .action(() => {
      print({
        name: "Yundu",
        guide: [
          "Use yundu deploy . for the smallest local self-hosted flow",
          "Use yundu serve to run the API",
          "Use yundu db migrate for external PostgreSQL or explicit schema control",
        ],
      });
    });

  program
    .command("doctor")
    .description("Run readiness diagnostics")
    .action(async () => {
      const message = unwrapMessage(DoctorQuery.create());
      if (!message) {
        return;
      }

      await handleBusResult(executeQuery(message));
    });

  const db = program.command("db").description("Database operations");
  db.command("migrate")
    .description("Apply pending migrations")
    .action(async () => {
      const message = unwrapMessage(DbMigrateCommand.create());
      if (!message) {
        return;
      }

      await handleBusResult(executeCommand(message));
    });
  db.command("status")
    .description("Show migration status")
    .action(async () => {
      const message = unwrapMessage(DbStatusQuery.create());
      if (!message) {
        return;
      }

      await handleBusResult(executeQuery(message));
    });

  const project = program.command("project").description("Project operations");
  project
    .command("create")
    .requiredOption("--name <name>")
    .option("--description <description>")
    .action(async (options) => {
      const message = unwrapMessage(
        CreateProjectCommand.create({
          name: options.name,
          description: options.description,
        }),
      );
      if (!message) {
        return;
      }

      await handleBusResult(executeCommand(message));
    });
  project.command("list").action(async () => {
    const message = unwrapMessage(ListProjectsQuery.create());
    if (!message) {
      return;
    }

    await handleBusResult(executeQuery(message));
  });

  const server = program.command("server").description("Server operations");
  server
    .command("register")
    .requiredOption("--name <name>")
    .requiredOption("--host <host>")
    .option("--port <port>", "SSH port", "22")
    .option("--provider <provider>", "Provider key", "generic-ssh")
    .action(async (options) => {
      const message = unwrapMessage(
        RegisterServerCommand.create({
          name: options.name,
          host: options.host,
          port: Number(options.port),
          providerKey: options.provider,
        }),
      );
      if (!message) {
        return;
      }

      await handleBusResult(executeCommand(message));
    });
  server.command("list").action(async () => {
    const message = unwrapMessage(ListServersQuery.create());
    if (!message) {
      return;
    }

    await handleBusResult(executeQuery(message));
  });

  program
    .command("deploy <pathOrSource>")
    .option("--project <projectId>")
    .option("--server <serverId>")
    .option("--environment <environmentId>")
    .option(
      "--method <method>",
      "Deployment method: auto | dockerfile | docker-compose | prebuilt-image | workspace-commands",
      "auto",
    )
    .option("--install <command>", "Install command for workspace-commands")
    .option("--build <command>", "Build command for workspace-commands")
    .option("--start <command>", "Start command for workspace-commands")
    .option("--port <port>", "Application port for local execution")
    .option("--health-path <path>", "Health check path for local execution")
    .action(async (pathOrSource, options) => {
      const message = unwrapMessage(
        CreateDeploymentCommand.create({
          projectId: options.project,
          serverId: options.server,
          environmentId: options.environment,
          sourceLocator: pathOrSource,
          deploymentMethod: options.method,
          installCommand: options.install,
          buildCommand: options.build,
          startCommand: options.start,
          ...(options.port ? { port: Number(options.port) } : {}),
          ...(options.healthPath ? { healthCheckPath: options.healthPath } : {}),
        }),
      );
      if (!message) {
        return;
      }

      await handleBusResult(executeCommand(message));
    });

  program.command("logs <deploymentId>").action(async (deploymentId) => {
    const message = unwrapMessage(DeploymentLogsQuery.create({ deploymentId }));
    if (!message) {
      return;
    }

    await handleBusResult(executeQuery(message));
  });

  program.command("rollback <deploymentId>").action(async (deploymentId) => {
    const message = unwrapMessage(RollbackDeploymentCommand.create({ deploymentId }));
    if (!message) {
      return;
    }

    await handleBusResult(executeCommand(message));
  });

  const env = program.command("env").description("Environment operations");
  env
    .command("list")
    .option("--project <projectId>")
    .action(async (options) => {
      const message = unwrapMessage(
        ListEnvironmentsQuery.create({
          projectId: options.project,
        }),
      );
      if (!message) {
        return;
      }

      await handleBusResult(executeQuery(message));
    });
  env
    .command("create")
    .requiredOption("--project <projectId>")
    .requiredOption("--name <name>")
    .requiredOption("--kind <kind>")
    .option("--parent <parentEnvironmentId>")
    .action(async (options) => {
      const message = unwrapMessage(
        CreateEnvironmentCommand.create({
          projectId: options.project,
          name: options.name,
          kind: options.kind,
          parentEnvironmentId: options.parent,
        }),
      );
      if (!message) {
        return;
      }

      await handleBusResult(executeCommand(message));
    });
  env.command("show <environmentId>").action(async (environmentId) => {
    const message = unwrapMessage(ShowEnvironmentQuery.create({ environmentId }));
    if (!message) {
      return;
    }

    await handleBusResult(executeQuery(message));
  });
  env
    .command("set <environmentId> <key> <value>")
    .requiredOption("--kind <kind>")
    .requiredOption("--exposure <exposure>")
    .option("--scope <scope>")
    .option("--secret", "Store as secret", false)
    .action(async (environmentId, key, value, options) => {
      const message = unwrapMessage(
        SetEnvironmentVariableCommand.create({
          environmentId,
          key,
          value,
          kind: options.kind,
          exposure: options.exposure,
          scope: options.scope,
          isSecret: options.secret,
        }),
      );
      if (!message) {
        return;
      }

      await handleBusResult(executeCommand(message));
    });
  env
    .command("unset <environmentId> <key>")
    .requiredOption("--exposure <exposure>")
    .option("--scope <scope>")
    .action(async (environmentId, key, options) => {
      const message = unwrapMessage(
        UnsetEnvironmentVariableCommand.create({
          environmentId,
          key,
          exposure: options.exposure,
          scope: options.scope,
        }),
      );
      if (!message) {
        return;
      }

      await handleBusResult(executeCommand(message));
    });
  env
    .command("diff <environmentId> <otherEnvironmentId>")
    .action(async (environmentId, otherEnvironmentId) => {
      const message = unwrapMessage(
        DiffEnvironmentsQuery.create({
          environmentId,
          otherEnvironmentId,
        }),
      );
      if (!message) {
        return;
      }

      await handleBusResult(executeQuery(message));
    });
  env
    .command("promote <environmentId> <targetName>")
    .requiredOption("--kind <kind>")
    .action(async (environmentId, targetName, options) => {
      const message = unwrapMessage(
        PromoteEnvironmentCommand.create({
          environmentId,
          targetName,
          targetKind: options.kind,
        }),
      );
      if (!message) {
        return;
      }

      await handleBusResult(executeCommand(message));
    });

  const plugins = program.command("plugins").description("Plugin operations");
  plugins.command("list").action(async () => {
    const message = unwrapMessage(ListPluginsQuery.create());
    if (!message) {
      return;
    }

    await handleBusResult(executeQuery(message));
  });

  const providers = program.command("providers").description("Provider operations");
  providers.command("list").action(async () => {
    const message = unwrapMessage(ListProvidersQuery.create());
    if (!message) {
      return;
    }

    await handleBusResult(executeQuery(message));
  });

  return program;
}
