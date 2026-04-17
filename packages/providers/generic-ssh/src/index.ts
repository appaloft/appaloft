import { type ProviderDescriptor } from "@appaloft/application";

export const genericSshProvider: ProviderDescriptor = {
  key: "generic-ssh",
  title: "Generic SSH",
  category: "deploy-target",
  capabilities: ["remote-command", "file-upload", "single-server"],
};
