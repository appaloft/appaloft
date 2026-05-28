import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { operationCatalog } from "../packages/application/src/operation-catalog";

type SkillEval = {
  id: string;
  family: string;
  prompt: string;
  expected_output: string;
  expected_operations: string[];
  source_documents: string[];
  assertions: string[];
};

type SkillEvalSuite = {
  skill_name: string;
  purpose: string;
  evals: SkillEval[];
};

type CandidateOutput = {
  summary: string;
  operation_keys: string[];
  plan: string[];
  safety_notes: string[];
  refusal: string;
};

type JudgeOutput = {
  passed: boolean;
  failed_assertions: string[];
  notes: string;
};

class RetryableChatCompletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableChatCompletionError";
  }
}

class RetryableJsonParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableJsonParseError";
  }
}

type Options = {
  baseUrl: string;
  dryRun: boolean;
  evalId?: string;
  judge: boolean;
  limit?: number;
  maxDocChars: number;
  model: string;
  judgeModel: string;
  provider: "deepseek" | "openai";
};

const chatCompletionMaxAttempts = 3;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const operationKeys = operationCatalog.map((operation) => operation.key).sort();
const operationKeySet: ReadonlySet<string> = new Set(operationKeys);

function stringArg(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function numberArg(args: string[], name: string): number | undefined {
  const raw = stringArg(args, name);
  if (!raw) {
    return undefined;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

function parseOptions(args: string[]): Options {
  const provider =
    stringArg(args, "--provider") ??
    process.env.APPALOFT_SKILL_EVAL_PROVIDER ??
    (process.env.DEEPSEEK_API_KEY ? "deepseek" : "openai");
  if (provider !== "deepseek" && provider !== "openai") {
    throw new Error("--provider must be openai or deepseek");
  }

  const defaultModel = provider === "deepseek" ? "deepseek-v4-flash" : "gpt-5-mini";

  return {
    baseUrl:
      stringArg(args, "--base-url") ??
      process.env.APPALOFT_SKILL_EVAL_BASE_URL ??
      (provider === "deepseek" ? "https://api.deepseek.com" : "https://api.openai.com/v1"),
    dryRun: args.includes("--dry-run"),
    evalId: stringArg(args, "--eval-id"),
    judge: !args.includes("--no-judge"),
    limit: numberArg(args, "--limit"),
    maxDocChars: numberArg(args, "--max-doc-chars") ?? 6000,
    model: stringArg(args, "--model") ?? process.env.APPALOFT_SKILL_EVAL_MODEL ?? defaultModel,
    judgeModel:
      stringArg(args, "--judge-model") ??
      process.env.APPALOFT_SKILL_EVAL_JUDGE_MODEL ??
      stringArg(args, "--model") ??
      process.env.APPALOFT_SKILL_EVAL_MODEL ??
      defaultModel,
    provider,
  };
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertStringArray(value: unknown, label: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} must be a string array`);
  }
}

function parseSuite(value: unknown): SkillEvalSuite {
  assertRecord(value, "eval suite");
  if (value.skill_name !== "appaloft") {
    throw new Error("skill_name must be appaloft");
  }
  if (!Array.isArray(value.evals)) {
    throw new Error("evals must be an array");
  }

  return {
    skill_name: "appaloft",
    purpose: typeof value.purpose === "string" ? value.purpose : "",
    evals: value.evals.map((entry, index) => {
      assertRecord(entry, `eval ${index}`);
      if (typeof entry.id !== "string") {
        throw new Error(`eval ${index} id is required`);
      }
      if (typeof entry.family !== "string") {
        throw new Error(`eval ${entry.id} family is required`);
      }
      if (typeof entry.prompt !== "string") {
        throw new Error(`eval ${entry.id} prompt is required`);
      }
      if (typeof entry.expected_output !== "string") {
        throw new Error(`eval ${entry.id} expected_output is required`);
      }
      assertStringArray(entry.expected_operations, `eval ${entry.id} expected_operations`);
      assertStringArray(entry.source_documents, `eval ${entry.id} source_documents`);
      assertStringArray(entry.assertions, `eval ${entry.id} assertions`);

      return entry as SkillEval;
    }),
  };
}

async function readFileSnippet(path: string, maxChars: number): Promise<string> {
  const absolutePath = resolve(repositoryRoot, path);
  if (!existsSync(absolutePath)) {
    throw new Error(`source document does not exist: ${path}`);
  }

  const text = await Bun.file(absolutePath).text();
  if (text.length <= maxChars) {
    return text;
  }

  return `${text.slice(0, maxChars)}\n\n[truncated after ${maxChars} characters]`;
}

async function buildEvalPrompt(entry: SkillEval, options: Options): Promise<string> {
  const skill = await readFileSnippet("skills/appaloft/SKILL.md", options.maxDocChars);
  const references = await Promise.all(
    entry.source_documents.map(async (sourceDocument) => ({
      sourceDocument,
      text: await readFileSnippet(sourceDocument, options.maxDocChars),
    })),
  );

  return [
    "You are testing the Appaloft skill as a real AI agent would use it.",
    "Use only Appaloft public skill instructions, source documents, and operation catalog keys in this prompt.",
    "Do not invent agent-only operations. Do not read, print, or request secrets.",
    "Return JSON only, matching the requested schema.",
    "",
    "Available Appaloft operation keys:",
    operationKeys.join(", "),
    "",
    "Skill source: skills/appaloft/SKILL.md",
    "```md",
    skill,
    "```",
    ...references.flatMap((reference) => [
      "",
      `Source document: ${reference.sourceDocument}`,
      "```md",
      reference.text,
      "```",
    ]),
    "",
    `User task for eval ${entry.id}:`,
    entry.prompt,
    "",
    "Eval success criteria for this automated release-readiness check:",
    `Expected output: ${entry.expected_output}`,
    "Expected operation hints; cover these when they match a requested action, but do not treat them as the only valid catalog keys:",
    ...entry.expected_operations.map((operationKey) => `- ${operationKey}`),
    "Assertions the answer must satisfy:",
    ...entry.assertions.map((assertion) => `- ${assertion}`),
    "",
    "Use operation_keys only for exact keys present in the Available Appaloft operation keys catalog above.",
    "Do not skip requested connect/configure/list/readback/cleanup actions by assuming they were already done; include the applicable Appaloft operation when the user asks for that action.",
    "Make plan steps explicit enough for the assertions, including required readbacks, log summaries, confirmations, cleanup/close steps, and MCP mapping explanations.",
  ].join("\n");
}

function responseSchema(name: string) {
  return {
    type: "json_schema",
    name,
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "operation_keys", "plan", "safety_notes", "refusal"],
      properties: {
        summary: { type: "string" },
        operation_keys: {
          type: "array",
          items: { type: "string" },
        },
        plan: {
          type: "array",
          items: { type: "string" },
        },
        safety_notes: {
          type: "array",
          items: { type: "string" },
        },
        refusal: { type: "string" },
      },
    },
  };
}

