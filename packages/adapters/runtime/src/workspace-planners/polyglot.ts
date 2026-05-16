import {
  domainError,
  err,
  ok,
  type Result,
  type SourceFramework,
  type SourceInspectionSnapshot,
  type SourceRuntimeFamily,
} from "@appaloft/core";
import {
  commandMentions,
  dockerBuildFromExecution,
  generatedWorkspaceDockerfileName,
  requiredStartCommand,
  workspaceMetadata,
  type WorkspaceDockerfileInput,
  type WorkspacePlannerInput,
  type WorkspaceRuntimeKind,
  type WorkspaceRuntimePlan,
  type WorkspaceRuntimePlanner,
} from "./types";

type PolyglotRuntimeFamily = Extract<
  SourceRuntimeFamily,
  "dotnet" | "elixir" | "go" | "php" | "ruby" | "rust"
>;

interface PolyglotDefaults {
  runtimeFamily: PolyglotRuntimeFamily;
  planner: string;
  runtimeKind: WorkspaceRuntimeKind;
  baseImage: (inspection?: SourceInspectionSnapshot) => string;
  installCommand?: (input: WorkspacePlannerInput) => string | undefined;
  buildCommand?: (input: WorkspacePlannerInput) => string | undefined;
  startCommand?: (input: WorkspacePlannerInput) => string | undefined;
  supportedFrameworks?: readonly SourceFramework[];
  commandTerms: readonly string[];
}

function requestedPort(input: WorkspacePlannerInput): number {
  return input.requestedDeployment.port ?? 3000;
}

function projectName(inspection?: SourceInspectionSnapshot, fallback = "app"): string {
  return inspection?.projectName?.replace(/[^A-Za-z0-9_.-]/gu, "_") || fallback;
}

function dotnetMajor(inspection?: SourceInspectionSnapshot): string {
  return inspection?.runtimeVersion?.match(/^\d+/u)?.[0] ?? "8";
}

function rustImageVersion(inspection?: SourceInspectionSnapshot): string {
  return inspection?.runtimeVersion?.match(/^\d+(?:\.\d+)?(?:\.\d+)?/u)?.[0] ?? "1.84";
}

function unsupportedFramework(input: WorkspacePlannerInput, defaults: PolyglotDefaults): Result<never> | null {
  const framework = input.source.inspection?.framework;
  if (!framework || defaults.supportedFrameworks?.includes(framework)) {
    return null;
  }

  if (input.requestedDeployment.startCommand) {
    return null;
  }

  return err(
    domainError.validation(
      "Detected framework is not supported by an active planner. Configure explicit production commands.",
      {
        phase: "runtime-plan-resolution",
        runtimeFamily: defaults.runtimeFamily,
        framework,
        reasonCode: "unsupported-framework",
      },
    ),
  );
}

function missingStart(input: WorkspacePlannerInput, defaults: PolyglotDefaults): Result<never> {
  return err(
    domainError.validation(
      "Runtime planning requires a deterministic production start command or explicit production commands.",
      {
        phase: "runtime-plan-resolution",
        runtimeFamily: defaults.runtimeFamily,
        ...(input.source.inspection?.framework ? { framework: input.source.inspection.framework } : {}),
        reasonCode: "missing-production-start-command",
      },
    ),
  );
}

function makePolyglotPlanner(defaults: PolyglotDefaults): WorkspaceRuntimePlanner {
  return {
    name: defaults.planner,
    runtimeKind: defaults.runtimeKind,

    detect(input) {
      return Boolean(
        input.source.inspection?.runtimeFamily === defaults.runtimeFamily ||
          commandMentions(input, defaults.commandTerms),
      );
    },

    plan(input): Result<WorkspaceRuntimePlan> {
      const unsupported = unsupportedFramework(input, defaults);
      if (unsupported) {
        return unsupported;
      }

      const startCommand = requiredStartCommand(input, defaults.startCommand?.(input));
      if (startCommand.isErr()) {
        const fallback = missingStart(input, defaults);
        return fallback.isErr() ? err(fallback.error) : err(startCommand.error);
      }

      const baseImage = defaults.baseImage(input.source.inspection);
      const installCommand =
        input.requestedDeployment.installCommand ?? defaults.installCommand?.(input);
      const buildCommand = input.requestedDeployment.buildCommand ?? defaults.buildCommand?.(input);

      return ok({
        planner: defaults.planner,
        runtimeKind: defaults.runtimeKind,
        dockerfilePath: generatedWorkspaceDockerfileName,
        baseImage,
        applicationShape: "serverful-http",
        ...(installCommand ? { installCommand } : {}),
        ...(buildCommand ? { buildCommand } : {}),
        startCommand: startCommand.value,
        metadata: workspaceMetadata({
          planner: defaults.planner,
          runtimeKind: defaults.runtimeKind,
          baseImage,
          applicationShape: "serverful-http",
          extra: {
            ...(input.source.inspection?.framework
              ? { framework: input.source.inspection.framework }
              : {}),
            ...(input.source.inspection?.packageManager
              ? { packageManager: input.source.inspection.packageManager }
              : {}),
            ...(input.source.inspection?.projectName
              ? { projectName: input.source.inspection.projectName }
              : {}),
          },
        }),
      });
    },

    dockerBuild(input: WorkspaceDockerfileInput) {
      return dockerBuildFromExecution({
        baseImage: input.execution.metadata?.["workspace.baseImage"] ?? defaults.baseImage(input.sourceInspection),
        execution: input.execution,
      });
    },
  };
}

