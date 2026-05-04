import {
  ConfigKey,
  ConfigValueText,
  domainError,
  err,
  ok,
  ResourceByIdSpec,
  ResourceId,
  type Result,
  safeTry,
  UpdatedAt,
  UpsertResourceSpec,
  VariableExposureValue,
  VariableKindValue,
} from "@appaloft/core";
import { inject, injectable } from "tsyringe";

import { type ExecutionContext, toRepositoryContext } from "../../execution-context";
import { type AppLogger, type Clock, type EventBus, type ResourceRepository } from "../../ports";
import { tokens } from "../../tokens";
import { publishDomainEventsAndReturn } from "../publish-domain-events";
import {
  type ImportResourceVariablesCommandInput,
  type ImportResourceVariablesResponse,
  type ResourceVariableDuplicateOverride,
  type ResourceVariableExistingOverride,
} from "./import-resource-variables.command";

const secretMask = "****";
const envKeyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const secretLikeKeyPattern =
  /(?:secret|password|passwd|token|api[_-]?key|database[_-]?url|connection[_-]?string|private[_-]?key|ssh[_-]?key|credential|certificate|cert)/i;

interface ParsedDotenvEntry {
  key: string;
  value: string;
  sourceLine: number;
}

interface ClassifiedImportEntry extends ParsedDotenvEntry {
  kind: "plain-config" | "secret";
  isSecret: boolean;
}

interface PreparedImportEntry {
  key: ConfigKey;
  value: ConfigValueText;
  kind: VariableKindValue;
  exposure: VariableExposureValue;
  isSecret: boolean;
  sourceLine: number;
  rawKey: string;
  rawValue: string;
}

function importValidation(message: string, details: Record<string, string | number | boolean>) {
  return domainError.validation(message, details);
}

function parseDotenvLine(rawLine: string, lineNumber: number): Result<ParsedDotenvEntry | null> {
  const trimmed = rawLine.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    return ok(null);
  }

  const withoutExport = trimmed.startsWith("export ")
    ? trimmed.slice("export ".length).trim()
    : trimmed;
  const equalsIndex = withoutExport.indexOf("=");

  if (equalsIndex <= 0) {
    return err(
      importValidation("Invalid .env line", {
        phase: "resource-env-import-parse",
        line: lineNumber,
      }),
    );
  }

  const key = withoutExport.slice(0, equalsIndex).trim();
  const rawValue = withoutExport.slice(equalsIndex + 1).trim();

  if (!envKeyPattern.test(key)) {
    return err(
      importValidation("Invalid .env key", {
        phase: "resource-env-import-parse",
        line: lineNumber,
        key,
      }),
    );
  }

  if (
    (rawValue.startsWith('"') && !rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && !rawValue.endsWith("'"))
  ) {
    return err(
      importValidation("Unterminated .env value", {
        phase: "resource-env-import-parse",
        line: lineNumber,
        key,
      }),
    );
  }

  const value =
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
      ? rawValue.slice(1, -1)
      : rawValue;

  return ok({
    key,
    value,
    sourceLine: lineNumber,
  });
}

function parseDotenvContent(content: string): Result<{
  entries: ParsedDotenvEntry[];
  duplicateOverrides: ResourceVariableDuplicateOverride[];
}> {
  const entriesByKey = new Map<string, ParsedDotenvEntry>();
  const firstLinesByKey = new Map<string, number>();
  const duplicateOverrides = new Map<string, ResourceVariableDuplicateOverride>();
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    const parsed = parseDotenvLine(line, lineNumber);
    if (parsed.isErr()) {
      return err(parsed.error);
    }

    if (!parsed.value) {
      continue;
    }

    const existing = entriesByKey.get(parsed.value.key);
    if (existing) {
      const firstLine = firstLinesByKey.get(parsed.value.key) ?? existing.sourceLine;
      duplicateOverrides.set(parsed.value.key, {
        key: parsed.value.key,
        exposure: "runtime",
        firstLine,
        lastLine: parsed.value.sourceLine,
        rule: "last-wins",
      });
    } else {
      firstLinesByKey.set(parsed.value.key, parsed.value.sourceLine);
    }

    entriesByKey.set(parsed.value.key, parsed.value);
  }

  if (entriesByKey.size === 0) {
    return err(
      importValidation("No .env variables found", {
        phase: "resource-env-import-parse",
      }),
    );
  }

  return ok({
    entries: [...entriesByKey.values()],
    duplicateOverrides: [...duplicateOverrides.values()],
  });
}

function normalizeKeySet(keys: readonly string[], label: string): Result<Set<string>> {
  const normalized = new Set<string>();

  for (const rawKey of keys) {
    const key = rawKey.trim();
    if (!envKeyPattern.test(key)) {
      return err(
        importValidation(`Invalid ${label}`, {
          phase: "resource-env-import-parse",
          key,
        }),
      );
    }
    normalized.add(key);
  }

  return ok(normalized);
}

