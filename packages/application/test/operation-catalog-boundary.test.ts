import { describe, expect, test } from "bun:test";
import {
  findGenericAggregateMutationOperations,
  type OperationCatalogEntry,
  operationCatalog,
} from "../src/operation-catalog";

const noopToken = Symbol("test");

function catalogEntry(overrides: Partial<OperationCatalogEntry>): OperationCatalogEntry {
  return {
    key: "resources.configure-source",
    kind: "command",
    domain: "resources",
    messageName: "ConfigureResourceSourceCommand",
    handlerName: "ConfigureResourceSourceCommandHandler",
    serviceName: "ConfigureResourceSourceUseCase",
    serviceToken: noopToken,
    transports: {
      cli: "appaloft resource configure-source <resourceId>",
      orpc: { method: "POST", path: "/api/resources/{resourceId}/source" },
    },
    ...overrides,
  };
}

describe("operation catalog aggregate mutation boundary", () => {
  test("[AGG-MUTATION-CATALOG-001] operation catalog exposes no generic aggregate update commands", () => {
    expect(findGenericAggregateMutationOperations(operationCatalog)).toEqual([]);
  });

  test("[MIN-CONSOLE-OPS-001] minimum console loop operations expose CLI and HTTP/oRPC transports", () => {
    const minimumLoopOperationKeys = [
      "projects.create",
      "projects.list",
      "environments.create",
      "environments.list",
      "environments.show",
      "environments.lock",
      "environments.unlock",
      "environments.set-variable",
      "environments.unset-variable",
      "environments.effective-precedence",
      "environments.diff",
      "environments.promote",
      "servers.register",
      "servers.configure-credential",
      "credentials.create-ssh",
      "credentials.list-ssh",
      "servers.list",
      "servers.show",
      "servers.capacity.inspect",
      "operator-work.list",
      "operator-work.show",
      "operator-work.mark-recovered",
      "operator-work.dead-letter",
      "operator-work.cancel",
      "operator-work.retry",
      "servers.rename",
      "servers.deactivate",
      "servers.delete-check",
      "servers.test-connectivity",
      "resources.create",
      "resources.list",
      "resources.show",
      "resources.health",
      "resources.health-history",
      "resources.runtime-logs",
      "resources.proxy-configuration.preview",
      "resources.diagnostic-summary",
      "deployments.create",
      "deployments.list",
      "deployments.show",
      "deployments.plan",
      "deployments.recovery-readiness",
      "deployments.timeline",
      "deployments.timeline.stream",
      "operator-work.stream-events",
    ];
    const catalogEntries: readonly OperationCatalogEntry[] = operationCatalog;
    const entriesByKey = new Map<string, OperationCatalogEntry>(
      catalogEntries.map((entry) => [entry.key, entry]),
    );

    for (const key of minimumLoopOperationKeys) {
      const entry = entriesByKey.get(key);

      expect(entry, key).toBeDefined();
      expect(entry?.inputSchema, key).toBeDefined();
      expect(entry?.transports.cli, key).toBeTruthy();
      expect(entry?.transports.orpc ?? entry?.transports.orpcStream, key).toBeDefined();
    }
  });

  test("[APP-CONN-014] connector catalog operations expose CLI and HTTP/oRPC transports", () => {
    const connectorOperationKeys = [
      "connections.categories.list",
      "connections.catalog.list",
      "connections.list",
      "connections.show",
      "connections.connect.start",
      "connections.connect.callback",
      "connections.capability.plan",
      "connections.capability.accept",
      "connections.capability.apply",
      "connections.revoke",
      "connections.status.show",
    ];
    const entriesByKey = new Map<string, OperationCatalogEntry>(
      operationCatalog.map((entry) => [entry.key, entry]),
    );

    for (const key of connectorOperationKeys) {
      const entry = entriesByKey.get(key);

      expect(entry, key).toBeDefined();
      expect(entry?.domain, key).toBe("connections");
      expect(entry?.transports.cli, key).toBeTruthy();
      expect(entry?.transports.orpc, key).toBeDefined();
    }
  });

  test("[PHASE7-DAY2-MGMT-001] day-two management exit operations expose CLI and HTTP/oRPC transports", () => {
    const dayTwoManagementOperationKeys = [
      "resources.configure-source",
      "resources.configure-runtime",
      "resources.configure-network",
      "resources.configure-access",
      "resources.configure-health",
      "resources.health-history",
      "resources.set-variable",
      "resources.import-variables",
      "resources.unset-variable",
      "resources.effective-config",
      "storage-volumes.create",
      "storage-volumes.list",
      "storage-volumes.show",
      "storage-volumes.rename",
      "storage-volumes.delete",
      "storage-volumes.cleanup-runtime",
      "resources.attach-storage",
      "resources.detach-storage",
      "dependency-resources.provision",
      "dependency-resources.import",
      "dependency-resources.list",
      "dependency-resources.show",
      "dependency-resources.rename",
      "dependency-resources.delete",
      "dependency-resources.create-backup",
      "dependency-resources.list-backups",
      "dependency-resources.show-backup",
      "dependency-resources.restore-backup",
      "dependency-resources.backup-policies.configure",
      "dependency-resources.backup-policies.list",
      "dependency-resources.backup-policies.show",
      "resources.bind-dependency",
      "resources.unbind-dependency",
      "resources.rotate-dependency-binding-secret",
      "resources.list-dependency-bindings",
      "resources.show-dependency-binding",
      "resources.configure-auto-deploy",
      "source-events.list",
      "source-events.show",
      "source-events.prune",
      "deployments.list",
      "deployments.show",
      "deployments.timeline",
      "deployments.timeline.stream",
      "deployments.recovery-readiness",
      "deployments.rollback",
      "deployments.cancel",
      "deployments.archive",
      "deployments.prune",
    ];
    const entriesByKey = new Map<string, OperationCatalogEntry>(
      operationCatalog.map((entry) => [entry.key, entry]),
    );

    for (const key of dayTwoManagementOperationKeys) {
      const entry = entriesByKey.get(key);

      expect(entry, key).toBeDefined();
      expect(entry?.inputSchema, key).toBeDefined();
      expect(entry?.transports.cli, key).toBeTruthy();
      expect(entry?.transports.orpc ?? entry?.transports.orpcStream, key).toBeDefined();
    }
  });

  test("[WEB-CLI-API-ACCESS-001][WEB-CLI-API-ACCESS-002] route and access observation reads share catalog transports", () => {
    const observationOperationKeys = [
      "resources.show",
      "resources.health",
      "resources.health-history",
      "resources.runtime-logs",
      "resources.proxy-configuration.preview",
      "resources.diagnostic-summary",
    ];

    const catalogEntries: readonly OperationCatalogEntry[] = operationCatalog;
    const entriesByKey = new Map<string, OperationCatalogEntry>(
      catalogEntries.map((entry) => [entry.key, entry]),
    );

    for (const key of observationOperationKeys) {
      const entry = entriesByKey.get(key);

      expect(entry, key).toMatchObject({
        kind: "query",
        domain: "resources",
      });
      expect(entry?.inputSchema, key).toBeDefined();
      expect(entry?.transports.cli, key).toBeTruthy();
      expect(entry?.transports.orpc, key).toBeDefined();
    }
  });

  test("[DEPLOY-PLAN-ENTRY-001] deployment plan preview is exposed as a read-only query", () => {
    const entry = operationCatalog.find((candidate) => candidate.key === "deployments.plan");

    expect(entry).toMatchObject({
      kind: "query",
      domain: "deployments",
      messageName: "DeploymentPlanQuery",
      handlerName: "DeploymentPlanQueryHandler",
      serviceName: "DeploymentPlanQueryService",
      transports: {
        cli: "appaloft deployments plan --project <projectId> --environment <environmentId> --resource <resourceId> --server <serverId> [--destination <destinationId>]",
        orpc: { method: "GET", path: "/api/deployments/plan" },
      },
    });
    expect(entry?.inputSchema).toBeDefined();
  });

  test("[DOMAIN-EVENT-RETENTION-004] domain event prune is exposed through catalog transports", () => {
    const entry = operationCatalog.find((candidate) => candidate.key === "domain-events.prune");

    expect(entry).toMatchObject({
      key: "domain-events.prune",
      kind: "command",
      domain: "domain-events",
      messageName: "PruneDomainEventsCommand",
      handlerName: "PruneDomainEventsCommandHandler",
      serviceName: "PruneDomainEventsUseCase",
      transports: {
        cli: "appaloft domain-event prune --before <iso>",
        orpc: { method: "POST", path: "/api/domain-events/prune" },
      },
    });
    expect(entry?.inputSchema).toBeDefined();
  });

  test("[DEP-RES-PROV-ENTRY-001] Dependency provisioning acceptance workflow is cataloged", () => {
    const entriesByKey = new Map<string, OperationCatalogEntry>(
      operationCatalog.map((entry) => [entry.key, entry]),
    );

    expect(entriesByKey.get("dependency-resources.provisioning.plan")).toMatchObject({
      kind: "command",
      messageName: "CreateDependencyResourceProvisioningPlanCommand",
      serviceName: "CreateDependencyResourceProvisioningPlanUseCase",
      transports: {
        cli: "appaloft dependency plan --mode <create|reuse>",
        orpc: { method: "POST", path: "/api/dependency-resources/provisioning/plan" },
      },
    });
    expect(entriesByKey.get("dependency-resources.provisioning.accept")).toMatchObject({
      kind: "command",
      messageName: "AcceptDependencyResourceProvisioningPlanCommand",
      serviceName: "AcceptDependencyResourceProvisioningPlanUseCase",
      transports: {
        cli: "appaloft dependency accept <planId> --acknowledge-mutation",
        orpc: { method: "POST", path: "/api/dependency-resources/provisioning/{planId}/accept" },
      },
    });
    expect(entriesByKey.get("dependency-resources.provisioning.status")).toMatchObject({
      kind: "query",
      messageName: "ShowDependencyResourceProvisioningPlanQuery",
      serviceName: "ShowDependencyResourceProvisioningPlanQueryService",
      transports: {
        cli: "appaloft dependency status <planId>",
        orpc: { method: "GET", path: "/api/dependency-resources/provisioning/{planId}" },
      },
    });
  });

  test("[DEP-RES-NATIVE-009] Dependency provider-native realization reuses stable catalog operations and schemas", () => {
    const catalogEntries: readonly OperationCatalogEntry[] = operationCatalog;
    const entriesByKey = new Map<string, OperationCatalogEntry>(
      catalogEntries.map((entry) => [entry.key, entry]),
    );
    const nativeDependencyOperations = [
      {
        key: "dependency-resources.provision",
        messageName: "ProvisionDependencyResourceCommand",
        serviceName: "ProvisionDependencyResourceUseCase",
        cli: "appaloft dependency provision --kind <kind>",
        orpc: { method: "POST", path: "/api/dependency-resources/provision" },
        sample: {
          kind: "redis",
          projectId: "prj_demo",
          environmentId: "env_demo",
          name: "Managed Redis",
          providerKey: "appaloft-managed-redis",
        },
      },
      {
        key: "resources.bind-dependency",
        messageName: "BindResourceDependencyCommand",
        serviceName: "BindResourceDependencyUseCase",
        cli: "appaloft resource dependency bind <resourceId>",
        orpc: { method: "POST", path: "/api/resources/{resourceId}/dependency-bindings" },
        sample: {
          resourceId: "res_web",
          dependencyResourceId: "rsi_managed_redis",
          targetName: "REDIS_URL",
        },
      },
      {
        key: "dependency-resources.delete",
        messageName: "DeleteDependencyResourceCommand",
        serviceName: "DeleteDependencyResourceUseCase",
        cli: "appaloft dependency delete <dependencyResourceId>",
        orpc: { method: "DELETE", path: "/api/dependency-resources/{dependencyResourceId}" },
        sample: {
          dependencyResourceId: "rsi_managed_redis",
        },
      },
    ];

    for (const operation of nativeDependencyOperations) {
      const entry = entriesByKey.get(operation.key);

      expect(entry, operation.key).toMatchObject({
        kind: "command",
        messageName: operation.messageName,
        serviceName: operation.serviceName,
        transports: {
          cli: operation.cli,
          orpc: operation.orpc,
        },
      });
      expect(entry?.inputSchema, operation.key).toBeDefined();
      const parsed = entry?.inputSchema?.parse({
        ...operation.sample,
        rawConnectionUrl: "redis://:super-secret@managed-redis.redis.internal:6379/0",
        providerResourceHandle: "redis/rsi_managed_redis",
        providerSdkResponse: { password: "super-secret" },
      });
      const serialized = JSON.stringify(parsed);

      expect(serialized).not.toContain("super-secret");
      expect(serialized).not.toContain("providerResourceHandle");
      expect(serialized).not.toContain("providerSdkResponse");
      expect(serialized).not.toContain("rawConnectionUrl");
    }
  });

  test("[SRV-LIFE-ENTRY-012] server delete is exposed through the active operation catalog", () => {
    const entry = operationCatalog.find((candidate) => candidate.key === "servers.delete");

    expect(entry).toMatchObject({
      kind: "command",
      domain: "servers",
      messageName: "DeleteServerCommand",
      handlerName: "DeleteServerCommandHandler",
      serviceName: "DeleteServerUseCase",
      transports: {
        cli: "appaloft server delete <serverId> --confirm <serverId>",
        orpc: { method: "DELETE", path: "/api/servers/{serverId}" },
      },
    });
    expect(entry?.inputSchema).toBeDefined();
  });

  test("[RUNTIME-CAPACITY-INSPECT-001] server capacity inspect is exposed as a read-only query", () => {
    const entry = operationCatalog.find(
      (candidate) => candidate.key === "servers.capacity.inspect",
    );

    expect(entry).toMatchObject({
      kind: "query",
      domain: "servers",
      messageName: "InspectServerCapacityQuery",
      handlerName: "InspectServerCapacityQueryHandler",
      serviceName: "InspectServerCapacityQueryService",
      transports: {
        cli: "appaloft server capacity inspect <serverId>",
        orpc: { method: "GET", path: "/api/servers/{serverId}/capacity" },
      },
    });
    expect(entry?.inputSchema).toBeDefined();
  });

  test("[RT-USAGE-008] runtime usage inspect is exposed as a read-only query", () => {
    const entry = operationCatalog.find((candidate) => candidate.key === "runtime-usage.inspect");

    expect(entry).toMatchObject({
      kind: "query",
      domain: "runtime-usage",
      messageName: "InspectRuntimeUsageQuery",
      handlerName: "InspectRuntimeUsageQueryHandler",
      serviceName: "RuntimeUsageInspectionQueryService",
      transports: {
        cli: "appaloft runtime-usage inspect <scope>",
        orpc: { method: "GET", path: "/api/runtime-usage/inspect" },
      },
    });
    expect(entry?.inputSchema).toBeDefined();
  });

  test("[RT-MON-002][RT-MON-003][RT-MON-006] runtime monitoring operations expose governed transports", () => {
    const samplesEntry = operationCatalog.find(
      (candidate) => candidate.key === "runtime-monitoring.samples.list",
    );
    const rollupEntry = operationCatalog.find(
      (candidate) => candidate.key === "runtime-monitoring.rollup",
    );
    const thresholdConfigureEntry = operationCatalog.find(
      (candidate) => candidate.key === "runtime-monitoring.thresholds.configure",
    );
    const thresholdShowEntry = operationCatalog.find(
      (candidate) => candidate.key === "runtime-monitoring.thresholds.show",
    );

    expect(samplesEntry).toMatchObject({
      kind: "query",
      domain: "runtime-monitoring",
      messageName: "ListRuntimeMonitoringSamplesQuery",
      handlerName: "ListRuntimeMonitoringSamplesQueryHandler",
      serviceName: "RuntimeMonitoringSamplesQueryService",
      transports: {
        cli: "appaloft runtime-monitoring samples <scope> --from <iso> --to <iso>",
        orpc: { method: "GET", path: "/api/runtime-monitoring/samples" },
      },
    });
    expect(samplesEntry?.inputSchema).toBeDefined();

    expect(rollupEntry).toMatchObject({
      kind: "query",
      domain: "runtime-monitoring",
      messageName: "RuntimeMonitoringRollupQuery",
      handlerName: "RuntimeMonitoringRollupQueryHandler",
      serviceName: "RuntimeMonitoringRollupQueryService",
      transports: {
        cli: "appaloft runtime-monitoring rollup <scope> --from <iso> --to <iso> --bucket <bucket>",
        orpc: { method: "GET", path: "/api/runtime-monitoring/rollup" },
      },
    });
    expect(rollupEntry?.inputSchema).toBeDefined();

    expect(thresholdConfigureEntry).toMatchObject({
      kind: "command",
      domain: "runtime-monitoring",
      messageName: "ConfigureRuntimeMonitoringThresholdsCommand",
      handlerName: "ConfigureRuntimeMonitoringThresholdsCommandHandler",
      serviceName: "ConfigureRuntimeMonitoringThresholdsUseCase",
      transports: {
        cli: "appaloft runtime-monitoring thresholds configure <scope> --rule <json>",
        orpc: { method: "POST", path: "/api/runtime-monitoring/thresholds" },
      },
    });
    expect(thresholdConfigureEntry?.inputSchema).toBeDefined();

    expect(thresholdShowEntry).toMatchObject({
      kind: "query",
      domain: "runtime-monitoring",
      messageName: "ShowRuntimeMonitoringThresholdsQuery",
      handlerName: "ShowRuntimeMonitoringThresholdsQueryHandler",
      serviceName: "ShowRuntimeMonitoringThresholdsQueryService",
      transports: {
        cli: "appaloft runtime-monitoring thresholds show <scope>",
        orpc: { method: "GET", path: "/api/runtime-monitoring/thresholds" },
      },
    });
    expect(thresholdShowEntry?.inputSchema).toBeDefined();
  });

  test("[RT-MON-005] timeline events health and diagnostics stay outside runtime monitoring operations", () => {
    const independentObservationOperations = [
      "resources.runtime-logs",
      "deployments.timeline",
      "deployments.timeline.stream",
      "resources.health",
      "resources.health-history",
      "resources.diagnostic-summary",
      "resources.proxy-configuration.preview",
    ];

    for (const key of independentObservationOperations) {
      const entry = operationCatalog.find((candidate) => candidate.key === key);
      expect(entry, key).toBeDefined();
      expect(entry?.domain).not.toBe("runtime-monitoring");
    }

    const runtimeMonitoringEntries = operationCatalog.filter(
      (entry) => entry.domain === "runtime-monitoring",
    );
    expect(
      runtimeMonitoringEntries.filter((entry) =>
        /\b(timeline?|events?|health|diagnostics?|proxy)\b/i.test(
          [entry.key, entry.messageName, entry.serviceName, entry.transports.cli].join(" "),
        ),
      ),
    ).toEqual([]);
  });

  test("[RT-MON-010] runtime monitoring catalog stays below Prometheus and APM scope", () => {
    const runtimeMonitoringEntries = operationCatalog
      .filter((entry) => entry.domain === "runtime-monitoring")
      .map((entry) => entry.key)
      .sort();

    expect(runtimeMonitoringEntries).toEqual([
      "runtime-monitoring.rollup",
      "runtime-monitoring.samples.list",
      "runtime-monitoring.thresholds.configure",
      "runtime-monitoring.thresholds.show",
    ]);

    const forbiddenScopePattern =
      /\b(prometheus|promql|grafana|apm|trace|tracing|dashboard|custom[-.]?metric|alert[-.]?routing|autoscal|quota|billing)\b/i;
    const catalogEntries: readonly OperationCatalogEntry[] = operationCatalog;
    const forbiddenEntries = catalogEntries.filter((entry) =>
      forbiddenScopePattern.test(
        [
          entry.key,
          entry.domain,
          entry.messageName,
          entry.handlerName,
          entry.serviceName,
          entry.transports.cli,
          entry.transports.orpc?.path,
        ].join(" "),
      ),
    );

    expect(forbiddenEntries).toEqual([]);
  });

  test("[OP-WORK-CATALOG-001] operator work ledger exposes queries and lifecycle commands", () => {
    const listEntry = operationCatalog.find((candidate) => candidate.key === "operator-work.list");
    const showEntry = operationCatalog.find((candidate) => candidate.key === "operator-work.show");
    const streamEntry = operationCatalog.find(
      (candidate) => candidate.key === "operator-work.stream-events",
    );
    const markRecoveredEntry = operationCatalog.find(
      (candidate) => candidate.key === "operator-work.mark-recovered",
    );
    const deadLetterEntry = operationCatalog.find(
      (candidate) => candidate.key === "operator-work.dead-letter",
    );
    const cancelEntry = operationCatalog.find(
      (candidate) => candidate.key === "operator-work.cancel",
    );
    const retryEntry = operationCatalog.find(
      (candidate) => candidate.key === "operator-work.retry",
    );
    const pruneEntry = operationCatalog.find(
      (candidate) => candidate.key === "operator-work.prune",
    );

    expect(listEntry).toMatchObject({
      kind: "query",
      domain: "operator-work",
      messageName: "ListOperatorWorkQuery",
      handlerName: "ListOperatorWorkQueryHandler",
      serviceName: "OperatorWorkQueryService",
      transports: {
        cli: "appaloft work list",
        orpc: { method: "GET", path: "/api/operator-work" },
      },
    });
    expect(showEntry).toMatchObject({
      kind: "query",
      domain: "operator-work",
      messageName: "ShowOperatorWorkQuery",
      handlerName: "ShowOperatorWorkQueryHandler",
      serviceName: "OperatorWorkQueryService",
      transports: {
        cli: "appaloft work show <workId>",
        orpc: { method: "GET", path: "/api/operator-work/{workId}" },
      },
    });
    expect(streamEntry).toMatchObject({
      kind: "query",
      domain: "operator-work",
      messageName: "StreamOperatorWorkEventsQuery",
      handlerName: "StreamOperatorWorkEventsQueryHandler",
      serviceName: "StreamOperatorWorkEventsQueryService",
      transports: {
        cli: "appaloft work events <workId>",
        orpc: { method: "GET", path: "/api/operator-work/{workId}/events" },
        orpcStream: { method: "GET", path: "/api/operator-work/{workId}/events/stream" },
      },
    });
    expect(markRecoveredEntry).toMatchObject({
      kind: "command",
      domain: "operator-work",
      messageName: "MarkOperatorWorkRecoveredCommand",
      handlerName: "MarkOperatorWorkRecoveredCommandHandler",
      serviceName: "MarkOperatorWorkRecoveredUseCase",
      transports: {
        cli: "appaloft work mark-recovered <workId>",
        orpc: { method: "POST", path: "/api/operator-work/{workId}/mark-recovered" },
      },
    });
    expect(deadLetterEntry).toMatchObject({
      kind: "command",
      domain: "operator-work",
      messageName: "DeadLetterOperatorWorkCommand",
      handlerName: "DeadLetterOperatorWorkCommandHandler",
      serviceName: "DeadLetterOperatorWorkUseCase",
      transports: {
        cli: "appaloft work dead-letter <workId>",
        orpc: { method: "POST", path: "/api/operator-work/{workId}/dead-letter" },
      },
    });
    expect(cancelEntry).toMatchObject({
      kind: "command",
      domain: "operator-work",
      messageName: "CancelOperatorWorkCommand",
      handlerName: "CancelOperatorWorkCommandHandler",
      serviceName: "CancelOperatorWorkUseCase",
      transports: {
        cli: "appaloft work cancel <workId>",
        orpc: { method: "POST", path: "/api/operator-work/{workId}/cancel" },
      },
    });
    expect(retryEntry).toMatchObject({
      kind: "command",
      domain: "operator-work",
      messageName: "RetryOperatorWorkCommand",
      handlerName: "RetryOperatorWorkCommandHandler",
      serviceName: "RetryOperatorWorkUseCase",
      transports: {
        cli: "appaloft work retry <workId>",
        orpc: { method: "POST", path: "/api/operator-work/{workId}/retry" },
      },
    });
    expect(pruneEntry).toMatchObject({
      kind: "command",
      domain: "operator-work",
      messageName: "PruneOperatorWorkCommand",
      handlerName: "PruneOperatorWorkCommandHandler",
      serviceName: "PruneOperatorWorkUseCase",
      transports: {
        cli: "appaloft work prune --before <iso>",
        orpc: { method: "POST", path: "/api/operator-work/prune" },
      },
    });
    expect(listEntry?.inputSchema).toBeDefined();
    expect(showEntry?.inputSchema).toBeDefined();
    expect(streamEntry?.inputSchema).toBeDefined();
    expect(markRecoveredEntry?.inputSchema).toBeDefined();
    expect(deadLetterEntry?.inputSchema).toBeDefined();
    expect(cancelEntry?.inputSchema).toBeDefined();
    expect(retryEntry?.inputSchema).toBeDefined();
    expect(pruneEntry?.inputSchema).toBeDefined();
  });

  test("[SRV-LIFE-ENTRY-015] server rename is exposed through the active operation catalog", () => {
    const entry = operationCatalog.find((candidate) => candidate.key === "servers.rename");

    expect(entry).toMatchObject({
      kind: "command",
      domain: "servers",
      messageName: "RenameServerCommand",
      handlerName: "RenameServerCommandHandler",
      serviceName: "RenameServerUseCase",
      transports: {
        cli: "appaloft server rename <serverId> --name <name>",
        orpc: { method: "POST", path: "/api/servers/{serverId}/rename" },
      },
    });
    expect(entry?.inputSchema).toBeDefined();
  });

  test("[SRV-LIFE-ENTRY-019] server edge proxy configure is exposed through the active operation catalog", () => {
    const entry = operationCatalog.find(
      (candidate) => candidate.key === "servers.configure-edge-proxy",
    );

    expect(entry).toMatchObject({
      kind: "command",
      domain: "servers",
      messageName: "ConfigureServerEdgeProxyCommand",
      handlerName: "ConfigureServerEdgeProxyCommandHandler",
      serviceName: "ConfigureServerEdgeProxyUseCase",
      transports: {
        cli: "appaloft server proxy configure <serverId> --kind none|traefik|caddy",
        orpc: { method: "POST", path: "/api/servers/{serverId}/edge-proxy/configuration" },
      },
    });
    expect(entry?.inputSchema).toBeDefined();
  });

  test("[DEF-ACCESS-ENTRY-007] default access policy readback is exposed through the active operation catalog", () => {
    const listEntry = operationCatalog.find(
      (candidate) => candidate.key === "default-access-domain-policies.list",
    );
    const showEntry = operationCatalog.find(
      (candidate) => candidate.key === "default-access-domain-policies.show",
    );

    expect(listEntry).toMatchObject({
      kind: "query",
      domain: "default-access-domain-policies",
      messageName: "ListDefaultAccessDomainPoliciesQuery",
      handlerName: "ListDefaultAccessDomainPoliciesQueryHandler",
      serviceName: "ListDefaultAccessDomainPoliciesQueryService",
      transports: {
        cli: "appaloft default-access list",
        orpc: { method: "GET", path: "/api/default-access-domain-policies" },
      },
    });
    expect(showEntry).toMatchObject({
      kind: "query",
      domain: "default-access-domain-policies",
      messageName: "ShowDefaultAccessDomainPolicyQuery",
      handlerName: "ShowDefaultAccessDomainPolicyQueryHandler",
      serviceName: "ShowDefaultAccessDomainPolicyQueryService",
      transports: {
        cli: "appaloft default-access show --scope system|deployment-target [--server <serverId>]",
        orpc: { method: "GET", path: "/api/default-access-domain-policies/show" },
      },
    });
    expect(listEntry?.inputSchema).toBeDefined();
    expect(showEntry?.inputSchema).toBeDefined();
  });

  test("[SSH-CRED-ENTRY-001] reusable SSH credential detail is exposed through the active operation catalog", () => {
    const entry = operationCatalog.find((candidate) => candidate.key === "credentials.show");

    expect(entry).toMatchObject({
      kind: "query",
      domain: "credentials",
      messageName: "ShowSshCredentialQuery",
      handlerName: "ShowSshCredentialQueryHandler",
      serviceName: "ShowSshCredentialQueryService",
      transports: {
        cli: "appaloft server credential-show <credentialId>",
        orpc: { method: "GET", path: "/api/credentials/ssh/{credentialId}" },
      },
    });
    expect(entry?.inputSchema).toBeDefined();
  });

  test("[SSH-CRED-ENTRY-006] reusable SSH credential delete is exposed through the active operation catalog", () => {
    const entry = operationCatalog.find((candidate) => candidate.key === "credentials.delete-ssh");

    expect(entry).toMatchObject({
      kind: "command",
      domain: "credentials",
      messageName: "DeleteSshCredentialCommand",
      handlerName: "DeleteSshCredentialCommandHandler",
      serviceName: "DeleteSshCredentialUseCase",
      transports: {
        cli: "appaloft server credential-delete <credentialId> --confirm <credentialId>",
        orpc: { method: "DELETE", path: "/api/credentials/ssh/{credentialId}" },
      },
    });
    expect(entry?.inputSchema).toBeDefined();
  });

  test("[SSH-CRED-ENTRY-011] reusable SSH credential rotate is exposed through the active operation catalog", () => {
    const entry = operationCatalog.find((candidate) => candidate.key === "credentials.rotate-ssh");

    expect(entry).toMatchObject({
      kind: "command",
      domain: "credentials",
      messageName: "RotateSshCredentialCommand",
      handlerName: "RotateSshCredentialCommandHandler",
      serviceName: "RotateSshCredentialUseCase",
      transports: {
        cli: "appaloft server credential-rotate <credentialId> --private-key-file <path> --confirm <credentialId>",
        orpc: { method: "POST", path: "/api/credentials/ssh/{credentialId}/rotate" },
      },
    });
    expect(entry?.inputSchema).toBeDefined();
  });

  test("[ENV-PRECEDENCE-ENTRY-001] environment effective precedence is exposed through the active operation catalog", () => {
    const entry = operationCatalog.find(
      (candidate) => candidate.key === "environments.effective-precedence",
    );

    expect(entry).toMatchObject({
      kind: "query",
      domain: "environments",
      messageName: "EnvironmentEffectivePrecedenceQuery",
      handlerName: "EnvironmentEffectivePrecedenceQueryHandler",
      serviceName: "EnvironmentEffectivePrecedenceQueryService",
      transports: {
        cli: "appaloft env effective-precedence <environmentId>",
        orpc: { method: "GET", path: "/api/environments/{environmentId}/effective-precedence" },
      },
    });
    expect(entry?.inputSchema).toBeDefined();
  });

  test("[ENV-LIFE-RENAME-ENTRY-004] environment rename is exposed through the active operation catalog", () => {
    const entry = operationCatalog.find((candidate) => candidate.key === "environments.rename");

    expect(entry).toMatchObject({
      kind: "command",
      domain: "environments",
      messageName: "RenameEnvironmentCommand",
      handlerName: "RenameEnvironmentCommandHandler",
      serviceName: "RenameEnvironmentUseCase",
      transports: {
        cli: "appaloft env rename <environmentId> --name <name>",
        orpc: { method: "POST", path: "/api/environments/{environmentId}/rename" },
      },
    });
    expect(entry?.inputSchema).toBeDefined();
  });

  test("[ENV-LIFE-ENTRY-004] environment archive is exposed through the active operation catalog", () => {
    const entry = operationCatalog.find((candidate) => candidate.key === "environments.archive");

    expect(entry).toMatchObject({
      kind: "command",
      domain: "environments",
      messageName: "ArchiveEnvironmentCommand",
      handlerName: "ArchiveEnvironmentCommandHandler",
      serviceName: "ArchiveEnvironmentUseCase",
      transports: {
        cli: "appaloft env archive <environmentId>",
        orpc: { method: "POST", path: "/api/environments/{environmentId}/archive" },
      },
    });
    expect(entry?.inputSchema).toBeDefined();
  });

  test("[ENV-LIFE-CLONE-ENTRY-004] environment clone is exposed through the active operation catalog", () => {
    const entry = operationCatalog.find((candidate) => candidate.key === "environments.clone");

    expect(entry).toMatchObject({
      kind: "command",
      domain: "environments",
      messageName: "CloneEnvironmentCommand",
      handlerName: "CloneEnvironmentCommandHandler",
      serviceName: "CloneEnvironmentUseCase",
      transports: {
        cli: "appaloft env clone <environmentId> --name <targetName>",
        orpc: { method: "POST", path: "/api/environments/{environmentId}/clone" },
      },
    });
    expect(entry?.inputSchema).toBeDefined();
  });

  test("[RES-PROFILE-ENTRY-010] resource access profile configure is exposed through the active operation catalog", () => {
    const entry = operationCatalog.find(
      (candidate) => candidate.key === "resources.configure-access",
    );

    expect(entry).toMatchObject({
      kind: "command",
      domain: "resources",
      messageName: "ConfigureResourceAccessCommand",
      handlerName: "ConfigureResourceAccessCommandHandler",
      serviceName: "ConfigureResourceAccessUseCase",
      transports: {
        cli: "appaloft resource configure-access <resourceId>",
        orpc: { method: "POST", path: "/api/resources/{resourceId}/access-profile" },
      },
    });
    expect(entry?.inputSchema).toBeDefined();
  });

  test("[SRC-AUTO-ENTRY-001] resource auto-deploy configure is exposed through the active operation catalog", () => {
    const entry = operationCatalog.find(
      (candidate) => candidate.key === "resources.configure-auto-deploy",
    );

    expect(entry).toMatchObject({
      kind: "command",
      domain: "resources",
      messageName: "ConfigureResourceAutoDeployCommand",
      handlerName: "ConfigureResourceAutoDeployCommandHandler",
      serviceName: "ConfigureResourceAutoDeployUseCase",
      transports: {
        cli: "appaloft resource auto-deploy <resourceId>",
        orpc: { method: "POST", path: "/api/resources/{resourceId}/auto-deploy" },
      },
    });
    expect(entry?.inputSchema).toBeDefined();
  });

  test("[SRC-AUTO-QUERY-001][SRC-AUTO-QUERY-002][SRC-AUTO-REPLAY-002][SRC-AUTO-PRUNE-003] source event operations are exposed through the active operation catalog", () => {
    const listEntry = operationCatalog.find((candidate) => candidate.key === "source-events.list");
    const showEntry = operationCatalog.find((candidate) => candidate.key === "source-events.show");
    const replayEntry = operationCatalog.find(
      (candidate) => candidate.key === "source-events.replay",
    );
    const pruneEntry = operationCatalog.find(
      (candidate) => candidate.key === "source-events.prune",
    );

    expect(listEntry).toMatchObject({
      kind: "query",
      domain: "source-events",
      messageName: "ListSourceEventsQuery",
      handlerName: "ListSourceEventsQueryHandler",
      serviceName: "ListSourceEventsQueryService",
      transports: {
        cli: "appaloft source-event list --resource <resourceId> | --project <projectId>",
        orpc: { method: "GET", path: "/api/source-events" },
      },
    });
    expect(showEntry).toMatchObject({
      kind: "query",
      domain: "source-events",
      messageName: "ShowSourceEventQuery",
      handlerName: "ShowSourceEventQueryHandler",
      serviceName: "ShowSourceEventQueryService",
      transports: {
        cli: "appaloft source-event show <sourceEventId> --resource <resourceId> | --project <projectId>",
        orpc: { method: "GET", path: "/api/source-events/{sourceEventId}" },
      },
    });
    expect(replayEntry).toMatchObject({
      kind: "command",
      domain: "source-events",
      messageName: "ReplaySourceEventCommand",
      handlerName: "ReplaySourceEventCommandHandler",
      serviceName: "ReplaySourceEventUseCase",
      transports: {
        cli: "appaloft source-event replay <sourceEventId> --resource <resourceId> | --project <projectId>",
        orpc: { method: "POST", path: "/api/source-events/{sourceEventId}/replay" },
      },
    });
    expect(pruneEntry).toMatchObject({
      kind: "command",
      domain: "source-events",
      messageName: "PruneSourceEventsCommand",
      handlerName: "PruneSourceEventsCommandHandler",
      serviceName: "PruneSourceEventsUseCase",
      transports: {
        cli: "appaloft source-event prune --before <iso>",
        orpc: { method: "POST", path: "/api/source-events/prune" },
      },
    });
    expect(listEntry?.inputSchema).toBeDefined();
    expect(showEntry?.inputSchema).toBeDefined();
    expect(replayEntry?.inputSchema).toBeDefined();
    expect(pruneEntry?.inputSchema).toBeDefined();
  });

  test("[AUDIT-EVENT-CATALOG-001] audit event reads are exposed through the active operation catalog", () => {
    const listEntry = operationCatalog.find((candidate) => candidate.key === "audit-events.list");
    const showEntry = operationCatalog.find((candidate) => candidate.key === "audit-events.show");
    const globalExportEntry = operationCatalog.find(
      (candidate) => candidate.key === "audit-events.export-global",
    );
    const configureHoldEntry = operationCatalog.find(
      (candidate) => candidate.key === "audit-events.legal-holds.configure",
    );
    const listHoldsEntry = operationCatalog.find(
      (candidate) => candidate.key === "audit-events.legal-holds.list",
    );
    const showHoldEntry = operationCatalog.find(
      (candidate) => candidate.key === "audit-events.legal-holds.show",
    );
    const releaseHoldEntry = operationCatalog.find(
      (candidate) => candidate.key === "audit-events.legal-holds.release",
    );
    const createArchiveEntry = operationCatalog.find(
      (candidate) => candidate.key === "audit-events.archives.create",
    );
    const listArchivesEntry = operationCatalog.find(
      (candidate) => candidate.key === "audit-events.archives.list",
    );
    const showArchiveEntry = operationCatalog.find(
      (candidate) => candidate.key === "audit-events.archives.show",
    );
    const pruneArchivesEntry = operationCatalog.find(
      (candidate) => candidate.key === "audit-events.archives.prune",
    );

    expect(listEntry).toMatchObject({
      kind: "query",
      domain: "audit-events",
      messageName: "ListAuditEventsQuery",
      handlerName: "ListAuditEventsQueryHandler",
      serviceName: "ListAuditEventsQueryService",
      transports: {
        cli: "appaloft audit-event list --aggregate <aggregateId>",
        orpc: { method: "GET", path: "/api/audit-events" },
      },
    });
    expect(showEntry).toMatchObject({
      kind: "query",
      domain: "audit-events",
      messageName: "ShowAuditEventQuery",
      handlerName: "ShowAuditEventQueryHandler",
      serviceName: "ShowAuditEventQueryService",
      transports: {
        cli: "appaloft audit-event show <auditEventId> --aggregate <aggregateId>",
        orpc: { method: "GET", path: "/api/audit-events/{auditEventId}" },
      },
    });
    expect(globalExportEntry).toMatchObject({
      kind: "query",
      domain: "audit-events",
      messageName: "ExportGlobalAuditEventsQuery",
      handlerName: "ExportGlobalAuditEventsQueryHandler",
      serviceName: "ExportGlobalAuditEventsQueryService",
      transports: {
        cli: "appaloft audit-event export-global --from <iso> --to <iso>",
        orpc: { method: "GET", path: "/api/audit-events/export-global" },
      },
    });
    expect(configureHoldEntry).toMatchObject({
      kind: "command",
      domain: "audit-events",
      messageName: "ConfigureAuditEventLegalHoldCommand",
      handlerName: "ConfigureAuditEventLegalHoldCommandHandler",
      serviceName: "ConfigureAuditEventLegalHoldUseCase",
      transports: {
        cli: "appaloft audit-event legal-hold configure",
        orpc: { method: "POST", path: "/api/audit-events/legal-holds" },
      },
    });
    expect(listHoldsEntry).toMatchObject({
      kind: "query",
      domain: "audit-events",
      messageName: "ListAuditEventLegalHoldsQuery",
      handlerName: "ListAuditEventLegalHoldsQueryHandler",
      serviceName: "ListAuditEventLegalHoldsQueryService",
      transports: {
        cli: "appaloft audit-event legal-hold list",
        orpc: { method: "GET", path: "/api/audit-events/legal-holds" },
      },
    });
    expect(showHoldEntry).toMatchObject({
      kind: "query",
      domain: "audit-events",
      messageName: "ShowAuditEventLegalHoldQuery",
      handlerName: "ShowAuditEventLegalHoldQueryHandler",
      serviceName: "ShowAuditEventLegalHoldQueryService",
      transports: {
        cli: "appaloft audit-event legal-hold show <holdId>",
        orpc: { method: "GET", path: "/api/audit-events/legal-holds/{holdId}" },
      },
    });
    expect(releaseHoldEntry).toMatchObject({
      kind: "command",
      domain: "audit-events",
      messageName: "ReleaseAuditEventLegalHoldCommand",
      handlerName: "ReleaseAuditEventLegalHoldCommandHandler",
      serviceName: "ReleaseAuditEventLegalHoldUseCase",
      transports: {
        cli: "appaloft audit-event legal-hold release <holdId>",
        orpc: { method: "POST", path: "/api/audit-events/legal-holds/{holdId}/release" },
      },
    });
    expect(createArchiveEntry).toMatchObject({
      kind: "command",
      domain: "audit-events",
      messageName: "CreateAuditEventArchiveCommand",
      handlerName: "CreateAuditEventArchiveCommandHandler",
      serviceName: "CreateAuditEventArchiveUseCase",
      transports: {
        cli: "appaloft audit-event archive create",
        orpc: { method: "POST", path: "/api/audit-events/archives" },
      },
    });
    expect(listArchivesEntry).toMatchObject({
      kind: "query",
      domain: "audit-events",
      messageName: "ListAuditEventArchivesQuery",
      handlerName: "ListAuditEventArchivesQueryHandler",
      serviceName: "ListAuditEventArchivesQueryService",
      transports: {
        cli: "appaloft audit-event archive list",
        orpc: { method: "GET", path: "/api/audit-events/archives" },
      },
    });
    expect(showArchiveEntry).toMatchObject({
      kind: "query",
      domain: "audit-events",
      messageName: "ShowAuditEventArchiveQuery",
      handlerName: "ShowAuditEventArchiveQueryHandler",
      serviceName: "ShowAuditEventArchiveQueryService",
      transports: {
        cli: "appaloft audit-event archive show <archiveId>",
        orpc: { method: "GET", path: "/api/audit-events/archives/{archiveId}" },
      },
    });
    expect(pruneArchivesEntry).toMatchObject({
      kind: "command",
      domain: "audit-events",
      messageName: "PruneAuditEventArchivesCommand",
      handlerName: "PruneAuditEventArchivesCommandHandler",
      serviceName: "PruneAuditEventArchivesUseCase",
      transports: {
        cli: "appaloft audit-event archive prune --before <iso>",
        orpc: { method: "POST", path: "/api/audit-events/archives/prune" },
      },
    });
    expect(listEntry?.inputSchema).toBeDefined();
    expect(showEntry?.inputSchema).toBeDefined();
    expect(globalExportEntry?.inputSchema).toBeDefined();
    expect(configureHoldEntry?.inputSchema).toBeDefined();
    expect(listHoldsEntry?.inputSchema).toBeDefined();
    expect(showHoldEntry?.inputSchema).toBeDefined();
    expect(releaseHoldEntry?.inputSchema).toBeDefined();
    expect(createArchiveEntry?.inputSchema).toBeDefined();
    expect(listArchivesEntry?.inputSchema).toBeDefined();
    expect(showArchiveEntry?.inputSchema).toBeDefined();
    expect(pruneArchivesEntry?.inputSchema).toBeDefined();
  });

  test("[SRC-AUTO-ENTRY-002][SRC-AUTO-ENTRY-004] source event ingest exposes governed HTTP routes", () => {
    const entry = operationCatalog.find((candidate) => candidate.key === "source-events.ingest");

    expect(entry).toMatchObject({
      kind: "command",
      domain: "source-events",
      messageName: "IngestSourceEventCommand",
      handlerName: "IngestSourceEventCommandHandler",
      serviceName: "IngestSourceEventUseCase",
      transports: {
        orpc: {
          method: "POST",
          path: "/api/resources/{resourceId}/source-events/generic-signed",
        },
        orpcAdditional: [
          {
            method: "POST",
            path: "/api/integrations/github/source-events",
          },
        ],
      },
    });
    expect(entry?.inputSchema).toBeDefined();
  });

  test("[RES-PROFILE-CONFIG-019] resource variable import is exposed through the active operation catalog", () => {
    const entry = operationCatalog.find(
      (candidate) => candidate.key === "resources.import-variables",
    );

    expect(entry).toMatchObject({
      kind: "command",
      domain: "resources",
      messageName: "ImportResourceVariablesCommand",
      handlerName: "ImportResourceVariablesCommandHandler",
      serviceName: "ImportResourceVariablesUseCase",
      transports: {
        cli: "appaloft resource import-variables <resourceId> --content <dotenv>",
        orpc: { method: "POST", path: "/api/resources/{resourceId}/variables/import" },
      },
    });
    expect(entry?.inputSchema).toBeDefined();
  });

  test("[ENV-LIFE-ENTRY-006] environment lock and unlock are exposed through the active operation catalog", () => {
    const lockEntry = operationCatalog.find((candidate) => candidate.key === "environments.lock");
    const unlockEntry = operationCatalog.find(
      (candidate) => candidate.key === "environments.unlock",
    );

    expect(lockEntry).toMatchObject({
      kind: "command",
      domain: "environments",
      messageName: "LockEnvironmentCommand",
      handlerName: "LockEnvironmentCommandHandler",
      serviceName: "LockEnvironmentUseCase",
      transports: {
        cli: "appaloft env lock <environmentId>",
        orpc: { method: "POST", path: "/api/environments/{environmentId}/lock" },
      },
    });
    expect(unlockEntry).toMatchObject({
      kind: "command",
      domain: "environments",
      messageName: "UnlockEnvironmentCommand",
      handlerName: "UnlockEnvironmentCommandHandler",
      serviceName: "UnlockEnvironmentUseCase",
      transports: {
        cli: "appaloft env unlock <environmentId>",
        orpc: { method: "POST", path: "/api/environments/{environmentId}/unlock" },
      },
    });
    expect(lockEntry?.inputSchema).toBeDefined();
    expect(unlockEntry?.inputSchema).toBeDefined();
  });

  test("[AGG-MUTATION-CATALOG-002] detects generic aggregate update operation keys and command names", () => {
    const violations = findGenericAggregateMutationOperations([
      catalogEntry({
        key: "resources.update",
        messageName: "UpdateResourceCommand",
        handlerName: "UpdateResourceCommandHandler",
        serviceName: "UpdateResourceUseCase",
      }),
    ]);

    expect(violations).toEqual([
      { key: "resources.update", field: "key", value: "resources.update" },
      { key: "resources.update", field: "messageName", value: "UpdateResourceCommand" },
      { key: "resources.update", field: "handlerName", value: "UpdateResourceCommandHandler" },
      { key: "resources.update", field: "serviceName", value: "UpdateResourceUseCase" },
    ]);
  });

  test("[AGG-MUTATION-CATALOG-003] detects generic update transport names and paths", () => {
    const violations = findGenericAggregateMutationOperations([
      catalogEntry({
        key: "resources.configure-source",
        transports: {
          cli: "appaloft resource update <resourceId>",
          orpc: { method: "POST", path: "/api/resources/{resourceId}/update" },
          orpcStream: { method: "POST", path: "/api/resources/{resourceId}/patch/stream" },
        },
      }),
    ]);

    expect(violations).toEqual([
      {
        key: "resources.configure-source",
        field: "transports.cli",
        value: "appaloft resource update <resourceId>",
      },
      {
        key: "resources.configure-source",
        field: "transports.orpc.path",
        value: "/api/resources/{resourceId}/update",
      },
      {
        key: "resources.configure-source",
        field: "transports.orpcStream.path",
        value: "/api/resources/{resourceId}/patch/stream",
      },
    ]);
  });
});
