import { type ProviderDescriptor } from "@appaloft/application";

export const tencentProvider: ProviderDescriptor = {
  key: "tencent-cloud",
  title: "Tencent Cloud",
  category: "cloud-provider",
  capabilities: ["cvm", "registry", "future-vpc-integration"],
};
