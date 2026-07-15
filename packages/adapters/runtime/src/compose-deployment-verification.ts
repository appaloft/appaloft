import {
  dockerDeploymentContainerVerificationCommand,
  parseDockerDeploymentContainerVerification,
  type DockerDeploymentContainerVerification,
} from "./docker-container-commands";

export interface ComposeVerificationCommandResult {
  failed: boolean;
  stdout: string;
  stderr: string;
}

export async function waitForComposeDeploymentContainers(input: {
  deploymentId: string;
  targetServiceName?: string;
  quote: (value: string) => string;
  attempts: number;
  intervalMs: number;
  run: (command: string) => Promise<ComposeVerificationCommandResult>;
}): Promise<{
  verification: DockerDeploymentContainerVerification;
  stdout: string;
  stderr: string;
}> {
  const command = dockerDeploymentContainerVerificationCommand({
    deploymentId: input.deploymentId,
    ...(input.targetServiceName ? { targetServiceName: input.targetServiceName } : {}),
    quote: input.quote,
  });
  let verification: DockerDeploymentContainerVerification = {
    status: "missing",
    containers: [],
  };
  let stdout = "";
  let stderr = "";

  for (let attempt = 0; attempt < Math.max(1, input.attempts); attempt += 1) {
    const result = await input.run(command);
    stdout = result.stdout;
    stderr = result.stderr;
    verification = result.failed
      ? { status: "failed", containers: [] }
      : parseDockerDeploymentContainerVerification(result.stdout);
    if (verification.status === "ready" || verification.status === "failed") {
      break;
    }
    if (attempt + 1 < input.attempts) {
      await Bun.sleep(input.intervalMs);
    }
  }

  return { verification, stdout, stderr };
}
