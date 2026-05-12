import { stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

interface CheckResult {
  message: string;
  ok: boolean;
}

function expandHome(path: string): string {
  return path === "~" || path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

function portIsValid(port: string): boolean {
  if (!/^\d+$/u.test(port)) {
    return false;
  }

  const value = Number.parseInt(port, 10);
  return value >= 1 && value <= 65535;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function pathIsFile(path: string): Promise<boolean> {
  return (await stat(path)).isFile();
}

async function fileIsNonEmpty(path: string): Promise<boolean> {
  return (await Bun.file(path).arrayBuffer()).byteLength > 0;
}

async function filePermissionsArePrivate(path: string): Promise<boolean> {
  if (process.platform === "win32") {
    return true;
  }

  const info = await stat(path);
  return (info.mode & 0o077) === 0;
}

async function checkSshReleaseReadiness(): Promise<CheckResult[]> {
  const host = process.env.APPALOFT_E2E_SSH_HOST?.trim();
  const privateKey = process.env.APPALOFT_E2E_SSH_PRIVATE_KEY?.trim();
  const port = process.env.APPALOFT_E2E_SSH_PORT?.trim();
  const username = process.env.APPALOFT_E2E_SSH_USERNAME;
  const usernameIsWhitespaceOnly =
    username !== undefined && username.length > 0 && username.trim().length === 0;
  const results: CheckResult[] = [];
  const sshPath = Bun.which("ssh");

  results.push({
    ok: Boolean(sshPath),
    message: sshPath ? "ssh executable is available." : "ssh executable is required.",
  });

  results.push({
    ok: Boolean(host),
    message: host ? "APPALOFT_E2E_SSH_HOST is configured." : "APPALOFT_E2E_SSH_HOST is required.",
  });

  results.push({
    ok: !port || portIsValid(port),
    message: !port
      ? "APPALOFT_E2E_SSH_PORT is not set; defaulting to 22."
      : portIsValid(port)
        ? "APPALOFT_E2E_SSH_PORT is valid."
        : "APPALOFT_E2E_SSH_PORT must be an integer from 1 to 65535.",
  });

  results.push({
    ok: !usernameIsWhitespaceOnly,
    message: usernameIsWhitespaceOnly
      ? "APPALOFT_E2E_SSH_USERNAME must not be blank when set."
      : !username
        ? "APPALOFT_E2E_SSH_USERNAME is not set; defaulting to root."
        : "APPALOFT_E2E_SSH_USERNAME is configured.",
  });

  if (!privateKey) {
    results.push({
      ok: false,
      message: "APPALOFT_E2E_SSH_PRIVATE_KEY must point to a private key file.",
    });
    return results;
  }

  const privateKeyPath = expandHome(privateKey);
  const privateKeyExists = await fileExists(privateKeyPath);
  results.push({
    ok: privateKeyExists,
    message: privateKeyExists
      ? "APPALOFT_E2E_SSH_PRIVATE_KEY file exists."
      : "APPALOFT_E2E_SSH_PRIVATE_KEY file does not exist.",
  });

  if (privateKeyExists) {
    const privateKeyIsFile = await pathIsFile(privateKeyPath);
    results.push({
      ok: privateKeyIsFile,
      message: privateKeyIsFile
        ? "APPALOFT_E2E_SSH_PRIVATE_KEY path is a file."
        : "APPALOFT_E2E_SSH_PRIVATE_KEY path must be a file.",
    });

    if (privateKeyIsFile) {
      const privateKeyHasContent = await fileIsNonEmpty(privateKeyPath);
      const privateKeyPermissionsArePrivate = await filePermissionsArePrivate(privateKeyPath);
      results.push({
        ok: privateKeyHasContent,
        message: privateKeyHasContent
          ? "APPALOFT_E2E_SSH_PRIVATE_KEY file is not empty."
          : "APPALOFT_E2E_SSH_PRIVATE_KEY file is empty.",
      });
      results.push({
        ok: privateKeyPermissionsArePrivate,
        message: privateKeyPermissionsArePrivate
          ? "APPALOFT_E2E_SSH_PRIVATE_KEY file permissions are private."
          : "APPALOFT_E2E_SSH_PRIVATE_KEY file permissions must be 0600 or stricter.",
      });
    }
  }

  return results;
}

const results = await checkSshReleaseReadiness();
for (const result of results) {
  console.log(`${result.ok ? "ok" : "missing"}: ${result.message}`);
}

if (results.some((result) => !result.ok)) {
  console.error(
    "SSH release-readiness preflight failed. Configure the missing APPALOFT_E2E_SSH_* values before running bun run smoke:ssh.",
  );
  process.exit(1);
}

console.log(
  "SSH release-readiness preflight passed. Run bun run smoke:ssh to capture release evidence.",
);
