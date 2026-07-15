import "../../../application/node_modules/reflect-metadata/Reflect.js";

import { describe, expect, test } from "bun:test";

import {
  composeContainerVerificationWaitOptions,
  waitForComposeDeploymentContainers,
} from "../src/compose-deployment-verification";

describe("Compose deployment verification", () => {
  test("[DEP-CREATE-ASYNC-009A] keeps native health polling when HTTP health is disabled", () => {
    expect(
      composeContainerVerificationWaitOptions({
        enabled: false,
        intervalSeconds: { value: 5 },
        retries: { value: 10 },
      }),
    ).toEqual({ attempts: 10, intervalMs: 5_000 });
  });

  test("[DEP-CREATE-ASYNC-009A] waits for starting native health checks to become healthy", async () => {
    let attempts = 0;
    const result = await waitForComposeDeploymentContainers({
      deploymentId: "dep_candidate",
      targetServiceName: "worker",
      quote: (value) => `'${value}'`,
      attempts: 2,
      intervalMs: 0,
      run: async () => {
        attempts += 1;
        return {
          failed: false,
          stderr: "",
          stdout:
            attempts === 1
              ? 'abc|{"Status":"running","Health":{"Status":"starting"}}|172.18.0.4\n'
              : 'abc|{"Status":"running","Health":{"Status":"healthy"}}|172.18.0.4\n',
        };
      },
    });

    expect(attempts).toBe(2);
    expect(result.verification.status).toBe("ready");
  });
});