function judgeSchema() {
  return {
    type: "json_schema",
    name: "appaloft_skill_eval_judgement",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["passed", "failed_assertions", "notes"],
      properties: {
        passed: { type: "boolean" },
        failed_assertions: {
          type: "array",
          items: { type: "string" },
        },
        notes: { type: "string" },
      },
    },
  };
}

function jsonShapeInstructions(kind: "candidate" | "judge"): string {
  if (kind === "judge") {
    return [
      "Return a JSON object with exactly these keys:",
      "- passed: boolean",
      "- failed_assertions: array of strings",
      "- notes: string",
      "Do not wrap the JSON in markdown.",
      "",
      'Example: {"passed":true,"failed_assertions":[],"notes":"The candidate satisfies the eval."}',
    ].join("\n");
  }

  return [
    "Return a JSON object with exactly these keys:",
    "- summary: string",
    "- operation_keys: array of Appaloft operation key strings",
    "- plan: array of strings",
    "- safety_notes: array of strings",
    "- refusal: string, empty when the task should proceed",
    "Do not wrap the JSON in markdown.",
    "",
    'Example: {"summary":"Plan the requested Appaloft workflow.","operation_keys":["projects.show"],"plan":["Read the project before changing it."],"safety_notes":["Do not expose secrets."],"refusal":""}',
  ].join("\n");
}

