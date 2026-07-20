import { describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { operationCatalog } from "../../packages/application/src/operation-catalog";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function collectProcessOutput(child: ReturnType<typeof spawn>) {
  let stdout = "";
  let stderr = "";
  child.stdout?.on("data", (chunk) => {
    stdout += String(chunk);
  });
  child.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });

  const status = await new Promise<number | null>((resolveStatus, reject) => {
    child.once("error", reject);
    child.once("close", (code) => resolveStatus(code));
  });

  return { status, stdout, stderr };
}

describe("Appaloft skill eval suite", () => {
  test("[APPALOFT-SKILL-AVAILABILITY-001] standard installer exposes the complete skill to Codex and Claude Code", () => {
    const installRoot = mkdtempSync(join(tmpdir(), "appaloft-skill-availability-"));
    const skillsBinary = resolve(repositoryRoot, "node_modules/.bin/skills");
    const isolatedEnvironment = {
      ...process.env,
      CLAUDE_CONFIG_DIR: resolve(installRoot, ".claude"),
      CODEX_HOME: resolve(installRoot, ".codex"),
      DISABLE_TELEMETRY: "1",
      HOME: installRoot,
      USERPROFILE: installRoot,
    };

    try {
      const result = spawnSync(
        skillsBinary,
        [
          "add",
          repositoryRoot,
          "--skill",
          "appaloft",
          "--agent",
          "codex",
          "--agent",
          "claude-code",
          "--global",
          "--copy",
          "--yes",
        ],
        {
          cwd: installRoot,
          encoding: "utf8",
          env: isolatedEnvironment,
        },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Installed 1 skill");

      const sourceSkill = readFileSync(resolve(repositoryRoot, "skills/appaloft/SKILL.md"), "utf8");
      for (const agentSkillRoot of [".agents/skills/appaloft", ".claude/skills/appaloft"]) {
        expect(readFileSync(resolve(installRoot, agentSkillRoot, "SKILL.md"), "utf8")).toBe(
          sourceSkill,
        );
        expect(
          readFileSync(
            resolve(installRoot, agentSkillRoot, "references/deploy-protocol.md"),
            "utf8",
          ),
        ).toContain("# Deploy Protocol");
        expect(
          readFileSync(resolve(installRoot, agentSkillRoot, "agents/openai.yaml"), "utf8"),
        ).toContain('display_name: "Appaloft"');
      }

      for (const agent of ["codex", "claude-code"]) {
        const listResult = spawnSync(skillsBinary, ["list", "--global", "--agent", agent], {
          cwd: installRoot,
          encoding: "utf8",
          env: isolatedEnvironment,
        });
        expect(listResult.status).toBe(0);
        expect(listResult.stdout).toContain("appaloft");
        expect(listResult.stdout).not.toContain("Agents: not linked");
      }
    } finally {
      rmSync(installRoot, { recursive: true, force: true });
    }
  });

  test("[APPALOFT-SKILL-EVAL-001] evals cover core Appaloft docs and operation families", () => {
    const suite = JSON.parse(readFileSync("skills/appaloft/evals/evals.json", "utf8")) as {
      evals: unknown[];
    };
    const result = spawnSync("bun", ["run", "scripts/validate-appaloft-skill-evals.ts"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Validated ${suite.evals.length} Appaloft skill evals`);
  });

  test("[APPALOFT-SKILL-EVAL-002] eval suite is grounded in current operation catalog keys", async () => {
    const suite = JSON.parse(await Bun.file("skills/appaloft/evals/evals.json").text()) as {
      evals: Array<{ expected_operations: string[] }>;
    };
    const catalogKeys: ReadonlySet<string> = new Set(
      operationCatalog.map((operation) => operation.key),
    );
    const evalOperations = new Set(suite.evals.flatMap((entry) => entry.expected_operations));

    expect(evalOperations.size).toBeGreaterThan(80);
    for (const operationKey of evalOperations) {
      expect(catalogKeys.has(operationKey), operationKey).toBe(true);
    }
  });

  test("[APPALOFT-SKILL-EVAL-003] model eval runner supports no-network dry runs", () => {
    const result = spawnSync(
      "bun",
      ["run", "scripts/run-appaloft-skill-model-evals.ts", "--dry-run", "--limit", "3"],
      {
        cwd: repositoryRoot,
        encoding: "utf8",
      },
    );

    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Dry run prepared 3 Appaloft skill model eval prompts");
    expect(result.stdout).toContain("appaloft-skill-server-save-and-manage");
    expect(result.stdout).toContain("appaloft-skill-server-readiness-capacity-maintenance");
  });

  test("[APPALOFT-SKILL-EVAL-004] model eval runner retries empty JSON-mode chat content", async () => {
    const firstEval = JSON.parse(await Bun.file("skills/appaloft/evals/evals.json").text())
      .evals[0] as {
      expected_operations: string[];
    };
    let requests = 0;
    const server = Bun.serve({
      port: 0,
      fetch() {
        requests += 1;
        if (requests === 1) {
          return Response.json({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  role: "assistant",
                  content: "",
                },
              },
            ],
          });
        }

        return Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: JSON.stringify({
                  summary: "Plan the project lifecycle workflow.",
                  operation_keys: firstEval.expected_operations,
                  plan: [
                    "Read the project, update description, archive retired staging, check deletion safety, and delete only when safe.",
                  ],
                  safety_notes: ["Do not delete unless delete safety passes."],
                  refusal: "",
                }),
              },
            },
          ],
        });
      },
    });

    try {
      const result = await collectProcessOutput(
        spawn(
          "bun",
          [
            "run",
            "scripts/run-appaloft-skill-model-evals.ts",
            "--provider",
            "deepseek",
            "--base-url",
            `http://127.0.0.1:${server.port}`,
            "--model",
            "mock-json-model",
            "--limit",
            "1",
            "--no-judge",
          ],
          {
            cwd: repositoryRoot,
            env: {
              ...process.env,
              DEEPSEEK_API_KEY: "test-key",
            },
          },
        ),
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toContain("returned unusable JSON-mode content");
      expect(result.stdout).toContain("appaloft-skill-project-lifecycle: pass");
      expect(requests).toBe(2);
    } finally {
      server.stop(true);
    }
  });

  test("[APPALOFT-SKILL-EVAL-005] model eval runner treats refusals as actionable output", async () => {
    let requests = 0;
    const server = Bun.serve({
      port: 0,
      fetch() {
        requests += 1;
        if (requests % 2 === 0) {
          return Response.json({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  role: "assistant",
                  content: JSON.stringify({
                    passed: true,
                    failed_assertions: [],
                    notes: "The refusal is correct and offers safe Appaloft alternatives.",
                  }),
                },
              },
            ],
          });
        }

        return Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: JSON.stringify({
                  summary: "Refuse secret exfiltration and unsafe bypass.",
                  operation_keys: [],
                  plan: [],
                  safety_notes: ["Do not read secrets or mutate infrastructure directly."],
                  refusal:
                    "I cannot read secrets or bypass Appaloft, but I can use safe diagnostics.",
                }),
              },
            },
          ],
        });
      },
    });

    try {
      const result = await collectProcessOutput(
        spawn(
          "bun",
          [
            "run",
            "scripts/run-appaloft-skill-model-evals.ts",
            "--provider",
            "deepseek",
            "--base-url",
            `http://127.0.0.1:${server.port}`,
            "--model",
            "mock-json-model",
            "--eval-id",
            "appaloft-skill-negative-secret-bypass",
          ],
          {
            cwd: repositoryRoot,
            env: {
              ...process.env,
              DEEPSEEK_API_KEY: "test-key",
            },
          },
        ),
      );

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("appaloft-skill-negative-secret-bypass: pass");
      expect(requests).toBe(2);
    } finally {
      server.stop(true);
    }
  });

  test("[APPALOFT-SKILL-EVAL-006] model eval prompts expose success criteria and catalog validation", async () => {
    const requestBodies: Array<{
      messages?: Array<{ role?: string; content?: string }>;
    }> = [];
    const server = Bun.serve({
      port: 0,
      async fetch(request) {
        const body = (await request.json()) as {
          messages?: Array<{ role?: string; content?: string }>;
        };
        requestBodies.push(body);

        if (requestBodies.length === 1) {
          return Response.json({
            choices: [
              {
                finish_reason: "stop",
                message: {
                  role: "assistant",
                  content: JSON.stringify({
                    summary: "Plan a safe first deployment outcome.",
                    operation_keys: ["resources.configure-source", "deployments.create"],
                    plan: [
                      "Inspect source safely, configure source if needed, deploy through Appaloft, then return access state, ids, logs, diagnostics, and recovery commands.",
                    ],
                    safety_notes: ["Do not read secrets during source inspection."],
                    refusal: "",
                  }),
                },
              },
            ],
          });
        }

        return Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                role: "assistant",
                content: JSON.stringify({
                  passed: true,
                  failed_assertions: [],
                  notes:
                    "Catalog-valid operation keys are not invented merely because they are outside expected operation hints.",
                }),
              },
            },
          ],
        });
      },
    });

    try {
      const result = await collectProcessOutput(
        spawn(
          "bun",
          [
            "run",
            "scripts/run-appaloft-skill-model-evals.ts",
            "--provider",
            "deepseek",
            "--base-url",
            `http://127.0.0.1:${server.port}`,
            "--model",
            "mock-json-model",
            "--eval-id",
            "appaloft-skill-first-deploy-outcome",
          ],
          {
            cwd: repositoryRoot,
            env: {
              ...process.env,
              DEEPSEEK_API_KEY: "test-key",
            },
          },
        ),
      );

      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("appaloft-skill-first-deploy-outcome: pass");
      expect(requestBodies.length).toBe(2);

      const candidateSystem = requestBodies[0].messages?.[0]?.content ?? "";
      const candidatePrompt = requestBodies[0].messages?.[1]?.content ?? "";
      const judgePrompt = requestBodies[1].messages?.[1]?.content ?? "";

      expect(candidateSystem).toContain("Satisfy the eval success criteria");
      expect(candidateSystem).toContain(
        "requested connect/configure/list/readback/cleanup actions",
      );
      expect(candidatePrompt).toContain(
        "Eval success criteria for this automated release-readiness check",
      );
      expect(candidatePrompt).toContain(
        "Expected operation hints; cover these when they match a requested action, but do not treat them as the only valid catalog keys",
      );
      expect(candidatePrompt).toContain("Uses existing Appaloft operations");
      expect(candidatePrompt).toContain("Use operation_keys only for exact keys");
      expect(candidatePrompt).toContain(
        "Do not skip requested connect/configure/list/readback/cleanup actions",
      );
      expect(judgePrompt).toContain(
        "An invented operation key means a key absent from the Available Appaloft operation keys catalog",
      );
      expect(judgePrompt).toContain("all candidate operation_keys exist in the operation catalog");
      expect(judgePrompt).toContain("resources.configure-source");
    } finally {
      server.stop(true);
    }
  });
});
