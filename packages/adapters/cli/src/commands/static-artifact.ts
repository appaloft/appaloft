import { existsSync, lstatSync, readdirSync, readFileSync, type Stats } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import {
  type Command as AppCommand,
  PublishStaticArtifactArchiveCommand,
  PublishStaticArtifactPayloadCommand,
} from "@appaloft/application";
import {
  type DomainError,
  domainError,
  err,
  ok,
  type Result,
  type StaticArtifactPublication,
} from "@appaloft/core";
import { Args, Command as EffectCommand, Options } from "@effect/cli";

import { optionalValue, runCommand } from "../runtime.js";
import { cliCommandDescriptions } from "./docs-help.js";

const sourcePathArg = Args.text({ name: "dist-or-zip" });
const projectOption = Options.text("project");
const resourceOption = Options.text("resource");
const artifactOption = Options.text("artifact").pipe(Options.optional);
const promoteAliasOption = Options.boolean("promote-alias").pipe(Options.withDefault(false));

interface StaticArtifactPublishCliInput {
  readonly sourcePath: string;
  readonly projectId: string;
  readonly resourceId: string;
  readonly artifactId?: string;
  readonly promoteAlias?: boolean;
}

function staticArtifactCliError(
  message: string,
  details: Record<string, string | number | boolean | null>,
): DomainError {
  return domainError.validation(message, {
    phase: "static-artifact-cli-payload",
    ...details,
  });
}

function staticArtifactCliInfraError(
  message: string,
  details: Record<string, string | number | boolean | null>,
): DomainError {
  return domainError.infra(message, {
    phase: "static-artifact-cli-payload",
    ...details,
  });
}

function mimeTypeForStaticArtifactPath(path: string): string {
  switch (extname(path).toLowerCase()) {
    case ".html":
    case ".htm":
      return "text/html";
    case ".css":
      return "text/css";
    case ".js":
    case ".mjs":
      return "text/javascript";
    case ".json":
      return "application/json";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

function safeRelativePath(rootPath: string, filePath: string): Result<string> {
  const relativePath = relative(rootPath, filePath)
    .split(/[\\/]+/)
    .join("/");
  const segments = relativePath.split("/").filter((segment) => segment.length > 0);
  if (
    relativePath.startsWith("../") ||
    relativePath === ".." ||
    segments.length === 0 ||
    segments.some((segment) => segment === "." || segment === ".." || segment.includes("\0"))
  ) {
    return err(
      staticArtifactCliError("Static artifact file path must stay inside the source directory", {
        path: relativePath,
      }),
    );
  }

  return ok(relativePath);
}

function readDirectoryFilePayloads(
  rootPath: string,
): Result<PublishStaticArtifactPayloadCommand["files"]> {
  const files: PublishStaticArtifactPayloadCommand["files"] = [];
  const pending = [rootPath];

  try {
    while (pending.length > 0) {
      const currentPath = pending.pop() as string;
      for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
        const entryPath = join(currentPath, entry.name);
        if (entry.isSymbolicLink()) {
          const relativePath = safeRelativePath(rootPath, entryPath);
          return err(
            staticArtifactCliError("Static artifact directories cannot contain symlinks", {
              path: relativePath.isOk() ? relativePath.value : entry.name,
            }),
          );
        }
        if (entry.isDirectory()) {
          pending.push(entryPath);
          continue;
        }
        if (!entry.isFile()) {
          continue;
        }

        const payloadPath = safeRelativePath(rootPath, entryPath);
        if (payloadPath.isErr()) return err(payloadPath.error);
        files.push({
          path: payloadPath.value,
          mimeType: mimeTypeForStaticArtifactPath(payloadPath.value),
          contentBase64: readFileSync(entryPath).toString("base64"),
        });
      }
    }
  } catch (error) {
    return err(
      staticArtifactCliInfraError("Static artifact source directory could not be read", {
        path: rootPath,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  files.sort((left, right) => left.path.localeCompare(right.path));
  if (files.length === 0) {
    return err(
      staticArtifactCliError("Static artifact source directory must contain at least one file", {
        path: rootPath,
      }),
    );
  }

  return ok(files);
}

function createStaticArtifactPublishCommandFromPath(
  input: StaticArtifactPublishCliInput,
): Result<AppCommand<StaticArtifactPublication>> {
  const sourcePath = resolve(input.sourcePath);
  if (!existsSync(sourcePath)) {
    return err(
      staticArtifactCliError("Static artifact source path does not exist", {
        path: input.sourcePath,
      }),
    );
  }

  let stat: Stats;
  try {
    stat = lstatSync(sourcePath);
  } catch (error) {
    return err(
      staticArtifactCliInfraError("Static artifact source path could not be inspected", {
        path: input.sourcePath,
        message: error instanceof Error ? error.message : String(error),
      }),
    );
  }

  if (stat.isDirectory()) {
    const files = readDirectoryFilePayloads(sourcePath);
    if (files.isErr()) return err(files.error);
    return PublishStaticArtifactPayloadCommand.create({
      projectId: input.projectId,
      resourceId: input.resourceId,
      files: files.value,
      ...(input.artifactId ? { artifactId: input.artifactId } : {}),
      ...(input.promoteAlias ? { promoteAlias: input.promoteAlias } : {}),
    });
  }

  if (stat.isFile() && sourcePath.toLowerCase().endsWith(".zip")) {
    try {
      return PublishStaticArtifactArchiveCommand.create({
        projectId: input.projectId,
        resourceId: input.resourceId,
        archiveBase64: readFileSync(sourcePath).toString("base64"),
        ...(input.artifactId ? { artifactId: input.artifactId } : {}),
        ...(input.promoteAlias ? { promoteAlias: input.promoteAlias } : {}),
      });
    } catch (error) {
      return err(
        staticArtifactCliInfraError("Static artifact zip archive could not be read", {
          path: input.sourcePath,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  return err(
    staticArtifactCliError("Static artifact source path must be a directory or .zip archive", {
      path: input.sourcePath,
    }),
  );
}

const publishCommand = EffectCommand.make(
  "publish",
  {
    sourcePath: sourcePathArg,
    project: projectOption,
    resource: resourceOption,
    artifact: artifactOption,
    promoteAlias: promoteAliasOption,
  },
  ({ artifact, project, promoteAlias, resource, sourcePath }) =>
    runCommand(
      createStaticArtifactPublishCommandFromPath({
        projectId: project,
        resourceId: resource,
        sourcePath,
        ...(optionalValue(artifact) ? { artifactId: optionalValue(artifact) as string } : {}),
        ...(promoteAlias ? { promoteAlias } : {}),
      }),
    ),
).pipe(EffectCommand.withDescription(cliCommandDescriptions.staticArtifactPublish));

export const staticArtifactCommand = EffectCommand.make("static-artifacts").pipe(
  EffectCommand.withDescription(cliCommandDescriptions.staticArtifact),
  EffectCommand.withSubcommands([publishCommand]),
);
