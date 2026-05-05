import { describe, expect, test } from "bun:test";
import { createDeploymentInputSchema } from "../src";

describe("deployment create contract", () => {
  test("[SWARM-TARGET-ADM-001] rejects Swarm-specific deployment input fields", () => {
    const parsed = createDeploymentInputSchema.safeParse({
      projectId: "prj_demo",
      serverId: "srv_demo",
      destinationId: "dst_demo",
      environmentId: "env_demo",
      resourceId: "res_demo",
      namespace: "prod",
      stack: "web",
      service: "api",
      replicas: 3,
      updatePolicy: "start-first",
      registrySecret: "resource-secret:REGISTRY_TOKEN",
      ingress: { host: "www.example.com" },
      manifest: { services: {} },
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.code === "unrecognized_keys")).toBe(true);
    }
  });
});