function extractResponseText(response: Record<string, unknown>): string {
  if (typeof response.output_text === "string") {
    return response.output_text;
  }

  const chunks: string[] = [];
  const output = response.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (typeof item !== "object" || item === null || !("content" in item)) {
        continue;
      }
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) {
        continue;
      }
      for (const contentItem of content) {
        if (typeof contentItem !== "object" || contentItem === null) {
          continue;
        }
        const text = (contentItem as { text?: unknown }).text;
        if (typeof text === "string") {
          chunks.push(text);
        }
      }
    }
  }

  const text = chunks.join("\n").trim();
  if (!text) {
    throw new Error("model response did not contain output text");
  }

  return text;
}

function valueType(value: unknown): string {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null) {
    return "null";
  }
  return typeof value;
}

function summarizeTextField(value: unknown): string {
  if (typeof value !== "string") {
    return valueType(value);
  }
  return value.trim() ? `string(${value.length})` : "empty-string";
}

function summarizeChatCompletionChoice(choice: Record<string, unknown>): string {
  const message = choice.message;
  const parts = [
    `finish_reason=${String(choice.finish_reason ?? "unknown")}`,
    `message=${valueType(message)}`,
  ];

  if (typeof message === "object" && message !== null && !Array.isArray(message)) {
    const messageRecord = message as Record<string, unknown>;
    parts.push(`role=${String(messageRecord.role ?? "unknown")}`);
    parts.push(`content=${summarizeTextField(messageRecord.content)}`);
    parts.push(`reasoning_content=${summarizeTextField(messageRecord.reasoning_content)}`);
    parts.push(`refusal=${summarizeTextField(messageRecord.refusal)}`);
    const toolCalls = messageRecord.tool_calls;
    if (Array.isArray(toolCalls)) {
      parts.push(`tool_calls=${toolCalls.length}`);
    }
  }

  return parts.join(", ");
}

function summarizeChatCompletionResponse(response: Record<string, unknown>): string {
  const choices = response.choices;
  if (!Array.isArray(choices)) {
    return `choices=${valueType(choices)}`;
  }

  return choices
    .map((choice, index) => {
      if (typeof choice !== "object" || choice === null || Array.isArray(choice)) {
        return `${index}:${valueType(choice)}`;
      }

      return `${index}:${summarizeChatCompletionChoice(choice as Record<string, unknown>)}`;
    })
    .join(" | ");
}

function extractChatCompletionText(response: Record<string, unknown>): string {
  const choices = response.choices;
  if (!Array.isArray(choices)) {
    throw new Error("chat completion response did not contain choices");
  }

  const choice = choices[0];
  if (typeof choice !== "object" || choice === null) {
    throw new Error("chat completion response did not contain a first choice");
  }
  const choiceRecord = choice as Record<string, unknown>;

  const message = choiceRecord.message;
  if (typeof message !== "object" || message === null) {
    throw new Error("chat completion response did not contain a message");
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content !== "string" || !content.trim()) {
    throw new RetryableChatCompletionError(
      `chat completion response did not contain message content (${summarizeChatCompletionChoice(choiceRecord)})`,
    );
  }

  return content.trim();
}

function parseJsonText<T>(text: string): T {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(trimmed) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new RetryableJsonParseError(
      `model response did not contain parseable JSON (${message}; ${trimmed.length} chars)`,
    );
  }
}

