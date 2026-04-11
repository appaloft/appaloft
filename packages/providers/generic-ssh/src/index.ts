import { type ProviderDescriptor } from "@yundu/application";

export const genericSshProvider: ProviderDescriptor = {
  key: "generic-ssh",
  title: "Generic SSH",
  category: "deploy-target",
  capabilities: ["remote-command", "file-upload", "single-server"],
};
