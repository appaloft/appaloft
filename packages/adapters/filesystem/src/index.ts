import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  createAdapterSpanName,
  type ExecutionContext,
  type SourceDetectionResult,
  type SourceDetector,
  yunduTraceAttributes,
} from "@yundu/application";
import {
  DisplayNameText,
  domainError,
  err,
  ok,
  type Result,
  SourceDescriptor,
  type SourceKind,
  SourceKindValue,
  SourceLocator,
} from "@yundu/core";

function detectLocalMetadata(path: string): Record<string, string> {
  const packageJsonPath = join(path, "package.json");
  let packageManager = "npm";
  let hasBuildScript = "false";
  let hasStartScript = "false";
  let hasStartBuiltScript = "false";

  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
        packageManager?: string;
        scripts?: Record<string, string>;
      };
      if (typeof packageJson.packageManager === "string") {
        if (packageJson.packageManager.startsWith("bun")) {
          packageManager = "bun";
        } else if (packageJson.packageManager.startsWith("pnpm")) {
          packageManager = "pnpm";
        }
      }

      hasBuildScript = String(Boolean(packageJson.scripts?.build));
      hasStartScript = String(Boolean(packageJson.scripts?.start));
      hasStartBuiltScript = String(Boolean(packageJson.scripts?.["start:built"]));
    } catch {
      // keep lightweight best-effort metadata only
    }
  }

  return {
    hasDockerfile: String(existsSync(join(path, "Dockerfile"))),
    hasCompose: String(
      existsSync(join(path, "docker-compose.yml")) || existsSync(join(path, "compose.yml")),
    ),
    hasGit: String(existsSync(join(path, ".git"))),
    hasPackageJson: String(existsSync(join(path, "package.json"))),
    packageManager,
    hasBuildScript,
    hasStartScript,
    hasStartBuiltScript,
    dockerfilePath: "Dockerfile",
  };
}

function resolveSourceKind(locator: string): {
  kind: SourceKind;
  metadata?: Record<string, string>;
} {
  if (/^(https?|ssh):\/\//.test(locator) || locator.endsWith(".git")) {
    return { kind: "remote-git" };
  }

  if (locator.endsWith(".zip")) {
    return { kind: "zip-artifact" };
  }

  if (locator.startsWith("docker://") || locator.startsWith("image://")) {
    return { kind: "docker-image" };
  }

  if (locator.endsWith("docker-compose.yml") || locator.endsWith("compose.yml")) {
    return { kind: "compose" };
  }

  const absolutePath = resolve(locator);

  if (existsSync(absolutePath) && statSync(absolutePath).isDirectory()) {
    const metadata = detectLocalMetadata(absolutePath);

    if (metadata.hasCompose === "true") {
      return { kind: "compose", metadata };
    }

    if (metadata.hasGit === "true") {
      return { kind: "local-git", metadata };
    }

    return { kind: "local-folder", metadata };
  }

  return { kind: "local-folder" };
}

export class FileSystemSourceDetector implements SourceDetector {
  async detect(context: ExecutionContext, locator: string): Promise<Result<SourceDetectionResult>> {
    return context.tracer.startActiveSpan(
      createAdapterSpanName("filesystem_source_detector", "detect"),
      {
        attributes: {
          [yunduTraceAttributes.sourceLocator]: locator,
        },
      },
      async () => {
        if (!locator.trim()) {
          return err(domainError.validation("Source locator is required"));
        }

        const absolutePath = resolve(locator);
        const resolved = resolveSourceKind(locator);
        const reasoning = [
          `Detected source kind: ${resolved.kind}`,
          resolved.metadata?.hasDockerfile === "true"
            ? "Dockerfile present in workspace"
            : "Dockerfile not detected",
          resolved.metadata?.hasCompose === "true"
            ? "Compose manifest present in workspace"
            : "Compose manifest not detected",
        ];

        const source = SourceDescriptor.rehydrate({
          kind: SourceKindValue.rehydrate(resolved.kind),
          locator: SourceLocator.rehydrate(
            locator.startsWith(".") || locator.startsWith("/") ? absolutePath : locator,
          ),
          displayName: DisplayNameText.rehydrate(basename(locator) || basename(absolutePath)),
          ...(resolved.metadata ? { metadata: resolved.metadata } : {}),
        });

        return ok({ source, reasoning });
      },
    );
  }
}