export const rubyWorkspacePlanner = makePolyglotPlanner({
  runtimeFamily: "ruby",
  planner: "ruby",
  runtimeKind: "ruby",
  commandTerms: ["bundle", "rackup", "rails", "ruby"],
  supportedFrameworks: ["rails", "sinatra"],
  baseImage: (inspection) => `ruby:${inspection?.runtimeVersion ?? "3.3"}-slim`,
  installCommand: () => "bundle install",
  startCommand: (input) => {
    if (input.requestedDeployment.startCommand) {
      return input.requestedDeployment.startCommand;
    }

    if (input.source.inspection?.framework === "rails") {
      return `bundle exec rails server -b 0.0.0.0 -p ${requestedPort(input)}`;
    }

    if (input.source.inspection?.framework === "sinatra") {
      return `bundle exec rackup -o 0.0.0.0 -p ${requestedPort(input)}`;
    }

    return undefined;
  },
});

export const phpWorkspacePlanner = makePolyglotPlanner({
  runtimeFamily: "php",
  planner: "php",
  runtimeKind: "php",
  commandTerms: ["composer", "php", "artisan"],
  supportedFrameworks: ["laravel", "symfony"],
  baseImage: () => "composer:2",
  installCommand: () => "composer install --no-dev --prefer-dist --no-interaction",
  startCommand: (input) => {
    if (input.requestedDeployment.startCommand) {
      return input.requestedDeployment.startCommand;
    }

    if (input.source.inspection?.framework === "laravel") {
      return `php artisan serve --host=0.0.0.0 --port=${requestedPort(input)}`;
    }

    return `php -S 0.0.0.0:${requestedPort(input)} -t public`;
  },
});

export const goWorkspacePlanner = makePolyglotPlanner({
  runtimeFamily: "go",
  planner: "go",
  runtimeKind: "go",
  commandTerms: ["go"],
  supportedFrameworks: ["chi", "echo", "fiber", "gin"],
  baseImage: (inspection) => `golang:${inspection?.runtimeVersion ?? "1.23"}-bookworm`,
  buildCommand: () => "go build -o /app/appaloft-app .",
  startCommand: (input) => input.requestedDeployment.startCommand ?? "/app/appaloft-app",
});

export const dotnetWorkspacePlanner = makePolyglotPlanner({
  runtimeFamily: "dotnet",
  planner: "dotnet",
  runtimeKind: "aspnet-core",
  commandTerms: ["dotnet"],
  supportedFrameworks: ["aspnet-core"],
  baseImage: (inspection) => `mcr.microsoft.com/dotnet/sdk:${dotnetMajor(inspection)}.0`,
  buildCommand: () => "dotnet publish -c Release -o /app/publish",
  startCommand: (input) =>
    input.requestedDeployment.startCommand ??
    `dotnet /app/publish/${projectName(input.source.inspection)}.dll`,
});

export const rustWorkspacePlanner = makePolyglotPlanner({
  runtimeFamily: "rust",
  planner: "rust",
  runtimeKind: "rust",
  commandTerms: ["cargo"],
  supportedFrameworks: ["actix-web", "axum", "rocket"],
  baseImage: (inspection) => `rust:${rustImageVersion(inspection)}-bookworm`,
  buildCommand: () => "cargo build --release",
  startCommand: (input) =>
    input.requestedDeployment.startCommand ??
    `./target/release/${projectName(input.source.inspection, "appaloft-app")}`,
});

export const elixirWorkspacePlanner = makePolyglotPlanner({
  runtimeFamily: "elixir",
  planner: "elixir",
  runtimeKind: "phoenix",
  commandTerms: ["elixir", "mix"],
  supportedFrameworks: ["phoenix"],
  baseImage: () => "hexpm/elixir:1.17.3-erlang-27.2-debian-bookworm-20241223-slim",
  installCommand: () => "mix local.hex --force && mix local.rebar --force && mix deps.get --only prod",
  buildCommand: () => "MIX_ENV=prod mix release",
  startCommand: (input) => {
    const name = projectName(input.source.inspection, "appaloft_app");
    return input.requestedDeployment.startCommand ?? `_build/prod/rel/${name}/bin/${name} start`;
  },
});
