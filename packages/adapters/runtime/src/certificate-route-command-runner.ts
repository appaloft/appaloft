import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  type BufferedProcessInput,
  type BufferedProcessResult,
  runBufferedProcess,
  shellCommand,
} from "./buffered-process";
import {
  type CertificateRouteCommandInput,
  type CertificateRouteCommandResult,
  type CertificateRouteCommandRunner,
} from "./docker-certificate-route-runtime";

export type CertificateRouteProcessExecutor = (
  input: BufferedProcessInput,
) => Promise<BufferedProcessResult>;

function hostWithUsername(host: string, username?: string): string {
  return username && !host.includes("@") ? `${username}@${host}` : host;
}

export class LocalSshCertificateRouteCommandRunner implements CertificateRouteCommandRunner {
  constructor(private readonly execute: CertificateRouteProcessExecutor = runBufferedProcess) {}

  async run(input: CertificateRouteCommandInput): Promise<CertificateRouteCommandResult> {
    const providerKey = input.server.providerKey.value;
    let tempDirectory: string | undefined;
    try {
      let command: readonly string[];
      if (providerKey === "local-shell") {
        command = shellCommand(input.command);
      } else if (providerKey === "generic-ssh") {
        const credential = input.server.credential;
        let identityArgs: string[] = [];
        if (credential?.kind.value === "ssh-private-key" && credential.privateKey) {
          tempDirectory = mkdtempSync(join(tmpdir(), "appaloft-certificate-route-ssh-"));
          const identityFile = join(tempDirectory, "id_deployment_target");
          writeFileSync(
            identityFile,
            credential.privateKey.value.endsWith("\n")
              ? credential.privateKey.value
              : `${credential.privateKey.value}\n`,
            { mode: 0o600 },
          );
          chmodSync(identityFile, 0o600);
          identityArgs = ["-i", identityFile, "-o", "IdentitiesOnly=yes"];
        }
        command = [
          "ssh",
          "-p",
          String(input.server.port.value),
          ...identityArgs,
          "-o",
          "BatchMode=yes",
          "-o",
          "ConnectTimeout=10",
          "-o",
          "StrictHostKeyChecking=accept-new",
          hostWithUsername(input.server.host.value, credential?.username?.value),
          input.command,
        ];
      } else {
        return {
          failed: true,
          stdout: "",
          stderr: "Certificate route command target is unsupported",
        };
      }

      const result = await this.execute({
        command,
        ...(input.stdin === undefined ? {} : { stdin: input.stdin }),
        ...(input.redactions ? { redactions: input.redactions } : {}),
        ...(input.timeoutMs ? { timeoutMs: input.timeoutMs } : {}),
      });
      return { failed: result.failed, stdout: result.stdout, stderr: result.stderr };
    } finally {
      if (tempDirectory) rmSync(tempDirectory, { recursive: true, force: true });
    }
  }
}
