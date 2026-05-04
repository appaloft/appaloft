import { describe, expect, test } from "bun:test";
import {
  type Command as AppCommand,
  type Query as AppQuery,
  type CommandBus,
  type ExecutionContextFactory,
  type QueryBus,
} from "@appaloft/application";
import { ok } from "@appaloft/core";

function ensureReflectMetadata(): void {
  const reflectObject = Reflect as typeof Reflect & {
    defineMetadata?: (...args: unknown[]) => void;
    getMetadata?: (...args: unknown[]) => unknown;
    getOwnMetadata?: (...args: unknown[]) => unknown;
    hasMetadata?: (...args: unknown[]) => boolean;
    metadata?: (_metadataKey: unknown, _metadataValue: unknown) => ClassDecorator;
  };

  reflectObject.defineMetadata ??= () => {};
  reflectObject.getMetadata ??= () => undefined;
  reflectObject.getOwnMetadata ??= () => undefined;
  reflectObject.hasMetadata ??= () => false;
  reflectObject.metadata ??= () => () => {};
}

async function createCommandCaptureHarness(requestId: string) {
  ensureReflectMetadata();
  const { createExecutionContext } = await import("@appaloft/application");
  const { createCliProgram } = await import("../src");
  const commands: AppCommand<unknown>[] = [];
  const queries: AppQuery<unknown>[] = [];
  const commandBus = {
    execute: async <T>(_context: unknown, command: AppCommand<T>) => {
      commands.push(command as AppCommand<unknown>);
      return ok({ id: "res_demo" } as T);
    },
  } as unknown as CommandBus;
  const queryBus = {
    execute: async <T>(_context: unknown, query: AppQuery<T>) => {
      queries.push(query as AppQuery<unknown>);
      return ok({} as T);
    },
  } as unknown as QueryBus;
  const executionContextFactory: ExecutionContextFactory = {
    create: (input) =>
      createExecutionContext({
        ...input,
        requestId,
      }),
  };
  const program = createCliProgram({
    version: "0.1.0-test",
    startServer: async () => {},
    commandBus,
    queryBus,
    executionContextFactory,
  });

  return { commands, queries, program };
}

async function parseCli(program: { parseAsync(args: string[]): Promise<unknown> }, args: string[]) {
  const writeStdout = process.stdout.write;
  try {
    process.stdout.write = (() => true) as typeof process.stdout.write;
    await program.parseAsync(args);
  } finally {
    process.stdout.write = writeStdout;
  }
}

async function parseCliWithOutput(
  program: { parseAsync(args: string[]): Promise<unknown> },
  args: string[],
): Promise<string> {
  let output = "";
  const writeStdout = process.stdout.write;
  try {
    process.stdout.write = ((
      chunk: string | Uint8Array,
      encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
      callback?: (error?: Error | null) => void,
    ) => {
      output += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString();
      const done = typeof encodingOrCallback === "function" ? encodingOrCallback : callback;
      done?.();
      return true;
    }) as typeof process.stdout.write;
    await program.parseAsync(args);
    return output;
  } finally {
    process.stdout.write = writeStdout;
  }
}

