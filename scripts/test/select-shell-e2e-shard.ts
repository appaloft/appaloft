type ShardFile = {
  path: string;
  weightMs: number;
};

type ShardAssignment = {
  shard: number;
  files: string[];
  shellWeightMs: number;
  extraWeightMs: number;
  totalWeightMs: number;
};

const shellE2eGlob = "./test/e2e/*.e2e.ts";
const defaultWeightMs = 30_000;

const e2eFileWeightMs: Record<string, number> = {
  "archive-delete-lifecycle.command.e2e.ts": 70_594,
  "certificates.command.e2e.ts": 67_837,
  "certificates.import.command.e2e.ts": 63_472,
  "dependency-resource-redis-backup.workflow.e2e.ts": 1_000,
  "domain-bindings.command.e2e.ts": 122_907,
  "github-action-ssh-state.workflow.e2e.ts": 1_000,
  "quick-deploy-framework-fixtures-docker.workflow.e2e.ts": 1_000,
  "quick-deploy-framework-fixtures-ssh.workflow.e2e.ts": 1_000,
  "quick-deploy-local-docker-substrates.workflow.e2e.ts": 96_895,
  "quick-deploy-ssh.workflow.e2e.ts": 1_000,
  "quick-deploy-static-docker.workflow.e2e.ts": 39_631,
  "quick-deploy-workspace-docker.workflow.e2e.ts": 32_295,
  "remote-control-plane.command.e2e.ts": 35_474,
  "routing-domain-and-tls-proxy.workflow.e2e.ts": 1_000,
  "routing-domain-and-tls.workflow.e2e.ts": 54_456,
  "server-register.command.e2e.ts": 16_656,
};

export const webViewSmokeWeightMs = 71_780;

const basename = (path: string) => path.split("/").at(-1) ?? path;

export function weightForShellE2eFile(path: string): number {
  return e2eFileWeightMs[basename(path)] ?? defaultWeightMs;
}

export async function listShellE2eFiles(shellRoot = "apps/shell"): Promise<string[]> {
  const files: string[] = [];
  for await (const path of new Bun.Glob(shellE2eGlob).scan({ cwd: shellRoot })) {
    files.push(path);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

export function assignShellE2eFiles(files: string[], shardTotal: number): ShardAssignment[] {
  if (!Number.isInteger(shardTotal) || shardTotal < 1) {
    throw new Error(`shard total must be a positive integer, received ${shardTotal}`);
  }

  const assignments: ShardAssignment[] = Array.from({ length: shardTotal }, (_, index) => ({
    shard: index + 1,
    files: [],
    shellWeightMs: 0,
    extraWeightMs: index === 0 ? webViewSmokeWeightMs : 0,
    totalWeightMs: index === 0 ? webViewSmokeWeightMs : 0,
  }));

  const weightedFiles = files
    .map<ShardFile>((path) => ({ path, weightMs: weightForShellE2eFile(path) }))
    .sort((left, right) => {
      const byWeight = right.weightMs - left.weightMs;
      return byWeight === 0 ? left.path.localeCompare(right.path) : byWeight;
    });

  for (const file of weightedFiles) {
    const target = assignments.toSorted((left, right) => {
      const byWeight = left.totalWeightMs - right.totalWeightMs;
      if (byWeight !== 0) {
        return byWeight;
      }
      const byFileCount = left.files.length - right.files.length;
      return byFileCount === 0 ? left.shard - right.shard : byFileCount;
    })[0];
    target.files.push(file.path);
    target.shellWeightMs += file.weightMs;
    target.totalWeightMs += file.weightMs;
  }

  for (const assignment of assignments) {
    assignment.files.sort((left, right) => left.localeCompare(right));
  }

  return assignments;
}

export function selectShellE2eShard(
  files: string[],
  shard: number,
  shardTotal: number,
): ShardAssignment {
  if (!Number.isInteger(shard) || shard < 1 || shard > shardTotal) {
    throw new Error(`shard must be between 1 and ${shardTotal}, received ${shard}`);
  }
  return assignShellE2eFiles(files, shardTotal)[shard - 1];
}

function readOption(name: string, fallback?: string): string | undefined {
  const prefix = `${name}=`;
  const inline = Bun.argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = Bun.argv.indexOf(name);
  return index === -1 ? fallback : Bun.argv[index + 1];
}

async function main(): Promise<void> {
  const shard = Number(readOption("--shard"));
  const shardTotal = Number(readOption("--total"));
  const shellRoot = readOption("--shell-root", "apps/shell") ?? "apps/shell";
  const format = readOption("--format", "args");
  const files = await listShellE2eFiles(shellRoot);
  const assignment = selectShellE2eShard(files, shard, shardTotal);

  if (format === "json") {
    console.log(JSON.stringify(assignment, null, 2));
    return;
  }

  if (format === "lines") {
    console.log(assignment.files.join("\n"));
    return;
  }

  if (format !== "args") {
    throw new Error(`unsupported format: ${format}`);
  }

  console.log(assignment.files.join(" "));
}

if (import.meta.main) {
  await main();
}
