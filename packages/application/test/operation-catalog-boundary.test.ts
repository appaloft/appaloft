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
      "servers.rename",
      "servers.deactivate",
      "servers.delete-check",
      "servers.test-connectivity",
      "resources.create",
      "resources.list",
      "resources.show",
      "resources.health",
      "resources.runtime-logs",
      "resources.proxy-configuration.preview",
      "resources.diagnostic-summary",
      "deployments.create",
      "deployments.list",
      "deployments.show",
      "deployments.plan",
      "deployments.recovery-readiness",
      "deployments.logs",
      "deployments.stream-events",
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
      expect(entry?.transports.orpc, key).toBeDefined();
    }
  });

  test("[WEB-CLI-API-ACCESS-001][WEB-CLI-API-ACCESS-002] route and access observation reads share catalog transports", () => {
    const observationOperationKeys = [
      "resources.show",
      "resources.health",
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

  test("[OP-WORK-CATALOG-001] operator work ledger is exposed as read-only queries", () => {
    const listEntry = operationCatalog.find((candidate) => candidate.key === "operator-work.list");
    const showEntry = operationCatalog.find((candidate) => candidate.key === "operator-work.show");

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
    expect(listEntry?.inputSchema).toBeDefined();
    expect(showEntry?.inputSchema).toBeDefined();
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
