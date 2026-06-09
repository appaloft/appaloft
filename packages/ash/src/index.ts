const ashScriptBrand: unique symbol = Symbol("AshScript");
const ashFragmentBrand: unique symbol = Symbol("AshFragment");

export interface AshScript {
  readonly [ashScriptBrand]: true;
  readonly text: string;
  toString(): string;
}

interface AshFragment {
  readonly [ashFragmentBrand]: true;
  readonly text: string;
}

export interface AshExecutionResult {
  readonly exitCode: number | null;
  readonly signalCode: string | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly success: boolean;
}

export interface AshExecuteOptions {
  readonly cwd?: string;
  readonly env?: Record<string, string | undefined>;
  readonly shell?: string;
}

type AshInterpolation = AshScript | AshFragment | false | null | undefined;

interface AshTag {
  (strings: TemplateStringsArray, ...values: AshInterpolation[]): AshScript;
  arg(input: string | number | boolean): AshFragment;
  env(name: string, value: string | number | boolean | null | undefined): AshFragment;
  raw(input: string | AshScript): AshFragment;
  list(
    values: readonly (string | number | boolean)[],
    options?: { readonly separator?: string },
  ): AshFragment;
  quote(input: string): string;
  render(script: AshScript): string;
  execute(script: AshScript, options?: AshExecuteOptions): AshExecutionResult;
  isScript(input: unknown): input is AshScript;
}

function createScript(text: string): AshScript {
  return {
    [ashScriptBrand]: true,
    text,
    toString(): string {
      return text;
    },
  };
}

function createFragment(text: string): AshFragment {
  return {
    [ashFragmentBrand]: true,
    text,
  };
}

function isAshFragment(input: unknown): input is AshFragment {
  return Boolean(
    input &&
      typeof input === "object" &&
      (input as { readonly [ashFragmentBrand]?: true })[ashFragmentBrand] === true,
  );
}

export function isAshScript(input: unknown): input is AshScript {
  return Boolean(
    input &&
      typeof input === "object" &&
      (input as { readonly [ashScriptBrand]?: true })[ashScriptBrand] === true,
  );
}

export function quote(input: string): string {
  return `'${input.replaceAll("'", "'\\''")}'`;
}

export function arg(input: string | number | boolean): AshFragment {
  return createFragment(quote(String(input)));
}

export function raw(input: string | AshScript): AshFragment {
  return createFragment(isAshScript(input) ? input.text : input);
}

export function list(
  values: readonly (string | number | boolean)[],
  options?: { readonly separator?: string },
): AshFragment {
  return createFragment(
    values.map((value) => quote(String(value))).join(options?.separator ?? " "),
  );
}

export function env(
  name: string,
  value: string | number | boolean | null | undefined,
): AshFragment {
  assertPortableEnvironmentName(name);
  return createFragment(`${name}=${quote(String(value ?? ""))}`);
}

export function render(script: AshScript): string {
  return script.text;
}

const ashTag = function ashTemplate(
  strings: TemplateStringsArray,
  ...values: AshInterpolation[]
): AshScript {
  let output = "";
  for (let index = 0; index < strings.length; index += 1) {
    output += strings.raw[index] ?? "";
    if (index < values.length) {
      output += renderInterpolation(values[index]);
    }
  }

  return createScript(ensureTrailingNewline(stripCommonIndent(output)));
} as AshTag;

export const ash: AshTag = Object.assign(ashTag, {
  arg,
  env,
  raw,
  list,
  quote,
  render,
  execute,
  isScript: isAshScript,
});

export function execute(script: AshScript, options: AshExecuteOptions = {}): AshExecutionResult {
  const spawnOptions: {
    cwd?: string;
    env?: Record<string, string | undefined>;
  } = {};

  if (options.cwd !== undefined) {
    spawnOptions.cwd = options.cwd;
  }
  if (options.env !== undefined) {
    spawnOptions.env = { ...Bun.env, ...options.env };
  }

  const result = Bun.spawnSync([options.shell ?? "sh", "-lc", script.text], spawnOptions);
  const exitCode = result.exitCode ?? null;
  return {
    exitCode,
    signalCode: result.signalCode ?? null,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
    success: exitCode === 0,
  };
}

function renderInterpolation(value: AshInterpolation): string {
  if (value === false || value === null || value === undefined) {
    return "";
  }
  if (isAshScript(value)) {
    return value.text;
  }
  if (isAshFragment(value)) {
    return value.text;
  }
  throw new TypeError(
    "ash template interpolations must use ash.arg(...), ash.env(...), ash.raw(...), ash.list(...), or another AshScript.",
  );
}

function assertPortableEnvironmentName(name: string): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new TypeError(`Invalid shell environment assignment name: ${name}`);
  }
}

function ensureTrailingNewline(input: string): string {
  return input.endsWith("\n") ? input : `${input}\n`;
}

function stripCommonIndent(input: string): string {
  const withoutOuterBlankLines = input.replace(/^\n/, "").replace(/(?:[ \t]*\n)+[ \t]*$/, "\n");
  const lines = withoutOuterBlankLines.split("\n");
  const indent = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => line.match(/^[ \t]*/)?.[0].length ?? 0)
    .reduce((minimum, current) => Math.min(minimum, current), Number.POSITIVE_INFINITY);

  if (!Number.isFinite(indent) || indent <= 0) {
    return withoutOuterBlankLines;
  }

  return lines.map((line) => line.slice(indent)).join("\n");
}

export namespace ash {
  export type Script = AshScript;
  export type ExecutionResult = AshExecutionResult;
}
