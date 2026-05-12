import { type ProviderDescriptor } from "@appaloft/application";

export const tencentProvider: ProviderDescriptor = {
  key: "tencent-cloud",
  title: "Tencent Cloud",
  category: "cloud-provider",
  capabilities: ["cvm", "registry", "future-vpc-integration"],
  capabilityDetails: [
    {
      key: "cvm",
      title: "CVM inventory",
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
        code: "provider.tencent_cloud.deferred",
        severity: "info",
        message: "Tencent Cloud integration is advertised as planned capability only.",
      },
    ],
  },
};
