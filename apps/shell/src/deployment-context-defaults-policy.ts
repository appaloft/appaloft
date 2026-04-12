import {
  type DeploymentContextDefaultsDecision,
  type DeploymentContextDefaultsPolicy,
  type DeploymentContextDefaultsPolicyInput,
} from "@yundu/application";
import { type AppConfig } from "@yundu/config";
import { ok } from "@yundu/core";

const localEmbeddedDefaults: DeploymentContextDefaultsDecision = {
  project: {
    mode: "reuse-or-create",
    preset: "local-project",
  },
  server: {
    mode: "reuse-or-create",
    preset: "local-server",
  },
  destination: {
    mode: "reuse-or-create",
    preset: "local-destination",
  },
  environment: {
    mode: "reuse-or-create",
    preset: "local-environment",
  },
  resource: {
    mode: "reuse-or-create",
    preset: "local-resource",
  },
};

const explicitContextRequired: DeploymentContextDefaultsDecision = {
  project: { mode: "required" },
  server: { mode: "required" },
  destination: { mode: "required" },
  environment: { mode: "required" },
  resource: { mode: "required" },
};

export class ShellDeploymentContextDefaultsPolicy implements DeploymentContextDefaultsPolicy {
  constructor(private readonly config: AppConfig) {}

  decide(
    input: DeploymentContextDefaultsPolicyInput,
  ): ReturnType<DeploymentContextDefaultsPolicy["decide"]> {
    if (this.config.runtimeMode === "self-hosted" && this.config.databaseDriver === "pglite") {
      switch (input.requestedDeploymentMethod) {
        case "auto":
        case "dockerfile":
        case "docker-compose":
        case "prebuilt-image":
        case "workspace-commands":
          return ok(localEmbeddedDefaults);
      }
    }

    return ok(explicitContextRequired);
  }
}
