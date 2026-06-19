import { domainError, err, ok, type Result } from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { InMemoryConnectorRegistry } from "../../extensibility/connector-registry";
import { createDefaultConnectorDefinitions } from "../../extensibility/default-connectors";
import { StaticDnsProviderDiscoveryPort } from "../../extensibility/dns-provider-discovery";
import {
  type ConnectionSnapshot,
  type ConnectorProviderAdapterRegistry,
  type ConnectorRegistry,
  type DnsConnectorZoneSnapshot,
  type DnsProviderDiscoveryPort,
  type DnsRecordRequirementSnapshot,
  type DomainBindingDnsReadiness,
  type DomainBindingReadModel,
  type DomainBindingSummary,
} from "../../ports";
import { tokens } from "../../tokens";
import { type ListConnectionsQueryService } from "../system/list-connections.query-service";
import { type PlanConnectorCapabilityQueryService } from "../system/plan-connector-capability.query-service";
import { type InspectDomainBindingDnsReadinessQueryPayload } from "./inspect-domain-binding-dns-readiness.query";
import { domainBindingDnsRecords } from "./plan-domain-binding-dns.query-service";

@injectable()
export class InspectDomainBindingDnsReadinessQueryService {
  constructor(
    @inject(tokens.domainBindingReadModel)
    private readonly domainBindingReadModel: DomainBindingReadModel,
    @inject(tokens.connectionsQueryService)
    private readonly connectionsQueryService: ListConnectionsQueryService,
    @inject(tokens.connectorProviderAdapterRegistry)
    private readonly adapterRegistry: ConnectorProviderAdapterRegistry,
    @inject(tokens.connectorCapabilityPlanQueryService)
    private readonly connectorPlanQueryService: PlanConnectorCapabilityQueryService,
    @inject(tokens.connectorRegistry)
    private readonly connectorRegistry: ConnectorRegistry = new InMemoryConnectorRegistry(
      createDefaultConnectorDefinitions(),
    ),
    @inject(tokens.dnsProviderDiscoveryPort)
    private readonly dnsProviderDiscovery: DnsProviderDiscoveryPort = new StaticDnsProviderDiscoveryPort(),
  ) {}

  async execute(
    context: ExecutionContext,
    input: InspectDomainBindingDnsReadinessQueryPayload,
  ): Promise<Result<DomainBindingDnsReadiness>> {
    const bindings = await this.domainBindingReadModel.list(toRepositoryContext(context));
    const binding = input.domainBindingId
      ? bindings.find((candidate) => candidate.id === input.domainBindingId)
      : undefined;
    if (input.domainBindingId && !binding) {
      return err(domainError.notFound("DomainBinding", input.domainBindingId));
    }

    const domainName = normalizeDomainName(binding?.domainName ?? input.domainName ?? "");
    const resourceId = binding?.resourceId ?? input.resourceId ?? "";
    const pathPrefix = binding?.pathPrefix ?? input.pathPrefix;
    if (!domainName || !resourceId) {
      return err(
        domainError.validation("Domain binding DNS readiness requires a domain name and resource"),
      );
    }

    const currentDomainBindingId = binding?.id ?? input.domainBindingId;
    const conflict = findRouteConflict(
      bindings,
      currentDomainBindingId
        ? {
            domainBindingId: currentDomainBindingId,
            domainName,
            pathPrefix,
          }
        : {
            domainName,
            pathPrefix,
          },
    );

    const providerDiscovery = await this.inspectDnsProvider(domainName);
    const recommendedConnector = providerDiscovery.recommendedConnectorKey
      ? this.connectorRegistry.findByKey(providerDiscovery.recommendedConnectorKey)
      : null;
    const effectiveConnectorKey = input.connectorKey ?? recommendedConnector?.key;

    const connections = (
      await this.connectionsQueryService.execute(context, {
        category: "dns",
        ...(effectiveConnectorKey ? { connectorKey: effectiveConnectorKey } : {}),
      })
    ).items.filter((connection) => connection.status === "connected");

    const zoneMatch = await this.matchAuthorizedZone(context, domainName, connections);
    const selectedConnector = this.selectedConnectorReadiness({
      ...(input.connectorKey ? { requestedConnectorKey: input.connectorKey } : {}),
      recommendedConnector,
      zoneMatch,
    });
    const records = input.records
      ? ok(input.records as DnsRecordRequirementSnapshot[])
      : binding
        ? domainBindingDnsRecords(binding, input)
        : ok<DnsRecordRequirementSnapshot[]>([]);

    let plan: DomainBindingDnsReadiness["plan"];
    if (conflict.status === "conflict") {
      plan = {
        status: "blocked",
        message: "Domain and path are already used by another active domain binding.",
      };
    } else if (records.isErr()) {
      plan = { status: "error", message: records.error.message };
    } else if (!records.value.length) {
      plan = {
        status: "not-requested",
        message:
          "DNS records were not provided and no existing domain binding target is available.",
      };
    } else if (zoneMatch.status !== "matched") {
      plan = {
        status: "blocked",
        message: missingZoneMessage({
          domainName,
          providerDiscovery,
          connections,
          selectedConnector,
        }),
      };
    } else {
      const connectorKey = zoneMatch.connectorKey;
      const zoneName = zoneMatch.zoneName;
      if (!connectorKey || !zoneName) {
        return err(domainError.invariant("Matched DNS zone is missing connector metadata"));
      }
      const preview = await this.connectorPlanQueryService.execute(context, {
        connectorKey,
        capabilityKey: input.capabilityKey,
        ownerRef: {
          scope: "resource",
          id: resourceId,
        },
        parameters: {
          zoneName,
          records: records.value,
          ...(input.ttl !== undefined ? { ttl: input.ttl } : {}),
          ...(input.proxied !== undefined ? { proxied: input.proxied } : {}),
        },
      });
      plan = preview.isOk()
        ? { status: "ready", preview: preview.value }
        : { status: "error", message: preview.error.message };
    }

    return ok({
      ...(binding?.id ? { domainBindingId: binding.id } : {}),
      resourceId,
      domainName,
      pathPrefix,
      providerDiscovery,
      selectedConnector,
      zoneMatch,
      conflict,
      plan,
      actions: readinessActions({ zoneMatch, conflict, plan, selectedConnector }),
    });
  }

