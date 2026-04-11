import { type ProviderDescriptor } from "@yundu/application";

export const localShellProvider: ProviderDescriptor = {
  key: "local-shell",
  title: "Local Shell",
  category: "deploy-target",
  capabilities: ["local-command", "docker-host", "docker-compose", "single-server"],
};
