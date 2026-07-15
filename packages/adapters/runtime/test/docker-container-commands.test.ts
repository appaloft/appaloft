import { describe, expect, test } from "bun:test";
import {
  dockerContainerLabelFlags,
  dockerDeploymentContainerVerificationCommand,
  dockerPublishedPortFlag,
  dockerRemoveConflictingRouteContainersCommand,
  dockerRemoveResourceContainersCommand,
  parseDockerPublishedHostPort,
  parseDockerDeploymentContainerVerification,
  appaloftDockerContainerLabels,
} from "../src/docker-container-commands";

function quote(input: string): string {
  return `'${input}'`;
}

describe("docker container command helpers", () => {
  test("publishes direct-port resources on their configured host port", () => {
    expect(dockerPublishedPortFlag({ containerPort: 3000, exposureMode: "direct-port" })).toBe(
      "-p 3000:3000",
    );
    expect(
      dockerPublishedPortFlag({
        containerPort: 3001,
        exposureMode: "direct-port",
        hostPort: 80,
      }),
    ).toBe("-p 80:3001");
  });

  test("publishes reverse-proxy resources on a loopback ephemeral host port", () => {
    expect(dockerPublishedPortFlag({ containerPort: 3000, exposureMode: "reverse-proxy" })).toBe(
      "-p 127.0.0.1::3000",
    );
    expect(dockerPublishedPortFlag({ containerPort: 3000 })).toBe("-p 127.0.0.1::3000");
  });

  test("scopes cleanup to containers for the same resource", () => {
    const command = dockerRemoveResourceContainersCommand({
      resourceId: "res_first",
      deploymentIds: ["dep_previous"],
      quote,
    });

    expect(command).toContain("--filter 'label=appaloft.resource-id=res_first'");
    expect(command).toContain("--filter 'label=appaloft.deployment-id=dep_previous'");
    expect(command).not.toContain("publish=3000");
  });

  test("[DEP-CREATE-ASYNC-009A] scopes Compose verification to the deployment target service", () => {
    const command = dockerDeploymentContainerVerificationCommand({
      deploymentId: "dep_candidate",
      targetServiceName: "web",
      quote,
    });

    expect(command).toContain("--filter 'label=appaloft.deployment-id=dep_candidate'");
    expect(command).toContain("--filter 'label=com.docker.compose.service=web'");
    expect(command).toContain("{{json .State}}");
  });

  test("[DEP-CREATE-ASYNC-009A] distinguishes ready, pending, and failed Compose containers", () => {
    expect(
      parseDockerDeploymentContainerVerification(
        'abc|{"Status":"running","Health":{"Status":"healthy"}}|172.18.0.4\ndef|{"Status":"running"}|172.18.0.5\n',
      ),
    ).toEqual({
      status: "ready",
      containers: [
        { id: "abc", runtimeStatus: "running", healthStatus: "healthy", ipAddress: "172.18.0.4" },
        { id: "def", runtimeStatus: "running", healthStatus: "none", ipAddress: "172.18.0.5" },
      ],
    });
    expect(
      parseDockerDeploymentContainerVerification(
        'abc|{"Status":"running","Health":{"Status":"starting"}}|172.18.0.4\n',
      ).status,
    ).toBe("pending");
    expect(
      parseDockerDeploymentContainerVerification('abc|{"Status":"exited"}|\n').status,
    ).toBe("failed");
    expect(parseDockerDeploymentContainerVerification("").status).toBe("missing");
  });

  test("cleans conflicting access route containers without removing the active deployment", () => {
    const command = dockerRemoveConflictingRouteContainersCommand({
      deploymentId: "dep_current",
      accessRoutes: [
        { host: "app.example.com", pathPrefix: "/" },
        { host: "app.example.com", pathPrefix: "/" },
      ],
      quote,
    });

    expect(command).toContain("docker ps -aq");
    expect(command).toContain("docker inspect -f '{{ json .Config.Labels }}'");
    expect(command).toContain(
      "docker inspect -f '{{ index .Config.Labels \"appaloft.deployment-id\" }}'",
    );
    expect(command).toContain(
      "docker inspect -f '{{ index .Config.Labels \"appaloft.preview-id\" }}'",
    );
    expect(command).toContain(
      "docker inspect -f '{{ index .Config.Labels \"appaloft.access-host\" }}'",
    );
    expect(command).toContain(
      "docker inspect -f '{{ index .Config.Labels \"appaloft.access-hosts\" }}'",
    );
    expect(command).toContain(
      "docker inspect -f '{{ index .Config.Labels \"appaloft.access-path-prefix\" }}'",
    );
    expect(command).toContain("grep -F ',app.example.com,'");
    expect(command).toContain("grep -F 'Host(`app.example.com`)'");
    expect(command).toContain('[ "$traefik_host_matches" = "1" ]');
    expect(command).toContain('[ "$appaloft_candidate" = "1" ]');
    expect(command).toContain("if [ \"$deployment_id\" != 'dep_current' ]");
    expect(command).toContain('[ \'/\' = "/" ] && [ -z "$access_path_prefix" ]');
    expect(command).toContain('docker rm -f "$container_id"');
  });

  test("matches legacy Traefik route labels for non-root paths", () => {
    const command = dockerRemoveConflictingRouteContainersCommand({
      deploymentId: "dep_current",
      accessRoutes: [{ host: "app.example.com", pathPrefix: "/api" }],
      quote,
    });

    expect(command).toContain("grep -F 'Host(`app.example.com`)'");
    expect(command).toContain("grep -F 'PathPrefix(`/api`)'");
    expect(command).toContain(
      'if [ "$traefik_host_matches" = "1" ] && [ "$traefik_path_matches" = "1" ]; then path_matches=1; fi;',
    );
    expect(command).toContain('docker rm -f "$container_id"');
  });

  test("renders stable Appaloft identity labels", () => {
    const labels = appaloftDockerContainerLabels({
      deploymentId: "dep_1",
      projectId: "proj_1",
      projectName: "Demo Project",
      projectSlug: "demo-project",
      environmentId: "env_1",
      environmentName: "preview-pr-14",
      environmentKind: "preview",
      resourceId: "res_1",
      resourceName: "Web",
      resourceSlug: "web",
      resourceKind: "application",
      serverId: "srv_1",
      serverName: "primary",
      serverProvider: "generic-ssh",
      targetKind: "single-server",
      destinationId: "dest_1",
      destinationName: "default",
      destinationKind: "generic",
      executionKind: "docker-container",
      buildStrategy: "workspace-commands",
      packagingMode: "all-in-one-docker",
      exposureMode: "reverse-proxy",
      upstreamProtocol: "http",
      sourceKind: "local-folder",
      sourceDisplayName: "workspace",
      sourceRuntimeFamily: "node",
      sourceFramework: "astro",
      sourcePackageManager: "bun",
      sourceApplicationShape: "server",
      sourceProjectName: "www",
      runtimeArtifactKind: "image",
      runtimeArtifactIntent: "build-image",
      routeSource: "server-applied-config-domain",
      accessHostname: "14.preview.appaloft.com",
      accessPathPrefix: "/",
      accessScheme: "http",
      accessHosts: ["14.preview.appaloft.com", "14.preview.appaloft.com"],
      sourceFingerprint: "source-fingerprint:v1:preview%3Apr%3A14",
    });

    expect(labels).toEqual([
      "appaloft.managed=true",
      "appaloft.deployment-id=dep_1",
      "appaloft.project-id=proj_1",
      "appaloft.project-name=Demo Project",
      "appaloft.project-slug=demo-project",
      "appaloft.environment-id=env_1",
      "appaloft.environment-name=preview-pr-14",
      "appaloft.environment-kind=preview",
      "appaloft.preview-id=pr-14",
      "appaloft.preview-number=14",
      "appaloft.preview-mode=pull-request",
      "appaloft.source-fingerprint=source-fingerprint:v1:preview%3Apr%3A14",
      "appaloft.resource-id=res_1",
      "appaloft.resource-name=Web",
      "appaloft.resource-slug=web",
      "appaloft.resource-kind=application",
      "appaloft.server-id=srv_1",
      "appaloft.server-name=primary",
      "appaloft.server-provider=generic-ssh",
      "appaloft.target-kind=single-server",
      "appaloft.destination-id=dest_1",
      "appaloft.destination-name=default",
      "appaloft.destination-kind=generic",
      "appaloft.execution-kind=docker-container",
      "appaloft.build-strategy=workspace-commands",
      "appaloft.packaging-mode=all-in-one-docker",
      "appaloft.exposure-mode=reverse-proxy",
      "appaloft.upstream-protocol=http",
      "appaloft.source-kind=local-folder",
      "appaloft.source-display-name=workspace",
      "appaloft.source-runtime-family=node",
      "appaloft.source-framework=astro",
      "appaloft.source-package-manager=bun",
      "appaloft.source-application-shape=server",
      "appaloft.source-project-name=www",
      "appaloft.artifact-kind=image",
      "appaloft.artifact-intent=build-image",
      "appaloft.route-source=server-applied-config-domain",
      "appaloft.access-host=14.preview.appaloft.com",
      "appaloft.access-path-prefix=/",
      "appaloft.access-scheme=http",
      "appaloft.access-hosts=14.preview.appaloft.com",
    ]);
    expect(dockerContainerLabelFlags({ labels, quote })).toContain(
      "--label 'appaloft.resource-id=res_1'",
    );
  });

  test("omits preview labels for non-preview environments", () => {
    const labels = appaloftDockerContainerLabels({
      deploymentId: "dep_2",
      projectId: "proj_2",
      environmentId: "env_2",
      environmentName: "production",
      environmentKind: "production",
      resourceId: "res_2",
      destinationId: "dest_2",
    });

    expect(labels).toContain("appaloft.environment-kind=production");
    expect(labels.some((label) => label.startsWith("appaloft.preview-"))).toBe(false);
  });

  test("parses Docker published host ports", () => {
    expect(parseDockerPublishedHostPort("127.0.0.1:49153\n")).toBe(49153);
    expect(parseDockerPublishedHostPort("0.0.0.0:3000\n")).toBe(3000);
    expect(parseDockerPublishedHostPort("[::]:3000\n")).toBe(3000);
    expect(parseDockerPublishedHostPort("not-a-port\n")).toBeUndefined();
  });
});