  private async inspectDnsProvider(
    domainName: string,
  ): Promise<DomainBindingDnsReadiness["providerDiscovery"]> {
    const discovery = await this.dnsProviderDiscovery.inspectHostname(domainName);
    const providerDiscovery = discovery.isOk()
      ? discovery.value
      : {
          status: "unavailable" as const,
          hostname: domainName,
          baseDomain: normalizeDomainName(domainName),
          nameservers: [],
          providerId: "unknown",
          providerTitle: "Unknown DNS provider",
          confidence: "unknown" as const,
          message: discovery.error.message,
        };
    const recommendedConnector = this.connectorRegistry.findDnsConnectorForProvider(
      providerDiscovery.providerId,
    );
    return {
      ...providerDiscovery,
      ...(recommendedConnector
        ? {
            recommendedConnectorKey: recommendedConnector.key,
            recommendedConnectorTitle: recommendedConnector.title,
          }
        : {}),
    };
  }

  private selectedConnectorReadiness(input: {
    requestedConnectorKey?: string;
    recommendedConnector: ReturnType<ConnectorRegistry["findByKey"]>;
    zoneMatch: DomainBindingDnsReadiness["zoneMatch"];
  }): DomainBindingDnsReadiness["selectedConnector"] {
    if (input.zoneMatch.status === "matched" && input.zoneMatch.connectorKey) {
      const connector = this.connectorRegistry.findByKey(input.zoneMatch.connectorKey);
      return {
        connectorKey: input.zoneMatch.connectorKey,
        ...(connector?.title ? { title: connector.title } : {}),
        source: "connected-zone",
      };
    }
    if (input.requestedConnectorKey) {
      const connector = this.connectorRegistry.findByKey(input.requestedConnectorKey);
      return {
        connectorKey: input.requestedConnectorKey,
        ...(connector?.title ? { title: connector.title } : {}),
        source: "requested",
      };
    }
    if (input.recommendedConnector) {
      return {
        connectorKey: input.recommendedConnector.key,
        title: input.recommendedConnector.title,
        source: "detected-provider",
      };
    }
    return { source: "none" };
  }

