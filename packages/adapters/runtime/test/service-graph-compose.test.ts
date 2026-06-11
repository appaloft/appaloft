import { describe, expect, test } from "bun:test";
import {
  renderReplicatedWorkloadCompose,
  renderServiceGraphCompose,
} from "../src/service-graph-compose";

describe("repository service graph compose rendering", () => {
  test("[CONFIG-FILE-SERVICE-GRAPH-005] renders one generated image as multiple compose services", () => {
    const compose = renderServiceGraphCompose({
      image: "appaloft-runtime-dep_123",
      dockerfilePath: ".appaloft/Dockerfile.appaloft",
      defaultPort: 3000,
      environment: {
        APPALOFT_DATABASE_URL: "${APPALOFT_DATABASE_URL}",
        APPALOFT_WORKER_COUNT: "4",
      },
      services: [
        {
          name: "web",
          kind: "web",
          runtime: {
            startCommand: "bun run start:web",
          },
          network: {
            internalPort: 3000,
            exposureMode: "reverse-proxy",
          },
          env: {
            NODE_ENV: "production",
          },
        },
        {
          name: "worker",
          kind: "worker",
          runtime: {
            startCommand: "bun run start:worker",
          },
          network: {
            exposureMode: "none",
          },
          replicas: 4,
        },
      ],
    });

    expect(compose).toContain('"web":');
    expect(compose).toContain('image: "appaloft-runtime-dep_123"');
    expect(compose).toContain("build:");
    expect(compose).toContain("context: ..");
    expect(compose).toContain('dockerfile: ".appaloft/Dockerfile.appaloft"');
    expect(compose).toContain('command: "bun run start:web"');
    expect(compose).toContain("expose:");
    expect(compose).toContain('- "3000"');
    expect(compose).toContain('"worker":');
    expect(compose).toContain('command: "bun run start:worker"');
    expect(compose).toContain('"APPALOFT_DATABASE_URL": "${APPALOFT_DATABASE_URL}"');
    expect(compose).toContain('"APPALOFT_WORKER_COUNT": "4"');
    expect(compose).not.toContain("APPALOFT_WORKER_SLOT");
    expect(compose).toContain("replicas: 4");
    expect(compose).not.toContain("ports:");
  });

  test("[CONFIG-FILE-APPLICATION-REPLICAS-001] renders a single workload as replicated compose service", () => {
    const compose = renderReplicatedWorkloadCompose({
      image: "appaloft-runtime-dep_456",
      dockerfilePath: "Dockerfile.worker",
      serviceName: "worker",
      replicas: 4,
      environment: {
        APPALOFT_DATABASE_URL: "${APPALOFT_DATABASE_URL}",
        APPALOFT_DEPLOYMENT_ID: "${APPALOFT_DEPLOYMENT_ID}",
        PORT: "${PORT}",
      },
      includeBuild: true,
    });

    expect(compose).toContain('"worker":');
    expect(compose).toContain('image: "appaloft-runtime-dep_456"');
    expect(compose).toContain("build:");
    expect(compose).toContain("context: ..");
    expect(compose).toContain('dockerfile: "Dockerfile.worker"');
    expect(compose).toContain("environment:");
    expect(compose).toContain('"APPALOFT_DATABASE_URL": "${APPALOFT_DATABASE_URL}"');
    expect(compose).toContain('"APPALOFT_DEPLOYMENT_ID": "${APPALOFT_DEPLOYMENT_ID}"');
    expect(compose).toContain('"PORT": "${PORT}"');
    expect(compose).not.toContain("postgres://");
    expect(compose).toContain("replicas: 4");
    expect(compose).not.toContain("ports:");
  });
});
