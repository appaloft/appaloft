import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";
import {
  dockerContainerNetworkIpCommand,
  parseDockerContainerNetworkIp,
  waitForHealth,
  type HealthFetch,
  type HttpHealthCheckOptions,
} from "../src/ssh-execution";
import { selectPublicHealthRoute } from "../src/public-health-route";

const baseOptions: HttpHealthCheckOptions = {
  method: "GET",
  expectedStatusCode: 200,
  intervalMs: 0,
  timeoutMs: 100,
  retries: 1,
  startPeriodMs: 0,
};

describe("public route health checks", () => {
  test("[ROUTE-TLS-ENTRY-023] selects the route owned by the resource health target service", () => {
    const route = selectPublicHealthRoute(
      [
        { pathPrefix: "/v1", targetServiceName: "api" },
        { pathPrefix: "/api", targetServiceName: "api" },
        { pathPrefix: "/", targetServiceName: "web" },
      ],
      "web",
    );

    expect(route).toEqual({ pathPrefix: "/", targetServiceName: "web" });
  });

  test("[ROUTE-TLS-ENTRY-023] falls back to the root served route for legacy route snapshots", () => {
    const route = selectPublicHealthRoute(
      [{ pathPrefix: "/v1" }, { pathPrefix: "/api" }, { pathPrefix: "/" }],
      "web",
    );

    expect(route).toEqual({ pathPrefix: "/" });
  });

  test("[SSH-DOCKER-HEALTH-001] renders Docker network IP lookup for SSH internal health", () => {
    expect(
      dockerContainerNetworkIpCommand({
        containerName: "appaloft-dep_live",
        networkName: "appaloft-edge",
      }),
    ).toBe(
      'docker inspect --format \'{{with index .NetworkSettings.Networks "appaloft-edge"}}{{.IPAddress}}{{end}}\' \'appaloft-dep_live\'',
    );
  });

  test("[SSH-DOCKER-HEALTH-001] parses Docker network IP lookup output", () => {
    expect(parseDockerContainerNetworkIp("\n172.19.0.7\n")).toBe("172.19.0.7");
    expect(parseDockerContainerNetworkIp("\nnot an ip\n")).toBeUndefined();
    expect(parseDockerContainerNetworkIp("\n\n")).toBeUndefined();
  });

  test("[DEP-CREATE-ASYNC-016] classifies TLS certificate verification failures", async () => {
    const result = await waitForHealth("https://preview.example.test/api/health", baseOptions, {
      fetchImpl: async () => {
        throw new Error("unable to verify the first certificate");
      },
    });

    expect(result).toEqual({
      ok: false,
      reason: "unable to verify the first certificate",
      failureKind: "tls-certificate",
    });
  });

  test("[DEP-CREATE-ASYNC-016] accepts untrusted TLS when route reachability is being verified", async () => {
    const calls: Array<{ rejectUnauthorized?: boolean }> = [];
    const fetchImpl: HealthFetch = async (_url, init) => {
      calls.push({ rejectUnauthorized: init.tls?.rejectUnauthorized });
      if (init.tls?.rejectUnauthorized === false) {
        return new Response("ok", { status: 200 });
      }
      throw new Error("unable to verify the first certificate");
    };

    const result = await waitForHealth(
      "https://preview.example.test/api/health",
      { ...baseOptions, tlsVerification: "allow-untrusted" },
      { fetchImpl },
    );

    expect(calls).toEqual([{ rejectUnauthorized: undefined }, { rejectUnauthorized: false }]);
    expect(result).toEqual({
      ok: true,
      tlsVerification: "untrusted",
      strictTlsFailureReason: "unable to verify the first certificate",
    });
  });

  test("[DEP-CREATE-ASYNC-016] keeps HTTP failures visible after an untrusted TLS retry", async () => {
    const fetchImpl: HealthFetch = async (_url, init) => {
      if (init.tls?.rejectUnauthorized === false) {
        return new Response("bad gateway", { status: 502, statusText: "Bad Gateway" });
      }
      throw new Error("unable to verify the first certificate");
    };

    const result = await waitForHealth(
      "https://preview.example.test/api/health",
      { ...baseOptions, tlsVerification: "allow-untrusted" },
      { fetchImpl },
    );

    expect(result).toEqual({
      ok: false,
      failureKind: "http-status",
      reason:
        "unable to verify the first certificate; untrusted TLS retry failed: last response was HTTP 502 Bad Gateway",
    });
  });
});