  private async matchAuthorizedZone(
    context: ExecutionContext,
    domainName: string,
    connections: readonly ConnectionSnapshot[],
  ): Promise<DomainBindingDnsReadiness["zoneMatch"]> {
    if (!connections.length) {
      return { status: "no-dns-connections" };
    }

    const candidates: {
      connection: ConnectionSnapshot;
      zone: DnsConnectorZoneSnapshot;
      normalizedZone: string;
    }[] = [];
    for (const connection of connections) {
      const adapter = this.adapterRegistry.findForConnector(connection.connectorKey);
      const zones = adapter?.listZones
        ? await adapter.listZones({
            ownerRef: connection.owner,
            connectorKey: connection.connectorKey,
          })
        : ok<readonly DnsConnectorZoneSnapshot[]>([]);
      if (zones.isErr()) {
        continue;
      }
      for (const zone of zones.value) {
        const normalizedZone = normalizeDomainName(zone.name);
        if (domainMatchesZone(domainName, normalizedZone)) {
          candidates.push({ connection, zone, normalizedZone });
        }
      }
    }

    candidates.sort((left, right) => right.normalizedZone.length - left.normalizedZone.length);
    const best = candidates[0];
    if (!best) {
      return { status: "no-matching-zone" };
    }

    return {
      status: "matched",
      connectorKey: best.connection.connectorKey,
      connectionId: best.connection.id,
      providerKey: best.connection.providerKey,
      ...((best.zone.providerAccountId ?? best.connection.credentialGrant.externalAccountId)
        ? {
            providerAccountId:
              best.zone.providerAccountId ?? best.connection.credentialGrant.externalAccountId,
          }
        : {}),
      zoneName: best.normalizedZone,
    };
  }
}

function findRouteConflict(
  bindings: readonly DomainBindingSummary[],
  input: { domainBindingId?: string; domainName: string; pathPrefix: string },
): DomainBindingDnsReadiness["conflict"] {
  const conflict = bindings.find(
    (binding) =>
      binding.id !== input.domainBindingId &&
      binding.status !== "deleted" &&
      normalizeDomainName(binding.domainName) === input.domainName &&
      binding.pathPrefix === input.pathPrefix,
  );
  if (!conflict) {
    return { status: "available" };
  }
  return {
    status: "conflict",
    conflictingDomainBindingId: conflict.id,
    conflictingResourceId: conflict.resourceId,
    conflictingProjectId: conflict.projectId,
    domainName: conflict.domainName,
    pathPrefix: conflict.pathPrefix,
  };
}

function readinessActions(input: {
  zoneMatch: DomainBindingDnsReadiness["zoneMatch"];
  conflict: DomainBindingDnsReadiness["conflict"];
  plan: DomainBindingDnsReadiness["plan"];
  selectedConnector: DomainBindingDnsReadiness["selectedConnector"];
}): DomainBindingDnsReadiness["actions"] {
  const canApplyDns =
    input.zoneMatch.status === "matched" &&
    input.conflict.status === "available" &&
    input.plan.status === "ready";
  return {
    canApplyDns,
    canConnectProvider:
      input.zoneMatch.status !== "matched" && Boolean(input.selectedConnector.connectorKey),
    canShowManualDns: true,
    ...(!canApplyDns
      ? {
          reason:
            input.conflict.status === "conflict"
              ? "domain-binding-conflict"
              : input.zoneMatch.status !== "matched"
                ? "dns-zone-not-connected"
                : input.plan.status,
        }
      : {}),
  };
}

function missingZoneMessage(input: {
  domainName: string;
  providerDiscovery: DomainBindingDnsReadiness["providerDiscovery"];
  connections: readonly ConnectionSnapshot[];
  selectedConnector: DomainBindingDnsReadiness["selectedConnector"];
}): string {
  if (
    input.selectedConnector.connectorKey &&
    input.connections.some(
      (connection) => connection.connectorKey === input.selectedConnector.connectorKey,
    )
  ) {
    return `The authorized ${input.selectedConnector.title ?? input.providerDiscovery.providerTitle} account does not include ${input.providerDiscovery.baseDomain}.`;
  }
  if (input.providerDiscovery.recommendedConnectorTitle) {
    return `No connected ${input.providerDiscovery.recommendedConnectorTitle} zone covers ${input.domainName}.`;
  }
  if (input.providerDiscovery.status === "detected") {
    return `${input.providerDiscovery.providerTitle} was detected, but automatic DNS is not available for this provider yet.`;
  }
  return "No connected DNS zone covers this domain.";
}

function normalizeDomainName(value: string): string {
  return value.trim().replace(/\.$/, "").toLowerCase();
}

function domainMatchesZone(domainName: string, zoneName: string): boolean {
  return domainName === zoneName || domainName.endsWith(`.${zoneName}`);
}
