import { describe, expect, test } from "bun:test";
import { classifyEdgeProxyStartFailure } from "../src/edge-proxy-failure-classification";

const baseInput = {
  containerName: "appaloft-traefik",
  defaultErrorCode: "edge_proxy_start_failed",
  defaultMessage: "Traefik edge proxy failed to start",
  networkName: "appaloft-edge",
  providerKey: "traefik",
  proxyKind: "traefik",
};

describe("edge proxy failure classification", () => {
  test("[EDGE-PROXY-RUNTIME-001] maps Docker bind port allocation to a stable host port conflict", () => {
    const failure = classifyEdgeProxyStartFailure({
      ...baseInput,
      output:
        "docker: Error response from daemon: failed to set up container networking: Bind for 0.0.0.0:80 failed: port is already allocated",
    });

    expect(failure).toMatchObject({
      errorCode: "edge_proxy_host_port_conflict",
      message: "Traefik edge proxy failed to start: host port 80 is already allocated",
      retryable: true,
      metadata: {
        bindAddress: "0.0.0.0",
        containerName: "appaloft-traefik",
        failurePhase: "proxy-container",
        failureReason: "host-port-conflict",
        hostPort: "80",
        networkName: "appaloft-edge",
        phase: "proxy-container",
        providerKey: "traefik",
        proxyKind: "traefik",
      },
    });
  });

  test("[EDGE-PROXY-RUNTIME-001] maps IPv6 Docker bind conflicts to the same stable code", () => {
    const failure = classifyEdgeProxyStartFailure({
      ...baseInput,
      output: "Bind for :::443 failed: port is already allocated",
    });

    expect(failure).toMatchObject({
      errorCode: "edge_proxy_host_port_conflict",
      metadata: {
        bindAddress: "::",
        hostPort: "443",
      },
    });
  });
});
