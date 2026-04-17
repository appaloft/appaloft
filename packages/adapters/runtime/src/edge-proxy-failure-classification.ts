export const edgeProxyHostPortConflictErrorCode = "edge_proxy_host_port_conflict";

export interface EdgeProxyStartFailureClassification {
  errorCode: string;
  message: string;
  metadata: Record<string, string>;
  retryable: boolean;
}

interface ParsedHostPortConflict {
  bindAddress?: string;
  hostPort?: string;
}

interface ClassifyEdgeProxyStartFailureInput {
  containerName: string;
  defaultErrorCode: string;
  defaultMessage: string;
  networkName: string;
  output: string;
  providerKey: string;
  proxyKind: string;
}

function endpointParts(endpoint: string): ParsedHostPortConflict {
  const trimmed = endpoint.trim();
  const bracketedMatch = trimmed.match(/^\[(?<address>.+)\]:(?<port>\d+)$/);
  const bracketedAddress = bracketedMatch?.groups?.address;
  const bracketedPort = bracketedMatch?.groups?.port;
  if (bracketedAddress && bracketedPort) {
    return {
      bindAddress: bracketedAddress,
      hostPort: bracketedPort,
    };
  }

  const portMatch = trimmed.match(/:(\d+)$/);
  if (!portMatch?.[1]) {
    return {};
  }

  const port = portMatch[1];
  const rawAddress = trimmed.slice(0, -(port.length + 1));
  const bindAddress = rawAddress === "" || rawAddress === "::" ? rawAddress || undefined : rawAddress;

  return {
    ...(bindAddress ? { bindAddress } : {}),
    hostPort: port,
  };
}

function parseHostPortConflict(output: string): ParsedHostPortConflict | undefined {
  const bindForMatch = output.match(/Bind for (?<endpoint>\S+) failed: port is already allocated/i);
  const bindForEndpoint = bindForMatch?.groups?.endpoint;
  if (bindForEndpoint) {
    return endpointParts(bindForEndpoint);
  }

  const listenMatch = output.match(
    /listen tcp[46]?\s+(?<endpoint>\S+): bind: address already in use/i,
  );
  const listenEndpoint = listenMatch?.groups?.endpoint;
  if (listenEndpoint) {
    return endpointParts(listenEndpoint);
  }

  if (/port is already allocated|address already in use/i.test(output)) {
    return {};
  }

  return undefined;
}

export function classifyEdgeProxyStartFailure(
  input: ClassifyEdgeProxyStartFailureInput,
): EdgeProxyStartFailureClassification {
  const baseMetadata = {
    containerName: input.containerName,
    failurePhase: "proxy-container",
    networkName: input.networkName,
    phase: "proxy-container",
    providerKey: input.providerKey,
    proxyKind: input.proxyKind,
  };
  const hostPortConflict = parseHostPortConflict(input.output);

  if (hostPortConflict) {
    const portText = hostPortConflict.hostPort ? ` ${hostPortConflict.hostPort}` : "";

    return {
      errorCode: edgeProxyHostPortConflictErrorCode,
      message: `${input.defaultMessage}: host port${portText} is already allocated`,
      metadata: {
        ...baseMetadata,
        failureReason: "host-port-conflict",
        ...(hostPortConflict.bindAddress ? { bindAddress: hostPortConflict.bindAddress } : {}),
        ...(hostPortConflict.hostPort ? { hostPort: hostPortConflict.hostPort } : {}),
      },
      retryable: true,
    };
  }

  return {
    errorCode: input.defaultErrorCode,
    message: input.defaultMessage,
    metadata: baseMetadata,
    retryable: true,
  };
}
