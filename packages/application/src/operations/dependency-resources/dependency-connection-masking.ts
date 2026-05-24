import {
  type DependencyResourceEndpointInput,
  domainError,
  err,
  ok,
  type Result,
} from "@appaloft/core";

import { type DependencyResourceKind } from "../../ports";

const sensitiveQueryKeys = new Set([
  "password",
  "pass",
  "token",
  "secret",
  "auth",
  "authorization",
  "cookie",
  "sslcert",
  "sslkey",
  "sslpassword",
  "tlskey",
  "tlscert",
  "access_key",
  "secret_key",
]);

const allowedProtocols = {
  postgres: new Set(["postgres:", "postgresql:"]),
  redis: new Set(["redis:", "rediss:"]),
  mysql: new Set(["mysql:"]),
  clickhouse: new Set(["clickhouse:", "clickhouses:", "http:", "https:"]),
  "object-storage": new Set(["s3:", "minio:", "http:", "https:"]),
  opensearch: new Set(["http:", "https:"]),
} satisfies Record<DependencyResourceKind, Set<string>>;

export function maskDependencyConnectionUrl(input: {
  kind: DependencyResourceKind;
  connectionUrl: string;
}): Result<DependencyResourceEndpointInput> {
  let parsed: URL;
  try {
    parsed = new URL(input.connectionUrl);
  } catch {
    return err(
      domainError.validation("Dependency resource connection URL is invalid", {
        phase: "dependency-resource-validation",
        field: "connectionUrl",
        dependencyKind: input.kind,
      }),
    );
  }

  if (!allowedProtocols[input.kind].has(parsed.protocol)) {
    return err(
      domainError.validation("Dependency resource connection URL scheme is unsupported", {
        phase: "dependency-resource-validation",
        field: "connectionUrl",
        dependencyKind: input.kind,
      }),
    );
  }

  if (!parsed.hostname) {
    return err(
      domainError.validation("Dependency resource connection URL host is required", {
        phase: "dependency-resource-validation",
        field: "connectionUrl",
        dependencyKind: input.kind,
      }),
    );
  }

  const safeQuery = new URLSearchParams();
  for (const [key, value] of parsed.searchParams.entries()) {
    if (!sensitiveQueryKeys.has(key.toLowerCase())) {
      safeQuery.set(key, value);
    }
  }

  const username = parsed.username ? `${decodeURIComponent(parsed.username)}:` : "";
  const password = parsed.password ? "********@" : username ? "@" : "";
  const port = parsed.port ? `:${parsed.port}` : "";
  const databaseName = parsed.pathname.replace(/^\//, "") || undefined;
  const query = safeQuery.toString() ? `?${safeQuery.toString()}` : "";
  const maskedConnection = `${parsed.protocol}//${username}${password}${parsed.hostname}${port}${parsed.pathname}${query}`;

  return ok({
    host: parsed.hostname,
    ...(parsed.port ? { port: Number(parsed.port) } : {}),
    ...(databaseName ? { databaseName: decodeURIComponent(databaseName) } : {}),
    maskedConnection,
  });
}
