import { type ProviderDescriptor } from "@appaloft/application";

export const aliyunProvider: ProviderDescriptor = {
  key: "aliyun",
  title: "Alibaba Cloud",
  category: "cloud-provider",
  capabilities: ["ecs", "registry", "future-vpc-integration"],
  capabilityDetails: [
    {
      key: "ecs",
      title: "ECS inventory",
      enabled: false,
      description:
        "Planned cloud target discovery; no provider SDK is exposed through Appaloft contracts.",
    },
    {
      key: "registry",
      title: "Container registry",
      enabled: false,
      description: "Planned image registry integration.",
    },
    {
      key: "future-vpc-integration",
      title: "VPC integration",
      enabled: false,
      description: "Reserved for future cloud-network integration.",
    },
  ],
  configuration: {
    status: "not-configured",
    diagnostics: [
      {
        code: "provider.aliyun.deferred",
        severity: "info",
        message: "Alibaba Cloud integration is advertised as planned capability only.",
      },
    ],
  },
};
