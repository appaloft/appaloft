import { type ProviderDescriptor } from "@appaloft/application";

export const localShellProvider: ProviderDescriptor = {
  key: "local-shell",
  title: "Local Shell",
  category: "deploy-target",
  capabilities: ["local-command", "docker-host", "docker-compose", "single-server"],
  capabilityDetails: [
    {
      key: "local-command",
      title: "Local command execution",
      enabled: true,
      description: "Runs local development and smoke-test commands on the host.",
    },
    {
      key: "docker-host",
      title: "Docker host",
      enabled: true,
      description: "Targets a local Docker host when the runtime adapter is available.",
    },
    {
      key: "docker-compose",
      title: "Docker Compose",
      enabled: true,
      description: "Supports Compose-based local runtime plans.",
    },
    {
      key: "single-server",
      title: "Single-server target",
      enabled: true,
      description: "Supports single-host deployment execution.",
    },
  ],
  configuration: {
    status: "configured",
    diagnostics: [
      {
        code: "provider.local_shell.configured",
        severity: "info",
        message: "Local Shell uses the current host and requires no provider secret.",
      },
    ],
  },
};