async function callOpenAiJson<T>(input: {
  apiKey: string;
  baseUrl: string;
  format: unknown;
  instructions: string;
  maxOutputTokens: number;
  model: string;
  prompt: string;
}): Promise<T> {
  const baseUrl = input.baseUrl.replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model,
      instructions: input.instructions,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: input.prompt }],
        },
      ],
      text: {
        format: input.format,
      },
      max_output_tokens: input.maxOutputTokens,
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI Responses API returned ${response.status}: ${raw}`);
  }

  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return parseJsonText<T>(extractResponseText(parsed));
}

async function callOpenAiCompatibleChatJson<T>(input: {
  apiKey: string;
  baseUrl: string;
  instructions: string;
  maxOutputTokens: number;
  model: string;
  prompt: string;
}): Promise<T> {
  const baseUrl = input.baseUrl.replace(/\/+$/, "");
  let lastRetryableError: RetryableChatCompletionError | RetryableJsonParseError | undefined;

  for (let attempt = 1; attempt <= chatCompletionMaxAttempts; attempt += 1) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        messages: [
          {
            role: "system",
            content: input.instructions,
          },
          {
            role: "user",
            content: input.prompt,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: input.maxOutputTokens,
        temperature: 0,
      }),
    });

    const raw = await response.text();
    if (!response.ok) {
      throw new Error(`OpenAI-compatible Chat Completions API returned ${response.status}: ${raw}`);
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    try {
      return parseJsonText<T>(extractChatCompletionText(parsed));
    } catch (error) {
      if (
        !(error instanceof RetryableChatCompletionError) &&
        !(error instanceof RetryableJsonParseError)
      ) {
        throw error;
      }
      lastRetryableError = error;
      if (attempt === chatCompletionMaxAttempts) {
        break;
      }
      console.warn(
        `OpenAI-compatible chat completion returned unusable JSON-mode content on attempt ${attempt}/${chatCompletionMaxAttempts}; retrying. ${error.message}; ${summarizeChatCompletionResponse(parsed)}`,
      );
    }
  }

  throw new Error(
    `OpenAI-compatible chat completion did not return parseable message content after ${chatCompletionMaxAttempts} attempts. ${lastRetryableError?.message ?? ""}`.trim(),
  );
}

function chatCompletionTokenBudget(tokens: number, provider: Options["provider"]): number {
  if (provider === "deepseek") {
    return Math.max(tokens * 4, tokens + 6000);
  }

  return tokens;
}

async function callModelJson<T>(input: {
  apiKey: string;
  baseUrl: string;
  format: unknown;
  instructions: string;
  jsonShape: string;
  maxOutputTokens: number;
  model: string;
  prompt: string;
  provider: Options["provider"];
}): Promise<T> {
  if (input.provider === "openai") {
    return callOpenAiJson<T>(input);
  }

  return callOpenAiCompatibleChatJson<T>({
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
    instructions: `${input.instructions}\n\n${input.jsonShape}`,
    maxOutputTokens: input.maxOutputTokens,
    model: input.model,
    prompt: input.prompt,
  });
}

function validateCandidate(candidate: CandidateOutput): string[] {
  const errors: string[] = [];

  for (const operationKey of candidate.operation_keys) {
    if (!operationKeySet.has(operationKey)) {
      errors.push(`unknown operation key ${operationKey}`);
    }
  }

  if (!candidate.summary.trim()) {
    errors.push("summary is empty");
  }
  if (!candidate.plan.length && !candidate.refusal.trim()) {
    errors.push("plan is empty");
  }

  return errors;
}

async function judgeCandidate(input: {
  apiKey: string;
  baseUrl: string;
  candidate: CandidateOutput;
  entry: SkillEval;
  model: string;
  provider: Options["provider"];
}): Promise<JudgeOutput> {
  const unknownOperationKeys = input.candidate.operation_keys.filter(
    (operationKey) => !operationKeySet.has(operationKey),
  );
  const prompt = [
    "Judge whether this Appaloft skill eval candidate satisfies the expected behavior.",
    "Return JSON only. Mark passed false if any assertion is substantively unmet.",
    "Expected operations are reference coverage hints for the intended Appaloft surface, not an exact checklist.",
    "Do not fail solely because a semantically correct candidate omits a reference operation key, uses a narrower safe plan, or refuses a request that asks for secrets or bypasses Appaloft.",
    "Do fail for invented operation keys, direct infrastructure/database mutation, unsafe secret handling, or violating a stated assertion.",
    "An invented operation key means a key absent from the Available Appaloft operation keys catalog, not merely absent from Expected operations.",
    "Operation keys that are present in the catalog are valid keys even when they are not listed under Expected operations.",
    "Missing an Expected operations hint is a failure only when the candidate also misses the expected output or a stated assertion.",
    "",
    "Available Appaloft operation keys:",
    operationKeys.join(", "),
    "",
    `Eval id: ${input.entry.id}`,
    `User task: ${input.entry.prompt}`,
    `Expected output: ${input.entry.expected_output}`,
    `Expected operations: ${input.entry.expected_operations.join(", ")}`,
    "Assertions:",
    ...input.entry.assertions.map((assertion) => `- ${assertion}`),
    "",
    `Candidate operation key catalog validation: ${
      unknownOperationKeys.length
        ? `unknown keys: ${unknownOperationKeys.join(", ")}`
        : "all candidate operation_keys exist in the operation catalog"
    }`,
    "",
    "Candidate:",
    JSON.stringify(input.candidate, null, 2),
  ].join("\n");

  return await callModelJson<JudgeOutput>({
    apiKey: input.apiKey,
    baseUrl: input.baseUrl,
    format: judgeSchema(),
    instructions: "You are a strict evaluator for Appaloft Agent Skill evals.",
    jsonShape: jsonShapeInstructions("judge"),
    maxOutputTokens: chatCompletionTokenBudget(1000, input.provider),
    model: input.model,
    prompt,
    provider: input.provider,
  });
}

const options = parseOptions(process.argv.slice(2));
const suite = parseSuite(
  JSON.parse(await Bun.file(resolve(repositoryRoot, "skills/appaloft/evals/evals.json")).text()),
);
let entries = options.evalId
  ? suite.evals.filter((entry) => entry.id === options.evalId)
  : suite.evals;
if (options.limit) {
  entries = entries.slice(0, options.limit);
}
if (!entries.length) {
  throw new Error(
    options.evalId ? `No eval found for --eval-id ${options.evalId}` : "No evals found",
  );
}

const prompts = await Promise.all(entries.map((entry) => buildEvalPrompt(entry, options)));
if (options.dryRun) {
  console.log(
    `Dry run prepared ${entries.length} Appaloft skill model eval prompt${entries.length === 1 ? "" : "s"} for ${options.provider}/${options.model}.`,
  );
  for (const [index, entry] of entries.entries()) {
    console.log(
      `${entry.id}: ${prompts[index].length} chars, ${entry.expected_operations.length} expected operations`,
    );
  }
  process.exit(0);
}

const apiKey =
  (options.provider === "deepseek"
    ? process.env.DEEPSEEK_API_KEY
    : process.env.OPENAI_API_KEY
  )?.trim() ?? process.env.APPALOFT_SKILL_EVAL_API_KEY?.trim();
if (!apiKey) {
  throw new Error(
    `${options.provider === "deepseek" ? "DEEPSEEK_API_KEY" : "OPENAI_API_KEY"} or APPALOFT_SKILL_EVAL_API_KEY is required unless --dry-run is set`,
  );
}

const failures: string[] = [];
for (const [index, entry] of entries.entries()) {
  const candidate = await callModelJson<CandidateOutput>({
    apiKey,
    baseUrl: options.baseUrl,
    format: responseSchema("appaloft_skill_eval_candidate"),
    instructions:
      "You are an AI agent using the Appaloft skill. Produce a concise operation plan as JSON. Use only operation keys listed in the prompt. Satisfy the eval success criteria with explicit coverage of requested connect/configure/list/readback/cleanup actions, plus required summaries, confirmations, close steps, and MCP mapping explanations when the task calls for them.",
    jsonShape: jsonShapeInstructions("candidate"),
    maxOutputTokens: chatCompletionTokenBudget(2000, options.provider),
    model: options.model,
    prompt: prompts[index],
    provider: options.provider,
  });
  const localErrors = validateCandidate(candidate);
  const judgement = options.judge
    ? await judgeCandidate({
        apiKey,
        baseUrl: options.baseUrl,
        candidate,
        entry,
        model: options.judgeModel,
        provider: options.provider,
      })
    : undefined;

  if (localErrors.length || judgement?.passed === false) {
    const failure = [
      `${entry.id} failed`,
      ...localErrors.map((error) => `local: ${error}`),
      ...(judgement?.failed_assertions ?? []).map((assertion) => `judge: ${assertion}`),
      ...(judgement?.notes ? [`notes: ${judgement.notes}`] : []),
    ].join("\n");
    failures.push(failure);
    console.error(failure);
  }

  console.log(
    `${entry.id}: ${localErrors.length === 0 && judgement?.passed !== false ? "pass" : "fail"} (${candidate.operation_keys.length} operations)`,
  );
}

if (failures.length) {
  throw new Error(`Appaloft skill model eval failures:\n${failures.join("\n\n")}`);
}

console.log(
  `Passed ${entries.length} Appaloft skill model eval${entries.length === 1 ? "" : "s"}.`,
);
