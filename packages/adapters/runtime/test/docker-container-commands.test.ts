import { describe, expect, test } from "bun:test";
import {
  dockerContainerLabelFlags,
  dockerPublishedPortFlag,
  dockerRemoveResourceContainersCommand,
  parseDockerPublishedHostPort,
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
      currentContainerName: "appaloft-dep_current",
      quote,
    });

    expect(command).toContain("--filter 'label=appaloft.resource-id=res_first'");
    expect(command).toContain("!= 'appaloft-dep_current'");
    expect(command).not.toContain("publish=3000");
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
      accessScheme: "http",
      accessHosts: ["14.preview.appaloft.com", "14.preview.appaloft.com"],
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
