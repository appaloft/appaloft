import { describe, expect, test } from "bun:test";
import {
  RuntimeCommandBuilder,
  dockerLabelsFromAssignments,
  renderRuntimeCommandString,
} from "../src/runtime-commands";

function shellQuote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

describe("runtime command builder", () => {
  test("renders Docker image builds from typed specs", () => {
    const spec = RuntimeCommandBuilder.docker().buildImage({
      image: "yundu-image-dep_1:latest",
      dockerfilePath: "/srv/app/Dockerfile.yundu",
      contextPath: "/srv/app",
    });

    expect(spec.kind).toBe("docker-build-image");
    expect(renderRuntimeCommandString(spec, { quote: shellQuote })).toBe(
      "docker build -t 'yundu-image-dep_1:latest' -f '/srv/app/Dockerfile.yundu' '/srv/app'",
    );
  });

  test("renders Docker container runs with structured env labels ports and network", () => {
    const docker = RuntimeCommandBuilder.docker();
    const spec = docker.runContainer({
      image: "registry.example.com/app:2026-04-16",
      containerName: "yundu-dep_1",
      networkName: "yundu-edge",
      env: [
        { name: "PORT", value: "3000" },
        { name: "DATABASE_URL", value: "postgres://secret", redacted: true },
      ],
      labels: dockerLabelsFromAssignments([
        "yundu.managed=true",
        "yundu.resource-id=res_1",
        "traefik.http.routers.res_1.rule=Host(`demo.test`)",
      ]),
      publishedPorts: [
        docker.publishPort({
          containerPort: 3000,
          mode: "loopback-ephemeral",
        }),
      ],
    });

    expect(spec.kind).toBe("docker-run-container");
    expect(renderRuntimeCommandString(spec, { quote: shellQuote })).toBe(
      [
        "docker run -d --name 'yundu-dep_1'",
        "--network 'yundu-edge'",
        "-p 127.0.0.1::3000",
        "-e 'PORT=3000'",
        "-e 'DATABASE_URL=postgres://secret'",
        "--label 'yundu.managed=true'",
        "--label 'yundu.resource-id=res_1'",
        "--label 'traefik.http.routers.res_1.rule=Host(`demo.test`)'",
        "'registry.example.com/app:2026-04-16'",
      ].join(" "),
    );
    expect(renderRuntimeCommandString(spec, { quote: shellQuote, mode: "display" })).toContain(
      "-e 'DATABASE_URL=[redacted]'",
    );
  });

  test("renders command sequences for SSH rollout steps", () => {
    const docker = RuntimeCommandBuilder.docker();
    const spec = RuntimeCommandBuilder.sequence([
      docker.removeContainer({
        containerName: "yundu-dep_1",
        ignoreMissing: true,
      }),
      docker.removeResourceContainers({
        resourceId: "res_1",
        currentContainerName: "yundu-dep_1",
      }),
      docker.runContainer({
        image: "app:latest",
        containerName: "yundu-dep_1",
        publishedPorts: [docker.publishPort({ containerPort: 8080, mode: "host-same-port" })],
      }),
    ]);

    const command = renderRuntimeCommandString(spec, { quote: shellQuote });

    expect(command).toContain("docker rm -f 'yundu-dep_1' >/dev/null 2>&1 || true");
    expect(command).toContain("docker ps -aq --filter 'label=yundu.resource-id=res_1'");
    expect(command).toContain("docker run -d --name 'yundu-dep_1' -p 8080:8080 'app:latest'");
  });

  test("renders Compose up with an executor working directory", () => {
    const spec = RuntimeCommandBuilder.docker().composeUp({
      composeFile: "/srv/app/docker-compose.yml",
      workingDirectory: "/srv/app",
    });

    expect(renderRuntimeCommandString(spec, { quote: shellQuote })).toBe(
      "cd '/srv/app' && docker compose -f '/srv/app/docker-compose.yml' up -d --build",
    );
  });
});
