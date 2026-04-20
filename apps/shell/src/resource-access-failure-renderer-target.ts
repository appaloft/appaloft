import { type ResourceAccessFailureRendererTarget } from "@appaloft/application";
import { type AppConfig } from "@appaloft/config";

function isWildcardHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === "0.0.0.0" || normalized === "::" || normalized === "[::]";
}

function validPort(port: number | undefined): number | null {
  return port !== undefined && Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

export function resourceAccessFailureRendererTargetForStartedServer(input: {
  config: AppConfig;
  actualPort?: number;
}): ResourceAccessFailureRendererTarget | undefined {
  if (input.config.resourceAccessFailureRendererUrl) {
    return { url: input.config.resourceAccessFailureRendererUrl };
  }

  const port = validPort(input.actualPort) ?? validPort(input.config.httpPort);
  if (port === null || !isWildcardHost(input.config.httpHost)) {
    return undefined;
  }

  return {
    url: `http://host.docker.internal:${port}`,
  };
}
