import { describe, expect, test } from "bun:test";
import {
  dockerContainerLabelFlags,
  dockerPublishedPortFlag,
  dockerRemoveResourceContainersCommand,
  parseDockerPublishedHostPort,
  yunduDockerContainerLabels,
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
      currentContainerName: "yundu-dep_current",
      quote,
    });

    expect(command).toContain("--filter 'label=yundu.resource-id=res_first'");
    expect(command).toContain("!= 'yundu-dep_current'");
    expect(command).not.toContain("publish=3000");
  });

  test("renders stable Yundu identity labels", () => {
    const labels = yunduDockerContainerLabels({
      deploymentId: "dep_1",
      projectId: "proj_1",
      environmentId: "env_1",
      resourceId: "res_1",
      destinationId: "dest_1",
    });

    expect(labels).toEqual([
      "yundu.managed=true",
      "yundu.deployment-id=dep_1",
      "yundu.project-id=proj_1",
      "yundu.environment-id=env_1",
      "yundu.resource-id=res_1",
      "yundu.destination-id=dest_1",
    ]);
    expect(dockerContainerLabelFlags({ labels, quote })).toContain(
      "--label 'yundu.resource-id=res_1'",
    );
  });

  test("parses Docker published host ports", () => {
    expect(parseDockerPublishedHostPort("127.0.0.1:49153\n")).toBe(49153);
    expect(parseDockerPublishedHostPort("0.0.0.0:3000\n")).toBe(3000);
    expect(parseDockerPublishedHostPort("[::]:3000\n")).toBe(3000);
    expect(parseDockerPublishedHostPort("not-a-port\n")).toBeUndefined();
  });
});
