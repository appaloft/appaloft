import { type ProviderDescriptor } from "@appaloft/application";

export const genericSshProvider: ProviderDescriptor = {
  key: "generic-ssh",
  title: "Generic SSH",
  category: "deploy-target",
  capabilities: ["remote-command", "file-upload", "single-server"],
  capabilityDetails: [
    {
      key: "remote-command",
      title: "Remote command execution",
      enabled: true,
      description: "Runs deployment and diagnostic commands over SSH.",
    },
    {
      key: "file-upload",
      title: "File upload",
      enabled: true,
      description: "Uploads source archives and runtime files to SSH targets.",
    },
    {
      key: "single-server",
      title: "Single-server target",
      enabled: true,
      description: "Supports one-server Docker or host-process deployments.",
    },
  ],
  configuration: {
    status: "configured",
    diagnostics: [
      {
        code: "provider.generic_ssh.configured",
        severity: "info",
        message: "Generic SSH uses per-server credentials and requires no global provider secret.",
        documentationHref: "/docs/servers/ssh-credentials/#server-ssh-credential",
      },
    ],
  },
};