function classifyEntries(
  entries: ParsedDotenvEntry[],
  input: {
    exposure: "build-time" | "runtime";
    secretKeys: readonly string[] | undefined;
    plainKeys: readonly string[] | undefined;
  },
): Result<ClassifiedImportEntry[]> {
  const secretKeys = normalizeKeySet(input.secretKeys ?? [], "secret key");
  if (secretKeys.isErr()) {
    return err(secretKeys.error);
  }

  const plainKeys = normalizeKeySet(input.plainKeys ?? [], "plain key");
  if (plainKeys.isErr()) {
    return err(plainKeys.error);
  }

  for (const key of secretKeys.value) {
    if (plainKeys.value.has(key)) {
      return err(
        importValidation("A .env key cannot be both secret and plain", {
          phase: "resource-env-import-parse",
          key,
        }),
      );
    }
  }

  const classified: ClassifiedImportEntry[] = [];

  for (const entry of entries) {
    const isSecret =
      secretKeys.value.has(entry.key) ||
      (!plainKeys.value.has(entry.key) && secretLikeKeyPattern.test(entry.key));

    if (input.exposure === "build-time" && !/^(PUBLIC_|VITE_)/.test(entry.key)) {
      return err(
        importValidation("Build-time variables must use PUBLIC_ or VITE_", {
          phase: "config-profile-resolution",
          key: entry.key,
          exposure: input.exposure,
        }),
      );
    }

    if (input.exposure === "build-time" && isSecret) {
      return err(
        importValidation("Build-time variables cannot be stored as secrets", {
          phase: "config-secret-validation",
          key: entry.key,
          exposure: input.exposure,
        }),
      );
    }

    classified.push({
      ...entry,
      kind: isSecret ? "secret" : "plain-config",
      isSecret,
    });
  }

  return ok(classified);
}

@injectable()
export class ImportResourceVariablesUseCase {
  constructor(
    @inject(tokens.resourceRepository)
    private readonly resourceRepository: ResourceRepository,
    @inject(tokens.clock)
    private readonly clock: Clock,
    @inject(tokens.eventBus)
    private readonly eventBus: EventBus,
    @inject(tokens.logger)
    private readonly logger: AppLogger,
  ) {}

  async execute(
    context: ExecutionContext,
    input: ImportResourceVariablesCommandInput,
  ): Promise<Result<ImportResourceVariablesResponse>> {
    const { clock, eventBus, logger, resourceRepository } = this;
    const repositoryContext = toRepositoryContext(context);

    return safeTry(async function* () {
      const resourceId = yield* ResourceId.create(input.resourceId);
      const exposure = yield* VariableExposureValue.create(input.exposure);
      const parsed = yield* parseDotenvContent(input.content);
      const classified = yield* classifyEntries(parsed.entries, {
        exposure: input.exposure,
        secretKeys: input.secretKeys,
        plainKeys: input.plainKeys,
      });

      const resource = await resourceRepository.findOne(
        repositoryContext,
        ResourceByIdSpec.create(resourceId),
      );

      if (!resource) {
        return err(domainError.notFound("resource", input.resourceId));
      }

      const existingIdentities = new Set(
        resource
          .toState()
          .variables.toState()
          .filter((entry) => entry.exposure.value === input.exposure)
          .map((entry) => entry.key.value),
      );
      const updatedAt = yield* UpdatedAt.create(clock.now());
      const preparedEntries: PreparedImportEntry[] = [];

      for (const entry of classified) {
        const key = yield* ConfigKey.create(entry.key);
        const value = yield* ConfigValueText.create(entry.value);
        const kind = yield* VariableKindValue.create(entry.kind);
        preparedEntries.push({
          key,
          value,
          kind,
          exposure,
          isSecret: entry.isSecret,
          sourceLine: entry.sourceLine,
          rawKey: entry.key,
          rawValue: entry.value,
        });
      }

      yield* resource.importVariables({
        entries: preparedEntries,
        updatedAt,
      });

      await resourceRepository.upsert(
        repositoryContext,
        resource,
        UpsertResourceSpec.fromResource(resource),
      );
      await publishDomainEventsAndReturn(context, eventBus, logger, resource, undefined);

      const existingOverrides: ResourceVariableExistingOverride[] = preparedEntries
        .filter((entry) => existingIdentities.has(entry.rawKey))
        .map((entry) => ({
          key: entry.rawKey,
          exposure: input.exposure,
          previousScope: "resource",
          rule: "resource-entry-replaced",
        }));

      return ok({
        resourceId: input.resourceId,
        importedEntries: preparedEntries.map((entry) => ({
          key: entry.rawKey,
          value: entry.isSecret ? secretMask : entry.rawValue,
          exposure: input.exposure,
          kind: entry.kind.value as "plain-config" | "secret",
          isSecret: entry.isSecret,
          action: existingIdentities.has(entry.rawKey) ? "replaced" : "created",
          sourceLine: entry.sourceLine,
        })),
        duplicateOverrides: parsed.duplicateOverrides.map((entry) => ({
          ...entry,
          exposure: input.exposure,
        })),
        existingOverrides,
      } satisfies ImportResourceVariablesResponse);
    });
  }
}
