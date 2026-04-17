import { type ProviderDescriptor } from "@appaloft/application";

export const aliyunProvider: ProviderDescriptor = {
  key: "aliyun",
  title: "Alibaba Cloud",
  category: "cloud-provider",
  capabilities: ["ecs", "registry", "future-vpc-integration"],
};