describe("CLI resource commands", () => {
  test("[RES-PROFILE-ENTRY-003] resource configure-runtime dispatches the application command", async () => {
    ensureReflectMetadata();
    const { ConfigureResourceRuntimeCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "res_demo" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_resource_runtime_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "resource",
        "configure-runtime",
        "res_demo",
        "--strategy",
        "dockerfile",
        "--install-command",
        "bun install",
        "--build-command",
        "bun run build",
        "--start-command",
        "bun run start",
        "--runtime-name",
        "preview-123",
        "--dockerfile-path",
        "docker/Dockerfile",
        "--build-target",
        "runner",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(ConfigureResourceRuntimeCommand);
    expect(commands[0]).toMatchObject({
      resourceId: "res_demo",
      runtimeProfile: {
        strategy: "dockerfile",
        installCommand: "bun install",
        buildCommand: "bun run build",
        startCommand: "bun run start",
        runtimeName: "preview-123",
        dockerfilePath: "docker/Dockerfile",
        buildTarget: "runner",
      },
    });
  });

  test("[RES-PROFILE-ENTRY-003] resource archive dispatches the application command", async () => {
    ensureReflectMetadata();
    const { ArchiveResourceCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "res_demo" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_resource_archive_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "resource",
        "archive",
        "res_demo",
        "--reason",
        "Retired after migration",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(ArchiveResourceCommand);
    expect(commands[0]).toMatchObject({
      resourceId: "res_demo",
      reason: "Retired after migration",
    });
  });

  test("[RES-PROFILE-ENTRY-010] resource configure-access dispatches the application command", async () => {
    ensureReflectMetadata();
    const { ConfigureResourceAccessCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "res_demo" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_resource_access_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "resource",
        "configure-access",
        "res_demo",
        "--generated-access",
        "disabled",
        "--path-prefix",
        "/internal",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(ConfigureResourceAccessCommand);
    expect(commands[0]).toMatchObject({
      resourceId: "res_demo",
      accessProfile: {
        generatedAccessMode: "disabled",
        pathPrefix: "/internal",
      },
    });
  });

  test("[RES-PROFILE-ENTRY-003] resource configure-source dispatches the application command", async () => {
    const { ConfigureResourceSourceCommand } = await import("@appaloft/application");
    const { commands, program } = await createCommandCaptureHarness("req_cli_resource_source_test");

    await parseCli(program, [
      "node",
      "appaloft",
      "resource",
      "configure-source",
      "res_demo",
      "--kind",
      "git-public",
      "--locator",
      "https://github.com/appaloft/demo",
      "--display-name",
      "demo repo",
      "--git-ref",
      "main",
      "--base-directory",
      "apps/web",
    ]);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(ConfigureResourceSourceCommand);
    expect(commands[0]).toMatchObject({
      resourceId: "res_demo",
      source: {
        kind: "git-public",
        locator: "https://github.com/appaloft/demo",
        displayName: "demo repo",
        gitRef: "main",
        baseDirectory: "apps/web",
      },
    });
  });

  test("[RES-PROFILE-ENTRY-003] resource configure-network dispatches the application command", async () => {
    const { ConfigureResourceNetworkCommand } = await import("@appaloft/application");
    const { commands, program } = await createCommandCaptureHarness(
      "req_cli_resource_network_test",
    );

    await parseCli(program, [
      "node",
      "appaloft",
      "resource",
      "configure-network",
      "res_demo",
      "--internal-port",
      "8080",
      "--upstream-protocol",
      "http",
      "--exposure-mode",
      "reverse-proxy",
      "--target-service",
      "web",
    ]);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(ConfigureResourceNetworkCommand);
    expect(commands[0]).toMatchObject({
      resourceId: "res_demo",
      networkProfile: {
        internalPort: 8080,
        upstreamProtocol: "http",
        exposureMode: "reverse-proxy",
        targetServiceName: "web",
      },
    });
  });

  test("[RES-PROFILE-ENTRY-003] resource configure-health dispatches the application command", async () => {
    const { ConfigureResourceHealthCommand } = await import("@appaloft/application");
    const { commands, program } = await createCommandCaptureHarness("req_cli_resource_health_test");

    await parseCli(program, [
      "node",
      "appaloft",
      "resource",
      "configure-health",
      "res_demo",
      "--path",
      "/ready",
      "--expected-status",
      "204",
      "--interval",
      "7",
      "--timeout",
      "3",
      "--retries",
      "4",
      "--start-period",
      "2",
    ]);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(ConfigureResourceHealthCommand);
    expect(commands[0]).toMatchObject({
      resourceId: "res_demo",
      healthCheck: {
        enabled: true,
        type: "http",
        intervalSeconds: 7,
        timeoutSeconds: 3,
        retries: 4,
        startPeriodSeconds: 2,
        http: {
          method: "GET",
          scheme: "http",
          host: "localhost",
          path: "/ready",
          expectedStatusCode: 204,
        },
      },
    });
  });

  test("[RES-PROFILE-ENTRY-003] resource set-variable dispatches the application command", async () => {
    ensureReflectMetadata();
    const { SetResourceVariableCommand, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "res_demo" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_resource_set_variable_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "resource",
        "set-variable",
        "res_demo",
        "DATABASE_URL",
        "postgres://resource",
        "--kind",
        "secret",
        "--exposure",
        "runtime",
        "--secret",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(SetResourceVariableCommand);
    expect(commands[0]).toMatchObject({
      resourceId: "res_demo",
      key: "DATABASE_URL",
      value: "postgres://resource",
      kind: "secret",
      exposure: "runtime",
      isSecret: true,
    });
  });

  test("[RES-PROFILE-ENTRY-003] resource unset-variable dispatches the application command", async () => {
    const { UnsetResourceVariableCommand } = await import("@appaloft/application");
    const { commands, program } = await createCommandCaptureHarness(
      "req_cli_resource_unset_variable_test",
    );

    await parseCli(program, [
      "node",
      "appaloft",
      "resource",
      "unset-variable",
      "res_demo",
      "DATABASE_URL",
      "--exposure",
      "runtime",
    ]);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(UnsetResourceVariableCommand);
    expect(commands[0]).toMatchObject({
      resourceId: "res_demo",
      key: "DATABASE_URL",
      exposure: "runtime",
    });
  });

  test("[RES-PROFILE-ENTRY-015] resource import-variables dispatches the application command", async () => {
    const { ImportResourceVariablesCommand } = await import("@appaloft/application");
    const { commands, program } = await createCommandCaptureHarness(
      "req_cli_resource_import_variables_test",
    );

    await parseCli(program, [
      "node",
      "appaloft",
      "resource",
      "import-variables",
      "res_demo",
      "--content",
      "DATABASE_URL=postgres://secret",
      "--exposure",
      "runtime",
    ]);

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(ImportResourceVariablesCommand);
    expect(commands[0]).toMatchObject({
      resourceId: "res_demo",
      content: "DATABASE_URL=postgres://secret",
      exposure: "runtime",
    });
  });

  test("[RES-PROFILE-ENTRY-003] resource effective-config dispatches the application query", async () => {
    ensureReflectMetadata();
    const { ResourceEffectiveConfigQuery, createExecutionContext } = await import(
      "@appaloft/application"
    );
    const { createCliProgram } = await import("../src");
    const queries: AppQuery<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, _command: AppCommand<T>) => ok({} as T),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);
        return ok({
          schemaVersion: "resources.effective-config/v1",
          resourceId: "res_demo",
          environmentId: "env_demo",
          ownedEntries: [],
          effectiveEntries: [],
          precedence: [
            "defaults",
            "system",
            "organization",
            "project",
            "environment",
            "resource",
            "deployment",
          ],
          generatedAt: "2026-01-01T00:00:00.000Z",
        } as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_resource_effective_config_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync(["node", "appaloft", "resource", "effective-config", "res_demo"]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ResourceEffectiveConfigQuery);
    expect(queries[0]).toMatchObject({
      resourceId: "res_demo",
    });
  });

  test("[WEB-CLI-API-ACCESS-002] resource health dispatches the shared resource health query", async () => {
    const { ResourceHealthQuery } = await import("@appaloft/application");
    const { program, queries } = await createCommandCaptureHarness("req_cli_resource_health_test");

    await parseCli(program, [
      "node",
      "appaloft",
      "resource",
      "health",
      "res_demo",
      "--live",
      "--checks",
      "--public-access-probe",
      "--runtime-probe",
    ]);

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ResourceHealthQuery);
    expect(queries[0]).toMatchObject({
      resourceId: "res_demo",
      mode: "live",
      includeChecks: true,
      includePublicAccessProbe: true,
      includeRuntimeProbe: true,
    });
  });

  test("[WEB-CLI-API-ACCESS-002] resource proxy-config dispatches the shared proxy preview query", async () => {
    const { ResourceProxyConfigurationPreviewQuery } = await import("@appaloft/application");
    const { program, queries } = await createCommandCaptureHarness("req_cli_resource_proxy_test");

    await parseCli(program, [
      "node",
      "appaloft",
      "resource",
      "proxy-config",
      "res_demo",
      "--deployment",
      "dep_demo",
      "--scope",
      "deployment-snapshot",
      "--diagnostics",
    ]);

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ResourceProxyConfigurationPreviewQuery);
    expect(queries[0]).toMatchObject({
      resourceId: "res_demo",
      deploymentId: "dep_demo",
      routeScope: "deployment-snapshot",
      includeDiagnostics: true,
    });
  });

  test("[WEB-CLI-API-ACCESS-002] resource diagnose dispatches the shared diagnostic summary query", async () => {
    const { ResourceDiagnosticSummaryQuery } = await import("@appaloft/application");
    const { program, queries } = await createCommandCaptureHarness(
      "req_cli_resource_diagnose_test",
    );

    await parseCli(program, [
      "node",
      "appaloft",
      "resource",
      "diagnose",
      "res_demo",
      "--deployment",
      "dep_demo",
      "--deployment-logs",
      "--runtime-logs",
      "--proxy-configuration",
      "--tail",
      "7",
    ]);

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ResourceDiagnosticSummaryQuery);
    expect(queries[0]).toMatchObject({
      resourceId: "res_demo",
      deploymentId: "dep_demo",
      includeDeploymentLogTail: true,
      includeRuntimeLogTail: true,
      includeProxyConfiguration: true,
      tailLines: 7,
    });
  });

  test("[RES-ACCESS-DIAG-EVIDENCE-001] resource access-failure dispatches request-id lookup query", async () => {
    const { ResourceAccessFailureEvidenceLookupQuery } = await import("@appaloft/application");
    const { program, queries } = await createCommandCaptureHarness(
      "req_cli_resource_access_failure_test",
    );

    await parseCli(program, [
      "node",
      "appaloft",
      "resource",
      "access-failure",
      "req_access_timeout",
      "--resource",
      "res_web",
      "--host",
      "web.example.test",
      "--path",
      "/private",
    ]);

    expect(queries).toHaveLength(1);
    expect(queries[0]).toBeInstanceOf(ResourceAccessFailureEvidenceLookupQuery);
    expect(queries[0]).toMatchObject({
      requestId: "req_access_timeout",
      resourceId: "res_web",
      hostname: "web.example.test",
      path: "/private",
    });
  });

  test("[WEB-CLI-API-ACCESS-005] CLI JSON output preserves shared access/proxy/health/diagnostic route context", async () => {
    ensureReflectMetadata();
    const {
      ResourceDiagnosticSummaryQuery,
      ResourceHealthQuery,
      ResourceProxyConfigurationPreviewQuery,
      ShowDomainBindingQuery,
      ShowResourceQuery,
      createExecutionContext,
    } = await import("@appaloft/application");
    const { createCliProgram } = await import("../src");
    const queries: AppQuery<unknown>[] = [];
    const generatedRoute = {
      url: "https://generated.example.test",
      hostname: "generated.example.test",
      scheme: "https",
      providerKey: "sslip",
      deploymentId: "dep_generated",
      deploymentStatus: "succeeded",
      pathPrefix: "/",
      proxyKind: "traefik",
      targetPort: 3000,
      updatedAt: "2026-01-01T00:00:05.000Z",
    };
    const serverAppliedRoute = {
      url: "https://server-applied.example.test",
      hostname: "server-applied.example.test",
      scheme: "https",
      deploymentId: "dep_server_applied",
      deploymentStatus: "succeeded",
      pathPrefix: "/",
      proxyKind: "traefik",
      targetPort: 3000,
      updatedAt: "2026-01-01T00:00:06.000Z",
    };
    const durableRoute = {
      url: "https://durable.example.test",
      hostname: "durable.example.test",
      scheme: "https",
      providerKey: "traefik",
      deploymentId: "dep_durable",
      deploymentStatus: "succeeded",
      pathPrefix: "/",
      proxyKind: "traefik",
      targetPort: 3000,
      updatedAt: "2026-01-01T00:00:07.000Z",
    };
    const routeIntentStatus = {
      schemaVersion: "route-intent-status/v1",
      routeId: "durable_domain_binding:durable.example.test:/:dep_durable",
      diagnosticId: "durable_domain_binding:durable.example.test:/:dep_durable",
      source: "durable-domain-binding",
      intent: {
        host: "durable.example.test",
        pathPrefix: "/",
        protocol: "https",
        routeBehavior: "serve",
      },
      context: {
        resourceId: "res_demo",
        deploymentId: "dep_durable",
        serverId: "srv_demo",
        destinationId: "dst_demo",
      },
      proxy: {
        intent: "required",
        applied: "ready",
        providerKey: "traefik",
      },
      domainVerification: "verified",
      tls: "active",
      runtimeHealth: "unknown",
      latestObservation: {
        source: "resource-access-summary",
        observedAt: "2026-01-01T00:00:07.000Z",
        deploymentId: "dep_durable",
      },
      recommendedAction: "none",
      copySafeSummary: {
        status: "available",
        message: "Route access is available according to the latest route observation.",
      },
    };
    const latestAccessFailure = {
      schemaVersion: "resource-access-failure/v1",
      requestId: "req_access_timeout",
      generatedAt: "2026-01-01T00:00:08.000Z",
      code: "resource_access_upstream_timeout",
      category: "timeout",
      phase: "upstream-connection",
      httpStatus: 504,
      retriable: true,
      ownerHint: "resource",
      nextAction: "check-health",
      affected: {
        url: "https://durable.example.test/private",
        hostname: "durable.example.test",
        path: "/private",
        method: "GET",
      },
      route: {
        resourceId: "res_demo",
        deploymentId: "dep_durable",
        domainBindingId: "dmb_ready",
        serverId: "srv_demo",
        destinationId: "dst_demo",
        providerKey: "traefik",
        routeId: "route_durable",
        routeSource: "durable-domain",
        routeStatus: "ready",
      },
      causeCode: "resource_public_access_probe_failed",
    };
    const commandBus = {
      execute: async <T>(_context: unknown, _command: AppCommand<T>) => ok({} as T),
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, query: AppQuery<T>) => {
        queries.push(query as AppQuery<unknown>);

        if (query instanceof ShowResourceQuery) {
          return ok({
            schemaVersion: "resources.show/v1",
            resource: {
              id: "res_demo",
              projectId: "prj_demo",
              environmentId: "env_demo",
              destinationId: "dst_demo",
              name: "Web",
              slug: "web",
              kind: "application",
              createdAt: "2026-01-01T00:00:00.000Z",
              services: [],
              deploymentCount: 1,
            },
            accessSummary: {
              latestGeneratedAccessRoute: generatedRoute,
              latestServerAppliedDomainRoute: serverAppliedRoute,
              latestDurableDomainRoute: durableRoute,
              proxyRouteStatus: "ready",
              lastRouteRealizationDeploymentId: "dep_durable",
              latestAccessFailureDiagnostic: latestAccessFailure,
            },
            lifecycle: { status: "active" },
            diagnostics: [],
            generatedAt: "2026-01-01T00:00:10.000Z",
          } as T);
        }

        if (query instanceof ResourceHealthQuery) {
          return ok({
            schemaVersion: "resources.health/v1",
            resourceId: "res_demo",
            generatedAt: "2026-01-01T00:00:10.000Z",
            overall: "degraded",
            publicAccess: {
              status: "failed",
              url: durableRoute.url,
              kind: "durable-domain",
              routeIntentStatus,
              latestAccessFailure,
            },
            checks: [],
            sourceErrors: [],
          } as T);
        }

        if (query instanceof ResourceProxyConfigurationPreviewQuery) {
          return ok({
            resourceId: "res_demo",
            providerKey: "traefik",
            routeScope: "latest",
            status: "applied",
            generatedAt: "2026-01-01T00:00:10.000Z",
            lastAppliedDeploymentId: "dep_durable",
            stale: false,
            routes: [
              {
                hostname: durableRoute.hostname,
                scheme: durableRoute.scheme,
                url: durableRoute.url,
                pathPrefix: "/",
                tlsMode: "auto",
                targetPort: 3000,
                source: "domain-binding",
              },
              {
                hostname: serverAppliedRoute.hostname,
                scheme: serverAppliedRoute.scheme,
                url: serverAppliedRoute.url,
                pathPrefix: "/",
                tlsMode: "auto",
                targetPort: 3000,
                source: "server-applied",
              },
              {
                hostname: generatedRoute.hostname,
                scheme: generatedRoute.scheme,
                url: generatedRoute.url,
                pathPrefix: "/",
                tlsMode: "auto",
                targetPort: 3000,
                source: "generated-default",
              },
            ],
            sections: [],
            warnings: [],
          } as T);
        }

        if (query instanceof ResourceDiagnosticSummaryQuery) {
          return ok({
            schemaVersion: "resources.diagnostic-summary/v1",
            generatedAt: "2026-01-01T00:00:10.000Z",
            focus: { resourceId: "res_demo", deploymentId: "dep_durable" },
            context: {
              projectId: "prj_demo",
              environmentId: "env_demo",
              resourceName: "Web",
              resourceSlug: "web",
              resourceKind: "application",
              destinationId: "dst_demo",
              serverId: "srv_demo",
              services: [],
            },
            access: {
              status: "failed",
              generatedUrl: generatedRoute.url,
              durableUrl: durableRoute.url,
              serverAppliedUrl: serverAppliedRoute.url,
              selectedRoute: routeIntentStatus,
              routeIntentStatuses: [routeIntentStatus],
              proxyRouteStatus: "ready",
              latestAccessFailure,
              reasonCode: latestAccessFailure.code,
              phase: latestAccessFailure.phase,
            },
            proxy: {
              status: "available",
              providerKey: "traefik",
              proxyRouteStatus: "ready",
              configurationIncluded: true,
              configurationStatus: "applied",
              configurationGeneratedAt: "2026-01-01T00:00:10.000Z",
              routeCount: 3,
              sectionCount: 0,
            },
            deploymentLogs: { status: "not-requested", tailLimit: 20, lineCount: 0, lines: [] },
            runtimeLogs: { status: "not-requested", tailLimit: 20, lineCount: 0, lines: [] },
            system: { entrypoint: "cli", requestId: "req_cli_access_regression_test" },
            sourceErrors: [],
            redaction: {
              policy: "deployment-environment-secrets",
              masked: false,
              maskedValueCount: 0,
            },
            copy: {
              json: JSON.stringify({
                generatedUrl: generatedRoute.url,
                durableUrl: durableRoute.url,
                serverAppliedUrl: serverAppliedRoute.url,
                selectedRoute: routeIntentStatus.source,
                latestAccessFailure: latestAccessFailure.requestId,
              }),
            },
          } as T);
        }

        if (query instanceof ShowDomainBindingQuery) {
          return ok({
            binding: {
              id: "dmb_ready",
              projectId: "prj_demo",
              environmentId: "env_demo",
              resourceId: "res_demo",
              serverId: "srv_demo",
              destinationId: "dst_demo",
              domainName: "durable.example.test",
              pathPrefix: "/",
              proxyKind: "traefik",
              tlsMode: "auto",
              certificatePolicy: "auto",
              status: "ready",
              verificationAttemptCount: 1,
              createdAt: "2026-01-01T00:00:00.000Z",
            },
            routeReadiness: {
              status: "ready",
              routeBehavior: "serve",
              selectedRoute: routeIntentStatus,
              contextRoutes: [routeIntentStatus],
            },
            generatedAccessFallback: generatedRoute,
            proxyReadiness: "ready",
            certificates: [],
            deleteSafety: {
              domainBindingId: "dmb_ready",
              safeToDelete: true,
              blockers: [],
              warnings: [],
              preservesGeneratedAccess: true,
              preservesDeploymentSnapshots: true,
              preservesServerAppliedRouteAudit: true,
            },
          } as T);
        }

        return ok({} as T);
      },
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_access_regression_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const outputs = [
      await parseCliWithOutput(program, ["node", "appaloft", "resource", "show", "res_demo"]),
      await parseCliWithOutput(program, ["node", "appaloft", "resource", "health", "res_demo"]),
      await parseCliWithOutput(program, [
        "node",
        "appaloft",
        "resource",
        "proxy-config",
        "res_demo",
        "--diagnostics",
      ]),
      await parseCliWithOutput(program, [
        "node",
        "appaloft",
        "resource",
        "diagnose",
        "res_demo",
        "--proxy-configuration",
      ]),
      await parseCliWithOutput(program, [
        "node",
        "appaloft",
        "domain-binding",
        "show",
        "dmb_ready",
      ]),
    ].join("\n");

    expect(outputs).toContain("https://generated.example.test");
    expect(outputs).toContain("https://server-applied.example.test");
    expect(outputs).toContain("https://durable.example.test");
    expect(outputs).toContain('"source": "domain-binding"');
    expect(outputs).toContain('"source": "server-applied"');
    expect(outputs).toContain('"source": "generated-default"');
    expect(outputs).toContain('"kind": "durable-domain"');
    expect(outputs).toContain('"source": "durable-domain-binding"');
    expect(outputs).toContain('"requestId": "req_access_timeout"');
    expect(outputs).toContain('"proxyReadiness": "ready"');
    expect(outputs).not.toContain("ssh-private-key");
    expect(outputs).not.toContain("Authorization");
    expect(outputs).not.toContain("Cookie");
    expect(queries.some((query) => query instanceof ShowResourceQuery)).toBe(true);
    expect(queries.some((query) => query instanceof ResourceHealthQuery)).toBe(true);
    expect(queries.some((query) => query instanceof ResourceProxyConfigurationPreviewQuery)).toBe(
      true,
    );
    expect(queries.some((query) => query instanceof ResourceDiagnosticSummaryQuery)).toBe(true);
    expect(queries.some((query) => query instanceof ShowDomainBindingQuery)).toBe(true);
  });

  test("[RES-PROFILE-ENTRY-006] resource delete dispatches the application command", async () => {
    ensureReflectMetadata();
    const { DeleteResourceCommand, createExecutionContext } = await import("@appaloft/application");
    const { createCliProgram } = await import("../src");
    const commands: AppCommand<unknown>[] = [];
    const commandBus = {
      execute: async <T>(_context: unknown, command: AppCommand<T>) => {
        commands.push(command as AppCommand<unknown>);
        return ok({ id: "res_demo" } as T);
      },
    } as unknown as CommandBus;
    const queryBus = {
      execute: async <T>(_context: unknown, _query: AppQuery<T>) => ok({} as T),
    } as unknown as QueryBus;
    const executionContextFactory: ExecutionContextFactory = {
      create: (input) =>
        createExecutionContext({
          ...input,
          requestId: "req_cli_resource_delete_test",
        }),
    };
    const program = createCliProgram({
      version: "0.1.0-test",
      startServer: async () => {},
      commandBus,
      queryBus,
      executionContextFactory,
    });

    const writeStdout = process.stdout.write;
    try {
      process.stdout.write = (() => true) as typeof process.stdout.write;
      await program.parseAsync([
        "node",
        "appaloft",
        "resource",
        "delete",
        "res_demo",
        "--confirm-slug",
        "web",
      ]);
    } finally {
      process.stdout.write = writeStdout;
    }

    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(DeleteResourceCommand);
    expect(commands[0]).toMatchObject({
      resourceId: "res_demo",
      confirmation: {
        resourceSlug: "web",
      },
    });
  });
});
