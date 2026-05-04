import {
  type DependencyResourceEndpointInput,
  domainError,
  err,
  ok,
  type Result,
} from "@appaloft/core";

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
]);

export function maskPostgresConnectionUrl(
  connectionUrl: string,
): Result<DependencyResourceEndpointInput> {
  let parsed: URL;
  try {
    parsed = new URL(connectionUrl);
  } catch {
    return err(
      domainError.validation("Postgres connection URL is invalid", {
        phase: "dependency-resource-validation",
        field: "connectionUrl",
      }),
    );
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    return err(
      domainError.validation("Postgres connection URL must use postgres:// or postgresql://", {
        phase: "dependency-resource-validation",
        field: "connectionUrl",
      }),
    );
  }

  if (!parsed.hostname) {
    return err(
      domainError.validation("Postgres connection URL host is required", {
        phase: "dependency-resource-validation",
        field: "connectionUrl",
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
